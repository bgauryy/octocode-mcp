//! Transaction journal: write-ahead log, commit, and crash-recovery for applied rewrites.
use super::{
    FileState, JOURNAL_PREFIX, Journal, JournalFile, JournalPhase, PreparedFile, RewriteError,
    cancelled, create_private_dir_all, io_error, read_target, sha256, transaction_id,
};
use crate::private_file::BeneathDir;
use crate::tools::cancel::CancellationCheck;
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    ffi::{OsStr, OsString},
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

pub(super) fn persist_journal(path: &Path, journal: &Journal) -> Result<(), RewriteError> {
    let bytes = serde_json::to_vec(journal)
        .map_err(|error| RewriteError::new("transactionFailed", error.to_string()))?;
    octocode_io::atomic::write_atomic(path, &bytes, true).map_err(io_error)?;
    Ok(())
}

/// The entry name of a journal path, for operations relative to its held
/// directory.
fn entry(path: &Path) -> Result<OsString, RewriteError> {
    path.file_name().map(OsStr::to_owned).ok_or_else(|| {
        RewriteError::new(
            "transactionFailed",
            format!("Not a file path: {}", path.display()),
        )
    })
}

/// Each journal file's directory, walked down from `root` without following
/// a symlink. Every write of a transaction goes through these handles, so a
/// directory swapped for a link later cannot redirect it.
fn open_directories(root: &Path, journal: &Journal) -> Vec<io::Result<BeneathDir>> {
    journal
        .files
        .iter()
        .map(|file| BeneathDir::open(root, file.target.parent().unwrap_or(root)))
        .collect()
}

pub(super) fn journal_directory(state_base: &Path, boundary: &Path) -> PathBuf {
    state_base
        .join(format!(
            "octocode-ast-rewrite-transactions-v1-{}",
            super::state_dir_uid_suffix()
        ))
        .join(sha256(boundary.to_string_lossy().as_bytes()))
}

pub(super) fn commit_transaction(
    state_base: &Path,
    boundary: &Path,
    files: &[PreparedFile],
    cancellation: &dyn CancellationCheck,
) -> Result<Value, RewriteError> {
    let id = transaction_id(boundary, files);
    let journal_dir = journal_directory(state_base, boundary);
    create_private_dir_all(&journal_dir)?;
    let journal_path = journal_dir.join(format!("{JOURNAL_PREFIX}{id}.json"));
    let mut journal = plan_journal(boundary, files, &id);
    persist_journal(&journal_path, &journal)?;
    // Verify before opening the directories, so no stage lands beside a
    // swapped one, and again after staging, right before the renames.
    let mut held: Option<Vec<BeneathDir>> = None;
    let result = (|| {
        verify_targets(boundary, files)?;
        let directories = held.insert(
            open_directories(boundary, &journal)
                .into_iter()
                .collect::<io::Result<_>>()
                .map_err(io_error)?,
        );
        stage_files(
            &mut journal,
            &journal_path,
            directories,
            files,
            cancellation,
        )?;
        verify_targets(boundary, files)?;
        promote_files(
            &mut journal,
            &journal_path,
            boundary,
            directories,
            cancellation,
        )
    })();
    // Settle through the handles the commit wrote through, or walk afresh
    // when it failed before opening them.
    let directories = match held {
        Some(held) => held.into_iter().map(Ok).collect(),
        None => open_directories(boundary, &journal),
    };
    match result {
        Ok(()) => {
            let Settled { errors, warnings } =
                finalize_committed(&journal_path, &journal, &directories);
            let warnings = errors.into_iter().chain(warnings).collect::<Vec<_>>();
            // Per-file before/after hashes live on the result's `files[]`.
            let mut receipt = json!({"id":id,"committed":true,"files":files.len()});
            if !warnings.is_empty() {
                receipt["cleanupWarnings"] = json!(warnings);
            }
            Ok(receipt)
        }
        Err(error) => {
            let Settled {
                errors: recovered,
                warnings,
            } = recover_one(&journal_path, &journal, &directories);
            Err(RewriteError::new(
                "transactionFailed",
                if recovered.is_empty() {
                    "The rewrite transaction failed; automatic recovery completed."
                } else {
                    "The rewrite transaction failed; automatic recovery is incomplete."
                },
            )
            .detail(json!({
                "cause":error.message,
                "rollback":{"restored":recovered.is_empty(),"files":files.len(),"errors":recovered,"warnings":warnings}
            })))
        }
    }
}

