//! `operation: "pullRequest"`: concurrent collection loads (GraphQL first page
//! or REST windows), metadata row, and assembly of the shaped sections.
use super::filter::{FileFilter, InventoryFilter};
use super::graphql::{
    GraphqlCollection, GraphqlOutcome, GraphqlPr, graphql_complete_collection_eligible,
    graphql_pull_request, map_graphql_comments, map_graphql_commits, map_graphql_files,
    map_graphql_reviews,
};
use super::inventory::{file_page_size, shape_pr_files};
use super::patch::hunks::{HeadSources, head_text_needed, match_context};
use super::pr_finish::{finish_pr, pr_metadata, slim_row};
use super::pr_menu::{INVENTORY_ALL_PATCHES_FILES, pr_next_menu};
use super::pr_sections::{shape_pr_comments, shape_pr_commits, shape_pr_reviews};
use super::text::{body_matches, history_body_view, needle, paginate_text, view_dropped_text};
use super::util::{content_flag, map_comments, str_at};
use super::window::{
    Loaded, MAX_COLLECTION_BATCHES, MAX_FILE_BATCHES, MAX_PR_COMMIT_BATCHES, WindowSpec,
    WindowState, load_window, reconcile_file_totals,
};
use super::{HistoryItemRequest, fetch, validation};
use crate::contracts::tool_types::ExtraKind;
use octocode_github::{GitHubTransport, ProviderError, ProviderErrorKind, RequestContext};
use serde_json::{Map, Value, json};

/// The content sections a pull-request query asks for.
pub(super) struct ContentWants {
    pub(super) body: bool,
    pub(super) files: bool,
    pub(super) discussion: bool,
    inline: bool,
    pub(super) reviews: bool,
    pub(super) commits: bool,
    pub(super) patch_mode: String,
}

pub(super) fn content_wants(query: &HistoryItemRequest) -> ContentWants {
    let content_value = query.content_value();
    let content = content_value.as_ref().and_then(Value::as_object);
    let patch_mode = content
        .and_then(|c| c.get("patches"))
        .and_then(|p| p.get("mode"))
        .and_then(Value::as_str)
        .unwrap_or("none")
        .to_owned();
    let comments_selector = content
        .and_then(|c| c.get("comments"))
        .and_then(Value::as_object);
    ContentWants {
        body: content_flag(content, "body"),
        files: content_flag(content, "files") || patch_mode != "none",
        discussion: content_flag(comments_selector, "discussion"),
        inline: content_flag(comments_selector, "reviewInline"),
        reviews: content_flag(content, "reviews"),
        commits: content
            .and_then(|c| c.get("commits"))
            .and_then(Value::as_object)
            .is_some(),
        patch_mode,
    }
}

/// One PR collection: the whole list when GraphQL returned it complete,
/// otherwise the REST window covering the requested public page.
async fn load_collection(
    transport: &GitHubTransport,
    wanted: bool,
    graphql: Option<Vec<Value>>,
    segments: &[&str],
    spec: WindowSpec,
    keep: impl Fn(&Value) -> bool,
    context: &RequestContext,
) -> Result<Option<Loaded>, ProviderError> {
    if !wanted {
        return Ok(None);
    }
    if let Some(items) = graphql {
        return Ok(Some(Loaded::complete(items)));
    }
    load_window(transport, segments, spec, keep, context)
        .await
        .map(Some)
}

pub(super) async fn pull_request(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
) -> Result<Value, ProviderError> {
    let wants = content_wants(query);
    let (graphql, graphql_fallback) = fast_path(transport, query, context, &wants).await?;
    let plan = PrPlan::new(query)?;
    let loads = load_pr(transport, query, context, &wants, &plan, graphql.as_ref()).await?;
    let shaped = shape_pr(transport, query, context, &wants, &plan, loads).await?;
    Ok(finish_pr(query, &wants, &plan, shaped, graphql_fallback))
}

