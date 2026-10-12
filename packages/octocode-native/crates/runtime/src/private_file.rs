//! Owner-only files: no-follow opens, bounded reads, and atomic replacement.
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

/// Open a regular file without following a final symlink. Nonblocking, so a
/// FIFO planted at `path` fails instead of hanging; `create` makes it 0600.
pub(crate) fn open_no_follow(path: &Path, create: bool) -> io::Result<File> {
    if let Ok(metadata) = fs::symlink_metadata(path)
        && !metadata.file_type().is_file()
    {
        return Err(not_regular());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    if create {
        options.write(true).create(true).truncate(false);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path)?;
    if !file.metadata()?.is_file() {
        return Err(not_regular());
    }
    Ok(file)
}

fn not_regular() -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        "Expected a regular file, not a symlink, directory, or device.",
    )
}

/// Open the regular file `path` for reading by walking down from `boundary`
/// one component at a time, never following a symlink, so a file or
/// directory swapped for a link after an earlier check cannot redirect the
/// read outside `boundary`. `path` must lie beneath `boundary` with no `..`;
/// a symlink or non-file anywhere below `boundary` is `InvalidInput`.
pub(crate) fn open_beneath(boundary: &Path, path: &Path) -> io::Result<File> {
    let names = names_beneath(boundary, path)?;
    let Some((file_name, directories)) = names.split_last() else {
        return Err(not_regular());
    };
    BeneathDir::walk(boundary, directories)?.open_file(file_name)
}

/// The components of `path` below `boundary`; `..`, `.` or a root is
/// `InvalidInput`.
fn names_beneath<'a>(boundary: &Path, path: &'a Path) -> io::Result<Vec<&'a OsStr>> {
    let relative = path.strip_prefix(boundary).map_err(|_| not_regular())?;
    relative
        .components()
        .map(|component| match component {
            Component::Normal(name) => Ok(name),
            _ => Err(not_regular()),
        })
        .collect()
}

/// A directory at or below a boundary, reached without following any
/// symlink, whose entries are then opened, created, renamed and removed by
/// name relative to it. On Unix it holds the directory's descriptor, so a
/// path component swapped for a link afterwards cannot redirect those
/// operations: they stay on the directory that was walked.
pub(crate) struct BeneathDir {
    #[cfg(unix)]
    directory: File,
    /// Windows has no `*at` calls in std: every operation re-resolves this
    /// path, so a swap between the walk and an operation is narrowed, not
    /// closed. This is the platform's existing behaviour, kept on purpose.
    #[cfg(not(unix))]
    directory: PathBuf,
}

impl BeneathDir {
    /// The directory `path` (`boundary` itself or beneath it, no `..`).
    pub(crate) fn open(boundary: &Path, path: &Path) -> io::Result<Self> {
        Self::walk(boundary, &names_beneath(boundary, path)?)
    }

    /// Whether walking from `boundary` to `path` again still reaches this
    /// directory. On Unix it compares device and inode; Windows std exposes
    /// no stable file identity, so there a fresh walk without links is all
    /// it checks.
    pub(crate) fn still_at(&self, boundary: &Path, path: &Path) -> io::Result<bool> {
        let again = Self::open(boundary, path)?;
        #[cfg(unix)]
        let same = {
            use std::os::unix::fs::MetadataExt;
            let (now, held) = (again.directory.metadata()?, self.directory.metadata()?);
            now.dev() == held.dev() && now.ino() == held.ino()
        };
        #[cfg(not(unix))]
        let same = {
            let _ = again;
            true
        };
        Ok(same)
    }

    /// Create the entry `name` exclusively, never through a symlink, with at
    /// most the owner bits of `mode` (Unix).
    pub(crate) fn create_new(&self, name: &OsStr, mode: u32) -> io::Result<File> {
        #[cfg(unix)]
        let file = open_at(
            &self.directory,
            name,
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
            (mode & 0o600) as libc::mode_t,
        );
        #[cfg(not(unix))]
        let file = create_new(&self.directory.join(name), mode);
        file
    }

    /// Open the regular file `name` for reading without following a link;
    /// nonblocking, so a FIFO planted there fails instead of hanging.
    pub(crate) fn open_file(&self, name: &OsStr) -> io::Result<File> {
        #[cfg(unix)]
        let file = open_at(&self.directory, name, libc::O_RDONLY | libc::O_NONBLOCK, 0)?;
        #[cfg(not(unix))]
        let file = open_no_follow(&self.directory.join(name), false)?;
        if !file.metadata()?.is_file() {
            return Err(not_regular());
        }
        Ok(file)
    }