/// The journal before any write: each target with its stage and backup
/// siblings and its expected hashes.
fn plan_journal(boundary: &Path, files: &[PreparedFile], id: &str) -> Journal {
    Journal {
        version: 1,
        id: id.to_owned(),
        root: boundary.to_path_buf(),
        phase: JournalPhase::Staging,
        files: files
            .iter()
            .enumerate()
            .map(|(index, file)| JournalFile {
                target: file.absolute.clone(),
                stage: file
                    .absolute
                    .with_file_name(format!(".octocode-{id}.stage-{index}")),
                backup: file
                    .absolute
                    .with_file_name(format!(".octocode-{id}.backup-{index}")),
                before_hash: file.before_hash.clone(),
                after_hash: file.after_hash.clone(),
                state: FileState::Planned,
            })
            .collect(),
    }
}

/// Writes every new content into an owner-only stage in its target's held
/// directory, synced, then gives the stage the target's permissions.
fn stage_files(
    journal: &mut Journal,
    journal_path: &Path,
    directories: &[BeneathDir],
    files: &[PreparedFile],
    cancellation: &dyn CancellationCheck,
) -> Result<(), RewriteError> {
    for (index, file) in files.iter().enumerate() {
        cancellation.check().map_err(cancelled)?;
        let name = entry(&journal.files[index].stage)?;
        let mut stage =
            create_stage(&directories[index], &name, &file.permissions).map_err(io_error)?;
        stage.write_all(&file.after).map_err(io_error)?;
        stage.sync_all().map_err(io_error)?;
        stage
            .set_permissions(file.permissions.clone())
            .map_err(io_error)?;
        journal.files[index].state = FileState::Staged;
        persist_journal(journal_path, journal)?;
    }
    journal.phase = JournalPhase::Prepared;
    persist_journal(journal_path, journal)
}

/// A new, empty stage file, owner-only and no wider than its source before
/// its first byte.
fn create_stage(
    directory: &BeneathDir,
    name: &OsStr,
    source: &fs::Permissions,
) -> io::Result<fs::File> {
    #[cfg(unix)]
    let mode = std::os::unix::fs::PermissionsExt::mode(source);
    #[cfg(not(unix))]
    let mode = {
        let _ = source;
        0o600
    };
    directory.create_new(name, mode)
}

/// Every target is still the regular file the preview hashed, reached from
/// `boundary` without following a symlink.
fn verify_targets(boundary: &Path, files: &[PreparedFile]) -> Result<(), RewriteError> {
    for file in files {
        let unchanged = read_target(boundary, &file.absolute)
            .is_ok_and(|(bytes, _)| sha256(&bytes) == file.before_hash);
        if !unchanged {
            return Err(RewriteError::new(
                "transactionFailed",
                format!("Target bytes changed: {}", file.absolute.display()),
            ));
        }
    }
    Ok(())
}