/// The GraphQL fast path. REST serves whatever GraphQL could not; a failed
/// fast path keeps its reason, and a cancelled or expired request stops here.
async fn fast_path(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
    wants: &ContentWants,
) -> Result<(Option<GraphqlPr>, Option<String>), ProviderError> {
    if !graphql_complete_collection_eligible(query) {
        return Ok((None, None));
    }
    match graphql_pull_request(transport, query, context, wants).await {
        Ok(GraphqlOutcome::Served(pr)) => Ok((Some(*pr), None)),
        Ok(GraphqlOutcome::Unavailable) => Ok((None, None)),
        Ok(GraphqlOutcome::Failed(reason)) => Ok((None, Some(reason))),
        Err(error)
            if matches!(
                error.kind,
                ProviderErrorKind::Cancelled | ProviderErrorKind::Timeout
            ) =>
        {
            Err(error)
        }
        Err(error) => Ok((None, Some(error.message.to_string()))),
    }
}

/// What a pull-request read selects: the content selector, the patch
/// selection, the literal and the file scope.
pub(super) struct PrPlan {
    number: String,
    content: Option<Value>,
    pub(super) needle: Option<String>,
    pub(super) scope: Option<InventoryFilter>,
}

impl PrPlan {
    fn new(query: &HistoryItemRequest) -> Result<Self, ProviderError> {
        let number = query
            .number()
            .ok_or_else(|| validation("number is required"))?
            .to_string();
        let content = query.content_value();
        let scope = InventoryFilter::from_query(query).map_err(|message| validation(&message))?;
        Ok(Self {
            number,
            content,
            needle: needle(query),
            scope,
        })
    }
    fn content(&self) -> Option<&Map<String, Value>> {
        self.content.as_ref().and_then(Value::as_object)
    }
    fn file_filter(&self) -> FileFilter<'_> {
        FileFilter {
            needle: self.needle.as_deref(),
            scope: self.scope.as_ref(),
        }
    }
}

/// The provider data one pull-request read loaded.
struct PrLoads {
    raw: Value,
    files: Option<Loaded>,
    discussion: Option<Loaded>,
    inline: Option<Loaded>,
    reviews: Option<Loaded>,
    commits: Option<Loaded>,
}

/// Requests that run before the collections: the PR itself, beside the
/// first file batch, when a filtered file scan or a later comment page needs
/// the PR's counts to read every batch at once.
async fn first_requests(
    transport: &GitHubTransport,
    context: &RequestContext,
    pulls: &[&str],
    filtered_files: bool,
    later_comments: bool,
) -> Result<(Option<Value>, Option<Vec<Value>>), ProviderError> {
    if filtered_files {
        let files_path = [pulls, &["files"]].concat();
        let batch = [
            ("per_page", octocode_github::MAX_PER_PAGE.to_string()),
            ("page", "1".to_owned()),
        ];
        let (raw, (files, more)) = tokio::try_join!(
            fetch(transport, pulls, &[], context),
            fetch(transport, &files_path, &batch, context),
        )?;
        let whole = (!more).then(|| files.as_array().cloned()).flatten();
        return Ok((Some(raw.0), whole));
    }
    if later_comments {
        return Ok((Some(fetch(transport, pulls, &[], context).await?.0), None));
    }
    Ok((None, None))
}

/// The PR fetched before its collections, beside its first file batch, when
/// they need its counts: a selected or match-filtered file scan cannot jump
/// to a batch by index, nor can a later comment page that filters bots; with
/// the PR's counts in hand they read every batch at once. When the first
/// file batch is the whole list (most PRs), a filtered read costs one round
/// trip.
async fn prefetch(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
    wants: &ContentWants,
    plan: &PrPlan,
    graphql: Option<&GraphqlPr>,
) -> Result<(Option<Value>, Option<Vec<Value>>), ProviderError> {
    if graphql.is_some() {
        return Ok((None, None));
    }
    let filtered_files = wants.files && !plan.file_filter().is_trivial();
    let later_comments =
        (wants.discussion || wants.inline) && query.page().is_some_and(|page| page > 1);
    let pulls = [
        "repos",
        query.owner(),
        query.repo(),
        "pulls",
        plan.number.as_str(),
    ];
    first_requests(transport, context, &pulls, filtered_files, later_comments).await
}

