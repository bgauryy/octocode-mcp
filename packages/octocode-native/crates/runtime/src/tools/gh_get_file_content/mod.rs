pub(crate) mod errors;
mod leads;

use std::path::Path;

use serde::Serialize;
use serde_json::{Value, json};

use crate::providers::github::{
    ConditionalCache, ContentRequest, GitHubProvider, ProviderError, RequestContext,
};
use crate::security::scan::ContentScan;
use crate::tools::cancel::CancellationCheck;
use crate::tools::gh_shared::{GhFailure, locate_path, missing_path};
use crate::tools::local_fetch::{LocalFetchQuery, RegexMatch, WindowUnit, process_fetched_content};
use crate::tools::result::ToolData;
use leads::{default_minify, empty_match_lead, ignore_case_lead, rewrite_continuations};

pub use crate::contracts::tool_types::GhGetFileContentQuery;

/// Bytes the first page of a match or range read holds.
const FIRST_PAGE_BYTES: usize = 6 * 1024;

/// One read's result. The wire row is flat: the read file's fields beside
/// `owner`/`repo`, with no `files` wrapper (a query reads one path).
#[derive(Clone, Debug)]
pub struct GhGetFileContentResult {
    pub owner: String,
    pub repo: String,
    pub files: Vec<GhGetFileContentFile>,
}

impl Serialize for GhGetFileContentResult {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Flat<'a> {
            owner: &'a str,
            repo: &'a str,
            #[serde(flatten)]
            file: Option<&'a GhGetFileContentFile>,
        }
        Flat {
            owner: &self.owner,
            repo: &self.repo,
            file: self.files.first(),
        }
        .serialize(serializer)
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhGetFileContentFile {
    #[serde(flatten)]
    pub content: crate::tools::local_fetch::LocalFetchResult,
    /// Commit the read was pinned to (a branch or default-branch ref resolves
    /// to its current SHA; continuations reuse it).
    pub commit_sha: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_not_found: Option<bool>,
    #[serde(skip)]
    pub from_cache: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified_by: Option<String>,
}

/// One ghGetFileContent row as the runtime emits it.
pub struct FileRead {
    pub output: ToolData,
    /// Every byte came from the content cache.
    pub cache: bool,
}