/// Backs up each target and renames its stage into place, every rename
/// relative to the target's held directory, then syncs the files and
/// directories.
fn promote_files(
    journal: &mut Journal,
    journal_path: &Path,
    boundary: &Path,
    directories: &[BeneathDir],
    cancellation: &dyn CancellationCheck,
) -> Result<(), RewriteError> {
    journal.phase = JournalPhase::Committing;
    persist_journal(journal_path, journal)?;
    for (index, directory) in directories.iter().enumerate() {
        cancellation.check().map_err(cancelled)?;
        let file = &journal.files[index];
        let (target, backup, stage) = (
            entry(&file.target)?,
            entry(&file.backup)?,
            entry(&file.stage)?,
        );
        // Recovery finds these files by their journal paths, so a directory
        // moved or swapped for a link since staging fails here, before
        // anything moves.
        let parent = file.target.parent().unwrap_or(boundary);
        if !directory.still_at(boundary, parent).unwrap_or(false) {
            return Err(RewriteError::new(
                "transactionFailed",
                format!(
                    "A target directory moved or became a symlink during commit: {}",
                    parent.display()
                ),
            ));
        }
        directory.rename(&target, &backup).map_err(io_error)?;
        journal.files[index].state = FileState::BackedUp;
        persist_journal(journal_path, journal)?;
        if hash_entry(directory, &backup).map_err(io_error)?.as_deref()
            != Some(journal.files[index].before_hash.as_str())
        {
            return Err(RewriteError::new(
                "transactionFailed",
                "Target changed during commit.",
            ));
        }
        directory.rename(&stage, &target).map_err(io_error)?;
        directory
            .open_file(&target)
            .and_then(|file| file.sync_all())
            .map_err(io_error)?;
        journal.files[index].state = FileState::Promoted;
        persist_journal(journal_path, journal)?;
    }
    // A failed sync fails the transaction, which recovery rolls back from the
    // backups.
    let mut synced = BTreeSet::new();
    for (file, directory) in journal.files.iter().zip(directories) {
        if synced.insert(file.target.parent()) {
            directory.sync().map_err(io_error)?;
        }
    }
    journal.phase = JournalPhase::Committed;
    persist_journal(journal_path, journal)
}

/// The hash of the regular file `name` in `directory`; `None` when absent.
fn hash_entry(directory: &BeneathDir, name: &OsStr) -> io::Result<Option<String>> {
    let mut file = match directory.open_file(name) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(Some(sha256(&bytes)))
}

/// Settles every interrupted transaction on `boundary`. `Ok` carries the
/// warnings of transactions that settled while keeping an external edit.
/// Settles every interrupted transaction the caller's root lock covers: the
/// boundary's own journals and those of roots nested inside it (the lock
/// rejects overlapping roots). A pending journal of an enclosing root is
/// left to that root's lock and named in a warning.
pub(super) fn recover_transactions(
    state_base: &Path,
    boundary: &Path,
    cancellation: &dyn CancellationCheck,
) -> Result<Vec<String>, RewriteError> {
    let own = journal_directory(state_base, boundary);
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for directory in journal_directories(&own)? {
        cancellation.check().map_err(cancelled)?;
        for (path, journal) in read_journals(&directory, &mut errors)? {
            cancellation.check().map_err(cancelled)?;
            let root = if directory == own {
                boundary
            } else if journal.root != boundary
                && journal.root.starts_with(boundary)
                && directory == journal_directory(state_base, &journal.root)
            {
                journal.root.as_path()
            } else {
                if journal.root != boundary && boundary.starts_with(&journal.root) {
                    warnings.push(format!(
                        "An interrupted astRewrite transaction on the enclosing root {} is pending; apply a rewrite on that root to recover it.",
                        journal.root.display()
                    ));
                }
                continue;
            };
            if !valid_journal(root, &journal) {
                errors.push(format!("Invalid transaction journal: {}", path.display()));
                continue;
            }
            let directories = open_directories(root, &journal);
            let settled = if journal.phase == JournalPhase::Committed {
                finalize_committed(&path, &journal, &directories)
            } else {
                recover_one(&path, &journal, &directories)
            };
            errors.extend(settled.errors);
            warnings.extend(settled.warnings);
        }
    }
    if errors.is_empty() {
        Ok(warnings)
    } else {
        Err(RewriteError::new(
            "recoveryFailed",
            "An interrupted astRewrite transaction could not be recovered safely.",
        )
        .detail(json!({"errors":errors})))
    }
}

/// `own` first, then every other per-root journal directory.
fn journal_directories(own: &Path) -> Result<Vec<PathBuf>, RewriteError> {
    let mut directories = vec![own.to_path_buf()];
    let Some(base) = own.parent() else {
        return Ok(directories);
    };
    let entries = match fs::read_dir(base) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(directories),
        Err(error) => return Err(io_error(error)),
    };
    for entry in entries {
        let entry = entry.map_err(io_error)?;
        if entry.file_type().map_err(io_error)?.is_dir() && entry.path() != own {
            directories.push(entry.path());
        }
    }
    Ok(directories)
}