    /// Rename the entry `from` to `to`, both in this directory, replacing
    /// `to`.
    pub(crate) fn rename(&self, from: &OsStr, to: &OsStr) -> io::Result<()> {
        #[cfg(unix)]
        let result = {
            use std::os::fd::AsRawFd;
            let (from, to) = (c_name(from)?, c_name(to)?);
            let fd = self.directory.as_raw_fd();
            // SAFETY: `fd` is an open directory and both names are single
            // NUL-terminated path components.
            if unsafe { libc::renameat(fd, from.as_ptr(), fd, to.as_ptr()) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        };
        #[cfg(not(unix))]
        let result = fs::rename(self.directory.join(from), self.directory.join(to));
        result
    }

    /// Remove the entry `name` (the link itself if it is one); an absent
    /// entry is `Ok`.
    pub(crate) fn remove_if_present(&self, name: &OsStr) -> io::Result<()> {
        #[cfg(unix)]
        let result = {
            use std::os::fd::AsRawFd;
            let name = c_name(name)?;
            // SAFETY: an open directory and one NUL-terminated component.
            if unsafe { libc::unlinkat(self.directory.as_raw_fd(), name.as_ptr(), 0) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        };
        #[cfg(not(unix))]
        let result = fs::remove_file(self.directory.join(name));
        match result {
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            result => result,
        }
    }

    /// Flush the directory's entries. Windows cannot open a directory to sync
    /// it; there renames rest on the filesystem's own ordering.
    pub(crate) fn sync(&self) -> io::Result<()> {
        #[cfg(unix)]
        let result = self.directory.sync_all();
        #[cfg(not(unix))]
        let result = Ok(());
        result
    }

    /// Unix: each component is an `openat` relative to its parent's
    /// descriptor with `O_NOFOLLOW`, so no path is resolved twice.
    #[cfg(unix)]
    fn walk(boundary: &Path, names: &[&OsStr]) -> io::Result<Self> {
        use std::os::unix::fs::OpenOptionsExt;
        let mut directory = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY)
            .open(boundary)?;
        for name in names {
            directory = open_at(&directory, name, libc::O_RDONLY | libc::O_DIRECTORY, 0)?;
        }
        Ok(Self { directory })
    }

    /// Elsewhere: refuse any component that is not a real directory. This
    /// checks before later operations use the path, so it narrows the swap
    /// window rather than closing it.
    #[cfg(not(unix))]
    fn walk(boundary: &Path, names: &[&OsStr]) -> io::Result<Self> {
        let mut directory = boundary.to_path_buf();
        for name in names {
            directory.push(name);
            if !fs::symlink_metadata(&directory)?.is_dir() {
                return Err(not_regular());
            }
        }
        Ok(Self { directory })
    }
}

#[cfg(unix)]
fn c_name(name: &OsStr) -> io::Result<std::ffi::CString> {
    use std::os::unix::ffi::OsStrExt;
    std::ffi::CString::new(name.as_bytes()).map_err(|_| not_regular())
}

/// `openat(directory, name)` that never follows a link at `name`; a link or
/// non-directory where a directory is required is `InvalidInput`.
#[cfg(unix)]
fn open_at(
    directory: &File,
    name: &OsStr,
    flags: libc::c_int,
    mode: libc::mode_t,
) -> io::Result<File> {
    use std::os::fd::{AsRawFd, FromRawFd};
    let name = c_name(name)?;
    // SAFETY: `directory` is an open descriptor and `name` is one
    // NUL-terminated path component; `mode` is read only with `O_CREAT`.
    let fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            libc::c_uint::from(mode),
        )
    };
    if fd < 0 {
        let error = io::Error::last_os_error();
        return Err(match error.raw_os_error() {
            Some(libc::ELOOP | libc::ENOTDIR) => not_regular(),
            _ => error,
        });
    }
    // SAFETY: `fd` is a fresh descriptor that nothing else owns.
    Ok(unsafe { File::from_raw_fd(fd) })
}

/// Read at most `limit` bytes; a larger input is an error, never a prefix.
pub(crate) fn read_limited(reader: impl Read, limit: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("File exceeds {} KiB.", limit / 1024),
        ));
    }
    Ok(bytes)
}

/// Create `path` exclusively, never through a symlink, with at most the
/// owner bits of `mode` (Unix), so no other user can read it from its first
/// byte.
pub(crate) fn create_new(path: &Path, mode: u32) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(mode & 0o600).custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(not(unix))]
    let _ = mode;
    options.open(path)
}

/// Replace `path` with `bytes` through an owner-only temporary file in the
/// same directory, so readers see the old or the new content, never a mix.
/// `durable` syncs the file before the rename and the directory after it.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8], durable: bool) -> io::Result<()> {
    let temporary = unique_sibling(path, "tmp")?;
    let result = (|| {
        let mut file = create_new(&temporary, 0o600)?;
        file.write_all(bytes)?;
        if durable {
            file.sync_all()?;
        }
        drop(file);
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
        return result;
    }
    // The rename already happened; a directory that cannot be synced does not
    // undo it, so this step is best effort.
    #[cfg(unix)]
    if durable && let Some(parent) = path.parent() {
        let _ = File::open(parent).and_then(|directory| directory.sync_all());
    }
    Ok(())
}

