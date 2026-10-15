//! Coverage disclosure and leads: what a page could not cover (binary,
//! default-excluded, policy-withheld, unreadable) and the follow-up calls
//! (read, references, re-runs, listings) a page offers.

use super::executor::*;
use super::layout::*;
use super::types::*;
use crate::contracts::tool_types::{
    LocalSearchSkippedPath, LocalSearchSkippedPathCause, LocalSearchSkippedPaths,
};
use crate::policy::path::PathPolicy;
use crate::policy::prune::DefaultsFlag;
use crate::policy::prune::PruneMode;
use crate::security::ContentSecurity;
use crate::tools::cancel::CancellationCheck;
use crate::tools::empty_walk::{Cause, Globs, Hits, Tagged, Verdict, Walk, diagnose, lift};
use crate::tools::id::ToolId;
use crate::tools::id::query_limits::local_fetch::RANGES_MAX_ITEMS;
use crate::tools::result::{Continuation, ToolError};
use octocode_engine::{portable::search_text_cancellable, types::TextSearchOptions};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// What the scan could not cover, and how the row says so.
pub(super) struct Coverage {
    pub(super) error_count: u32,
    /// Of `error_count`: readable files the regex failed on (a match limit).
    pub(super) pattern_error_count: u32,
    /// A file was searched only up to its first NUL (`binaryQuit`).
    pub(super) binary_cut: bool,
    pub(super) binary_files: String,
    pub(super) pcre2_deadline: bool,
    pub(super) skip_hint: Option<String>,
    /// include/exclude filtered out every file: nothing was searched.
    pub(super) scope_miss: bool,
    /// Entries the security path policy withheld from the walk.
    pub(super) withheld: usize,
    /// Files the scan searched: an empty row's one fact.
    pub(super) files_searched: u32,
    /// The warning for an include/exclude glob with a `..` segment, which
    /// never matches: globs match paths under `path`.
    pub(super) parent_glob: Option<String>,
    /// The walk stopped before it reached every path (a cap other than a
    /// binary cut, which only ends one file's content).
    pub(super) walk_cut: bool,
}

/// The empty row's fact when include/exclude left the walk no file.
const SCOPE_MISS_HINT: &str = "Nothing searched: include/exclude matched no file.";

impl Coverage {
    pub(super) fn of(
        query: &LocalSearchQuery,
        stats: &SearchStats,
        scanned: &octocode_engine::types::TextSearchStats,
        root: &std::path::Path,
        output_root: &std::path::Path,
        skipped: &crate::policy::discovery::WalkSkips,
    ) -> Self {
        let cap_reasons = || {
            stats
                .cap_reason
                .as_deref()
                .unwrap_or_default()
                .split(", ")
                .filter(|reason| !reason.is_empty())
        };
        let cap_has = |name: &str| cap_reasons().any(|reason| reason == name);
        let skip_hint = skipped_target_hint(
            root.is_file(),
            stats.files_searched,
            stats.cap_reason.as_deref(),
        )
        .or_else(|| {
            (root.is_file() && scanned.skipped_binary_count.unwrap_or(0) > 0).then(|| {
                "The target file is binary from its leading bytes (a NUL in its header); it was not searched, and no text tool reads it.".into()
            })
        });
        Self {
            error_count: stats.error_count.unwrap_or(0),
            pattern_error_count: scanned.pattern_error_count.unwrap_or(0),
            binary_cut: cap_has("binaryQuit"),
            binary_files: binary_file_list(
                scanned.binary_files.as_deref().unwrap_or_default(),
                scanned.binary_file_count.unwrap_or(0),
                output_root,
            ),
            pcre2_deadline: cap_has("pcre2Deadline"),
            scope_miss: !root.is_file()
                && stats.files_searched == 0
                && skip_hint.is_none()
                && (!query.include.is_empty() || !query.exclude.is_empty()),
            skip_hint,
            withheld: skipped.withheld.total(),
            files_searched: stats.files_searched,
            parent_glob: crate::policy::include::parent_glob_warning(
                &query.include,
                &query.exclude,
            ),
            walk_cut: stats.capped == Some(true)
                && (cap_reasons().next().is_none()
                    || cap_reasons().any(|reason| reason != "binaryQuit")),
        }
    }

    /// Unreadable paths or a binary cut leave coverage incomplete: absence
    /// is unproven, and prefix matches before a NUL are not the file's full
    /// set.
    pub(super) fn gap(&self) -> bool {
        self.error_count > 0 || self.binary_cut
    }

    pub(super) fn warnings(
        &self,
        layout: &Layout,
        shown_redacted: usize,
        unverified: bool,
        empty: bool,
    ) -> Vec<String> {
        let mut warnings = vec![];
        warnings.extend(self.parent_glob.clone());
        // A clipped value is flagged on its row (`originalChars`,
        // `returnedChars`) and read whole by its `expandValues` lead.
        if shown_redacted > 0 && !layout.list {
            warnings.push(format!(
                "redactedMatches: {shown_redacted} returned match value(s) had secret-shaped text replaced by [REDACTED…] placeholders; those values are not verbatim source."
            ));
        }
        if unverified {
            warnings.push(
                "Some match values were redacted because their source file could not be re-read to check clipped text for secrets. Use localFetch at the returned anchors.".into(),
            );
        }
        if self.pcre2_deadline {
            warnings.push(
                "The PCRE2 (regex:\"pcre2\") search stopped at its wall-clock deadline; results cover only the files finished before it.".into(),
            );
        }
        if self.binary_cut {
            warnings.push(format!(
                "binaryFileSkipped: {} searched only up to the first NUL byte.",
                self.binary_files
            ));
        }
        // Hints are shown only on empty/error rows; a partial row keeps the
        // unreadable-path explanation as a warning.
        if self.pattern_error_count > 0 {
            warnings.push(format!(
                "patternLimit: the regex hit the engine's matching limit in {}, which went unsearched; simplify nested repetition, or use regex:\"rust\".",
                crate::response::pages::counted(u64::from(self.pattern_error_count), "file", "files")
            ));
        }
        let unreadable = self.error_count - self.pattern_error_count.min(self.error_count);
        if unreadable > 0 && empty {
            warnings.push(unreadable_hint(unreadable));
        }
        warnings
    }

    /// A scope miss stands only while no skipped path may hold a match: then
    /// the skip, not include/exclude, is why nothing was searched, and the
    /// skip's own hint replaces the generic count of searched files.
    pub(super) fn skipped_paths_hold_matches(&mut self, hints: &mut Vec<String>) {
        self.scope_miss = false;
        let counted = empty_hint(self.files_searched);
        hints.retain(|hint| hint != SCOPE_MISS_HINT && *hint != counted);
    }

    /// An empty row's one per-call fact; unreadable paths and a binary cut
    /// are stated once, in `warnings`.
    pub(super) fn empty_hints(&self, empty: bool) -> Vec<String> {
        if !empty {
            return vec![];
        }
        if self.scope_miss {
            vec![SCOPE_MISS_HINT.into()]
        } else if self.error_count > 0 {
            vec![]
        } else if let Some(hint) = &self.skip_hint {
            vec![hint.clone()]
        } else if self.withheld > 0 {
            // Not a spelling problem: the policy notice in `warnings` names
            // what was withheld (once, there).
            vec!["No matches where searched; the withheld entries named in warnings may hold it (unproven).".into()]
        } else {
            vec![empty_hint(self.files_searched)]
        }
    }
}

/// A page's result, for its leads.
pub(super) struct Found<'a> {
    pub(super) query: &'a LocalSearchQuery,
    pub(super) paths: &'a PathPolicy,
    pub(super) root: &'a std::path::Path,
    pub(super) output_root: &'a std::path::Path,
    pub(super) files: &'a [SearchFile],
    pub(super) layout: &'a Layout,
    pub(super) definition: Option<&'a Definition>,
    pub(super) symbol: Option<&'a str>,
    pub(super) scanned: &'a octocode_engine::types::TextSearchStats,
    /// What the walk left out: policy-withheld and default-excluded files.
    pub(super) skipped: &'a crate::policy::discovery::WalkSkips,
    /// The walk reached every path. A binary cut or an unreadable file
    /// leaves file content unread, not paths unwalked, so it does not
    /// clear this.
    pub(super) walk_complete: bool,
    pub(super) empty: bool,
}