/// The journals in `directory`; an unreadable one is recorded in `errors`.
fn read_journals(
    directory: &Path,
    errors: &mut Vec<String>,
) -> Result<Vec<(PathBuf, Journal)>, RewriteError> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(io_error(error)),
    }
    .collect::<Result<Vec<_>, _>>()
    .map_err(io_error)?;
    let mut journals = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.starts_with(JOURNAL_PREFIX) || !name.ends_with(".json") {
            continue;
        }
        let path = entry.path();
        match fs::read(&path).map_err(io_error).and_then(|bytes| {
            serde_json::from_slice::<Journal>(&bytes)
                .map_err(|error| RewriteError::new("recoveryFailed", error.to_string()))
        }) {
            Ok(journal) => journals.push((path, journal)),
            Err(error) => errors.push(error.message),
        }
    }
    Ok(journals)
}

fn valid_journal(boundary: &Path, journal: &Journal) -> bool {
    journal.version == 1
        && journal.root == boundary
        && journal.files.iter().enumerate().all(|(index, file)| {
            file.target.starts_with(boundary)
                && file.target.parent() == file.stage.parent()
                && file.target.parent() == file.backup.parent()
                && file.stage.file_name().is_some_and(|name| {
                    name == std::ffi::OsStr::new(&format!(".octocode-{}.stage-{index}", journal.id))
                })
                && file.backup.file_name().is_some_and(|name| {
                    name == std::ffi::OsStr::new(&format!(
                        ".octocode-{}.backup-{index}",
                        journal.id
                    ))
                })
                && file.before_hash.len() == 64
                && file.after_hash.len() == 64
        })
}

/// One journal file's directory during recovery, reached without following
/// a symlink; `None` when the directory no longer exists, so each of its
/// entries is absent.
struct Entries<'a>(Option<&'a BeneathDir>);

impl<'a> Entries<'a> {
    /// The held or freshly walked directory, `None` when it is gone; `Err`
    /// names a directory no longer reachable beneath the root, which
    /// recovery never touches.
    fn of(directory: &'a io::Result<BeneathDir>, target: &Path) -> Result<Self, String> {
        match directory {
            Ok(directory) => Ok(Self(Some(directory))),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Self(None)),
            Err(error) => Err(format!(
                "Target directory is no longer reachable beneath the root ({error}): {}",
                target.display()
            )),
        }
    }

    fn hash(&self, path: &Path) -> Result<Option<String>, String> {
        let Some(directory) = self.0 else {
            return Ok(None);
        };
        hash_entry(directory, &Self::name(path)?).map_err(|error| error.to_string())
    }

    fn rename(&self, from: &Path, to: &Path) -> Result<(), String> {
        let directory = self
            .0
            .ok_or_else(|| format!("Directory missing: {}", from.display()))?;
        directory
            .rename(&Self::name(from)?, &Self::name(to)?)
            .map_err(|error| error.to_string())
    }

    /// Removes `path` if present.
    fn remove(&self, path: &Path) -> Result<(), String> {
        let Some(directory) = self.0 else {
            return Ok(());
        };
        directory
            .remove_if_present(&Self::name(path)?)
            .map_err(|error| error.to_string())
    }

    fn name(path: &Path) -> Result<OsString, String> {
        entry(path).map_err(|error| error.message)
    }
}

/// The outcome of settling one journal: errors keep the journal; warnings
/// report an external edit that was kept while the journal retired.
#[derive(Default)]
pub(super) struct Settled {
    pub(super) errors: Vec<String>,
    pub(super) warnings: Vec<String>,
}

