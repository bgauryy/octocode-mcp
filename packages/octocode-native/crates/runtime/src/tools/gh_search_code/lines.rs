//! Line-anchored hits for repo-scoped code searches. GitHub's code index
//! returns at most a few unnumbered fragments per file, so every file of the
//! page is read (core API quota, through the contents cache) and its keyword
//! lines are listed as `"<line>\t<text>"` (the numbered-line form), the way
//! `grep -n` would: with several keywords, the lines holding all of them.
use crate::security::scan::ContentScan;
use crate::tools::num::u32_of_usize;
use octocode_engine::graph::{GraphFactDeclaration, GraphFactsDocument};
use octocode_github::{GitHubProvider, ProviderError, ProviderErrorKind, RequestContext};
use std::path::Path;

/// Hit lines listed per file; a file with more states `matchCount`, and its
/// `next.readHits` row reads every keyword line. 20 → 5 (2026-10-09): one
/// repo-scoped search listed up to 20 lines per file (8.9 KB for 20 files)
/// where a shell search returns paths; five lines show what a file
/// holds, and its read returns the rest.
pub(super) const MAX_LINES_PER_FILE: usize = 5;
/// Characters kept per hit line (a window around the first keyword).
const MAX_LINE_CHARS: usize = 200;
/// Blobs larger than this keep their index fragments.
const MAX_SCAN_BYTES: usize = 2 * 1024 * 1024;

/// One file's hits at a resolved commit.
#[derive(Clone, Debug, PartialEq)]
pub(super) enum FileHits {
    /// The lines holding every keyword, else each keyword's first line
    /// (capped at [`MAX_LINES_PER_FILE`]); `total` counts every keyword line.
    Lines {
        lines: Vec<String>,
        /// A shown line was cut to its keyword window.
        clipped: bool,
        first: u32,
        last: u32,
        /// The hit that best fits the goal ([`hit_score`]).
        best: u32,
        total: usize,
        line_count: usize,
        /// The best hit's line, verbatim and trimmed, when it declares a
        /// block (a function, class, ...) and no other line of the file
        /// holds it: a `matchString` + `block` read returns that whole
        /// declaration.
        declaration: Option<String>,
        /// The last shown line, when the listing is exactly the file's
        /// first keyword lines with none cut: a read of the lines after it
        /// reaches every unshown hit once. `None` when a hit line was
        /// skipped or cut, so only a whole re-read reaches it.
        resume_after: Option<u32>,
    },
    /// The blob was read but no line holds a keyword (index lag or
    /// tokenization differences): keep the index fragments.
    Unmatched,
    /// The path does not exist at the resolved ref.
    Missing,
    /// The blob could not be read or scanned (binary, too large, transient).
    Unavailable,
}

/// Resolve `reference` (`None`: the default branch HEAD) to a commit SHA.
pub(super) async fn resolve_commit<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    owner: &str,
    repo: &str,
    reference: Option<&str>,
    context: &RequestContext,
) -> Result<String, ProviderError> {
    provider
        .resolve_reference(owner, repo, reference, false, context)
        .await
}

/// Read each path at `sha` concurrently and list its keyword lines, the
/// read blobs scanned on parallel threads ([`scan_all`]). Cancellation
/// and deadline expiry abort; other read failures leave the file `Unavailable`.
pub(super) async fn resolve_files<C: octocode_github::ConditionalCache>(
    provider: &GitHubProvider<C>,
    owner: &str,
    repo: &str,
    sha: &str,
    paths: &[String],
    keywords: &[String],
    goal: &str,
    context: &RequestContext,
    security: &(impl ContentScan + Sync),
) -> Result<Vec<FileHits>, ProviderError> {
    context.check()?;
    let reads = paths.iter().map(|path| async move {
        provider
            .get_file_content(
                &octocode_github::ContentRequest {
                    owner: owner.to_owned(),
                    repo: repo.to_owned(),
                    path: path.clone(),
                    reference: Some(sha.to_owned()),
                    force_refresh: false,
                },
                context,
            )
            .await
    });
    let fetched = futures_util::future::join_all(reads).await;
    context.check()?;
    let mut out = Vec::with_capacity(paths.len());
    let mut blobs = Vec::new();
    for (path, result) in paths.iter().zip(&fetched) {
        out.push(match result {
            Ok(content) => {
                blobs.push((out.len(), content.bytes.as_ref(), path.as_str()));
                FileHits::Unavailable
            }
            Err(error)
                if matches!(
                    error.kind,
                    ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
                ) =>
            {
                return Err(error.clone());
            }
            Err(error)
                if error.kind == ProviderErrorKind::NotFound || error.status == Some(404) =>
            {
                FileHits::Missing
            }
            Err(_) => FileHits::Unavailable,
        });
    }
    let scanned = scan_all(
        &blobs
            .iter()
            .map(|&(_, bytes, path)| (bytes, path))
            .collect::<Vec<_>>(),
        keywords,
        goal,
        security,
        context,
    )?;
    for ((at, _, _), hits) in blobs.into_iter().zip(scanned) {
        out[at] = hits;
    }
    Ok(out)
}

/// [`scan`] of each `(bytes, path)`, in order, on scoped threads within the
/// process's scan budget ([`SCANS`]). A scan that panics leaves its file
/// `Unavailable` (its index fragments stay) rather than failing the row.
fn scan_all(
    files: &[(&[u8], &str)],
    keywords: &[String],
    goal: &str,
    security: &(impl ContentScan + Sync),
    context: &RequestContext,
) -> Result<Vec<FileHits>, ProviderError> {
    let cores = std::thread::available_parallelism().map_or(4, std::num::NonZeroUsize::get);
    Ok(fan_out(
        &SCANS,
        context,
        cores,
        files,
        |&(bytes, _)| scan_weight(bytes),
        |&(bytes, path)| scan(bytes, path, keywords, goal, security),
    )?
    .into_iter()
    .map(|hits| hits.unwrap_or(FileHits::Unavailable))
    .collect())
}

/// Blob bytes the process scans at once. A scanned file's working set (its
/// lines, their lowercase copies and its declarations parse) runs to about
/// 35 times its bytes, so this keeps concurrent scans near 300 MB whatever
/// the core count, page size or number of concurrent calls, while small
/// files still scan on every core.
const SCAN_BUDGET_BYTES: usize = 8 * 1024 * 1024;