impl Found<'_> {
    /// Leads in the tool's own rank: a read of the top hit, the symbol's
    /// lspSearch lead, then reads of clipped values, the skipped binaries
    /// and the literal search. Returns whether skipped paths hold a match
    /// and the first page's observed skipped-path disclosure.
    pub(super) fn add_leads(
        &self,
        stats: &mut SearchStats,
        next: &mut Option<Value>,
        hints: &mut Vec<String>,
        warnings: &mut Vec<String>,
        search_options: &TextSearchOptions,
        cancel: &impl CancellationCheck,
    ) -> Result<(bool, Option<LocalSearchSkippedPaths>), ToolError> {
        let query = self.query;
        let first_disclosure = self.first_page() && query.match_page().max(1) == 1;
        let mut skipped_paths = if first_disclosure {
            self.excluded_paths()?
        } else {
            None
        };
        let mut add = |name: String, lead: Value| {
            if let Some(map) = next.get_or_insert_with(|| json!({})).as_object_mut() {
                map.insert(name, lead);
            }
        };
        if let Some(read) = self.read_lead() {
            add("read".into(), read);
        }
        if let (Some(symbol), Some(definition)) = (self.symbol, self.definition)
            && let Some(row) = crate::tools::leads::lsp::verify_query(
                &definition.source,
                symbol,
                u64::from(definition.line),
                crate::tools::leads::lsp::Verify::for_kind(&definition.kind),
            )
        {
            add(
                crate::tools::leads::lsp::lead_name(&row),
                Continuation::new(ToolId::LspSearch, row).build(),
            );
        }
        if let Some(lead) = self.expand_values_lead(warnings) {
            add("expandValues".into(), lead);
        }
        // Binaries were never text to search: a row with hits states their
        // count in `stats`, an empty row says it in `warnings`, where the
        // count may explain the miss.
        if let Some((warning, listing)) = self.skipped_binaries() {
            if self.empty {
                warnings.extend(Some(warning).filter(|warning| !warning.is_empty()));
            } else {
                stats.binary_skipped = self.leading_binaries();
            }
            add("binarySkipped".into(), listing);
        }
        // What the walk left out is disclosed once, on the first page: the
        // security policy's withheld entries (nothing lifts them), and the
        // default excludes with the same search over them.
        if first_disclosure {
            warnings.extend(self.skipped.withheld.notice());
            if !self.empty
                && let Some(counts) = excluded_counts(self.scanned, self.skipped)
            {
                warnings.push(format!("Default excludes skipped {counts}."));
                add(
                    "includeSkipped".into(),
                    lifting_lead(query, &[Cause::DefaultExcluded]),
                );
            }
        }
        // Thousands of hits page for dozens of calls: one count call ranks
        // the files first, so the next read or narrowing is chosen, not paged.
        if self.first_page()
            && !is_count_or_list_view(query)
            && let Some(total) = self
                .scanned
                .match_count
                .filter(|total| *total >= LARGE_RESULT_MATCHES)
        {
            add("viewFileCount".into(), count_lead(query));
            hints.push(format!("{total} matches."));
        }
        // An unset `regex` runs as a regex only when the text reads only as
        // one; an empty literal search whose text has regex characters says
        // the other reading exists.
        let literal_missed = self.empty
            && query.regex.is_none()
            && query.regex_mode() == LocalSearchQueryRegex::Literal
            && query
                .match_string
                .contains(super::types::REGEX_METACHARACTERS);
        if literal_missed {
            warnings.push(
                "matchString ran as literal text; regex:\"rust\" runs it as a regex.".to_owned(),
            );
        }
        if self.empty && self.walk_complete && self.first_page() {
            disclose_variants(query, self.paths, search_options, next, hints, cancel);
        }
        let skipped_match =
            if self.empty && self.walk_complete && first_disclosure && !self.root.is_file() {
                let (matched, observed) = disclose_unsearched(
                    query,
                    self.paths,
                    search_options,
                    excluded_counts(self.scanned, self.skipped),
                    next,
                    hints,
                    cancel,
                )?;
                if let Some(observed) = observed {
                    let disclosure = skipped_paths.get_or_insert_with(|| LocalSearchSkippedPaths {
                        entries: Vec::new(),
                        sampled: false,
                    });
                    disclosure.sampled |= observed.sampled;
                    for entry in observed.entries {
                        if let Some(existing) = disclosure.entries.iter_mut().find(|known| {
                            known.path == entry.path
                                && known.cause == entry.cause
                                && (known.reason == entry.reason
                                    || known.reason.is_none()
                                    || entry.reason.is_none())
                        }) {
                            if existing.reason.is_none() {
                                existing.reason = entry.reason;
                            }
                        } else {
                            disclosure.entries.push(entry);
                        }
                    }
                }
                matched
            } else {
                false
            };
        Ok((skipped_match, skipped_paths))
    }

    fn excluded_paths(&self) -> Result<Option<LocalSearchSkippedPaths>, ToolError> {
        let entries = self
            .scanned
            .pruned_dirs
            .as_deref()
            .unwrap_or_default()
            .iter()
            .chain(self.skipped.generated.iter())
            .map(|path| {
                Ok(LocalSearchSkippedPath {
                    path: self
                        .root
                        .join(path)
                        .to_string_lossy()
                        .into_owned()
                        .try_into()
                        .map_err(skipped_path_error)?,
                    cause: LocalSearchSkippedPathCause::DefaultExcluded,
                    reason: None,
                })
            })
            .collect::<Result<Vec<_>, ToolError>>()?;
        Ok((!entries.is_empty()).then_some(LocalSearchSkippedPaths {
            entries,
            sampled: !self.walk_complete,
        }))
    }

    /// The one call that reads every clipped value on the page whole; a
    /// warning counts the windows past what one call holds.
    fn expand_values_lead(&self, warnings: &mut Vec<String>) -> Option<Value> {
        let query = self.query;
        let expansions = expand_values(
            query,
            self.paths,
            self.output_root,
            self.files,
            self.layout.context_lines,
            query.multiline != LocalSearchQueryMultiline::Off,
            // A caller-sized (grid) page keeps its rows whatever the value
            // width; a streamed page is cut by serialized size.
            (!self.layout.streamed).then_some(GridPage {
                value_cap: self.layout.budget_cap.unwrap_or(RESPONSE_VALUE_CHAR_BUDGET),
            }),
        );
        let (lead, left) = one_call(&expansions)?;
        if left > 0 {
            warnings.push(format!(
                "expandValues reads {} of {} clipped-value windows; {left} more are on this page.",
                expansions.len() - left,
                expansions.len()
            ));
        }
        Some(lead)
    }

    pub(super) fn first_page(&self) -> bool {
        self.query.page().max(1) == 1
    }

    /// The natural next step on a first page with hits: read the top hit in
    /// context. A shown declaration of the searched symbol reads that
    /// declaration whole when one block read holds it; a larger one (a big
    /// class) reads its hit in context, like any other hit. A partial page
    /// (a binary cut, an unreadable path) still reads its shown hits; a file
    /// cut at a NUL byte is never the read (localFetch rejects binaries).
    pub(super) fn read_lead(&self) -> Option<Value> {
        let query = self.query;
        let readable = self.first_page()
            && !self.layout.list
            && query.result_view != LocalSearchQueryResultView::MatchOnly
            && self.layout.context_lines == 0
            && query.regex_mode() != LocalSearchQueryRegex::Pcre2
            && query.invert_match != Some(true);
        if !readable {
            return None;
        }
        let binary_cut = self.scanned.binary_files.as_deref().unwrap_or_default();
        let text_file = |file: &&SearchFile| {
            !binary_cut
                .iter()
                .any(|cut| std::path::Path::new(cut).ends_with(&file.path))
        };
        let declared = self.definition.and_then(|definition| {
            self.files
                .iter()
                .filter(text_file)
                .find(|file| {
                    self.output_root.join(&file.path).to_string_lossy()
                        == definition.source.as_str()
                })
                .zip(Some(definition))
        });
        match declared {
            Some((file, definition))
                if (definition.end + 1).saturating_sub(definition.start) as usize
                    <= crate::tools::local_fetch::BLOCK_MAX_LINES =>
            {
                Some(declaration_read(
                    query,
                    self.root,
                    file,
                    definition.start,
                    definition.end,
                ))
            }
            Some((file, _)) => read_handoff(query, self.root, file),
            None => self
                .files
                .iter()
                .find(text_file)
                .and_then(|top| read_handoff(query, self.root, top)),
        }
    }

    /// Files skipped as binary from their leading bytes, when any.
    pub(super) fn leading_binaries(&self) -> Option<u32> {
        let total: u32 = self
            .scanned
            .skipped_binary_extensions
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|group| group.count)
            .sum();
        (total > 0).then_some(total)
    }

    /// Files binary from their leading bytes are outside a text search, not
    /// a coverage gap: disclosed once, on the first page, as a count by
    /// extension with a listing.
    /// The listing also covers binary-cut files too many to name in their
    /// own warning ([`binary_file_list`]).
    pub(super) fn skipped_binaries(&self) -> Option<(String, Value)> {
        if !self.first_page() || self.root.is_file() {
            return None;
        }
        let skipped = self
            .scanned
            .skipped_binary_extensions
            .as_deref()
            .unwrap_or_default();
        let cut = self.scanned.binary_files.as_deref().unwrap_or_default();
        let cut_groups = if cut.len() > MAX_NAMED_BINARY_FILES {
            binary_groups(cut)
        } else {
            Vec::new()
        };
        if skipped.is_empty() && cut_groups.is_empty() {
            return None;
        }
        let listing =
            leading_binary_listing(self.query, &merge_binary_groups(skipped, &cut_groups));
        let warning = if skipped.is_empty() {
            // The cut files' own warning carries the count.
            String::new()
        } else {
            leading_binary_warning(skipped)
        };
        Some((warning, listing))
    }
}