fn recover_one(path: &Path, journal: &Journal, directories: &[io::Result<BeneathDir>]) -> Settled {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for (file, directory) in journal.files.iter().zip(directories).rev() {
        let at = match Entries::of(directory, &file.target) {
            Ok(at) => at,
            // A Planned/Staged target was never moved: its bytes are intact,
            // and a stage left in the unreachable directory is named here.
            Err(unreachable) if matches!(file.state, FileState::Planned | FileState::Staged) => {
                warnings.push(format!("{unreachable}; left it untouched."));
                continue;
            }
            Err(unreachable) => {
                errors.push(unreachable);
                continue;
            }
        };
        let result = (|| -> Result<(), String> {
            let target_hash = at.hash(&file.target)?;
            let backup_hash = at.hash(&file.backup)?;
            if let Some(backup_hash) = backup_hash {
                if backup_hash != file.before_hash {
                    if target_hash.is_none() {
                        at.rename(&file.backup, &file.target)?;
                        at.remove(&file.stage)?;
                        return Ok(());
                    }
                    return Err(format!("Backup hash mismatch: {}", file.target.display()));
                }
                if target_hash
                    .as_ref()
                    .is_some_and(|hash| hash != &file.before_hash && hash != &file.after_hash)
                {
                    return Err(format!(
                        "External target change blocks recovery: {}",
                        file.target.display()
                    ));
                }
                if target_hash.as_deref() == Some(file.before_hash.as_str()) {
                    at.remove(&file.backup)?;
                } else {
                    at.remove(&file.target)?;
                    at.rename(&file.backup, &file.target)?;
                }
            } else if target_hash.as_deref() != Some(file.before_hash.as_str()) {
                // The backup rename is persisted (BackedUp) only after it
                // happens, so a Planned/Staged target with no backup was never
                // moved: its current bytes are someone else's edit. Keep them.
                if !matches!(file.state, FileState::Planned | FileState::Staged) {
                    return Err(format!(
                        "Original bytes unavailable for recovery: {}",
                        file.target.display()
                    ));
                }
                warnings.push(format!(
                    "Target changed outside the transaction before it was moved; kept its current bytes: {}",
                    file.target.display()
                ));
            }
            at.remove(&file.stage)?;
            Ok(())
        })();
        if let Err(error) = result {
            errors.push(error);
        }
    }
    Settled {
        errors: retire(path, errors),
        warnings,
    }
}

/// Once every file settled cleanly, delete the journal and its directory.
fn retire(path: &Path, mut errors: Vec<String>) -> Vec<String> {
    if errors.is_empty()
        && let Err(error) = fs::remove_file(path)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        errors.push(error.to_string());
    }
    if errors.is_empty()
        && let Some(parent) = path.parent()
    {
        let _ = fs::remove_dir(parent);
    }
    errors
}