/// The process's in-flight scan bytes: every row, and every call a
/// long-lived server runs at once, shares it.
static SCANS: ScanBudget = ScanBudget::new(SCAN_BUDGET_BYTES);

/// The bytes [`scan`] holds for a blob: none for one it refuses unread.
fn scan_weight(bytes: &[u8]) -> usize {
    if bytes.len() > MAX_SCAN_BYTES {
        0
    } else {
        bytes.len()
    }
}

/// Bytes held by running scans, at most `limit`.
struct ScanBudget {
    limit: usize,
    held: std::sync::Mutex<usize>,
    freed: std::sync::Condvar,
    #[cfg(test)]
    waiting: std::sync::atomic::AtomicUsize,
}

impl ScanBudget {
    const fn new(limit: usize) -> Self {
        Self {
            limit,
            held: std::sync::Mutex::new(0),
            freed: std::sync::Condvar::new(),
            #[cfg(test)]
            waiting: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    /// Hold `bytes` (at most the whole budget: a larger item runs alone)
    /// until the guard drops, waiting while other scans hold too much.
    fn admit(&self, bytes: usize, context: &RequestContext) -> Result<Admitted<'_>, ProviderError> {
        context.check()?;
        let bytes = bytes.min(self.limit);
        let mut held = self
            .held
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while bytes > self.limit - *held {
            context.check()?;
            let wait = context
                .budget
                .effective_deadline()
                .saturating_duration_since(std::time::Instant::now())
                .min(std::time::Duration::from_millis(10));
            #[cfg(test)]
            self.waiting
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            held = self
                .freed
                .wait_timeout(held, wait)
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .0;
            #[cfg(test)]
            self.waiting
                .fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        }
        context.check()?;
        *held += bytes;
        Ok(Admitted {
            budget: self,
            bytes,
        })
    }

    /// Workers for `items` items, the largest weighing `largest`: one per
    /// core, never more than the items, nor than the budget admits at once.
    fn workers(&self, cores: usize, items: usize, largest: usize) -> usize {
        cores.min(items).min(self.limit / largest.max(1)).max(1)
    }
}

/// A scan's hold on its [`ScanBudget`] bytes, released on drop (a
/// panicking scan's too).
struct Admitted<'a> {
    budget: &'a ScanBudget,
    bytes: usize,
}

impl Drop for Admitted<'_> {
    fn drop(&mut self) {
        let mut held = self
            .budget
            .held
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *held -= self.bytes;
        drop(held);
        self.budget.freed.notify_all();
    }
}

/// `work` on each item, in order, each holding `weight(item)` bytes of
/// `budget` while it runs; several items run on scoped threads (at most
/// [`ScanBudget::workers`]) that each take the next item until none is
/// left. An item whose `work` panicked is `None`; the others keep their
/// results, on one thread or many.
fn fan_out<I: Sync, T: Send>(
    budget: &ScanBudget,
    context: &RequestContext,
    cores: usize,
    items: &[I],
    weight: impl Fn(&I) -> usize + Sync,
    work: impl Fn(&I) -> T + Sync,
) -> Result<Vec<Option<T>>, ProviderError> {
    context.check()?;
    let run = |item: &I| {
        context.check()?;
        let _held = budget.admit(weight(item), context)?;
        context.check()?;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(item))).ok();
        context.check()?;
        Ok(result)
    };
    if items.len() < 2 {
        return items.iter().map(run).collect();
    }
    let largest = items.iter().map(&weight).max().unwrap_or(0);
    let workers = budget.workers(cores, items.len(), largest);
    let next = std::sync::atomic::AtomicUsize::new(0);
    let mut out: Vec<Option<T>> = items.iter().map(|_| None).collect();
    std::thread::scope(|scope| {
        let tasks: Vec<_> = (0..workers)
            .map(|_| {
                scope.spawn(|| {
                    let mut done = Vec::new();
                    loop {
                        context.check()?;
                        let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        let Some(item) = items.get(index) else {
                            return Ok::<_, ProviderError>(done);
                        };
                        done.push((index, run(item)?));
                    }
                })
            })
            .collect();
        for task in tasks {
            let done = match task.join() {
                Ok(done) => done?,
                Err(panic) => std::panic::resume_unwind(panic),
            };
            for (index, value) in done {
                out[index] = value;
            }
        }
        context.check()?;
        Ok(out)
    })
}

/// Case-insensitive keyword lines of one blob, numbered from 1.
pub(super) fn scan(
    bytes: &[u8],
    path: &str,
    keywords: &[String],
    goal: &str,
    security: &impl ContentScan,
) -> FileHits {
    if bytes.len() > MAX_SCAN_BYTES || bytes.iter().take(8192).any(|byte| *byte == 0) {
        return FileHits::Unavailable;
    }
    let text = String::from_utf8_lossy(bytes);
    let needles: Vec<String> = keywords
        .iter()
        .map(|keyword| keyword.trim().to_lowercase())
        .filter(|keyword| !keyword.is_empty())
        .collect();
    if needles.is_empty() {
        return FileHits::Unmatched;
    }
    let mut blob = Blob {
        raw: text.lines().collect(),
        lowered: text.lines().map(str::to_lowercase).collect(),
        key_blocks: Vec::new(),
        declared: Vec::new(),
        path,
    };
    let found = blob.found(&needles);
    if found.is_empty() {
        return FileHits::Unmatched;
    }
    // Only a file with a keyword line is outlined.
    blob.key_blocks = crate::security::private_key_block_line_ranges(&text);
    let outline = crate::tools::declarations_cache::file_document(&text, path);
    blob.declared = hit_declarations(outline.as_deref(), &found);
    let hits = blob.hits(found, &needles, goal);
    let anchor = blob.anchor(&hits, &needles, security);
    let listing = blob.listing(&hits, &needles, anchor.window, security);
    FileHits::Lines {
        declaration: blob.declaration(&hits, anchor.best, security),
        lines: listing.lines,
        clipped: listing.clipped,
        first: anchor.first,
        last: anchor.last,
        best: anchor.best,
        total: hits.len(),
        line_count: blob.lowered.len(),
        resume_after: listing.resume_after,
    }
}

/// One line holding a keyword.
struct Hit {
    /// Its 0-based line index.
    index: usize,
    /// The byte of its first keyword in the lowercase line.
    at: usize,
    /// It holds every keyword.
    every: bool,
    /// How well it fits the goal ([`hit_score`]).
    score: (usize, usize),
}