/// The searched symbol's declaration among the shown hits.
pub(super) struct Definition {
    /// Absolute path of the declaring file.
    pub(super) source: String,
    /// The declaration's name line.
    pub(super) line: u32,
    pub(super) kind: String,
    /// Its first and last line.
    pub(super) start: u32,
    pub(super) end: u32,
}

/// localFetch read of a shown declaration whole, from its first line to its
/// last; localFetch pages a long one.
pub(super) fn declaration_read(
    query: &LocalSearchQuery,
    root: &std::path::Path,
    file: &SearchFile,
    start: u32,
    end: u32,
) -> Value {
    Continuation::new(
        ToolId::LocalFetch,
        json!({"path": joined_path(query, root, file), "ranges": [format!("{start}-{end}")]}),
    )
    .build()
}

/// A hit whose value was clipped out of a line longer than one read page:
/// a line-range read of it shows the line's start, not the hit.
pub(super) fn is_long_line_hit(hit: &SearchMatch) -> bool {
    hit.clipped
        && hit
            .original_chars
            .is_some_and(|chars| chars > crate::tools::local_fetch::LINE_PAGE_BYTES)
}

/// A byte window of the hit's line, starting at the hit.
pub(super) fn long_line_read(path: &str, hit: &SearchMatch) -> Value {
    Continuation::new(
        ToolId::LocalFetch,
        json!({
            "path": path,
            "ranges": [format!("{0}-{0}", hit.line)],
            "unit": "bytes",
            "offset": hit.byte_offset,
        }),
    )
    .confidence("exact")
    .build()
}

/// A shown file's path joined to the caller's own `path`, so a read
/// resolves wherever the search did.
pub(super) fn joined_path(
    query: &LocalSearchQuery,
    root: &std::path::Path,
    file: &SearchFile,
) -> String {
    if root.is_file() {
        query.path.to_string()
    } else {
        std::path::Path::new(query.path.as_str())
            .join(&file.path)
            .to_string_lossy()
            .into_owned()
    }
}

/// Re-run an empty search over what the defaults leave out (ignored and
/// hidden entries, the default-excluded directories) to say which of them
/// hold a match: the hint names the rule, entry or directory, and the lead
/// searches again with only those lifted. Default-excluded directories the
/// re-run could not finish are named with the lead that searches them.
/// Returns whether skipped paths were shown to hold a match.
pub(super) fn disclose_unsearched(
    query: &LocalSearchQuery,
    paths: &PathPolicy,
    search_options: &TextSearchOptions,
    excluded: Option<String>,
    next: &mut Option<Value>,
    hints: &mut Vec<String>,
    cancel: &impl CancellationCheck,
) -> Result<(bool, Option<LocalSearchSkippedPaths>), ToolError> {
    let walk = Walk {
        ignored: query.include_ignored == Some(true),
        hidden: query.include_hidden == Some(true),
        default_excludes: query.default_excludes.defaults(),
    };
    let root = std::path::PathBuf::from(&search_options.path);
    let tagged = probe_lifted(
        search_options,
        walk.lifting(&walk.skipping()),
        paths,
        cancel,
    );
    let verdict = diagnose(&root, PruneMode::SearchSafe, walk, |relaxed| {
        Ok::<_, std::convert::Infallible>(tagged.as_ref().map_or_else(
            |()| Hits {
                cut: true,
                ..Hits::default()
            },
            |tagged| tagged.find(relaxed, None),
        ))
    });
    let (found, causes, may_hold_matches, entries) = match verdict {
        Ok(Verdict::Skipped(diagnosis)) => {
            let at_least = if diagnosis.found().cut {
                "at least "
            } else {
                ""
            };
            (
                vec![format!(
                    "{at_least}{} file(s) match in skipped paths ({}).",
                    diagnosis.found().count,
                    diagnosis.labels()
                )],
                diagnosis.causes().to_vec(),
                true,
                observed_paths(diagnosis.skips())?,
            )
        }
        Ok(Verdict::Unproven) => {
            let ignored = unsearched_ignored(&root, walk);
            let mut found = vec![];
            let mut causes = vec![];
            let may_hold_matches = !ignored.is_empty();
            if !ignored.is_empty() {
                found.push(format!(
                    "{} ignored directory(s) were not searched; the check of them timed out.",
                    ignored.len()
                ));
                causes.push(Cause::Ignored);
            }
            if let Some(counts) = excluded.filter(|_| walk.default_excludes) {
                found.push(format!(
                    "Default-excluded paths were not searched ({counts})."
                ));
                causes.push(Cause::DefaultExcluded);
            }
            if causes.is_empty() {
                return Ok((false, None));
            }
            (found, causes, may_hold_matches, observed_paths(&ignored)?)
        }
        _ => return Ok((false, None)),
    };
    for hint in found.into_iter().rev() {
        hints.insert(0, hint);
    }
    if let Some(map) = next.get_or_insert_with(|| json!({})).as_object_mut() {
        map.insert("includeSkipped".into(), lifting_lead(query, &causes));
    }
    let observed = (!entries.is_empty()).then_some(LocalSearchSkippedPaths {
        entries,
        sampled: true,
    });
    Ok((may_hold_matches, observed))
}