/// Removes a committed transaction's stage and backup files. A target edited
/// after the commit keeps its edit: the commit already happened, so the
/// mismatch is a warning and the journal still retires.
fn finalize_committed(
    path: &Path,
    journal: &Journal,
    directories: &[io::Result<BeneathDir>],
) -> Settled {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    for (file, directory) in journal.files.iter().zip(directories) {
        // The commit already happened; artifacts left in a directory no
        // longer reachable beneath the root are named, not chased.
        let at = match Entries::of(directory, &file.target) {
            Ok(at) => at,
            Err(unreachable) => {
                warnings.push(format!("{unreachable}; left its stage and backup."));
                continue;
            }
        };
        match at.hash(&file.target) {
            Ok(Some(hash)) if hash == file.after_hash => {}
            Ok(_) => warnings.push(format!(
                "Committed target changed after the commit; kept its current bytes: {}",
                file.target.display()
            )),
            Err(error) => {
                errors.push(error);
                continue;
            }
        }
        for artifact in [&file.stage, &file.backup] {
            if let Err(error) = at.remove(artifact) {
                errors.push(error);
            }
        }
    }
    Settled {
        errors: retire(path, errors),
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Journals on disk keep the phase and state words earlier releases
    /// wrote, so an interrupted transaction from one stays recoverable.
    #[test]
    fn journal_phase_and_state_keep_their_on_disk_words() {
        assert_eq!(
            [
                JournalPhase::Staging,
                JournalPhase::Prepared,
                JournalPhase::Committing,
                JournalPhase::Committed,
            ]
            .map(|phase| serde_json::to_value(phase).unwrap()),
            ["staging", "prepared", "committing", "committed"].map(serde_json::Value::from)
        );
        assert_eq!(
            [
                FileState::Planned,
                FileState::Staged,
                FileState::BackedUp,
                FileState::Promoted,
            ]
            .map(|state| serde_json::to_value(state).unwrap()),
            ["planned", "staged", "backed-up", "promoted"].map(serde_json::Value::from)
        );
    }

    /// A directory swapped for a symlink after the last target check, right
    /// before the renames, cannot redirect them: promotion fails typed, and
    /// nothing outside the root is moved, written, or left behind.
    #[cfg(unix)]
    #[test]
    fn a_directory_swapped_for_a_symlink_before_promotion_is_never_written_through() {
        use crate::tools::cancel::NeverCancel;
        let dir = tempfile::tempdir().unwrap();
        let base = fs::canonicalize(dir.path()).unwrap();
        let (root, outside) = (base.join("root"), base.join("outside"));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir(&outside).unwrap();
        let target = root.join("src/a.ts");
        // Identical bytes outside, so a hash check alone cannot tell them apart.
        for path in [&target, &outside.join("a.ts")] {
            fs::write(path, b"old\n").unwrap();
        }
        let prepared = PreparedFile {
            path: "src/a.ts".to_owned(),
            shown: "src/a.ts".to_owned(),
            absolute: target.clone(),
            before_hash: sha256(b"old\n"),
            after_hash: sha256(b"new\n"),
            before: b"old\n".to_vec(),
            after: b"new\n".to_vec(),
            patch: String::new(),
            matches: Vec::new(),
            permissions: fs::metadata(&target).unwrap().permissions(),
            before_errors: 0,
            after_facts: None,
        };
        let files = [prepared];
        let journal_path = base.join("state/journal.json");
        fs::create_dir(base.join("state")).unwrap();
        let mut journal = plan_journal(&root, &files, "swap");
        persist_journal(&journal_path, &journal).unwrap();
        let directories = open_directories(&root, &journal)
            .into_iter()
            .collect::<io::Result<Vec<_>>>()
            .unwrap();
        stage_files(
            &mut journal,
            &journal_path,
            &directories,
            &files,
            &NeverCancel,
        )
        .unwrap();
        verify_targets(&root, &files).unwrap();

        fs::rename(root.join("src"), root.join("src-moved")).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("src")).unwrap();

        let promoted = promote_files(
            &mut journal,
            &journal_path,
            &root,
            &directories,
            &NeverCancel,
        );
        let names = |path: &Path| {
            let mut names = fs::read_dir(path)
                .unwrap()
                .map(|entry| entry.unwrap().file_name().into_string().unwrap())
                .collect::<Vec<_>>();
            names.sort();
            names
        };
        assert_eq!(names(&outside), ["a.ts"], "nothing lands outside the root");
        assert_eq!(fs::read(outside.join("a.ts")).unwrap(), b"old\n");
        assert_eq!(fs::read(root.join("src-moved/a.ts")).unwrap(), b"old\n");
        let error = promoted.expect_err("never promote through the link");
        assert_eq!(error.code, "transactionFailed", "{}", error.message);
        // Recovery through the held handles drops the stage from the real,
        // moved directory and retires the journal; outside stays untouched.
        let directories = directories.into_iter().map(Ok).collect::<Vec<_>>();
        let settled = recover_one(&journal_path, &journal, &directories);
        assert!(settled.errors.is_empty(), "{:?}", settled.errors);
        assert_eq!(names(&root.join("src-moved")), ["a.ts"]);
        assert_eq!(names(&outside), ["a.ts"]);
        assert!(!journal_path.exists());
    }

    /// A stage holds the source's new bytes, so before its first byte it is
    /// already no wider than the source and never wider than owner-only.
    #[cfg(unix)]
    #[test]
    fn a_stage_is_never_wider_than_its_source_before_any_byte() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let held = BeneathDir::open(dir.path(), dir.path()).unwrap();
        for source in [0o600, 0o644, 0o640, 0o400, 0o755] {
            let name = format!("stage-{source:o}");
            let file = create_stage(
                &held,
                OsStr::new(&name),
                &fs::Permissions::from_mode(source),
            )
            .unwrap();
            let staged = file.metadata().unwrap().permissions().mode() & 0o777;
            assert_eq!(file.metadata().unwrap().len(), 0);
            assert_eq!(staged & !source, 0, "source {source:o} staged {staged:o}");
            assert_eq!(staged & !0o600, 0, "source {source:o} staged {staged:o}");
        }
    }
}