impl Hit {
    /// Its 1-based line number.
    fn number(&self) -> u32 {
        u32_of_usize(self.index + 1)
    }
}

/// Where a read anchors: the first and last anchoring lines and the best
/// hit, as line numbers (0: none), and the covering window (hit indexes)
/// when no line holds every keyword.
struct Anchor {
    window: Option<(usize, usize)>,
    first: u32,
    last: u32,
    best: u32,
}

/// The listed hit lines of a file.
struct Listing {
    lines: Vec<String>,
    clipped: bool,
    resume_after: Option<u32>,
}

/// One scanned blob: its lines, as read and lowercased, the private-key
/// blocks no listed line may show, and the declarations its grammar
/// outlines on its keyword lines ([`hit_declarations`]; none for a file
/// type without an outline), sorted by name line.
struct Blob<'a> {
    raw: Vec<&'a str>,
    lowered: Vec<String>,
    key_blocks: Vec<(u32, u32)>,
    declared: Vec<&'a GraphFactDeclaration>,
    path: &'a str,
}

/// The declarations of `outline` whose name line is a `found` keyword line
/// (the only lines a hit is scored or anchored on), by name line, outline
/// order within one line. They borrow the shared parse: the rest of the
/// outline is never copied.
fn hit_declarations<'a>(
    outline: Option<&'a GraphFactsDocument>,
    found: &[Found],
) -> Vec<&'a GraphFactDeclaration> {
    let mut declared: Vec<&GraphFactDeclaration> = outline
        .into_iter()
        .flat_map(|outline| &outline.declarations)
        .filter(|declared| {
            found
                .binary_search_by_key(&(name_line(declared) - 1), |&(index, _, _)| index)
                .is_ok()
        })
        .collect();
    declared.sort_by_key(|declared| name_line(declared));
    declared
}

/// A declaration's 1-based name line.
fn name_line(declared: &GraphFactDeclaration) -> usize {
    declared.selection_range.start.line as usize + 1
}

/// A keyword line before scoring: its 0-based index, the byte of its first
/// keyword in the lowercase line and that keyword's length.
type Found = (usize, usize, usize);

impl Blob<'_> {
    /// The declaration whose name the keyword at byte `at` of line `index`
    /// is: its name line is the hit line, and the name ends past `at`. A
    /// binary search finds the line's declarations, so scoring every hit
    /// costs no pass over the whole outline.
    fn declares(&self, index: usize, at: usize) -> Option<&GraphFactDeclaration> {
        let lower = &self.lowered[index];
        let from = self
            .declared
            .partition_point(|declared| name_line(declared) < index + 1);
        self.declared[from..]
            .iter()
            .copied()
            .take_while(|declared| name_line(declared) == index + 1)
            .find(|declared| {
                let name = declared.name.to_lowercase();
                !name.is_empty()
                    && lower
                        .find(&name)
                        .is_some_and(|start| start + name.len() > at)
            })
    }

    /// Every keyword line, in file order, unscored.
    fn found(&self, needles: &[String]) -> Vec<Found> {
        self.lowered
            .iter()
            .enumerate()
            .filter_map(|(index, lower)| {
                let (at, needle) = needles
                    .iter()
                    .filter_map(|needle| lower.find(needle.as_str()).map(|at| (at, needle)))
                    .min()?;
                Some((index, at, needle.len()))
            })
            .collect()
    }

    /// The `found` keyword lines, scored against the goal.
    fn hits(&self, found: Vec<Found>, needles: &[String], goal: &str) -> Vec<Hit> {
        let terms = goal_terms(goal, needles, &self.lowered);
        found
            .into_iter()
            .map(|(index, at, length)| Hit {
                index,
                at,
                every: needles
                    .iter()
                    .all(|needle| self.lowered[index].contains(needle.as_str())),
                score: hit_score(
                    &self.lowered,
                    index,
                    at + length,
                    self.declares(index, at).is_some(),
                    &terms,
                ),
            })
            .collect()
    }

    fn in_key_block(&self, number: u32) -> bool {
        self.key_blocks
            .iter()
            .any(|&(start, end)| (start..=end).contains(&number))
    }

    /// The read anchors where the listing does: on lines holding every
    /// keyword when any exist; else on the smallest window holding every
    /// keyword (one opened by a declaration first); else on any keyword line.
    fn anchor(&self, hits: &[Hit], needles: &[String], security: &impl ContentScan) -> Anchor {
        let any_every = hits.iter().any(|hit| hit.every);
        let window = (!any_every && needles.len() > 1)
            .then(|| {
                covering_window(hits, &self.lowered, needles, |start| {
                    self.declared_head(&hits[start], security).is_some()
                })
            })
            .flatten();
        if let Some((start, end)) = window {
            let first = hits[start].number();
            return Anchor {
                window,
                first,
                last: hits[end].number(),
                best: first,
            };
        }
        let (mut first, mut last, mut best) = (0, 0, (0, (0, 0)));
        for hit in hits.iter().filter(|hit| !any_every || hit.every) {
            let number = hit.number();
            if first == 0 || hit.score > best.1 {
                best = (number, hit.score);
            }
            if first == 0 {
                first = number;
            }
            last = number;
        }
        Anchor {
            window,
            first,
            last,
            best: best.0,
        }
    }

    /// Listed: the lines holding every keyword; without one, each keyword's
    /// first line and the anchoring window's first and last lines. The rest
    /// stay counted for the whole-file read.
    fn listing(
        &self,
        hits: &[Hit],
        needles: &[String],
        window: Option<(usize, usize)>,
        security: &impl ContentScan,
    ) -> Listing {
        let mut uncovered: Vec<&String> = if hits.iter().any(|hit| hit.every) {
            Vec::new()
        } else {
            needles.iter().collect()
        };
        let in_window = |hit: usize| window.is_some_and(|(start, end)| hit == start || hit == end);
        let mut listing = Listing {
            lines: Vec::new(),
            clipped: false,
            resume_after: None,
        };
        let (mut shown_hits, mut prefix, mut last_shown) = (0, true, 0);
        for (position, hit) in hits.iter().enumerate() {
            if listing.lines.len() >= MAX_LINES_PER_FILE {
                break;
            }
            let lower = &self.lowered[hit.index];
            let before = uncovered.len();
            uncovered.retain(|needle| !lower.contains(needle.as_str()));
            if !hit.every && uncovered.len() == before && !in_window(position) {
                continue;
            }
            let number = hit.number();
            prefix &= position == shown_hits;
            shown_hits += 1;
            last_shown = number;
            let line = self.raw[hit.index];
            let shown = if self.in_key_block(number) {
                crate::security::key_fragment_placeholder()
            } else {
                listing.clipped |= line.chars().count() > MAX_LINE_CHARS;
                let window = clip(
                    line,
                    octocode_engine::text::case_fold::Folded::of(line).char_index(hit.at),
                );
                security
                    .sanitize(&window, Path::new(self.path))
                    .map(|(clean, _)| clean)
                    .unwrap_or_else(|_| "[REDACTED]".to_owned())
            };
            listing.lines.push(format!(
                "{number}{}{shown}",
                crate::tools::numbered::SEPARATOR
            ));
        }
        listing.resume_after = (prefix && !listing.clipped && last_shown > 0).then_some(last_shown);
        listing
    }

    /// The best hit's declaration line, unless it sits in a private-key block.
    fn declaration(&self, hits: &[Hit], best: u32, security: &impl ContentScan) -> Option<String> {
        let hit = hits.iter().find(|hit| hit.number() == best)?;
        if self.in_key_block(best) {
            return None;
        }
        self.declared_head(hit, security)
    }

    /// The hit line as a `matchString` when its keyword is the name of a
    /// block declaration the grammar outlines (a `matchString` + `block`
    /// read then returns the whole declaration), the line is short and
    /// unique in the file, and scanning leaves it unchanged.
    fn declared_head(&self, hit: &Hit, security: &impl ContentScan) -> Option<String> {
        self.declares(hit.index, hit.at)
            .filter(|declared| declared.range.end.line > declared.range.start.line)?;
        let head = self.raw[hit.index].trim();
        if head.is_empty() || head.chars().count() > MAX_LINE_CHARS {
            return None;
        }
        let needle = head.to_lowercase();
        if self
            .lowered
            .iter()
            .filter(|other| other.contains(&needle))
            .count()
            != 1
        {
            return None;
        }
        let (clean, _) = security.sanitize(head, Path::new(self.path)).ok()?;
        (clean == head).then_some(clean)
    }
}