fn observed_paths(
    skipped: &[crate::tools::empty_walk::Skip],
) -> Result<Vec<LocalSearchSkippedPath>, ToolError> {
    skipped
        .iter()
        .map(|skip| {
            Ok(LocalSearchSkippedPath {
                path: skip
                    .entry
                    .to_string_lossy()
                    .replace('\\', "/")
                    .try_into()
                    .map_err(skipped_path_error)?,
                cause: match skip.cause {
                    Cause::Ignored => LocalSearchSkippedPathCause::Ignored,
                    Cause::Hidden => LocalSearchSkippedPathCause::Hidden,
                    Cause::DefaultExcluded => LocalSearchSkippedPathCause::DefaultExcluded,
                },
                reason: Some(skip.reason.clone()),
            })
        })
        .collect()
}

fn skipped_path_error(error: impl std::fmt::Display) -> ToolError {
    ToolError::new(
        "outputContractViolation",
        format!("Invalid skipped-path evidence: {error}"),
    )
}

/// The ignored directories a walk skipped, named, within [`NAMING_MS`] of
/// their own (the probe that ran out of time left none of the diagnosis'
/// budget): the rules the lead lifts.
fn unsearched_ignored(root: &std::path::Path, walk: Walk) -> Vec<crate::tools::empty_walk::Skip> {
    let started = std::time::Instant::now();
    let allowance = std::time::Duration::from_millis(NAMING_MS);
    crate::tools::empty_walk::ignored_directories(root, PruneMode::SearchSafe, walk, &|| {
        started.elapsed() > allowance
    })
}

/// Time to name the ignored directories after an unproven probe.
const NAMING_MS: u64 = 400;

/// Counts of the paths the original walk observed but default exclusions skipped.
fn excluded_counts(
    scanned: &octocode_engine::types::TextSearchStats,
    skipped: &crate::policy::discovery::WalkSkips,
) -> Option<String> {
    let dirs = scanned.pruned_dirs.as_deref().unwrap_or_default().len();
    let files = skipped.generated.len();
    let mut parts = Vec::new();
    if dirs > 0 {
        parts.push(crate::response::pages::counted(dirs as u64, "dir", "dirs"));
    }
    if files > 0 {
        parts.push(crate::response::pages::counted(
            files as u64,
            "file",
            "files",
        ));
    }
    (!parts.is_empty()).then(|| parts.join(" and "))
}

/// The same search with the default excludes off, from page 1: a result
/// that found matches keeps its ignore and hidden settings.
/// Words of a compound identifier (`parseConfig`, `parse_config`,
/// `ParseConfig`, `parse-config`, `HTTPServer`): split at `_`, `-` and case
/// boundaries; `None` for one word or a non-identifier.
fn identifier_words(term: &str) -> Option<Vec<String>> {
    let valid = term.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && term
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !valid {
        return None;
    }
    let chars: Vec<char> = term.chars().collect();
    let mut words = Vec::new();
    let mut word = String::new();
    for (index, &c) in chars.iter().enumerate() {
        if c == '_' || c == '-' {
            if !word.is_empty() {
                words.push(std::mem::take(&mut word));
            }
            continue;
        }
        let previous = index.checked_sub(1).map(|i| chars[i]);
        let next = chars.get(index + 1).copied();
        // `aB` starts a word; so does the `B` of `HTTPServer` before `e`.
        let boundary = c.is_ascii_uppercase()
            && previous.is_some_and(|p| {
                p.is_ascii_lowercase()
                    || p.is_ascii_digit()
                    || (p.is_ascii_uppercase() && next.is_some_and(|n| n.is_ascii_lowercase()))
            });
        if boundary && !word.is_empty() {
            words.push(std::mem::take(&mut word));
        }
        word.push(c.to_ascii_lowercase());
    }
    if !word.is_empty() {
        words.push(word);
    }
    (words.len() >= 2).then_some(words)
}

/// The other case styles of a compound identifier: snake, camel, Pascal,
/// SCREAMING and kebab, without the term itself.
pub(super) fn identifier_variants(term: &str) -> Option<Vec<String>> {
    let words = identifier_words(term)?;
    let capitalized = |word: &String| {
        let mut chars = word.chars();
        chars
            .next()
            .map(|first| first.to_ascii_uppercase().to_string() + chars.as_str())
            .unwrap_or_default()
    };
    let camel = words[0].clone() + &words[1..].iter().map(capitalized).collect::<String>();
    let mut variants = vec![
        words.join("_"),
        camel,
        words.iter().map(capitalized).collect::<String>(),
        words.join("_").to_ascii_uppercase(),
        words.join("-"),
    ];
    variants.retain(|variant| variant != term);
    variants.dedup();
    (!variants.is_empty()).then_some(variants)
}

/// A bounded files-only walk over the query's own scope for `variants`;
/// how many files hold one (0 when the walk failed or found none).
fn variant_files(
    mut options: TextSearchOptions,
    variants: &[String],
    paths: &PathPolicy,
    cancel: &impl CancellationCheck,
) -> usize {
    options.pattern = variants
        .iter()
        .map(|variant| regex::escape(variant))
        .collect::<Vec<_>>()
        .join("|");
    options.fixed_string = Some(false);
    options.perl_regex = Some(false);
    options.case_sensitive = Some(true);
    options.case_insensitive = Some(false);
    options.files_only = Some(true);
    options.files_without_match = Some(false);
    options.count_lines_per_file = Some(false);
    options.count_matches_per_file = Some(false);
    options.only_matching = Some(false);
    options.invert_match = Some(false);
    options.context_lines = Some(0);
    options.digest_max_bytes = None;
    let started = std::time::Instant::now();
    let deadline = std::time::Duration::from_millis(IGNORED_PROBE_MS);
    search_text_cancellable(options, Arc::new(paths.clone()), &|| {
        cancel.check().is_err() || started.elapsed() > deadline
    })
    .map_or(0, |found| found.files.len())
}

/// The same search over the identifier's case-style variants.
fn variants_lead(query: &LocalSearchQuery, variants: &[String]) -> Value {
    let mut lead = restart_fields(query);
    if let Some(fields) = lead.as_object_mut() {
        let pattern = variants
            .iter()
            .map(|variant| regex::escape(variant))
            .collect::<Vec<_>>()
            .join("|");
        fields.insert("matchString".into(), json!(pattern));
        fields.insert("regex".into(), json!("rust"));
        fields.remove("caseMode");
    }
    Continuation::new(ToolId::LocalSearch, lead).build()
}

/// An empty search for a compound identifier: say when its other case
/// styles match, so a spelling miss does not read as absence.
pub(super) fn disclose_variants(
    query: &LocalSearchQuery,
    paths: &PathPolicy,
    options: &TextSearchOptions,
    next: &mut Option<Value>,
    hints: &mut Vec<String>,
    cancel: &impl CancellationCheck,
) {
    if query
        .regex
        .is_some_and(|regex| regex != LocalSearchQueryRegex::Literal)
    {
        return;
    }
    let Some(variants) = identifier_variants(&query.match_string) else {
        return;
    };
    let count = variant_files(options.clone(), &variants, paths, cancel);
    if count == 0 {
        return;
    }
    hints.insert(
        0,
        format!(
            "No match for {}; its other spellings match in {count} file(s).",
            query.match_string
        ),
    );
    if let Some(map) = next.get_or_insert_with(|| json!({})).as_object_mut() {
        map.insert("findSimilar".into(), variants_lead(query, &variants));
    }
}

/// Matches at which a line view leads to its per-file counts.
pub(super) const LARGE_RESULT_MATCHES: u32 = 1_000;

/// Views that already answer per file (counts) or list paths.
fn is_count_or_list_view(query: &LocalSearchQuery) -> bool {
    matches!(
        query.result_view,
        LocalSearchQueryResultView::CountMatches
            | LocalSearchQueryResultView::CountLines
            | LocalSearchQueryResultView::Files
            | LocalSearchQueryResultView::FilesWithout
    )
}