/// The PR itself: from GraphQL, the prefetch, or one REST read.
async fn load_raw(
    transport: &GitHubTransport,
    context: &RequestContext,
    pulls: &[&str],
    graphql: Option<&GraphqlPr>,
    prefetched: Option<Value>,
) -> Result<Value, ProviderError> {
    match (graphql, prefetched) {
        (Some(graphql), _) => Ok(graphql.raw.clone()),
        (None, Some(raw)) => Ok(raw),
        (None, None) => fetch(transport, pulls, &[], context)
            .await
            .map(|(raw, _)| raw),
    }
}

/// A collection's item count on the prefetched PR (`changed_files`,
/// `comments`, `review_comments`).
fn provider_count(raw: Option<&Value>, key: &str) -> Option<usize> {
    raw.and_then(|raw| raw.get(key))
        .and_then(Value::as_u64)
        .map(|total| usize::try_from(total).unwrap_or(usize::MAX))
}

async fn load_pr(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
    wants: &ContentWants,
    plan: &PrPlan,
    graphql: Option<&GraphqlPr>,
) -> Result<PrLoads, ProviderError> {
    let (file_filter, needle) = (plan.file_filter(), plan.needle.as_deref());
    let page_size = query.collection_page_size();
    let comment_filter = |value: &Value| body_matches(value, needle);
    let spec = |max_batches, page: Option<usize>, filtered| WindowSpec {
        max_batches,
        page: page.unwrap_or(1),
        page_size,
        filtered,
        provider_total: None,
    };
    let (owner, repo, number) = (query.owner(), query.repo(), plan.number.as_str());
    let under_pulls = |leaf: &'static str| ["repos", owner, repo, "pulls", number, leaf];
    let [files_path, inline_path, reviews_path, commits_path] =
        ["files", "comments", "reviews", "commits"].map(under_pulls);
    let discussion_path = ["repos", owner, repo, "issues", number, "comments"];
    let complete = |kind: fn(&GraphqlPr) -> GraphqlCollection, map: fn(&Value) -> Vec<Value>| {
        graphql
            .filter(|g| kind(g) == GraphqlCollection::Complete)
            .map(|g| map(&g.source))
    };
    let (raw_first, first_file_batch) =
        prefetch(transport, query, context, wants, plan, graphql).await?;
    let provider_count = |key: &str| provider_count(raw_first.as_ref(), key);
    let pulls = ["repos", owner, repo, "pulls", number];
    // Collections load concurrently; each derives its provider batches from
    // the public page cursor (no provider cursor leaks into continuations).
    let (raw, files, discussion, inline, reviews, commits) = tokio::try_join!(
        load_raw(transport, context, &pulls, graphql, raw_first.clone()),
        load_collection(
            transport,
            wants.files,
            complete(|g| g.files, map_graphql_files).or(first_file_batch),
            &files_path,
            WindowSpec {
                provider_total: provider_count("changed_files"),
                page_size: file_page_size(query, wants.patch_mode != "none"),
                ..spec(MAX_FILE_BATCHES, query.page(), !file_filter.is_trivial())
            },
            |value| file_filter.matches(value),
            context,
        ),
        load_collection(
            transport,
            wants.discussion,
            complete(|g| g.discussion, map_graphql_comments),
            &discussion_path,
            WindowSpec {
                provider_total: provider_count("comments"),
                ..spec(MAX_COLLECTION_BATCHES, query.page(), true)
            },
            comment_filter,
            context,
        ),
        load_collection(
            transport,
            wants.inline,
            None,
            &inline_path,
            WindowSpec {
                provider_total: provider_count("review_comments"),
                ..spec(MAX_COLLECTION_BATCHES, query.page(), true)
            },
            comment_filter,
            context,
        ),
        load_collection(
            transport,
            wants.reviews,
            complete(|g| g.reviews, map_graphql_reviews),
            &reviews_path,
            spec(MAX_COLLECTION_BATCHES, query.page(), needle.is_some()),
            comment_filter,
            context,
        ),
        load_collection(
            transport,
            wants.commits,
            complete(|g| g.commits, map_graphql_commits),
            &commits_path,
            spec(MAX_PR_COMMIT_BATCHES, query.page(), false),
            |_| true,
            context,
        ),
    )?;
    Ok(PrLoads {
        raw,
        files,
        discussion,
        inline,
        reviews,
        commits,
    })
}