/// Widest span (in lines) of a window that anchors a multi-keyword read.
const MAX_WINDOW_LINES: usize = 60;

/// The hits (`start..=end` indexes into `hits`) of the smallest window of at
/// most [`MAX_WINDOW_LINES`] lines holding every keyword, preferring one
/// opened by a declaration (`declares`), then the narrowest, then the
/// earliest. `None` when no such window exists.
fn covering_window(
    hits: &[Hit],
    lowered: &[String],
    needles: &[String],
    declares: impl Fn(usize) -> bool,
) -> Option<(usize, usize)> {
    // ((opened by no declaration, span, start), (start, end)).
    type Ranked = ((bool, usize, usize), (usize, usize));
    let mut chosen: Option<Ranked> = None;
    for start in 0..hits.len() {
        let mut missing: Vec<&String> = needles.iter().collect();
        for end in start..hits.len() {
            let span = hits[end].index - hits[start].index;
            if span > MAX_WINDOW_LINES {
                break;
            }
            missing.retain(|needle| !lowered[hits[end].index].contains(needle.as_str()));
            if missing.is_empty() {
                let rank = (!declares(start), span, start);
                if chosen.as_ref().is_none_or(|(best, _)| rank < *best) {
                    chosen = Some((rank, (start, end)));
                }
                break;
            }
        }
    }
    chosen.map(|(_, window)| window)
}

/// Lines on each side of a hit searched for the goal's other terms.
const GOAL_CONTEXT_LINES: usize = 8;

/// Goal words (three or more characters, lowercase) that are not part of a
/// searched keyword and are rare in this file: on at most one line in
/// [`COMMON_TERM_LINES`] (and at least one line allowed). A word on more
/// lines (`the`, `use`, a type every line names) cannot tell one hit's
/// neighborhood from another's.
fn goal_terms(goal: &str, needles: &[String], lowered: &[String]) -> Vec<String> {
    let mut terms: Vec<String> = goal
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.chars().count() >= 3)
        .filter(|word| !needles.iter().any(|needle| needle.contains(word)))
        .map(str::to_owned)
        .collect();
    terms.sort_unstable();
    terms.dedup();
    let common = (lowered.len() / COMMON_TERM_LINES).max(1);
    terms.retain(|term| {
        lowered
            .iter()
            .filter(|line| line.contains(term.as_str()))
            .count()
            <= common
    });
    terms
}

/// A goal term on more than one line in this many is too common to locate.
const COMMON_TERM_LINES: usize = 20;

/// How well hit line `index` (keyword ending at byte `after`; `declares`:
/// the keyword is a declared name) fits the goal, ordered by the hit's own
/// shape first (a literal value assigned to the keyword, `x = 512` or
/// `x: 512`, 3; any other assignment or declaration 2; other code 1; a
/// comment 0), then by the goal terms named within [`GOAL_CONTEXT_LINES`].
/// Shape leads because neighboring prose names goal terms near uses and
/// definitions alike.
fn hit_score(
    lowered: &[String],
    index: usize,
    after: usize,
    declares: bool,
    terms: &[String],
) -> (usize, usize) {
    let window = &lowered[index.saturating_sub(GOAL_CONTEXT_LINES)
        ..(index + GOAL_CONTEXT_LINES + 1).min(lowered.len())];
    let named = terms
        .iter()
        .filter(|term| window.iter().any(|line| line.contains(term.as_str())))
        .count();
    (hit_shape(&lowered[index], after, declares), named)
}

fn hit_shape(lower: &str, after: usize, declares: bool) -> usize {
    let code = lower.trim_start();
    if ["//", "#", "/*", "*", "--", "<!--", "\"\"\""]
        .iter()
        .any(|marker| code.starts_with(marker))
    {
        return 0;
    }
    let rest = lower.get(after..).unwrap_or_default().trim_start();
    let value = rest
        .strip_prefix(":=")
        .or_else(|| {
            rest.strip_prefix('=')
                .filter(|value| !value.starts_with(['=', '>']))
        })
        .or_else(|| {
            rest.strip_prefix(':')
                .filter(|value| !value.starts_with(':'))
        })
        .map(str::trim_start);
    if let Some(value) = value {
        let literal = value
            .starts_with(|c: char| c.is_ascii_digit() || matches!(c, '"' | '\'' | '`'))
            || (value.starts_with('-') && value[1..].starts_with(|c: char| c.is_ascii_digit()))
            || ["true", "false", "none", "null", "nil"]
                .iter()
                .any(|word| value.starts_with(word));
        return if literal { 3 } else { 2 };
    }
    if declares { 2 } else { 1 }
}