/// The same search as per-file match counts, from page 1.
pub(super) fn count_lead(query: &LocalSearchQuery) -> Value {
    let mut lead = restart_fields(query);
    if let Some(fields) = lead.as_object_mut() {
        fields.insert("resultView".into(), json!("countMatches"));
        // Fields that shape match rows (or are valid only under matchOnly)
        // have no meaning in a count view.
        for field in [
            "contextLines",
            "matchContentLength",
            "pageSize",
            "matchPageSize",
            "unique",
        ] {
            fields.remove(field);
        }
    }
    Continuation::new(ToolId::LocalSearch, lead).build()
}

/// The same search from page 1 with the walk's `causes` lifted.
pub(super) fn lifting_lead(query: &LocalSearchQuery, causes: &[Cause]) -> Value {
    let mut lead = restart_fields(query);
    lift(&mut lead, causes);
    Continuation::new(ToolId::LocalSearch, lead).build()
}

/// The query as a fresh page-1 search: no page, match page or snapshot.
pub(super) fn restart_fields(query: &LocalSearchQuery) -> Value {
    let mut lead = serde_json::to_value(query).unwrap_or_else(|_| json!({}));
    if let Some(fields) = lead.as_object_mut() {
        fields.retain(|key, value| {
            !value.is_null() && !matches!(key.as_str(), "page" | "matchPage" | "snapshot")
        });
    }
    lead
}

/// A structureSearch `files` listing of the searched scope with the query's
/// own include/exclude globs and walk scope (`includeIgnored`, `defaultExcludes`;
/// a `files` listing always shows dot entries): what the search's globs
/// match there. A glob that reaches above `path` is left out: it never
/// matches, and the row's warning names it.
pub(super) fn scope_listing(query: &LocalSearchQuery) -> Value {
    let mut listing = json!({"operation": "files", "path": query.path.as_str()});
    let matchable = |globs: &[String]| {
        globs
            .iter()
            .filter(|glob| !crate::policy::include::reaches_above(glob))
            .cloned()
            .collect::<Vec<_>>()
    };
    let (include, exclude) = (matchable(&query.include), matchable(&query.exclude));
    if !include.is_empty() {
        listing["include"] = json!(include);
    }
    if !exclude.is_empty() {
        listing["exclude"] = json!(exclude);
    }
    if query.include_ignored == Some(true) {
        listing["includeIgnored"] = json!(true);
    }
    if !query.default_excludes.defaults() {
        listing["defaultExcludes"] = json!(false);
    }
    Continuation::new(ToolId::StructureSearch, listing).build()
}

/// Shown files a page parses for enclosing names and the searched
/// symbol's declaration (a first page holds at most this many); rows of
/// later files stay unnamed, and the page says so.
pub(super) const ENCLOSING_MAX_FILES: usize = DEFAULT_SNIPPET_PAGE_SIZE as usize;

/// Serialized chars an `enclosing` field adds besides its value: `,"enclosing":`.
pub(super) const ENCLOSING_FIELD_CHARS: usize = 13;

/// Serialized chars an `enclosingLine` field adds besides its number:
/// `,"enclosingLine":`.
pub(super) const ENCLOSING_LINE_FIELD_CHARS: usize = 17;

/// What a page cut reserves per hit row of a file it did not outline (see
/// [`ENCLOSING_CUT_FILES`]) for its `enclosing` name: the field, the
/// object's keys, a kind, two line numbers and a typical symbol name. A
/// longer name still goes on its row; the page runs that much over budget.
pub(super) const ENCLOSING_RESERVE_CHARS: usize = ENCLOSING_FIELD_CHARS + 80;

/// Files with rows in an outlined language that a default page cut outlines,
/// in page order, so it charges each of their hit rows the exact name it
/// carries. A fixed count, not a time bound: every call outlines the same
/// files and cuts the same pages. Rows of later files reserve
/// [`ENCLOSING_RESERVE_CHARS`] each.
pub(super) const ENCLOSING_CUT_FILES: usize = 64;

/// The current outline of a shown file, or `None` when it is too large,
/// unreadable, unsupported, or no longer the bytes a stored scan matched.
pub(super) fn shown_outline(
    source: &std::path::Path,
    expected: Option<Option<super::manifest::Digest>>,
    security: &ContentSecurity,
) -> Option<super::enclosing::Outline> {
    let bytes = shown_bytes(source, expected)?;
    outline_of(&bytes, source, security)
}

/// The current bytes of a shown file within the parse cap, or `None` when
/// it is larger, unreadable, or no longer the bytes a stored scan matched.
pub(super) fn shown_bytes(
    source: &std::path::Path,
    expected: Option<Option<super::manifest::Digest>>,
) -> Option<Vec<u8>> {
    let limit = octocode_engine::signatures::MAX_PARSE_SIZE;
    let bytes = crate::tools::source::read_bounded(source, limit).ok()?;
    if let Some(expected) = expected
        && expected != Some(<[u8; 32]>::from(Sha256::digest(&bytes)))
    {
        return None;
    }
    Some(bytes)
}

/// Set `matchKeys` on each shown JSON or TOML file with hit rows: the key
/// path of every hit line, read from the file's current bytes, in page
/// order while the page stays within `page_budget`. Returns the note for
/// files whose keys did not fit, never dropped silently.
pub(super) fn annotate_match_keys(
    files: &mut [SearchFile],
    output_root: &std::path::Path,
    page_budget: usize,
    expected: &dyn Fn(&std::path::Path) -> Option<Option<super::manifest::Digest>>,
    security: &ContentSecurity,
) -> Option<String> {
    let mut used = json_bytes(&*files);
    let mut over_budget = 0usize;
    for file in files.iter_mut() {
        let source = output_root.join(&file.path);
        let Some(rows) = file.matches.as_ref().filter(|rows| !rows.is_empty()) else {
            continue;
        };
        if !crate::tools::match_keys::is_keyed_path(&source) {
            continue;
        }
        let mut lines = rows
            .iter()
            .flat_map(row_lines)
            .filter(|line| *line > 0)
            .map(|line| line as usize)
            .collect::<Vec<_>>();
        lines.sort_unstable();
        lines.dedup();
        let limit = octocode_engine::signatures::MAX_PARSE_SIZE;
        let Some(bytes) = shown_bytes(&source, expected(&source)) else {
            continue;
        };
        let Ok(text) = security.decode_source_bytes(&bytes, limit) else {
            continue;
        };
        let keys = crate::tools::match_keys::line_key_paths(&source, &text, &lines);
        if keys.is_empty() {
            continue;
        }
        let added = json_bytes(&crate::tools::match_keys::MatchKeys(&keys))
            .saturating_add(MATCH_KEYS_FIELD_CHARS);
        if over_budget == 0 && used.saturating_add(added) <= page_budget {
            used += added;
            file.match_keys = keys;
        } else {
            over_budget += 1;
        }
    }
    (over_budget > 0).then(|| {
        let noun = if over_budget == 1 { "file" } else { "files" };
        format!(
            "Key paths (matchKeys) omitted on {over_budget} later {noun} to keep the page within its size budget."
        )
    })
}

/// `,"matchKeys":` around a file's key map.
const MATCH_KEYS_FIELD_CHARS: usize = 13;

/// Largest file outlined for `enclosing` names. Parsing is linear (a 4.5 MB
/// generated Rust file took 1 s of a 1.2 s search, 2026-10-08) and files this
/// large are almost always generated; their hits keep no enclosing name.
pub(super) const ENCLOSING_MAX_BYTES: usize = 1024 * 1024;

/// The outline of a shown file's `bytes`, read within the parse cap; none
/// for a file over [`ENCLOSING_MAX_BYTES`].
pub(super) fn outline_of(
    bytes: &[u8],
    source: &std::path::Path,
    security: &ContentSecurity,
) -> Option<super::enclosing::Outline> {
    if bytes.len() > ENCLOSING_MAX_BYTES {
        return None;
    }
    let limit = octocode_engine::signatures::MAX_PARSE_SIZE;
    let text = security.decode_source_bytes(bytes, limit).ok()?;
    super::enclosing::Outline::of(&text, &source.to_string_lossy())
}