/// Run one ghGetFileContent row: the read, or the failure with its one
/// recovery (a missing path walks to the case-corrected file or the nearest
/// existing directory).
pub async fn run<C>(
    provider: &GitHubProvider<C>,
    query: &GhGetFileContentQuery,
    request: Result<&RequestContext, ProviderError>,
    window: Option<usize>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> Result<FileRead, GhFailure>
where
    C: ConditionalCache,
{
    let request_context = request.map_err(|error| errors::failure(error, query, None))?;
    let error = match execute(
        provider,
        query,
        request_context,
        window,
        security,
        cancel,
        regex,
    )
    .await
    {
        Ok(result) => return Ok(file_read(result, query)),
        Err(error) => error,
    };
    // Recovery leads name a renamed repository as it is now.
    let canonical = crate::tools::gh_shared::canonical_repo(
        provider,
        query.owner.as_str(),
        query.repo.as_str(),
        request_context,
    )
    .await
    .and_then(|(owner, repo)| {
        Some(GhGetFileContentQuery {
            owner: owner.parse().ok()?,
            repo: repo.parse().ok()?,
            ..query.clone()
        })
    });
    let query = canonical.as_ref().unwrap_or(query);
    let found = if missing_path(&error, Some(query.path.as_str())) {
        locate_path(provider, &errors::repo_path(query), request_context).await
    } else {
        None
    };
    Err(errors::failure(error, query, found))
}

/// The row of a read: its status from the file, and the resolved commit
/// unless the caller already named that full SHA.
fn file_read(result: GhGetFileContentResult, query: &GhGetFileContentQuery) -> FileRead {
    let status = match result
        .files
        .first()
        .map(|file| file.content.status.as_str())
    {
        Some("error") => Some("error"),
        Some("empty") => Some("empty"),
        _ => None,
    };
    let cache = !result.files.is_empty() && result.files.iter().all(|file| file.from_cache);
    let mut data = serde_json::to_value(&result).unwrap_or_default();
    if data["commitSha"].as_str() == query.ref_.as_deref()
        && let Some(map) = data.as_object_mut()
    {
        map.remove("commitSha");
    }
    FileRead {
        output: ToolData {
            status,
            ..ToolData::from(data)
        },
        cache,
    }
}

pub async fn execute<C>(
    provider: &GitHubProvider<C>,
    query: &GhGetFileContentQuery,
    request_context: &RequestContext,
    window: Option<usize>,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> Result<GhGetFileContentResult, ProviderError>
where
    C: ConditionalCache,
{
    // Resolve the ref once (memoized across a batch), then read the body at
    // the immutable SHA.
    let sha = provider
        .resolve_reference(
            &query.owner,
            &query.repo,
            query.ref_.as_deref(),
            query.force_refresh.unwrap_or(false),
            request_context,
        )
        .await?;
    let content_request = ContentRequest {
        owner: query.owner.to_string(),
        repo: query.repo.to_string(),
        path: query.path.to_string(),
        reference: Some(sha),
        force_refresh: query.force_refresh.unwrap_or(false),
        session_id: None,
    };
    let acquired = provider
        .get_file_content(&content_request, request_context)
        .await?;
    // A renamed repository: later requests and every lead use the canonical
    // name (a redirect-free read of a never-redirected name costs nothing).
    let renamed = crate::tools::gh_shared::canonical_repo(
        provider,
        query.owner.as_str(),
        query.repo.as_str(),
        request_context,
    )
    .await;
    let renamed_warning = renamed.as_ref().map(|to| {
        crate::tools::gh_shared::renamed_warning(query.owner.as_str(), query.repo.as_str(), to)
    });
    let canonical;
    let query = match &renamed {
        Some((owner, repo)) => {
            canonical = GhGetFileContentQuery {
                owner: owner.parse().map_err(decode_display)?,
                repo: repo.parse().map_err(decode_display)?,
                ..query.clone()
            };
            &canonical
        }
        None => query,
    };
    // A receipts read's first page states when the file last changed: one
    // commits request after the body arrived, so a failed or throttled read
    // never spends it, and later pages repeat nothing. A default read sends
    // no extra request.
    let (last_modified, last_modified_by) = if query
        .extras
        .contains(&crate::contracts::tool_types::ExtraKind::Receipts)
        && query.offset.unwrap_or(0) == 0
    {
        file_timestamp(provider, query, &acquired.resolved_ref, request_context).await
    } else {
        (None, None)
    };
    shape(
        query,
        acquired,
        Fetched {
            window,
            renamed_warning,
            last_modified,
            last_modified_by,
        },
        security,
        cancel,
        regex,
    )
}

/// What the fetch side of a read hands its shaping: the response window,
/// the rename warning and the receipts of the read's first page.
struct Fetched {
    window: Option<usize>,
    renamed_warning: Option<String>,
    last_modified: Option<String>,
    last_modified_by: Option<String>,
}

/// One fetched body as the read's row: the shared extraction, a missed
/// match's facts, the status, and the read's pages and leads.
fn shape(
    query: &GhGetFileContentQuery,
    acquired: octocode_github::ContentResponse,
    fetched: Fetched,
    security: &impl ContentScan,
    cancel: &impl CancellationCheck,
    regex: &impl RegexMatch,
) -> Result<GhGetFileContentResult, ProviderError> {
    let Fetched {
        window,
        renamed_warning,
        last_modified,
        last_modified_by,
    } = fetched;
    let local = local_query(query)?;
    // The configured response window bounds a whole-file view; a selected
    // view's first page is a preview (its hits often answer), and
    // `next.continueWindow` pages the rest losslessly.
    let facts = crate::tools::local_fetch::SourceFacts {
        modified: None,
        window,
        first_page_bytes: Some(FIRST_PAGE_BYTES),
    };
    let mut content = process_fetched_content(
        &local,
        &acquired.bytes,
        Path::new(query.path.as_str()),
        &facts,
        security,
        cancel,
        regex,
    );
    if content.error_code.as_deref() == Some("invalidPagination") {
        return Err(ProviderError::new(
            crate::providers::github::ProviderErrorKind::Decode,
            "offset must be on a UTF-8 code point boundary",
        ));
    }
    let match_not_found = content.selected_match_count == Some(0)
        || (content.error_code.as_deref() == Some("noMatches") && content.error.is_some());
    if match_not_found {
        no_match(&mut content, &local, query, &acquired.bytes, regex);
    }
    if content.returned_bytes == Some(0) {
        content.source_line_ranges.clear();
    }
    if content.error.is_none() {
        content.status = if match_not_found {
            // Same as localFetch: no selected line is an empty read, which
            // keeps the recovery hint visible under the hint policy.
            "empty"
        } else if content.content.as_ref().is_some_and(|s| !s.is_empty()) {
            "success"
        } else {
            "empty"
        }
        .into();
    }
    // Shared local read errors omit their path; the remote file envelope
    // requires the repository-relative identity even when processing fails.
    if content.path.is_empty() {
        content.path = query.path.to_string();
    }
    if let Some(warning) = renamed_warning {
        content.warnings.insert(0, warning);
    }
    let mut next = rewrite_continuations(&mut content, query, &acquired.resolved_ref);
    if match_not_found
        && let Some((name, lead)) = empty_match_lead(
            query,
            &local,
            content.total_lines.unwrap_or(0),
            &acquired.resolved_ref,
        )
        && let Some(calls) = next.get_or_insert_with(|| json!({})).as_object_mut()
    {
        calls.insert(name.into(), lead);
    }
    if match_not_found
        && let Some(lead) = ignore_case_lead(query, &local, &acquired, regex)
        && let Some(calls) = next.get_or_insert_with(|| json!({})).as_object_mut()
    {
        calls.insert("ignoreCase".into(), lead);
    }
    // The contract's default view is no news; another view is echoed.
    if content.content_view == Some(default_minify()) {
        content.content_view = None;
    }
    Ok(GhGetFileContentResult {
        owner: query.owner.to_string(),
        repo: query.repo.to_string(),
        files: vec![GhGetFileContentFile {
            content,
            commit_sha: acquired.resolved_ref,
            file_type: file_type(&query.path),
            match_not_found: match_not_found.then_some(true),
            from_cache: acquired.from_cache,
            next,
            last_modified,
            last_modified_by,
        }],
    })
}

/// A selection with no hit in the file is an empty read that says why: its
/// facts (redaction, a literal `|`, the lines a case-insensitive read would
/// select) and the file's size, with the contract's empty `content` (as in
/// localFetch) and no zero counters.
fn no_match(
    content: &mut crate::tools::local_fetch::LocalFetchResult,
    local: &LocalFetchQuery,
    query: &GhGetFileContentQuery,
    bytes: &[u8],
    regex: &impl RegexMatch,
) {
    let raw = String::from_utf8_lossy(bytes);
    // The shared read's `noMatches` error row carries no facts of its own;
    // the empty row states them.
    if content.error.is_some() {
        let insensitive = crate::tools::local_fetch::insensitive_match_count(local, &raw, regex);
        if insensitive > 0 {
            content.warnings.push(format!(
                "{insensitive} {} ignoring case.",
                if insensitive == 1 {
                    "line matches"
                } else {
                    "lines match"
                }
            ));
        }
        content.hints = crate::tools::local_fetch::no_match_hints(local, false);
    }
    content.path = query.path.to_string();
    content.error = None;
    content.error_code = None;
    content.content = Some(String::new());
    content.content_view = None;
    content.total_lines = Some(raw.lines().count());
    content.source_chars = None;
    content.source_bytes = None;
    content.returned_chars = None;
    content.returned_bytes = None;
    content.returned_lines = None;
    content.pagination = None;
    content.source_line_ranges.clear();
}

/// The kind of file a read returned (`fileType`).
fn file_type(path: &str) -> Option<&'static str> {
    match crate::content::classify_file_type(path)? {
        crate::content::FileType::Config => Some("config"),
        crate::content::FileType::Lock => Some("lock"),
        crate::content::FileType::Doc => Some("doc"),
        crate::content::FileType::Code => Some("code"),
    }
}

/// Last commit touching `path` at `reference` (a resolved SHA). History below
/// a commit is immutable, so the answer is cached per (owner, repo, SHA, path)
/// and repeated offset-0 reads skip the `commits?path=` round trip.
async fn file_timestamp<C>(
    provider: &GitHubProvider<C>,
    query: &GhGetFileContentQuery,
    reference: &str,
    context: &RequestContext,
) -> (Option<String>, Option<String>)
where
    C: ConditionalCache,
{
    let partition = provider.transport.cache_partition(context, None).ok();
    let key = {
        use sha2::{Digest, Sha256};
        let mut digest = Sha256::new();
        for value in [
            query.owner.to_ascii_lowercase().as_str(),
            query.repo.to_ascii_lowercase().as_str(),
            reference,
            query.path.as_str(),
        ] {
            digest.update(value.as_bytes());
            digest.update([0]);
        }
        // v2: the author is the login when GitHub links one.
        format!(
            "github-file-timestamp:v2-{}",
            hex::encode(digest.finalize())
        )
    };
    if let Some(partition) = &partition
        && let Some(cached) = provider.cache.get(partition, &key).await
        && let Ok((date, author)) =
            serde_json::from_slice::<(Option<String>, Option<String>)>(&cached.bytes)
    {
        return (date, author);
    }
    let Ok(page) = provider
        .transport
        .list_commits(
            &crate::providers::github::CommitListRequest {
                owner: query.owner.to_string(),
                repo: query.repo.to_string(),
                branch: Some(reference.to_owned()),
                path: Some(query.path.to_string()),
                author: None,
                since: None,
                until: None,
                page: 1,
                per_page: 1,
            },
            context,
        )
        .await
    else {
        return (None, None);
    };
    let stamp = page.items.first().map_or((None, None), |commit| {
        (
            commit
                .pointer("/commit/committer/date")
                .or_else(|| commit.pointer("/commit/author/date"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            commit
                .pointer("/author/login")
                .or_else(|| commit.pointer("/commit/author/name"))
                .and_then(Value::as_str)
                .map(str::to_owned),
        )
    });
    if let Some(partition) = &partition
        && let Ok(bytes) = serde_json::to_vec(&stamp)
    {
        provider
            .cache
            .put(
                partition,
                key,
                crate::providers::github::CachedContent {
                    etag: None,
                    bytes: bytes.into(),
                    resolved_ref: reference.to_owned(),
                },
            )
            .await;
    }
    stamp
}

/// The GitHub file query is the localFetch extraction query plus repository
/// coordinates (`owner`, `repo`, `ref`, `forceRefresh`): the extraction
/// fields map one to one onto the localFetch wire type, so both tools share
/// one extraction request. Paged reads get the default page size.
fn local_query(query: &GhGetFileContentQuery) -> Result<LocalFetchQuery, ProviderError> {
    let GhGetFileContentQuery {
        block,
        case_mode,
        context_lines,
        extras,
        force_refresh: _,
        full_content,
        length,
        main_goal,
        match_string,
        minify,
        offset,
        owner: _,
        path,
        ranges,
        reasoning,
        ref_: _,
        regex,
        repo: _,
        unit,
        whole_word,
    } = query;
    let mut local = LocalFetchQuery {
        block: *block,
        case_mode: *case_mode,
        whole_word: *whole_word,
        context_lines: *context_lines,
        extras: extras.clone(),
        full_content: *full_content,
        length: *length,
        main_goal: main_goal
            .as_ref()
            .map(|goal| goal.as_str().parse())
            .transpose()
            .map_err(decode_display)?,
        match_string: match_string.clone(),
        minify: Some(*minify),
        offset: *offset,
        path: path.as_str().parse().map_err(decode_display)?,
        ranges: ranges
            .iter()
            .map(|range| range.as_str().parse())
            .collect::<Result<Vec<_>, _>>()
            .map_err(decode_display)?,
        reasoning: reasoning
            .as_ref()
            .map(|reasoning| reasoning.as_str().parse())
            .transpose()
            .map_err(decode_display)?,
        regex: *regex,
        snapshot: None,
        unit: *unit,
    };
    let paged =
        local.full_content != Some(true) && local.match_string.is_none() && !local.has_ranges();
    // A path-only read keeps no length: localFetch guards it with a head.
    if local.length.is_none() && paged && !crate::tools::local_fetch::unanchored_first_read(&local)
    {
        local.length = crate::tools::local_fetch::wire_positive(default_chunk_size(&local));
    }
    Ok(local)
}

/// A byte page when `length` is omitted: localFetch's 16 KiB page budget
/// (its `LINE_PAGE_BYTES`, private to local_fetch).
const DEFAULT_BYTE_CHUNK: usize = 16_384;

fn default_chunk_size(local: &LocalFetchQuery) -> usize {
    match local.unit.unwrap_or(WindowUnit::Lines) {
        WindowUnit::Lines => crate::tools::local_fetch::DEFAULT_LINE_CHUNK,
        WindowUnit::Bytes => DEFAULT_BYTE_CHUNK,
    }
}

fn decode_display(error: impl std::fmt::Display) -> ProviderError {
    ProviderError::new(
        crate::providers::github::ProviderErrorKind::Decode,
        error.to_string(),
    )
}

/// This tool's output facts for the shared response stages.
pub(crate) struct Output;
impl crate::tools::output::ToolOutput for Output {
    fn fallback_hint(&self, _query: &serde_json::Value) -> &'static str {
        "Verify owner/repo/ref/path, or remove matchString."
    }
    fn error_hint(&self, code: &str) -> Option<&'static str> {
        // The message names the item; `repair` is the corrected read.
        (code == "invalidPattern").then_some(crate::tools::output::NO_HINT)
    }
    fn evidence_kind(&self, _query: &serde_json::Value, _data: &serde_json::Value) -> &'static str {
        "provider"
    }
    fn text_shape(&self) -> crate::tools::output::TextShape {
        crate::tools::output::TextShape::FileText
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::github::{NoCache, RetryPolicy};
    use crate::security::scan::{MemoizedScan, SanitizedViewMemo};
    use crate::tools::cancel::NeverCancel;
    use crate::tools::gh_shared::test_support::{fixture_context, mock_provider, mount_json};
    use crate::tools::local_fetch::wire_positive;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use std::{path::Path, time::Duration};
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{method, path, query_param},
    };

    async fn execute_default_regex<C>(
        provider: &GitHubProvider<C>,
        query: &GhGetFileContentQuery,
        request_context: &RequestContext,
        window: Option<usize>,
        security: &impl ContentScan,
        cancel: &impl CancellationCheck,
    ) -> Result<GhGetFileContentResult, ProviderError>
    where
        C: ConditionalCache,
    {
        execute(
            provider,
            query,
            request_context,
            window,
            security,
            cancel,
            &crate::tools::local_fetch::LocalFetchRegex,
        )
        .await
    }

    struct Safe;
    impl ContentScan for Safe {
        fn sanitize(
            &self,
            text: &str,
            _: &Path,
        ) -> Result<(String, Vec<String>), (String, String)> {
            Ok((text.replace("TOKEN", "[REDACTED]"), vec![]))
        }
    }

    #[derive(Default)]
    struct Counting {
        scans: std::sync::atomic::AtomicUsize,
    }
    impl ContentScan for Counting {
        fn sanitize(
            &self,
            text: &str,
            path: &Path,
        ) -> Result<(String, Vec<String>), (String, String)> {
            self.scans.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Safe.sanitize(text, path)
        }
        fn redact_key_blocks(&self, content: &str) -> (String, bool) {
            (content.replace("KEYBODY", "[KEY]"), true)
        }
    }

    #[test]
    fn line_pages_scan_only_their_window_and_keep_redaction() {
        let body = format!("TOKEN KEYBODY\n{}", "line of text\n".repeat(4000));
        let scanner = Counting::default();
        let memo = SanitizedViewMemo::new();
        let security = MemoizedScan::new(&scanner, &memo);
        let mut pages = Vec::new();
        for offset in [0, 100, 200] {
            let request = LocalFetchQuery {
                path: "big.txt".parse().expect("path"),
                unit: Some(WindowUnit::Lines),
                offset: Some(offset),
                length: wire_positive(100),
                ..LocalFetchQuery::test_default()
            };
            let page = process_fetched_content(
                &request,
                body.as_bytes(),
                Path::new("big.txt"),
                &Default::default(),
                &security,
                &NeverCancel,
                &crate::tools::local_fetch::LocalFetchRegex,
            );
            pages.push(page.content.unwrap_or_default());
        }
        // Line pages sanitize only their window (plus a margin), one small
        // scan per page, instead of the whole file.
        assert_eq!(
            scanner.scans.load(std::sync::atomic::Ordering::SeqCst),
            3,
            "each line page scans its own window"
        );
        assert!(pages[0].starts_with("[REDACTED] [KEY]\n"), "{}", pages[0]);
        assert_eq!(pages[1], "line of text\n".repeat(100));
        // The memo still serves repeated full views (byte/fullContent pages):
        // a new view is scanned once, then reused.
        security
            .sanitize("x".repeat(20_000).as_str(), Path::new("other"))
            .expect("scan");
        security
            .sanitize("x".repeat(20_000).as_str(), Path::new("other"))
            .expect("scan");
        assert_eq!(scanner.scans.load(std::sync::atomic::Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn shared_pipeline_ranges_redacts_and_emits_remote_continuation() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        mount_json(
            &server,
            "/api/v3/repos/a/b/commits/main",
            200,
            serde_json::json!({"sha":sha}),
        )
        .await;
        Mock::given(method("GET")).and(path("/api/v3/repos/a/b/contents/src%2Flib.rs")).and(query_param("ref",sha)).respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode("one\nneedle TOKEN\nthree\n")}))).mount(&server).await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let query: GhGetFileContentQuery = serde_json::from_value(serde_json::json!({
            "owner": "a", "repo": "b", "path": "src/lib.rs", "ref": "main",
            "unit": "lines", "length": 2, "minify": "none", "mainGoal": "test", "reasoning": "test"
        }))
        .expect("ghGetFileContent query");
        let result = execute_default_regex(
            &provider,
            &query,
            &fixture_context(Duration::from_secs(2), 4096),
            None,
            &Safe,
            &NeverCancel,
        )
        .await
        .expect("result");
        assert_eq!(
            result.files[0].content.content.as_deref(),
            Some("one\nneedle [REDACTED]\n")
        );
        assert_eq!(result.files[0].commit_sha, sha);
        let wire = serde_json::to_value(&result.files[0]).expect("file json");
        assert_eq!(wire["commitSha"], sha);
        assert!(wire.get("resolvedRef").is_none(), "{wire}");
        let next = result.files[0].next.clone().expect("continuation");
        assert_eq!(next["continueWindow"]["tool"], "ghGetFileContent");
        assert_eq!(next["continueWindow"]["query"]["queries"][0]["owner"], "a");
        assert_eq!(next["continueWindow"]["query"]["queries"][0]["ref"], sha);
    }

    #[tokio::test]
    async fn match_string_runs_on_redacted_text() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        mount_json(
            &server,
            "/api/v3/repos/a/b/commits/main",
            200,
            serde_json::json!({"sha":sha}),
        )
        .await;
        mount_json(&server, "/api/v3/repos/a/b/contents/src%2Flib.rs", 200, serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode("one\nkey TOKEN\nthree\n")})).await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let query: GhGetFileContentQuery = serde_json::from_value(serde_json::json!({
            "owner": "a", "repo": "b", "path": "src/lib.rs", "ref": "main",
            "matchString": "TOKEN", "contextLines": 0, "mainGoal": "test", "reasoning": "test"
        }))
        .expect("query");
        let result = execute_default_regex(
            &provider,
            &query,
            &fixture_context(Duration::from_secs(2), 4096),
            None,
            &Safe,
            &NeverCancel,
        )
        .await
        .expect("result");
        assert_eq!(
            result.files[0].match_not_found,
            Some(true),
            "{:?}",
            result.files[0].content
        );
    }

    async fn read(provider: &GitHubProvider<NoCache>, query: Value) -> GhGetFileContentResult {
        let mut query = query;
        query["mainGoal"] = "test".into();
        query["reasoning"] = "test".into();
        let query: GhGetFileContentQuery = serde_json::from_value(query).expect("query");
        execute_default_regex(
            provider,
            &query,
            &fixture_context(Duration::from_secs(5), 1 << 20),
            Some(50_000),
            &Safe,
            &NeverCancel,
        )
        .await
        .expect("result")
    }

    /// Freshness is a receipt: a `receipts` read's first page (offset 0)
    /// states when the file last changed and by whom, for one commits
    /// request sent after the body arrived; a default read, a later page and
    /// a failed read send none.
    #[tokio::test]
    async fn a_receipts_first_page_states_the_last_change_for_one_extra_request() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let body: String = (1..=40).map(|i| format!("line {i}\n")).collect();
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/a.txt",
            200,
            serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(&body)}),
        )
        .await;
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/missing.txt",
            404,
            serde_json::json!({"message":"Not Found"}),
        )
        .await;
        Mock::given(method("GET"))
            .and(path("/api/v3/repos/a/b/commits"))
            .and(wiremock::matchers::query_param("path", "a.txt"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!([{"author":{"login":"ada-l"},"commit":{"committer":{"date":"2026-01-02T00:00:00Z"},"author":{"name":"Ada"}}}]),
            ))
            .expect(1)
            .mount(&server)
            .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let plain = read(
            &provider,
            serde_json::json!({"owner":"a","repo":"b","path":"a.txt","ref":sha}),
        )
        .await;
        assert_eq!(plain.files[0].last_modified, None);
        assert_eq!(plain.files[0].last_modified_by, None);
        let base = serde_json::json!({"owner":"a","repo":"b","path":"a.txt","ref":sha,"extras":["receipts"]});
        let stamped = read(&provider, base.clone()).await;
        assert_eq!(
            stamped.files[0].last_modified.as_deref(),
            Some("2026-01-02T00:00:00Z")
        );
        assert_eq!(stamped.files[0].last_modified_by.as_deref(), Some("ada-l"));
        let mut later = base;
        later["offset"] = 20.into();
        let later = read(&provider, later).await;
        assert_eq!(later.files[0].last_modified, None);
        assert_eq!(later.files[0].last_modified_by, None);
        let mut missing =
            serde_json::json!({"owner":"a","repo":"b","path":"missing.txt","ref":sha});
        missing["mainGoal"] = "test".into();
        missing["reasoning"] = "test".into();
        let missing: GhGetFileContentQuery = serde_json::from_value(missing).expect("query");
        assert!(
            execute_default_regex(
                &provider,
                &missing,
                &fixture_context(Duration::from_secs(5), 1 << 20),
                None,
                &Safe,
                &NeverCancel,
            )
            .await
            .is_err()
        );
        let requests = server.received_requests().await.unwrap_or_default();
        assert!(
            !requests.iter().any(|request| {
                request.url.path() == "/api/v3/repos/a/b/commits"
                    && request
                        .url
                        .query()
                        .is_some_and(|q| q.contains("missing.txt"))
            }),
            "a failed read asked for its timestamp: {requests:?}"
        );
    }

    /// A window is exactly what was asked: a `ranges` or `matchString`
    /// read of a small file returns those lines, never the whole file, in
    /// the default view and verbatim alike. A `ranges` read can always ask
    /// for more.
    #[tokio::test]
    async fn windows_stay_windows_on_small_files() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let small: String = (1..=30).map(|i| format!("line {i}\n")).collect();
        mount_json(&server, "/api/v3/repos/a/b/contents/small.py".to_owned(), 200, serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(&small)}),).await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let base = || serde_json::json!({"owner":"a","repo":"b","path":"small.py","ref":sha});
        let mut matched = base();
        matched["matchString"] = "line 12".into();
        matched["contextLines"] = 1.into();
        let window = read(&provider, matched).await;
        let file = &window.files[0].content;
        assert_eq!(file.matched_lines, vec![12]);
        assert_eq!(
            file.source_line_ranges,
            vec![crate::tools::local_fetch::LineRange { start: 11, end: 13 }]
        );
        for minify in [None, Some("none")] {
            let mut ranged = base();
            ranged["ranges"] = serde_json::json!(["1-15"]);
            if let Some(mode) = minify {
                ranged["minify"] = mode.into();
            }
            let window = read(&provider, ranged).await;
            let content = window.files[0].content.content.clone().unwrap_or_default();
            assert!(content.contains("line 15"), "{content}");
            assert!(!content.contains("line 16"), "{minify:?}: {content}");
        }
    }

    /// A path-only read of a file over one page gets localFetch's guarded
    /// head, not a 2,000-line page; the continuation reaches the rest, and
    /// an explicit whole-file read stays one call away.
    #[tokio::test]
    async fn a_path_only_read_of_a_large_file_returns_a_head_and_a_continuation() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let body: String = (1..=1_500).map(|i| format!("line of text {i}\n")).collect();
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/big.txt",
            200,
            serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(&body)}),
        )
        .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let base = serde_json::json!({"owner":"a","repo":"b","path":"big.txt","ref":sha});
        let head = read(&provider, base.clone()).await;
        let file = &head.files[0];
        assert_eq!(
            file.content.returned_lines,
            Some(50),
            "{:?}",
            file.content.warnings
        );
        assert!(
            file.content
                .warnings
                .iter()
                .any(|warning| warning.contains("read without an anchor")),
            "{:?}",
            file.content.warnings
        );
        let next = file.next.clone().expect("continuation");
        let page = &next["continueWindow"]["query"]["queries"][0];
        assert_eq!(page["offset"], 50, "{next}");
        assert_eq!(page["path"], "big.txt", "{next}");
        // Explicit whole-file read, and anchored reads, are not cut to a head.
        let mut whole = base.clone();
        whole["fullContent"] = true.into();
        let whole = read(&provider, whole).await;
        assert!(whole.files[0].content.returned_lines.expect("lines") > 50);
        let mut ranged = base;
        ranged["ranges"] = serde_json::json!(["10-200"]);
        let ranged = read(&provider, ranged).await;
        assert_eq!(ranged.files[0].content.returned_lines, Some(191));
    }

    /// A path-only read of a minified file (one oversized line) pages by
    /// bytes; every `next.continueWindow` carries the page's unit, so following
    /// them verbatim reaches the end byte-identical.
    #[tokio::test]
    async fn a_minified_file_walks_to_its_end_through_next_continue() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let body: String = (0..40_000)
            .map(|i| format!("needle{i} "))
            .collect::<String>()
            .chars()
            .take(300_000)
            .collect();
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/min.js",
            200,
            serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(&body)}),
        )
        .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let mut query =
            serde_json::json!({"owner":"a","repo":"b","path":"min.js","ref":sha,"minify":"none"});
        let (mut text, mut pages) = (String::new(), 0);
        loop {
            let result = read(&provider, query).await;
            let file = &result.files[0];
            assert_eq!(file.content.error_code, None, "{:?}", file.content);
            assert!(!file.content.out_of_range, "{:?}", file.content);
            text.push_str(file.content.content.as_deref().unwrap_or_default());
            pages += 1;
            assert!(pages < 40, "runaway paging");
            match file
                .next
                .as_ref()
                .map(|next| next["continueWindow"].clone())
            {
                Some(next) if !next.is_null() => {
                    query = next["query"]["queries"][0].clone();
                }
                _ => break,
            }
        }
        assert!(pages >= 18, "{pages} pages");
        assert!(text == body, "pages join into the file exactly once");
    }

    /// Continuations and leads carry only fields that change the read: a
    /// default view (`fullContent` off, `minify: standard`, sent or not) is
    /// omitted, a chosen `minify: none` is kept, and a whole-file read pages
    /// without `fullContent`.
    #[tokio::test]
    async fn continuations_omit_default_view_fields() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let body: String = (1..=6000).map(|i| format!("line of text {i}\n")).collect();
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/big.txt",
            200,
            serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(&body)}),
        )
        .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let base = serde_json::json!({"owner":"a","repo":"b","path":"big.txt","ref":sha});
        let mut paged = base.clone();
        paged["unit"] = "lines".into();
        paged["length"] = 100.into();
        let mut standard = paged.clone();
        standard["minify"] = "standard".into();
        let mut verbatim = paged.clone();
        verbatim["minify"] = "none".into();
        let mut whole = base;
        whole["fullContent"] = true.into();
        for (query, minify) in [
            (paged, None),
            (standard, None),
            (verbatim, Some("none")),
            (whole, None),
        ] {
            let result = read(&provider, query).await;
            let next = result.files[0].next.clone().expect("continuation");
            let page = &next["continueWindow"]["query"]["queries"][0];
            assert!(page.get("fullContent").is_none(), "{next}");
            assert_eq!(page.get("minify").and_then(Value::as_str), minify, "{next}");
            assert_eq!(page["ref"], sha, "{next}");
        }
    }

    #[tokio::test]
    async fn oversized_full_content_is_partial_not_empty() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        mount_json(&server, "/api/v3/repos/a/b/contents/big.txt", 200, serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode("line of text\n".repeat(6000))})).await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let query: GhGetFileContentQuery = serde_json::from_value(serde_json::json!({
            "owner": "a", "repo": "b", "path": "big.txt", "ref": sha,
            "fullContent": true, "mainGoal": "test", "reasoning": "test"
        }))
        .expect("query");
        let result = execute_default_regex(
            &provider,
            &query,
            &fixture_context(Duration::from_secs(2), 1 << 20),
            Some(50_000),
            &Safe,
            &NeverCancel,
        )
        .await
        .expect("result");
        let file = &result.files[0];
        // The first bounded page comes back inline, not an empty body.
        assert_eq!(file.content.error_code, None);
        assert_eq!(file.content.status, "success");
        assert!(
            file.content
                .content
                .as_deref()
                .is_some_and(|text| !text.is_empty())
        );
        assert_eq!(file.content.is_partial, Some(true));
        assert!(
            file.next
                .as_ref()
                .is_some_and(|next| next.get("continueWindow").is_some())
        );
    }

    async fn run_default(
        provider: &GitHubProvider<NoCache>,
        query: Value,
    ) -> Result<FileRead, crate::tools::gh_shared::GhFailure> {
        let mut query = query;
        query["mainGoal"] = "test".into();
        query["reasoning"] = "test".into();
        let query: GhGetFileContentQuery = serde_json::from_value(query).expect("query");
        run(
            provider,
            &query,
            Ok(&fixture_context(Duration::from_secs(5), 1 << 20)),
            None,
            &Safe,
            &NeverCancel,
            &crate::tools::local_fetch::LocalFetchRegex,
        )
        .await
    }

    /// A path whose case differs is answered by one listing walk at the
    /// resolved commit: one case-corrected `read` lead, and the one hint
    /// names where that lead is. No listing at `HEAD` is spent.
    #[tokio::test]
    async fn wrong_case_path_leads_once_to_the_case_corrected_read() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        Mock::given(method("GET"))
            .and(path("/api/v3/repos/a/b/commits/HEAD"))
            .respond_with(ResponseTemplate::new(200).set_body_string(sha))
            .mount(&server)
            .await;
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/src%2FLib.rs",
            404,
            serde_json::json!({"message":"Not Found"}),
        )
        .await;
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/src",
            200,
            serde_json::json!([
                {"name":"lib.rs","path":"src/lib.rs","type":"file"},
                {"name":"main.rs","path":"src/main.rs","type":"file"}
            ]),
        )
        .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let failure = match run_default(
            &provider,
            serde_json::json!({"owner":"a","repo":"b","path":"src/Lib.rs"}),
        )
        .await
        {
            Err(failure) => failure,
            Ok(_) => panic!("a missing path is a failure"),
        };
        let next = failure.next.expect("recovery leads");
        assert_eq!(
            next["read"]["query"]["queries"][0]["path"], "src/lib.rs",
            "{next}"
        );
        assert_eq!(
            failure.hints,
            vec!["Only the path's case differs.".to_owned()]
        );
        let requests = server.received_requests().await.unwrap_or_default();
        assert!(
            !requests
                .iter()
                .any(|request| request.url.query().is_some_and(|q| q.contains("ref=HEAD"))),
            "a listing at HEAD was spent: {requests:?}"
        );
    }

    /// A matchString with no hit in an existing file is `matchNotFound` with
    /// an empty `content` (the contract requires it, as in localFetch) and
    /// its leads; it carries no prose beside them, no zero counters and no
    /// echo of the request.
    #[tokio::test]
    async fn no_match_read_keeps_its_leads_without_empty_echo() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        mount_json(&server, "/api/v3/repos/a/b/contents/a.txt", 200, serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode("one\ntwo\n")}),).await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let read = run_default(
            &provider,
            serde_json::json!({"owner":"a","repo":"b","path":"a.txt","ref":sha,"matchString":"absent"}),
        )
        .await
        .expect("read");
        let data = &read.output.data;
        assert_eq!(read.output.status, Some("empty"), "{data}");
        assert_eq!(data["matchNotFound"], true, "{data}");
        assert_eq!(data["content"], "", "{data}");
        crate::contracts::validate_output(
            "ghGetFileContent",
            &serde_json::json!({"results":[{"index":0,"status":"empty","data":data}]}),
        )
        .expect("an empty match row satisfies the output contract");
        for junk in [
            "returnedLines",
            "returnedChars",
            "searchedFor",
            "pagination",
            "hints",
            "warnings",
        ] {
            assert!(data.get(junk).is_none(), "{junk}: {data}");
        }
        // FIX §0 #4: the runnable lead is the next step: a repository search
        // for a small file.
        let lead = &data["next"]["findCode"];
        assert_eq!(lead["tool"], "ghSearchCode", "{data}");
        assert_eq!(
            lead["query"]["queries"][0]["keywords"],
            serde_json::json!(["absent"]),
            "{data}"
        );
        // A miss that no case-insensitive read would select has no
        // ignoreCase lead.
        assert!(data["next"].get("ignoreCase").is_none(), "{data}");
        // The shared localFetch miss offers a localSearch of the file's
        // directory; it has no GitHub equivalent, so it must not be rewritten
        // into a ghGetFileContent read of that directory (an invalidInput
        // "is a directory" row when run verbatim).
        assert!(data["next"].get("findText").is_none(), "{data}");
        for (name, lead) in data["next"].as_object().into_iter().flatten() {
            if lead["tool"] == "ghGetFileContent" {
                assert_eq!(
                    lead["query"]["queries"][0]["path"], "a.txt",
                    "{name} reads another path: {data}"
                );
            }
        }

        // A case-sensitive miss that a case-insensitive read selects runs
        // the same read, ignoring case, at the read's commit; the count of
        // lines it selects is the fact beside the lead.
        let sensitive = run_default(
            &provider,
            serde_json::json!({"owner":"a","repo":"b","path":"a.txt","ref":sha,"matchString":"Two"}),
        )
        .await
        .expect("read");
        let data = &sensitive.output.data;
        assert_eq!(
            data["warnings"],
            serde_json::json!(["1 line matches ignoring case."]),
            "{data}"
        );
        assert!(data.get("hints").is_none(), "{data}");
        let row = &data["next"]["ignoreCase"]["query"]["queries"][0];
        assert_eq!(data["next"]["ignoreCase"]["tool"], "ghGetFileContent");
        assert_eq!(row["caseMode"], "insensitive", "{data}");
        assert_eq!(row["matchString"], "Two", "{data}");
        assert_eq!(row["ref"], sha, "{data}");
        crate::contracts::validate_output(
            "ghGetFileContent",
            &serde_json::json!({"results":[{"index":0,"status":"empty","data":data}]}),
        )
        .expect("an ignoreCase lead satisfies the output contract");
    }

    /// FIX §0 #4: a literal missed in a large file leads to a clasify locate
    /// of that file at the read's commit.
    #[tokio::test]
    async fn no_match_in_a_large_file_leads_to_clasify() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        let text = (0..1200).map(|n| format!("line {n}\n")).collect::<String>();
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/big.txt",
            200,
            serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(&text)}),
        )
        .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let read = run_default(
            &provider,
            serde_json::json!({"owner":"a","repo":"b","path":"big.txt","ref":sha,"matchString":"absent"}),
        )
        .await
        .expect("read");
        let data = &read.output.data;
        let lead = &data["next"]["clasify"];
        assert_eq!(lead["tool"], "clasify", "{data}");
        let matrix = &lead["query"]["queries"][0];
        assert_eq!(matrix["resources"][0]["query"]["ref"], sha, "{data}");
        assert_eq!(matrix["resources"][0]["query"]["path"], "big.txt", "{data}");
        assert_eq!(matrix["questions"][0]["type"], "locate", "{data}");
    }

    /// The happy-path anchors of a block read: `path`, the resolved
    /// `commitSha` (the next read's ref), gutter-numbered source lines, and
    /// `blocks[]` as `{symbolName, line, endLine}`; owner, repo and ref are
    /// not echoed.
    #[tokio::test]
    async fn a_block_read_row_carries_path_commit_gutter_and_blocks() {
        let server = MockServer::start().await;
        let sha = "0123456789abcdef0123456789abcdef01234567";
        Mock::given(method("GET"))
            .and(path("/api/v3/repos/a/b/commits/main"))
            .respond_with(ResponseTemplate::new(200).set_body_string(sha))
            .mount(&server)
            .await;
        let source = "use x;\n\nfn helper() -> u8 {\n    1\n}\n\nfn main() {\n    let v = helper();\n    println!(\"{v}\");\n}\n";
        mount_json(
            &server,
            "/api/v3/repos/a/b/contents/src%2Fmain.rs",
            200,
            serde_json::json!({"type":"file","encoding":"base64","content":STANDARD.encode(source)}),
        )
        .await;
        let provider = mock_provider(&server, RetryPolicy::default());
        let read = run_default(
            &provider,
            serde_json::json!({"owner":"a","repo":"b","path":"src/main.rs","ref":"main",
                "matchString":"let v","block":true}),
        )
        .await
        .expect("read");
        let mut data = read.output.data.clone();
        assert_eq!(data["path"], "src/main.rs", "{data}");
        assert_eq!(data["commitSha"], sha, "{data}");
        assert_eq!(
            data["blocks"],
            serde_json::json!([{"symbolName":"main","line":7,"endLine":10}]),
            "{data}"
        );
        let mut staged = serde_json::json!({"results":[{"index":0,"data":data.take()}]});
        crate::tools::numbered::number_read_rows(
            crate::tools::id::ToolId::GhGetFileContent,
            &mut staged,
        );
        let row = &staged["results"][0]["data"];
        assert!(
            row["content"]
                .as_str()
                .is_some_and(|text| text.starts_with("7\tfn main() {\n8\t")),
            "{row}"
        );
        for echo in ["ref", "matchString", "block"] {
            assert!(row.get(echo).is_none(), "{echo} echoed: {row}");
        }
    }
}