/// The line itself when short; otherwise a window starting a little before
/// the first keyword, marked with `…`.
fn clip(line: &str, at_char: usize) -> String {
    let chars = line.chars().count();
    if chars <= MAX_LINE_CHARS {
        return line.to_owned();
    }
    let start = at_char.saturating_sub(40).min(chars - MAX_LINE_CHARS);
    let body: String = line.chars().skip(start).take(MAX_LINE_CHARS).collect();
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if start + MAX_LINE_CHARS < chars {
        "…"
    } else {
        ""
    };
    format!("{prefix}{body}{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::security::scan::Passthrough;

    fn test_context() -> RequestContext {
        RequestContext::with_timeout(std::time::Duration::from_secs(30), MAX_SCAN_BYTES)
    }

    /// A hit on a name the grammar's outline declares carries its
    /// declaration line, so the read lead returns the whole block; a call,
    /// a comment or a repeated line does not.
    #[test]
    fn a_declared_hit_names_its_unique_declaration_line() {
        let declared_in = |path: &str, text: &str, keyword: &str| match scan(
            text.as_bytes(),
            path,
            &[keyword.into()],
            "",
            &Passthrough,
        ) {
            FileHits::Lines { declaration, .. } => declaration,
            other => panic!("{other:?}"),
        };
        let declaration = |text: &str, keyword: &str| declared_in("a.py", text, keyword);
        let text =
            "x = 1\n\ndef merge_setting(request, session):\n    return 1\n\nmerge_setting(a, b)\n";
        assert_eq!(
            declaration(text, "merge_setting"),
            Some("def merge_setting(request, session):".to_owned())
        );
        assert_eq!(declaration("merge_setting(a, b)\n", "merge_setting"), None);
        // The searched keyword may carry the block keyword itself.
        assert_eq!(
            declaration(text, "def merge_setting"),
            Some("def merge_setting(request, session):".to_owned())
        );
        assert_eq!(
            declaration(
                "def merge_setting(a):\n    pass\ndef merge_setting(a):\n    pass\n",
                "merge_setting"
            ),
            None
        );
        assert_eq!(
            declared_in(
                "server.go",
                "package http\n\nfunc (s *Server) ListenAndServe() error {\n\treturn nil\n}\n",
                "listenandserve"
            ),
            Some("func (s *Server) ListenAndServe() error {".to_owned())
        );
        // A parameter named like the keyword is no declaration of it.
        assert_eq!(
            declaration("def run(merge_setting):\n    pass\n", "merge_setting"),
            None
        );
        assert_eq!(
            declaration("# def merge_setting(a):\n", "merge_setting"),
            None
        );
    }

    /// The resume line is where the next unshown hit can start, only
    /// when the shown lines are exactly the first hits and none was cut.
    #[test]
    fn a_listing_that_is_a_hit_prefix_resumes_after_its_last_line() {
        let text = "x\n".repeat(2) + &"hit()\n".repeat(8);
        let FileHits::Lines {
            lines,
            total,
            resume_after,
            ..
        } = scan(text.as_bytes(), "a.rs", &["hit".into()], "", &Passthrough)
        else {
            panic!("hits")
        };
        assert_eq!((lines.len(), total), (MAX_LINES_PER_FILE, 8));
        assert_eq!(resume_after, Some(7));
        // The last hit is shown: nothing is left to continue.
        let text = "hit()\n".repeat(3);
        let FileHits::Lines { resume_after, .. } =
            scan(text.as_bytes(), "a.rs", &["hit".into()], "", &Passthrough)
        else {
            panic!("hits")
        };
        assert_eq!(resume_after, Some(3));
        // A listing that skipped a hit line (a keyword-only line beside
        // lines holding every keyword) is not a prefix of the hits.
        let text = "alpha\n".to_owned() + &"alpha beta\n".repeat(6);
        let FileHits::Lines { resume_after, .. } = scan(
            text.as_bytes(),
            "a.rs",
            &["alpha".into(), "beta".into()],
            "",
            &Passthrough,
        ) else {
            panic!("hits")
        };
        assert_eq!(resume_after, None);
        // A cut line cannot be resumed after: its tail was not shown.
        let text = format!("hit {}\n{}", "a".repeat(400), "hit\n".repeat(7));
        let FileHits::Lines { resume_after, .. } =
            scan(text.as_bytes(), "a.rs", &["hit".into()], "", &Passthrough)
        else {
            panic!("hits")
        };
        assert_eq!(resume_after, None);
    }

    #[test]
    fn every_keyword_line_is_numbered_case_insensitively() {
        let text = "import x\nawait Wrap_App(app)\nother\n    await wrap_app(s)\n";
        let hits = scan(
            text.as_bytes(),
            "a.py",
            &["wrap_app".into()],
            "",
            &Passthrough,
        );
        assert_eq!(
            hits,
            FileHits::Lines {
                lines: vec![
                    "2\tawait Wrap_App(app)".into(),
                    "4\t    await wrap_app(s)".into()
                ],
                first: 2,
                last: 4,
                best: 2,
                total: 2,
                line_count: 4,
                clipped: false,
                declaration: None,
                resume_after: Some(4),
            }
        );
        assert_eq!(
            scan(
                text.as_bytes(),
                "a.py",
                &["absent".into()],
                "",
                &Passthrough
            ),
            FileHits::Unmatched
        );
        assert_eq!(
            scan(
                b"bin\0ary needle",
                "a.bin",
                &["needle".into()],
                "",
                &Passthrough
            ),
            FileHits::Unavailable
        );
    }

    /// The read anchors on the hit that best fits the goal: a literal
    /// assigned to the keyword beats an earlier type declaration, a later
    /// use, and a setter whose docs name more goal terms; goal terms nearby
    /// break ties between hits of the same shape.
    #[test]
    fn the_best_hit_for_the_goal_anchors_the_read() {
        let mut text = String::from(
            "struct Builder {\n    /// Cap on thread usage.\n    max_blocking_threads: usize,\n}\n",
        );
        text.push_str(&"\n".repeat(20));
        text.push_str("fn new() -> Builder {\n    Builder {\n        // Defaults for the pool.\n        max_blocking_threads: 512,\n    }\n}\n");
        text.push_str(&"\n".repeat(20));
        text.push_str("fn spawn(&self) {\n    pool(self.max_blocking_threads);\n}\n");
        // A setter whose docs name more goal terms is still a declaration,
        // not the default value.
        text.push_str("/// The default value is set by the Builder runtime.\npub fn max_blocking_threads(&mut self, val: usize) {\n    self.max_blocking_threads = val;\n}\n");
        let best = |goal: &str| match scan(
            text.as_bytes(),
            "builder.rs",
            &["max_blocking_threads".into()],
            goal,
            &Passthrough,
        ) {
            FileHits::Lines { first, best, .. } => (first, best),
            other => panic!("{other:?}"),
        };
        assert_eq!(
            best("Find default max_blocking_threads in the Builder"),
            (3, 28)
        );
        // Without goal terms a literal assignment still outranks a type.
        assert_eq!(best(""), (3, 28));
        // A comment hit never anchors over code.
        let commented =
            "// max_blocking_threads = 1 by default\nlet max_blocking_threads = config();\n";
        let FileHits::Lines { best, .. } = scan(
            commented.as_bytes(),
            "a.rs",
            &["max_blocking_threads".into()],
            "default max_blocking_threads",
            &Passthrough,
        ) else {
            panic!("hit");
        };
        assert_eq!(best, 2);
    }

    #[test]
    fn long_lines_keep_a_window_around_the_keyword() {
        let line = format!("{}needle{}", "a".repeat(500), "b".repeat(500));
        let FileHits::Lines { lines, clipped, .. } = scan(
            line.as_bytes(),
            "a.js",
            &["needle".into()],
            "",
            &Passthrough,
        ) else {
            panic!("hit");
        };
        // The cut is flagged so the page carries a read of the whole line.
        assert!(clipped);
        assert!(lines[0].starts_with("1\t…"), "{}", lines[0]);
        assert!(lines[0].contains("needle"));
        assert!(lines[0].chars().count() <= MAX_LINE_CHARS + 4);
    }

    /// Several keywords list the lines holding every keyword; lines with
    /// only some stay counted for the readHits continuation. A file where no
    /// line holds them all lists each keyword's first line.
    #[test]
    fn lines_with_every_keyword_are_listed_first() {
        let keywords = ["octocode".to_owned(), "mcp".to_owned()];
        let text =
            "# Octocode\nOctocode MCP server\nmcp only\noctocode only\nthe octocode mcp tools\n";
        let FileHits::Lines { lines, total, .. } =
            scan(text.as_bytes(), "README.md", &keywords, "", &Passthrough)
        else {
            panic!("hit");
        };
        assert_eq!(
            lines,
            vec!["2\tOctocode MCP server", "5\tthe octocode mcp tools"]
        );
        assert_eq!(total, 5);
        let spread = "octocode one\noctocode two\nmcp three\nmcp four\n";
        let FileHits::Lines { lines, total, .. } =
            scan(spread.as_bytes(), "a.md", &keywords, "", &Passthrough)
        else {
            panic!("hit");
        };
        // The window anchoring the read (lines 2-3) is listed too.
        assert_eq!(
            lines,
            vec!["1\toctocode one", "2\toctocode two", "3\tmcp three"]
        );
        assert_eq!(total, 4);
    }

    #[test]
    fn the_read_anchors_on_a_line_holding_every_keyword() {
        let keywords = ["fn".to_owned(), "search_path".to_owned()];
        let text = "fn default() {}\nfn other() {}\nlet x = 1;\nfn search_path(p: &Path) {}\n";
        let FileHits::Lines {
            first, last, best, ..
        } = scan(text.as_bytes(), "a.rs", &keywords, "", &Passthrough)
        else {
            panic!("hit");
        };
        assert_eq!((first, last, best), (4, 4, 4));
    }

    /// With no line holding every keyword, the read anchors on the
    /// smallest window that holds them all, preferring one a declaration
    /// opens, not on the best single-keyword hit elsewhere in the file.
    #[test]
    fn spread_keywords_anchor_on_the_declaration_window() {
        let mut lines = vec![String::new(); 900];
        lines[0] = "class Session:".into();
        lines[127] = "    def configure(self, env):".into();
        lines[128] = "        self.trust_env = env".into();
        lines[490] = "    def reset(self):".into();
        lines[491] = "        self.trust_env = True".into();
        lines[639] = "    def request(self, url):".into();
        lines[640] = "        settings = self.merge_environment_settings(url)".into();
        lines[830] =
            "    def merge_environment_settings(self, url, proxies, stream, verify, cert):".into();
        lines[844] = "        if self.trust_env:".into();
        let text = lines.join("\n");
        let keywords = [
            "merge_environment_settings".to_owned(),
            "trust_env".to_owned(),
        ];
        let FileHits::Lines {
            lines,
            first,
            last,
            best,
            declaration,
            ..
        } = scan(text.as_bytes(), "sessions.py", &keywords, "", &Passthrough)
        else {
            panic!("hit");
        };
        assert_eq!((first, last, best), (831, 845, 831));
        assert_eq!(
            declaration.as_deref(),
            Some("def merge_environment_settings(self, url, proxies, stream, verify, cert):")
        );
        let numbers: Vec<&str> = lines
            .iter()
            .filter_map(|line| line.split('\t').next())
            .collect();
        for number in ["129", "641", "831", "845"] {
            assert!(numbers.contains(&number), "{lines:?}");
        }
        // Keywords never within the window size keep the best single hit.
        let far =
            "x = trust_env\n".to_owned() + &"\n".repeat(100) + "merge_environment_settings()\n";
        let FileHits::Lines { best, .. } =
            scan(far.as_bytes(), "a.py", &keywords, "", &Passthrough)
        else {
            panic!("hit");
        };
        assert_eq!(best, 1);
    }

    /// A hit line whose lowercase form moves char boundaries, even at an
    /// equal byte length, lists verbatim rather than panicking, and a long
    /// line keeps its keyword in the window.
    #[test]
    fn hit_lines_that_lowercase_to_other_boundaries_list_verbatim() {
        let lines = |text: &str, keyword: &str| match scan(
            text.as_bytes(),
            "a.js",
            &[keyword.into()],
            "",
            &Passthrough,
        ) {
            FileHits::Lines { lines, .. } => lines,
            other => panic!("{other:?}"),
        };
        let text = "const s = \"İéxẞ\";\n";
        assert_eq!(text.len(), text.to_lowercase().len());
        assert_eq!(lines(text, "éx"), ["1\tconst s = \"İéxẞ\";"]);
        assert_eq!(lines(text, "ẞ"), ["1\tconst s = \"İéxẞ\";"]);
        assert_eq!(lines("x = \"STRAẞE\"\n", "straße"), ["1\tx = \"STRAẞE\""]);
        for prefix in ["İ", "ẞ", "e\u{301}", "👍🏽"] {
            let line = format!("{}needle{}", prefix.repeat(300), "b".repeat(300));
            let shown = &lines(&line, "needle")[0];
            assert!(shown.starts_with("1\t…"), "{prefix}: {shown}");
            assert!(shown.contains("needle"), "{prefix}: {shown}");
        }
    }

    /// Scanning a page's files on parallel threads keeps each file's own
    /// hits, in page order.
    #[test]
    fn parallel_scans_keep_page_order() {
        let texts: Vec<String> = (0..17)
            .map(|file| match file % 3 {
                0 => format!("fn f{file}() {{}}\nneedle {file}\n"),
                1 => "nothing here\n".to_owned(),
                _ => format!("{}needle\n", "x\n".repeat(file)),
            })
            .collect();
        let paths: Vec<String> = (0..texts.len()).map(|file| format!("f{file}.rs")).collect();
        let files: Vec<(&[u8], &str)> = texts
            .iter()
            .zip(&paths)
            .map(|(text, path)| (text.as_bytes(), path.as_str()))
            .collect();
        let keywords = ["needle".to_owned()];
        let serial: Vec<FileHits> = files
            .iter()
            .map(|&(bytes, path)| scan(bytes, path, &keywords, "", &Passthrough))
            .collect();
        assert_eq!(
            scan_all(&files, &keywords, "", &Passthrough, &test_context()).unwrap(),
            serial
        );
        assert!(matches!(serial[1], FileHits::Unmatched));
        assert!(matches!(serial[5], FileHits::Lines { first: 6, .. }));
    }

    /// A file with many declarations finds the one a hit names by its line:
    /// declarations on other lines never match, and outline order holds on
    /// one line.
    #[test]
    fn hits_find_their_declaration_by_line_among_many() {
        let mut text = String::new();
        for function in 0..2_000 {
            text.push_str(&format!("def f{function}(a):\n    return a\n"));
        }
        text.push_str("def target_name(a):\n    return a\n");
        let FileHits::Lines {
            declaration, best, ..
        } = scan(
            text.as_bytes(),
            "a.py",
            &["target_name".into()],
            "",
            &Passthrough,
        )
        else {
            panic!("hit");
        };
        assert_eq!(best, 4_001);
        assert_eq!(declaration.as_deref(), Some("def target_name(a):"));
    }

    /// A scanned file keeps only the declarations named on its keyword
    /// lines, borrowed from the shared parse: a file of 2,000 functions
    /// with one hit holds one.
    #[test]
    fn only_declarations_named_on_hit_lines_are_kept() {
        let mut text = String::new();
        for function in 0..2_000 {
            text.push_str(&format!("def f{function}(a):\n    return a\n"));
        }
        text.push_str("def target_name(a):\n    return a\n");
        let path = format!("hit-declarations-{}.py", std::process::id());
        let outline =
            crate::tools::declarations_cache::file_document(&text, &path).expect("outline");
        assert_eq!(outline.declarations.len(), 2_001);
        let kept = hit_declarations(Some(&outline), &[(4_000, 4, 11)]);
        let names: Vec<&str> = kept.iter().map(|declared| declared.name.as_str()).collect();
        assert_eq!(names, ["target_name"]);
        assert!(hit_declarations(None, &[(4_000, 4, 11)]).is_empty());
    }

    /// Fan-outs running at once (rows, or calls of a long-lived server)
    /// share one byte budget: the bytes held by running items never pass it,
    /// an item larger than the whole budget runs alone, and each fan-out
    /// keeps its items' order.
    #[test]
    fn concurrent_fan_outs_hold_their_bytes_within_one_budget() {
        use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
        let budget = ScanBudget::new(10);
        let (held, peak) = (AtomicUsize::new(0), AtomicUsize::new(0));
        let mut items: Vec<usize> = (0..24).map(|item| 1 + item % 4).collect();
        items.push(25);
        let work = |&weight: &usize| {
            let charged = weight.min(10);
            peak.fetch_max(held.fetch_add(charged, SeqCst) + charged, SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(2));
            held.fetch_sub(charged, SeqCst);
            weight * 10
        };
        let outs = std::thread::scope(|scope| {
            let calls: Vec<_> = (0..3)
                .map(|_| {
                    scope.spawn(|| {
                        fan_out(&budget, &test_context(), 8, &items, |&weight| weight, work)
                    })
                })
                .collect();
            calls
                .into_iter()
                .map(|call| call.join().expect("fan-out").expect("scan"))
                .collect::<Vec<_>>()
        });
        assert!(peak.load(SeqCst) <= 10, "{}", peak.load(SeqCst));
        let expected: Vec<Option<usize>> = items.iter().map(|weight| Some(weight * 10)).collect();
        for out in outs {
            assert_eq!(out, expected);
        }
        assert_eq!(*budget.held.lock().expect("held"), 0);
    }

    /// Workers follow the cores for small blobs and the budget for large
    /// ones: twelve 1.8 MB blobs scan four at a time on twelve cores.
    #[test]
    fn scan_workers_are_bounded_by_bytes_then_cores() {
        let budget = ScanBudget::new(SCAN_BUDGET_BYTES);
        assert_eq!(budget.workers(12, 12, 1_800_000), 4);
        assert_eq!(budget.workers(12, 12, 20_000), 12);
        assert_eq!(budget.workers(12, 3, 20_000), 3);
        assert_eq!(budget.workers(12, 12, MAX_SCAN_BYTES), 4);
        assert_eq!(budget.workers(1, 12, 0), 1);
        assert_eq!(scan_weight(&vec![b'x'; MAX_SCAN_BYTES + 1]), 0);
    }

    /// A fan-out given one core runs on one thread, with the serial output.
    #[test]
    fn a_fan_out_on_one_core_runs_on_one_thread() {
        let threads = std::sync::Mutex::new(std::collections::HashSet::new());
        let out = fan_out(
            &ScanBudget::new(usize::MAX),
            &test_context(),
            1,
            &[1, 2, 3, 4],
            |_| 0,
            |&item| {
                threads
                    .lock()
                    .expect("threads")
                    .insert(std::thread::current().id());
                item
            },
        );
        assert_eq!(out.unwrap(), [Some(1), Some(2), Some(3), Some(4)]);
        assert_eq!(threads.lock().expect("threads").len(), 1);
    }

    /// A panicking item is the only one lost, on a worker that took others
    /// too and on the single-item path alike, and its bytes go back.
    #[test]
    fn a_panicking_item_loses_only_itself() {
        let budget = ScanBudget::new(usize::MAX);
        let work = |&item: &u32| {
            assert_ne!(item, 2, "item 2 panics");
            item
        };
        let out = fan_out(&budget, &test_context(), 1, &[1, 2, 3, 4], |_| 1, work);
        assert_eq!(out.unwrap(), [Some(1), None, Some(3), Some(4)]);
        assert_eq!(
            fan_out(&budget, &test_context(), 1, &[2], |_| 1, work).unwrap(),
            [None]
        );
        assert_eq!(*budget.held.lock().expect("held"), 0);
    }

    fn stopped_budget_waiter(timeout: bool, items: &[usize]) {
        use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
        use std::time::{Duration, Instant};

        let budget = ScanBudget::new(1);
        let holder_context = test_context();
        let holder = budget.admit(1, &holder_context).expect("holder admitted");
        let mut context = test_context();
        if timeout {
            context.budget.deadline = Instant::now() + Duration::from_millis(250);
            context.budget.wait_until = context.budget.deadline;
        }
        let ran = AtomicUsize::new(0);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                let result = fan_out(
                    &budget,
                    &context,
                    4,
                    items,
                    |_| 1,
                    |_| {
                        ran.fetch_add(1, SeqCst);
                    },
                );
                tx.send(result.map_err(|error| error.kind))
                    .expect("result receiver");
            });
            let observe_until = Instant::now() + Duration::from_secs(2);
            let waiting = loop {
                if budget.waiting.load(SeqCst) != 0 {
                    break true;
                }
                if Instant::now() >= observe_until {
                    break false;
                }
                std::thread::yield_now();
            };
            if !timeout {
                context.budget.cancellation.cancel();
            }
            let result = rx.recv_timeout(Duration::from_secs(2));
            let still_held = *budget.held.lock().expect("budget");
            let work_ran = ran.load(SeqCst);
            // Release even on failure so a broken unbounded wait cannot hang the test.
            drop(holder);
            assert!(waiting, "worker must enter admission wait before stopping");
            assert_eq!(
                result.expect("waiter returns before holder release"),
                Err(if timeout {
                    ProviderErrorKind::Timeout
                } else {
                    ProviderErrorKind::Cancelled
                })
            );
            assert_eq!(still_held, 1);
            assert_eq!(work_ran, 0);
        });
        assert_eq!(*budget.held.lock().expect("budget"), 0);
    }

    #[test]
    fn cancelled_budget_waiter_returns_before_holder_release_without_work() {
        stopped_budget_waiter(false, &[1]);
        stopped_budget_waiter(false, &[1, 2]);
    }

    #[test]
    fn expired_budget_waiter_returns_before_holder_release_without_work() {
        stopped_budget_waiter(true, &[1]);
        stopped_budget_waiter(true, &[1, 2]);
    }

    #[test]
    fn cancellation_between_files_stops_remaining_work() {
        use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
        let budget = ScanBudget::new(1);
        let context = test_context();
        let ran = AtomicUsize::new(0);
        let result = fan_out(
            &budget,
            &context,
            1,
            &[1, 2, 3],
            |_| 1,
            |_| {
                ran.fetch_add(1, SeqCst);
                context.budget.cancellation.cancel();
            },
        );
        assert_eq!(result.unwrap_err().kind, ProviderErrorKind::Cancelled);
        assert_eq!(ran.load(SeqCst), 1);
        assert_eq!(*budget.held.lock().expect("budget"), 0);
    }

    #[test]
    fn deadline_between_files_stops_remaining_work() {
        use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
        use std::time::{Duration, Instant};
        let budget = ScanBudget::new(1);
        let mut context = test_context();
        context.budget.deadline = Instant::now() + Duration::from_millis(100);
        let ran = AtomicUsize::new(0);
        let result = fan_out(
            &budget,
            &context,
            1,
            &[1, 2, 3],
            |_| 1,
            |_| {
                ran.fetch_add(1, SeqCst);
                while Instant::now() < context.budget.deadline {
                    std::thread::park_timeout(
                        context
                            .budget
                            .deadline
                            .saturating_duration_since(Instant::now()),
                    );
                }
            },
        );
        assert_eq!(result.unwrap_err().kind, ProviderErrorKind::Timeout);
        assert_eq!(ran.load(SeqCst), 1);
        assert_eq!(*budget.held.lock().expect("budget"), 0);
    }

    #[test]
    fn stopped_scan_all_propagates_errors_instead_of_unavailable_hits() {
        let context = test_context();
        context.budget.cancellation.cancel();
        let result = scan_all(
            &[(b"needle", "a.rs")],
            &["needle".into()],
            "",
            &Passthrough,
            &context,
        );
        assert_eq!(result.unwrap_err().kind, ProviderErrorKind::Cancelled);
        let mut context = test_context();
        context.budget.deadline = std::time::Instant::now();
        let result = scan_all(&[], &[], "", &Passthrough, &context);
        assert_eq!(result.unwrap_err().kind, ProviderErrorKind::Timeout);
    }

    #[test]
    fn many_hits_are_capped_but_counted() {
        let text = "needle\n".repeat(30);
        let FileHits::Lines {
            lines,
            total,
            last,
            clipped,
            ..
        } = scan(
            text.as_bytes(),
            "a.rs",
            &["needle".into()],
            "",
            &Passthrough,
        )
        else {
            panic!("hit");
        };
        assert_eq!(lines.len(), MAX_LINES_PER_FILE);
        assert_eq!(total, 30);
        assert_eq!(last, 30);
        assert!(!clipped);
    }
}