/// Lines a shown row stands for: every matched line of a merged block.
pub(super) fn row_lines(row: &SearchMatch) -> Vec<u32> {
    row.match_lines.clone().unwrap_or_else(|| vec![row.line])
}

/// Name the enclosing declaration of every hit row of a page's first
/// [`ENCLOSING_MAX_FILES`] files (`enclosing` on the first row inside a
/// declaration, `enclosingLine` on the later ones) and find the first shown hit that declares `symbol`. Each file is
/// parsed once. The page cut charged the names' size, so a name is never
/// traded for budget; a default page never shows more files than this, and
/// rows past the parse bounds of a caller-sized page or a file over 1 MiB are
/// counted in the returned note, never dropped silently.
pub(super) fn annotate_enclosing(
    files: &mut [SearchFile],
    symbol: Option<&str>,
    declaring: Option<&str>,
    output_root: &std::path::Path,
    expected: &dyn Fn(&std::path::Path) -> Option<Option<super::manifest::Digest>>,
    mut outlines: super::verify::Outlines,
    security: &ContentSecurity,
) -> (Option<Definition>, Option<String>) {
    let mut names: Vec<Vec<Option<super::types::Enclosing>>> = Vec::with_capacity(files.len());
    let mut definition = None;
    let mut unparsed_rows = 0usize;
    let mut oversized_rows = 0usize;
    for (position, file) in files.iter().enumerate() {
        let Some(matches) = file.matches.as_ref().filter(|rows| !rows.is_empty()) else {
            names.push(Vec::new());
            continue;
        };
        if position >= ENCLOSING_MAX_FILES {
            unparsed_rows += matches.len();
            names.push(Vec::new());
            continue;
        }
        let source = output_root.join(&file.path);
        // The secret check already read and outlined most shown files.
        let outline = match outlines.remove(&source) {
            Some(outline) => outline,
            None => shown_outline(&source, expected(&source), security),
        };
        let Some(outline) = outline else {
            // Only a file whose language has declarations lost them to its
            // size (a 3 MiB `uv.lock` never had any).
            if outlined_language(&source)
                && std::fs::metadata(&source)
                    .is_ok_and(|meta| meta.len() > ENCLOSING_MAX_BYTES as u64)
            {
                oversized_rows += matches.len();
            }
            names.push(Vec::new());
            continue;
        };
        if definition.is_none()
            && let Some(symbol) = symbol
            && let Some((line, (kind, start, end))) = matches
                .iter()
                .flat_map(row_lines)
                .find_map(|line| Some((line, outline.declaration(symbol, line)?)))
        {
            definition = Some(Definition {
                source: source.to_string_lossy().into_owned(),
                line,
                kind: kind.to_owned(),
                start,
                end,
            });
        }
        names.push(row_owners(&outline, matches, declaring));
    }
    for (file, names) in files.iter_mut().zip(names) {
        let mut named = std::collections::HashMap::new();
        for (row, name) in file.matches.iter_mut().flatten().zip(names) {
            let Some(name) = name else { continue };
            // A name already given by the nearest earlier row at its line
            // is a reference; a different declaration on that line is named
            // in full, and becomes what the line refers to.
            if named.get(&name.line) == Some(&name) {
                row.enclosing_line = Some(name.line);
            } else {
                named.insert(name.line, name.clone());
                row.enclosing = Some(name);
            }
        }
    }
    let mut note = (unparsed_rows > 0).then(|| {
        format!(
            "Enclosing declarations (enclosing) are named for the first {ENCLOSING_MAX_FILES} files of a page only; {} after them {} none. Rerun with pageSize {ENCLOSING_MAX_FILES} or less to name them.",
            hit_rows(unparsed_rows),
            have(unparsed_rows)
        )
    });
    if oversized_rows > 0 {
        let oversized = format!(
            "Enclosing declarations (enclosing) are not named in files over 1 MiB; {} there {} none.",
            hit_rows(oversized_rows),
            have(oversized_rows)
        );
        note = Some(match note {
            Some(note) => format!("{note} {oversized}"),
            None => oversized,
        });
    }
    (definition, note)
}

/// `1 hit row`, `3 hit rows`.
fn hit_rows(rows: usize) -> String {
    format!("{rows} hit {}", if rows == 1 { "row" } else { "rows" })
}

fn have(rows: usize) -> &'static str {
    if rows == 1 { "has" } else { "have" }
}

/// Whether `source`'s language has a declaration outline (by extension).
pub(super) fn outlined_language(source: &std::path::Path) -> bool {
    source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            octocode_engine::signatures::languages::find_entry(&extension.to_ascii_lowercase())
                .is_some()
        })
}