/// Inline review comments sort before discussion; the combined list is
/// complete only when both sources are.
fn merge_comments(
    inline: Option<Loaded>,
    discussion: Option<Loaded>,
) -> (Vec<Value>, Option<WindowState>) {
    let mut comments = Vec::new();
    let mut state: Option<WindowState> = None;
    for loaded in [inline, discussion] {
        let Some(loaded) = loaded else { continue };
        state = Some(match state {
            None => loaded.state,
            Some(previous) => previous.merge(loaded.state),
        });
        comments.extend(map_comments(loaded.items));
    }
    (comments, state)
}

/// What the changed-file section of a read found.
#[derive(Default)]
pub(super) struct FileOutcome {
    review: Vec<String>,
    pub(super) unsearched: Vec<String>,
    /// The first unsearched path and the commit holding its text (the
    /// base for a removed file, else the head).
    pub(super) first_unsearched: Option<(String, Option<String>)>,
    /// `(dropped, listed)` changed files of the `matchString` filter.
    pub(super) match_dropped: Option<(usize, usize)>,
    pub(super) scope_unmatched: bool,
    pub(super) merge_read: Option<Value>,
    /// `readAtCommit`/`readParent`: the top file at the head (when no merge
    /// read covers it) and at the base.
    pub(super) side_reads: Vec<(&'static str, Value)>,
    /// Files whose `matchString` context the hunks cut short.
    pub(super) clipped: Vec<(String, Vec<String>)>,
}

fn shape_files_section(
    row: &mut Value,
    pagination: &mut Map<String, Value>,
    loaded: Loaded,
    raw: &Value,
    query: &HistoryItemRequest,
    wants: &ContentWants,
    plan: &PrPlan,
) -> FileOutcome {
    let file_filter = plan.file_filter();
    // A cross-tool read: one check at the merge commit, on the first page,
    // over every loaded file (a later patch window does not repeat it, and
    // the shown window may hold no code file).
    let merge_read = (!query.later_page())
        .then(|| {
            super::pr_menu::read_at_merge(query, raw, &loaded.items, |file| {
                file_filter.matches(file)
            })
        })
        .flatten();
    // Both sides of the numbered diff for its top file: the head (a merged
    // PR's merge read stands for its new side) and the base, whose old-side
    // numbers match while the base has not moved past the diff's merge base.
    // A file GitHub sent without a patch comes first: no merge read covers
    // it, so its head read stays.
    let side_reads = if query.later_page() || wants.patch_mode == "none" {
        Vec::new()
    } else {
        let unpatched =
            super::pr_menu::first_unpatched(&loaded.items, |file| file_filter.matches(file))
                .is_some();
        super::pr_menu::change_reads(
            query.owner(),
            query.repo(),
            &loaded.items,
            &super::pr_menu::ChangeSides {
                new_ref: str_at(raw, "/head/sha").filter(|_| merge_read.is_none() || unpatched),
                old_ref: str_at(raw, "/base/sha").filter(|sha| !sha.is_empty()),
                old_confidence: "medium",
            },
            |file| file_filter.matches(file),
        )
    };
    let listed = loaded.state.skipped + loaded.items.len();
    let state = loaded.state;
    // An `include`/`status`/`minChanges` scope that matched no changed file at all.
    let scope_unmatched = (plan.scope.is_some() || plan.needle.is_some())
        && state.exhausted
        && query.page().unwrap_or(1) == 1
        && !loaded.items.iter().any(|file| file_filter.matches(file));
    let shaped = shape_pr_files(
        row,
        pagination,
        loaded.items,
        state,
        query,
        &wants.patch_mode,
        plan.scope.as_ref(),
    );
    if let Some(page) = pagination.get_mut("files") {
        let changed_files = raw
            .get("changed_files")
            .and_then(Value::as_u64)
            .map(|total| usize::try_from(total).unwrap_or(usize::MAX));
        reconcile_file_totals(
            page,
            state,
            listed,
            changed_files,
            !file_filter.is_trivial(),
        );
    }
    FileOutcome {
        review: shaped.review,
        unsearched: shaped.unsearched,
        first_unsearched: shaped.first_unsearched.map(|(path, removed)| {
            let side = if removed { "/base/sha" } else { "/head/sha" };
            let sha = str_at(raw, side).filter(|sha| !sha.is_empty());
            (path, sha.map(str::to_owned))
        }),
        match_dropped: shaped.match_dropped,
        scope_unmatched,
        merge_read,
        side_reads,
        clipped: shaped.clipped,
    }
}

/// Files read at the head per call to widen `matchString` context; the rest
/// keep their clip flag and `next.expandContext`.
const MAX_HEAD_SOURCES: usize = 10;

/// The head text of each in-scope file whose `matchString` hit runs need
/// more context than its hunks hold, read once at `headSha` (the history
/// read cache revalidates it). `None` when no file needs it.
async fn head_sources(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
    raw: &Value,
    loaded: &Loaded,
    plan: &PrPlan,
) -> Option<HeadSources> {
    let needle = needle(query)?;
    let sha = str_at(raw, "/head/sha").filter(|sha| !sha.is_empty())?;
    let lines = match_context(query);
    let filter = plan.file_filter();
    let paths: Vec<&str> = loaded
        .items
        .iter()
        .filter(|file| filter.matches(file) && str_at(file, "/status") != Some("removed"))
        .filter(|file| {
            str_at(file, "/patch").is_some_and(|patch| head_text_needed(patch, &needle, lines))
        })
        .filter_map(|file| str_at(file, "/filename"))
        .take(MAX_HEAD_SOURCES)
        .collect();
    if paths.is_empty() {
        return None;
    }
    let reads = paths.iter().map(|path| async move {
        let mut segments = vec!["repos", query.owner(), query.repo(), "contents"];
        segments.extend(path.split('/'));
        let text = fetch(transport, &segments, &[("ref", sha.to_owned())], context)
            .await
            .ok()
            .and_then(|(value, _)| decode_contents(&value));
        ((*path).to_owned(), text)
    });
    let mut sources = HeadSources::default();
    for (path, text) in futures_util::future::join_all(reads).await {
        sources.insert(
            path,
            text.map(|text| text.lines().map(str::to_owned).collect()),
        );
    }
    Some(sources)
}

/// A Contents API file body as text; `None` for a directory, a body GitHub
/// left out (over 1 MB), or bytes that are not UTF-8.
fn decode_contents(value: &Value) -> Option<String> {
    use base64::Engine as _;
    if str_at(value, "/encoding") != Some("base64") {
        return None;
    }
    let packed: String = str_at(value, "/content")?
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(packed)
        .ok()?;
    String::from_utf8(bytes).ok()
}

/// The read's own next steps. A summary offers the PR-read menu; an
/// unfiltered first inventory page offers its review pick (and every patch
/// on a small PR); a filtered inventory or a patch read is a targeted answer
/// and keeps only its continuations.
fn read_menu(
    query: &HistoryItemRequest,
    plan: &PrPlan,
    patch_mode: &str,
    review: &[String],
    raw: &Value,
    slim: bool,
    file_read: bool,
) -> Option<Value> {
    if !slim {
        return Some(pr_next_menu(query, plan.content(), patch_mode, review, raw));
    }
    let first_inventory =
        file_read && patch_mode == "none" && !query.later_page() && !query.has_file_filter();
    if !first_inventory {
        return None;
    }
    let all_patches = raw
        .get("changed_files")
        .and_then(Value::as_u64)
        .is_some_and(|files| files <= INVENTORY_ALL_PATCHES_FILES);
    let mut next = pr_next_menu(query, plan.content(), patch_mode, review, raw);
    if let Some(menu) = next.as_object_mut() {
        menu.retain(|name, _| {
            name == "readSelectedPatches" || (all_patches && name == "readPatches")
        });
    }
    Some(next).filter(|next| next.as_object().is_some_and(|next| !next.is_empty()))
}

/// A shaped pull-request row and what the response still needs from it.
pub(super) struct ShapedPr {
    pub(super) row: Value,
    pub(super) files: FileOutcome,
    /// Surfaces whose minified view dropped text (`next.readRawBody`).
    pub(super) minified: Vec<&'static str>,
    pub(super) menu: Option<Value>,
    /// The code the page's anchored review comments discuss, ten ranges a read.
    pub(super) comment_reads: Vec<Value>,
}

async fn shape_pr(
    transport: &GitHubTransport,
    query: &HistoryItemRequest,
    context: &RequestContext,
    wants: &ContentWants,
    plan: &PrPlan,
    loads: PrLoads,
) -> Result<ShapedPr, ProviderError> {
    let PrLoads {
        raw,
        files,
        discussion,
        inline,
        reviews,
        commits,
    } = loads;
    let patch_mode = wants.patch_mode.as_str();
    let (comments, comments_state) = merge_comments(inline, discussion);
    let slim = (query.later_page() || query.has_sections()) && !query.wants(ExtraKind::Details);
    let mut row = pr_metadata(&raw, query);
    if slim {
        slim_row(&mut row, query);
    }
    let mut pagination = Map::new();
    let mut minified = Vec::new();
    if wants.body {
        let raw_body = raw.get("body").and_then(Value::as_str).unwrap_or("");
        let body = history_body_view(raw_body, query);
        if view_dropped_text(raw_body, &body) {
            minified.push("body");
        }
        let (text, page) = paginate_text(&body, query.char_offset(), query.char_length());
        row["body"] = json!(text);
        pagination.insert("body".into(), page);
    }
    let widened;
    let query = match &files {
        Some(loaded) if patch_mode != "none" => {
            match head_sources(transport, query, context, &raw, loaded, plan).await {
                Some(sources) => {
                    widened = HistoryItemRequest {
                        head_sources: Some(std::sync::Arc::new(sources)),
                        ..query.clone()
                    };
                    &widened
                }
                None => query,
            }
        }
        _ => query,
    };
    let file_outcome = files.map_or_else(FileOutcome::default, |loaded| {
        shape_files_section(&mut row, &mut pagination, loaded, &raw, query, wants, plan)
    });
    let mut comment_reads = Vec::new();
    if let Some(state) = comments_state {
        let shape = shape_pr_comments(&mut row, &mut pagination, comments, state, query);
        if shape.dropped {
            minified.push("comments");
        }
        comment_reads = shape.code_reads;
    }
    if let Some(loaded) = reviews
        && shape_pr_reviews(&mut row, &mut pagination, loaded.items, loaded.state, query)
    {
        minified.push("reviews");
    }
    if !minified.is_empty() {
        row["bodyView"] = json!("minified");
    }
    if let Some(loaded) = commits {
        shape_pr_commits(
            transport,
            &mut row,
            &mut pagination,
            loaded.items,
            loaded.state,
            query,
            context,
        )
        .await?;
    }
    let menu = read_menu(
        query,
        plan,
        patch_mode,
        &file_outcome.review,
        &raw,
        slim,
        wants.files,
    );
    // Patch rows are the evidence of a patch read: it re-proves only number,
    // state, and the head it read. The metadata read names the PR (title,
    // author, createdAt); a read without patch rows keeps them.
    let patch_rows = row["files"]
        .as_array()
        .is_some_and(|files| !files.is_empty() && files.iter().all(Value::is_object));
    if slim
        && patch_mode != "none"
        && patch_rows
        && row.get("headSha").is_some()
        && let Some(fields) = row.as_object_mut()
    {
        for key in ["title", "author", "createdAt"] {
            fields.remove(key);
        }
    }
    if !pagination.is_empty() {
        row["contentPagination"] = Value::Object(pagination);
    }
    Ok(ShapedPr {
        row,
        files: file_outcome,
        minified,
        menu,
        comment_reads,
    })
}