/// A hidden, unpredictable sibling name: `.{name}-{128-bit hex}.{suffix}`.
fn unique_sibling(path: &Path, suffix: &str) -> io::Result<PathBuf> {
    let mut nonce = [0_u8; 16];
    getrandom::fill(&mut nonce).map_err(|_| io::Error::other("Cannot create a file name."))?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    Ok(path.with_file_name(format!(".{name}-{}.{suffix}", hex::encode(nonce))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_owner_only_and_leaves_no_temporary() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.json");
        fs::write(&path, "old").unwrap();
        for durable in [false, true] {
            write_atomic(&path, b"new", durable).unwrap();
            assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        }
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn bounded_read_rejects_oversize_instead_of_truncating() {
        assert_eq!(read_limited(&b"abcd"[..], 4).unwrap(), b"abcd");
        assert!(read_limited(&b"abcde"[..], 4).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn beneath_open_never_follows_a_swapped_directory_or_file() {
        let dir = tempfile::tempdir().unwrap();
        let boundary = dir.path().join("root");
        let outside = dir.path().join("outside");
        fs::create_dir_all(boundary.join("src")).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(boundary.join("src/a.ts"), "inside").unwrap();
        fs::write(outside.join("a.ts"), "outside").unwrap();
        let target = boundary.join("src/a.ts");
        let mut read = String::new();
        open_beneath(&boundary, &target)
            .unwrap()
            .read_to_string(&mut read)
            .unwrap();
        assert_eq!(read, "inside");
        // A directory swapped for a link to outside the boundary.
        fs::rename(boundary.join("src"), boundary.join("moved")).unwrap();
        std::os::unix::fs::symlink(&outside, boundary.join("src")).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "outside");
        let error = open_beneath(&boundary, &target).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        // A final component swapped for a link.
        fs::remove_file(boundary.join("src")).unwrap();
        fs::create_dir(boundary.join("src")).unwrap();
        std::os::unix::fs::symlink(outside.join("a.ts"), &target).unwrap();
        let error = open_beneath(&boundary, &target).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        // Nothing outside the boundary or above it.
        assert!(open_beneath(&boundary, &outside.join("a.ts")).is_err());
        assert!(open_beneath(&boundary, &boundary.join("src/../moved/a.ts")).is_err());
        assert!(open_beneath(&boundary, &boundary.join("moved/a.ts")).is_ok());
    }

    /// Operations through a held directory stay on the directory that was
    /// walked, even after its path is swapped for a link to outside, and a
    /// fresh walk tells the swap apart.
    #[cfg(unix)]
    #[test]
    fn a_held_directory_keeps_its_operations_after_a_swap() {
        let dir = tempfile::tempdir().unwrap();
        let boundary = dir.path().join("root");
        let outside = dir.path().join("outside");
        fs::create_dir_all(boundary.join("src")).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(outside.join("a.ts"), "outside").unwrap();
        let src = boundary.join("src");
        let held = BeneathDir::open(&boundary, &src).unwrap();
        assert!(held.still_at(&boundary, &src).unwrap());
        held.create_new(OsStr::new("stage"), 0o644)
            .unwrap()
            .write_all(b"new")
            .unwrap();
        fs::rename(&src, boundary.join("moved")).unwrap();
        std::os::unix::fs::symlink(&outside, &src).unwrap();
        assert_eq!(
            held.still_at(&boundary, &src).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        held.rename(OsStr::new("stage"), OsStr::new("a.ts"))
            .unwrap();
        held.sync().unwrap();
        let mut read = String::new();
        held.open_file(OsStr::new("a.ts"))
            .unwrap()
            .read_to_string(&mut read)
            .unwrap();
        assert_eq!(read, "new");
        assert_eq!(
            fs::read_to_string(boundary.join("moved/a.ts")).unwrap(),
            "new"
        );
        assert_eq!(fs::read_to_string(outside.join("a.ts")).unwrap(), "outside");
        held.remove_if_present(OsStr::new("a.ts")).unwrap();
        held.remove_if_present(OsStr::new("a.ts")).unwrap();
        assert_eq!(fs::read_dir(boundary.join("moved")).unwrap().count(), 0);
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 1);
        // The boundary itself is a directory beneath itself; `..` is not.
        assert!(BeneathDir::open(&boundary, &boundary).is_ok());
        assert!(BeneathDir::open(&boundary, &boundary.join("moved/..")).is_err());
        // A link in place of a file is refused, never opened through.
        std::os::unix::fs::symlink(outside.join("a.ts"), boundary.join("moved/link")).unwrap();
        let moved = BeneathDir::open(&boundary, &boundary.join("moved")).unwrap();
        assert!(moved.open_file(OsStr::new("link")).is_err());
        assert!(moved.create_new(OsStr::new("link"), 0o600).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn no_follow_open_rejects_symlinks_and_fifos() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target");
        fs::write(&target, "x").unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(open_no_follow(&link, false).is_err());
        assert!(open_no_follow(&link, true).is_err());
        let fifo = dir.path().join("fifo");
        let name = std::ffi::CString::new(fifo.to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        assert!(open_no_follow(&fifo, false).is_err());
        assert!(open_no_follow(&target, false).is_ok());
    }
}