/// Bytes `value` serializes to as JSON, counted without building the text;
/// `usize::MAX` when it does not serialize.
pub(super) fn json_bytes<T: serde::Serialize + ?Sized>(value: &T) -> usize {
    struct Count(usize);
    impl std::io::Write for Count {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0 += buf.len();
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut count = Count(0);
    serde_json::to_writer(&mut count, value).map_or(usize::MAX, |()| count.0)
}

/// Each row's enclosing declaration, on every row inside one: so no row
/// reads as having none. With `declaring` (a declaration search), only rows that declare
/// that symbol are named.
pub(super) fn row_owners(
    outline: &super::enclosing::Outline,
    rows: &[SearchMatch],
    declaring: Option<&str>,
) -> Vec<Option<super::types::Enclosing>> {
    rows.iter()
        .map(|row| {
            let named = declaring.is_none_or(|symbol| {
                row_lines(row)
                    .iter()
                    .any(|line| outline.declares(symbol, *line))
            });
            named
                .then(|| outline.owner(row_lines(row)[0]))
                .flatten()
                .and_then(|owner| outline.label(owner))
        })
        .collect()
}

/// Hits a handed-off read may cover (each opens a ±6-line window).
pub(super) const READ_HANDOFF_MAX_HITS: usize = 20;

/// Lines a handed-off read shows on each side of a hit.
/// A range end past any file: localFetch clamps it to the last line, so the
/// read runs from its start to the end of the file, paged.
pub(super) const READ_TO_END_LINE: usize = 1_000_000;

pub(super) const READ_HANDOFF_CONTEXT: u32 = 6;

/// `(start, end)` windows of `context` lines around each line, merged where
/// they overlap or touch, in line order.
pub(super) fn hit_windows(lines: impl IntoIterator<Item = u32>, context: u32) -> Vec<(u32, u32)> {
    crate::tools::line_spans::merge_spans(lines.into_iter().map(|line| {
        (
            line.saturating_sub(context).max(1),
            line.saturating_add(context),
        )
    }))
}

/// localFetch read of one file's hits in context (the file declaring the
/// searched symbol, else the top file): ±6-line `ranges`
/// around exactly the shown hits, or (when they need more windows than one
/// read holds) the search text as `matchString`. Paths join the caller's
/// own `path`, so the read resolves wherever the search did.
pub(super) fn read_handoff(
    query: &LocalSearchQuery,
    root: &std::path::Path,
    top: &SearchFile,
) -> Option<Value> {
    let hits = top.matches.as_ref()?;
    if hits.is_empty() || hits.len() > READ_HANDOFF_MAX_HITS {
        return None;
    }
    let path = joined_path(query, root, top);
    // A line longer than a read page is read from the hit, not from its
    // start: that hit alone, when no other hit is a plain line.
    let (long, plain): (Vec<_>, Vec<_>) = hits.iter().partition(|hit| is_long_line_hit(hit));
    if plain.is_empty()
        && let Some(hit) = long.first()
    {
        return Some(long_line_read(&path, hit));
    }
    let windows = hit_windows(plain.into_iter().flat_map(row_lines), READ_HANDOFF_CONTEXT);
    if windows.len() <= RANGES_MAX_ITEMS {
        let ranges = windows
            .iter()
            .map(|(start, end)| format!("{start}-{end}"))
            .collect::<Vec<_>>();
        return Some(
            Continuation::new(ToolId::LocalFetch, json!({"path": path, "ranges": ranges})).build(),
        );
    }
    let mut read = json!({
        "path": path,
        "matchString": query.match_string.as_str(),
        "contextLines": READ_HANDOFF_CONTEXT,
    });
    if query.regex_mode() != LocalSearchQueryRegex::Literal
        && regex::escape(&query.match_string) != query.match_string.as_str()
    {
        read["regex"] = json!("rust");
    }
    if query.case_mode != LocalSearchQueryCaseMode::Insensitive {
        read["caseMode"] = json!(query.case_mode);
    }
    Some(Continuation::new(ToolId::LocalFetch, read).build())
}

/// A query that explicitly targets a single file which the engine then skips
/// (e.g. over the per-file byte ceiling, surfaced as `capReason:"maxFileSize"`
/// with `filesScanned:0`) is a silent false negative without an explanation:
/// nothing was searched, so "no matches" would be misleading.
pub(super) fn skipped_target_hint(
    single_file: bool,
    files_searched: u32,
    cap_reason: Option<&str>,
) -> Option<String> {
    let reason = cap_reason?;
    if single_file && reason.contains("binaryQuit") {
        return Some(
            "The target file is binary (NUL byte found); it was not searched past that point."
                .into(),
        );
    }
    (single_file && files_searched == 0).then(|| {
        format!(
            "Nothing searched: the target file was skipped ({reason}). Read it with localFetch."
        )
    })
}

/// The engine collects at most [`MAX_COLLECTED_FILES`] files; the rest of
/// the matched files are counted but on no page. Names how many, and how to
/// reach them.
pub(super) fn uncollected_warning(stats: &SearchStats, collected: u32) -> Option<String> {
    let capped = stats
        .cap_reason
        .as_deref()
        .is_some_and(|reason| reason.split(", ").any(|r| r == "maxCollectedFiles"));
    let beyond = stats.files_matched.saturating_sub(collected);
    (capped && beyond > 0).then(|| {
        format!(
            "maxCollectedFiles: {beyond} of {} matched files are past the {MAX_COLLECTED_FILES}-file collection cap and no page reaches them; split the search by path or include.",
            stats.files_matched
        )
    })
}

pub(super) fn unreadable_hint(count: u32) -> String {
    format!(
        "{} unreadable",
        crate::response::pages::counted(u64::from(count), "path", "paths")
    )
}

/// An empty search's fact: how many files it read.
pub(super) fn empty_hint(files_searched: u32) -> String {
    format!(
        "No matches in {} searched.",
        crate::response::pages::counted(u64::from(files_searched), "file", "files")
    )
}

/// Wall-clock bound of the one ignored/hidden/default-excluded re-walk behind
/// an empty result.
pub(super) const IGNORED_PROBE_MS: u64 = 400;

#[cfg(test)]
thread_local! {
    static PROBE_BUDGET: std::cell::Cell<Option<std::time::Duration>> =
        const { std::cell::Cell::new(None) };
}

/// The bound of one re-walk: [`IGNORED_PROBE_MS`], or a test's own.
fn probe_budget() -> std::time::Duration {
    #[cfg(test)]
    if let Some(budget) = PROBE_BUDGET.with(std::cell::Cell::get) {
        return budget;
    }
    std::time::Duration::from_millis(IGNORED_PROBE_MS)
}

/// Runs `body` with the re-walk bound set to `budget` on this thread.
#[cfg(test)]
pub(super) fn with_probe_budget<T>(budget: std::time::Duration, body: impl FnOnce() -> T) -> T {
    PROBE_BUDGET.with(|cell| cell.set(Some(budget)));
    let out = body();
    PROBE_BUDGET.with(|cell| cell.set(None));
    out
}
/// The files `options`' search finds under the fully relaxed `walk` (files
/// only), tagged with the causes that hide each ([`Tagged::found`]). A search
/// that cannot run is `Err`; one cut by its deadline keeps what it found and
/// answers every relaxed walk as cut.
fn probe_lifted(
    options: &TextSearchOptions,
    walk: Walk,
    paths: &PathPolicy,
    cancel: &impl CancellationCheck,
) -> Result<Tagged, ()> {
    let mut options = options.clone();
    options.ignore = octocode_engine::search::walk::IgnorePolicy {
        include_ignored: walk.ignored,
        include_hidden: walk.hidden,
    };
    if !walk.default_excludes {
        options.exclude_dir = None;
    }
    options.files_only = Some(true);
    options.files_without_match = Some(false);
    options.count_lines_per_file = Some(false);
    options.count_matches_per_file = Some(false);
    options.only_matching = Some(false);
    options.unique = Some(false);
    options.count_unique = Some(false);
    options.context_lines = Some(0);
    options.sort = Some("path".into());
    options.digest_max_bytes = None;
    let root = std::path::PathBuf::from(&options.path);
    let globs = Globs {
        include: options.include.as_deref().unwrap_or_default(),
        exclude: options.exclude.as_deref().unwrap_or_default(),
    };
    let started = std::time::Instant::now();
    let probe = probe_budget();
    let searched = search_text_cancellable(
        options.clone(),
        Arc::new(crate::policy::discovery::SearchWalk::new(
            paths.clone(),
            root.clone(),
            walk.default_excludes,
        )),
        &|| cancel.check().is_err() || started.elapsed() > probe,
    )
    .map_err(|_| ())?;
    let cut = searched
        .stats
        .cap_reason
        .as_deref()
        .is_some_and(|reason| !reason.is_empty());
    Tagged::found(
        &root,
        PruneMode::SearchSafe,
        globs,
        searched.files.iter().map(|file| root.join(&file.path)),
        cut,
    )
    .map_err(|_| ())
}

/// `binarySkipped` warning: how many files were skipped as binary from
/// their leading bytes, grouped by extension (`.woff2 54, .png 2`).
pub(super) fn leading_binary_warning(
    groups: &[octocode_engine::types::BinaryExtensionCount],
) -> String {
    let total: u64 = groups.iter().map(|group| u64::from(group.count)).sum();
    let by_extension = binary_counts(groups);
    let noun = if total == 1 {
        "binary file"
    } else {
        "binary files"
    };
    format!("binarySkipped: {total} {noun} not searched ({by_extension}).")
}

/// Most chars of exact names a binary listing's `nameRegex` spells out.
pub(super) const MAX_LISTED_NAME_CHARS: usize = 2_000;

/// Most extensions a structureSearch `extensions` filter takes.
pub(super) const MAX_LISTED_EXTENSIONS: usize = 100;

/// A structureSearch `files` query over the searched scope that lists every
/// skipped binary: by `extensions`, or by a basename regex when one has no
/// extension (or there are more extensions than the filter takes). It may
/// also list same-extension text files; it never misses a skipped one.
pub(super) fn leading_binary_listing(
    query: &LocalSearchQuery,
    groups: &[octocode_engine::types::BinaryExtensionCount],
) -> Value {
    let mut listing = json!({
        "operation": "files",
        "path": query.path.as_str(),
        "entryType": "f",
    });
    let by_extension = groups.len() <= MAX_LISTED_EXTENSIONS
        && groups.iter().all(|group| !group.extension.is_empty());
    if by_extension {
        listing["extensions"] = json!(
            groups
                .iter()
                .map(|group| group.extension.as_str())
                .collect::<Vec<_>>()
        );
    } else {
        // Extensionless binaries by exact name: a no-extension pattern
        // would also list every extensionless text file.
        let names = groups
            .iter()
            .filter(|group| group.extension.is_empty())
            .flat_map(|group| group.names.iter().map(|name| regex::escape(name)))
            .collect::<Vec<_>>();
        let extensions = groups
            .iter()
            .filter(|group| !group.extension.is_empty())
            .map(|group| regex::escape(&group.extension))
            .collect::<Vec<_>>();
        let mut alternatives = Vec::new();
        if !names.is_empty() {
            let exact = format!("^(?:{})$", names.join("|"));
            // Too many names for one call: every extensionless name instead,
            // which may also list text files but never misses a binary.
            alternatives.push(if exact.len() > MAX_LISTED_NAME_CHARS {
                r"^\.?[^.]*$".to_owned()
            } else {
                exact
            });
        }
        if !extensions.is_empty() {
            alternatives.push(format!(r"\.(?i:{})$", extensions.join("|")));
        }
        listing["nameRegex"] = json!(alternatives.join("|"));
    }
    if let Some(depth) = query.max_depth {
        listing["maxDepth"] = json!(depth);
    }
    if !query.exclude.is_empty() {
        listing["exclude"] = json!(query.exclude);
    }
    if !query.default_excludes.defaults() {
        listing["defaultExcludes"] = json!(false);
    }
    if query.include_ignored == Some(true) {
        listing["includeIgnored"] = json!(true);
    }
    Continuation::new(ToolId::StructureSearch, listing)
        .confidence("high")
        .build()
}

/// Binary-cut files a warning names one by one; more are a count by
/// extension, listed whole by the `binarySkipped` lead.
pub(super) const MAX_NAMED_BINARY_FILES: usize = 10;

/// Paths grouped by lowercased extension (`""` for none, naming those
/// files), most files first, as the engine groups skipped binaries.
pub(super) fn binary_groups(paths: &[String]) -> Vec<octocode_engine::types::BinaryExtensionCount> {
    let mut groups = std::collections::BTreeMap::<String, (u32, Vec<String>)>::new();
    for path in paths {
        let path = std::path::Path::new(path);
        let extension = octocode_engine::text::extension_of(&path.to_string_lossy(), true, "");
        let group = groups.entry(extension.clone()).or_default();
        group.0 = group.0.saturating_add(1);
        if extension.is_empty()
            && let Some(name) = path.file_name()
        {
            group.1.push(name.to_string_lossy().into_owned());
        }
    }
    let mut groups = groups
        .into_iter()
        .map(|(extension, (count, mut names))| {
            names.sort();
            names.dedup();
            octocode_engine::types::BinaryExtensionCount {
                extension,
                count,
                names,
            }
        })
        .collect::<Vec<_>>();
    groups.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| a.extension.cmp(&b.extension))
    });
    groups
}

/// Two extension groupings as one: counts summed, names joined.
pub(super) fn merge_binary_groups(
    first: &[octocode_engine::types::BinaryExtensionCount],
    second: &[octocode_engine::types::BinaryExtensionCount],
) -> Vec<octocode_engine::types::BinaryExtensionCount> {
    let mut merged: Vec<octocode_engine::types::BinaryExtensionCount> = first.to_vec();
    for group in second {
        match merged
            .iter_mut()
            .find(|known| known.extension == group.extension)
        {
            Some(known) => {
                known.count = known.count.saturating_add(group.count);
                known.names.extend(group.names.iter().cloned());
                known.names.sort();
                known.names.dedup();
            }
            None => merged.push(group.clone()),
        }
    }
    merged
}

/// `.woff2 54, .png 2, no extension 1`.
pub(super) fn binary_counts(groups: &[octocode_engine::types::BinaryExtensionCount]) -> String {
    groups
        .iter()
        .map(|group| {
            if group.extension.is_empty() {
                format!("no extension {}", group.count)
            } else {
                format!(".{} {}", group.extension, group.count)
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The binary-cut files a warning names: every root-relative path, files
/// sharing a directory written once under it (`dir/{a.txt,b.txt}`), then
/// the count of any the engine could not name (`and 3 more`). Past
/// [`MAX_NAMED_BINARY_FILES`] they are a count by extension, and the
/// `binarySkipped` listing names each one.
pub(super) fn binary_file_list(paths: &[String], total: u32, root: &std::path::Path) -> String {
    if paths.is_empty() {
        return "a file with a NUL byte was".into();
    }
    if paths.len() > MAX_NAMED_BINARY_FILES {
        let total = (total as usize).max(paths.len());
        return format!(
            "{total} files ({}) were",
            binary_counts(&binary_groups(paths))
        );
    }
    let mut by_dir = std::collections::BTreeMap::<String, Vec<String>>::new();
    for path in paths {
        let path = std::path::Path::new(path);
        let relative = path
            .strip_prefix(root)
            .ok()
            .filter(|relative| !relative.as_os_str().is_empty())
            .unwrap_or(path);
        let dir = relative
            .parent()
            .map(|dir| dir.to_string_lossy().into_owned())
            .unwrap_or_default();
        let name = relative.file_name().map_or_else(
            || relative.to_string_lossy().into_owned(),
            |name| name.to_string_lossy().into_owned(),
        );
        by_dir.entry(dir).or_default().push(name);
    }
    let mut names = by_dir
        .into_iter()
        .flat_map(|(dir, names)| {
            let prefix = if dir.is_empty() {
                String::new()
            } else {
                format!("{dir}/")
            };
            if names.len() == 1 || dir.is_empty() {
                names
                    .into_iter()
                    .map(|name| format!("{prefix}{name}"))
                    .collect::<Vec<_>>()
            } else {
                vec![format!("{prefix}{{{}}}", names.join(","))]
            }
        })
        .collect::<Vec<_>>()
        .join(", ");
    let unnamed = (total as usize).saturating_sub(paths.len());
    if unnamed > 0 {
        names.push_str(&format!(" and {unnamed} more"));
    }
    let verb = if paths.len() + unnamed == 1 {
        "was"
    } else {
        "were"
    };
    format!("{names} {verb}")
}

#[cfg(test)]
mod enclosing_cap_tests {
    /// A file over the enclosing cap is not outlined (its hits keep no
    /// `enclosing`); one at the cap still is.
    #[test]
    fn files_over_the_enclosing_cap_are_not_outlined() {
        let security = crate::security::ContentSecurity;
        let path = std::path::Path::new("big.rs");
        let line = "fn f() {}\n";
        let at_cap = line.repeat(super::ENCLOSING_MAX_BYTES / line.len());
        assert!(super::outline_of(at_cap.as_bytes(), path, &security).is_some());
        let over = format!("{at_cap}{line}{line}");
        assert!(over.len() > super::ENCLOSING_MAX_BYTES);
        assert!(super::outline_of(over.as_bytes(), path, &security).is_none());
    }
}

#[cfg(test)]
mod empty_hint_tests {
    use super::empty_hint;

    /// An empty row states its count, never static search advice.
    #[test]
    fn empty_hint_is_the_scanned_count() {
        assert_eq!(empty_hint(1), "No matches in 1 file searched.");
        let many = empty_hint(12);
        assert_eq!(many, "No matches in 12 files searched.");
        for advice in ["Try", "caseMode", "regex", "shorter"] {
            assert!(!many.contains(advice), "{many}");
        }
    }
}

/// One executable call from `reads` (one-row calls of one tool, see
/// [`expand_values`]): as many rows as one call accepts, and how many reads
/// it leaves out. A page offers one value-expansion lead, not one per file.
/// A default page is cut so its reads fit (see [`stream_pages`]); only a
/// caller-sized page can leave reads out.
fn one_call(reads: &[Value]) -> Option<(Value, usize)> {
    let first = reads.first()?;
    let tool = ToolId::from_name(first["tool"].as_str()?)?;
    let limit = crate::tools::result::rows_per_call(tool);
    let mut rows = Vec::new();
    let mut left = 0;
    for read in reads {
        match crate::tools::result::continuation_row(read) {
            Some(row) if read["tool"] == first["tool"] && rows.len() < limit => {
                rows.push(row.clone());
            }
            _ => left += 1,
        }
    }
    let call = Continuation::input(tool, json!({ "queries": rows }))
        .confidence("exact")
        .build();
    Some((call, left))
}
