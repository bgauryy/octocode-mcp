//! Structural rule plumbing shared by the AST tools: which grammars a scope
//! holds, the compile probe, grammar inference, one invalid-pattern error,
//! and the language globs a graph-facts scan takes.

use std::collections::{BTreeMap, BTreeSet};

/// `languageGlobs` (language → globs) as the engine scan's flat glob list.
pub(crate) fn language_globs(
    map: &BTreeMap<String, Vec<String>>,
) -> Vec<octocode_engine::types::GraphLanguageGlob> {
    map.iter()
        .flat_map(|(language, globs)| {
            globs
                .iter()
                .map(|glob| octocode_engine::types::GraphLanguageGlob {
                    language: language.clone(),
                    glob: glob.clone(),
                })
        })
        .collect()
}

/// Error code for a pattern or rule that compiles for no grammar.
pub(crate) const INVALID_PATTERN: &str = "invalidPattern";

/// Recovery for [`INVALID_PATTERN`], in both tools.
pub(crate) const INVALID_PATTERN_HINT: &str = "Make the pattern one complete, parseable node, or inspect its shape with astSearch operation:\"syntaxTree\".";

/// Why a pattern that parsed can still match nothing, in both tools.
pub(crate) const PATTERN_SHAPE_HINT: &str = "Patterns match whole nodes (modifiers, return types); astSearch operation:\"syntaxTree\" shows the shape, or use a rule.";
/// Where to look when a rule matches nothing, in both tools.
pub(crate) const RULE_SHAPE_HINT: &str = "A rule matches nodes by kind, pattern and relations; astSearch operation:\"syntaxTree\" shows the node kinds.";

/// What an empty structural answer covered (the files read, in which
/// grammar) and why a pattern or rule that compiled can still match nothing,
/// in both tools.
pub(crate) fn empty_match_hint(scanned: u32, language: Option<&str>, pattern: bool) -> String {
    let language = language.map_or_else(String::new, |language| format!("{language} "));
    let plural = if scanned == 1 { "" } else { "s" };
    let shape = if pattern {
        PATTERN_SHAPE_HINT
    } else {
        RULE_SHAPE_HINT
    };
    format!("0 matches in {scanned} {language}file{plural}. {shape}")
}

/// A rule that does not compile, as both tools report it.
#[derive(Debug)]
pub(crate) struct RuleError {
    pub code: &'static str,
    pub message: String,
}

/// Engine text without its leading `[code] ` tag.
pub(crate) fn untagged(message: &str) -> &str {
    message
        .strip_prefix('[')
        .and_then(|rest| rest.split_once("] "))
        .map_or(message, |(_, text)| text)
}

/// Compiles the pattern or YAML rule as a search for each extension of one
/// grammar; it passes when any of them parses it (`.tsx` accepts JSX that
/// `.ts` rejects).
pub(crate) fn compile_check(
    extensions: &BTreeSet<String>,
    pattern: Option<&str>,
    rule: Option<&str>,
) -> Result<(), RuleError> {
    let mut first_error = None;
    for extension in extensions {
        let result = octocode_engine::portable::structural_search_detailed(
            "",
            &format!("pattern.{extension}"),
            pattern,
            rule,
        )
        .map_err(|error| RuleError {
            code: INVALID_PATTERN,
            message: untagged(&error.to_string()).to_owned(),
        })?;
        match result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.code == "structural.query.compileFailed")
        {
            Some(diagnostic) => {
                first_error.get_or_insert_with(|| RuleError {
                    code: INVALID_PATTERN,
                    message: untagged(&diagnostic.message).to_owned(),
                });
            }
            None => return Ok(()),
        }
    }
    first_error.map_or(Ok(()), Err)
}

/// The grammar a query without `language` runs with.
pub(crate) enum GrammarChoice {
    /// Exactly one candidate compiles the rule.
    One(String),
    /// Candidates exist, and none compiles it: the first compile error.
    Invalid(RuleError),
    /// The scope holds no candidate grammar.
    Absent,
    /// Several candidates compile it.
    Several(Vec<String>),
}

/// Picks the one candidate grammar (`selector → extensions`) that compiles.
pub(crate) fn choose_grammar(
    candidates: impl Iterator<Item = (String, BTreeSet<String>)>,
    compiles: impl Fn(&str, &BTreeSet<String>) -> Result<(), RuleError>,
) -> GrammarChoice {
    let mut first_error = None;
    let mut compiled = Vec::new();
    for (language, extensions) in candidates {
        match compiles(&language, &extensions) {
            Ok(()) => compiled.push((language, extensions)),
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    // A grammar whose files another candidate's family already scans (each
    // file with its own parser: `typescript` covers `.tsx`) is no choice.
    let mut parsing: Vec<String> = compiled
        .iter()
        .enumerate()
        .filter(|(index, (_, extensions))| {
            !compiled.iter().enumerate().any(|(other, (_, family))| {
                other != *index
                    && extensions.is_subset(family)
                    && (extensions.len() < family.len() || other < *index)
            })
        })
        .map(|(_, (language, _))| language.clone())
        .collect();
    match (parsing.len(), first_error) {
        (1, _) => GrammarChoice::One(parsing.remove(0)),
        (0, Some(error)) => GrammarChoice::Invalid(error),
        (0, None) => GrammarChoice::Absent,
        _ => GrammarChoice::Several(parsing),
    }
}

/// The grammar and extensions a file's own extension selects.
pub(crate) fn file_grammar(path: &std::path::Path) -> Option<(String, BTreeSet<String>)> {
    let extension = octocode_engine::text::extension_of(&path.to_string_lossy(), true, "");
    octocode_engine::portable::grammar_capabilities()
        .into_iter()
        .filter(|capability| capability.structural_search)
        .find(|capability| capability.extensions.contains(&extension))
        .map(|capability| {
            let extensions = language_extensions(&capability.language)
                .unwrap_or_else(|| BTreeSet::from([extension]));
            (grammar_selector(&capability), extensions)
        })
}

/// Grammars whose extensions occur under `root`, from a bounded walk that
/// honors the same discovery policy, ignore files and excluded directories
/// as the match scan. Each maps to its full extension set, most files
/// first (ties by name), so a list of candidates leads with the grammar the
/// scope is mostly written in.
pub(crate) fn present_grammars(
    root: &std::path::Path,
    prune: &[String],
    hidden: bool,
    no_ignore: bool,
    max_files: usize,
    globs: crate::tools::empty_walk::Globs<'_>,
    permits: &dyn Fn(&std::path::Path) -> Result<bool, String>,
) -> Result<Vec<(String, BTreeSet<String>)>, String> {
    let capabilities = octocode_engine::portable::grammar_capabilities()
        .into_iter()
        .filter(|capability| capability.structural_search)
        .collect::<Vec<_>>();
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();
    let mut files = 0_usize;
    let walker = crate::tools::empty_walk::Walk {
        ignored: no_ignore,
        hidden,
        default_excludes: !prune.is_empty(),
    }
    .walker(root, prune, globs)?;
    for entry in walker {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        if !permits(entry.path())? {
            continue;
        }
        files += 1;
        if files > max_files {
            break;
        }
        let extension =
            octocode_engine::text::extension_of(&entry.path().to_string_lossy(), true, "");
        if !extension.is_empty() {
            *seen.entry(extension).or_default() += 1;
        }
    }
    let mut grammars: BTreeMap<String, (BTreeSet<String>, usize)> = BTreeMap::new();
    for (extension, count) in seen {
        if let Some(capability) = capabilities
            .iter()
            .find(|capability| capability.extensions.contains(&extension))
            && let Some(extensions) = language_extensions(&capability.language)
        {
            grammars
                .entry(grammar_selector(capability))
                .or_insert_with(|| (extensions, 0))
                .1 += count;
        }
    }
    let mut ranked = grammars.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|(a, (_, a_files)), (b, (_, b_files))| b_files.cmp(a_files).then(a.cmp(b)));
    Ok(ranked
        .into_iter()
        .map(|(language, (extensions, _))| (language, extensions))
        .collect())
}

/// The language a caller would write for a grammar: its language id
/// (`rust`, `typescript`), else its lowercased name.
pub(crate) fn grammar_selector(capability: &octocode_engine::types::GrammarCapability) -> String {
    capability
        .language_id
        .clone()
        .unwrap_or_else(|| capability.language.to_ascii_lowercase())
}

/// The one message for a `language` no structural grammar answers to
/// (astSearch and astRewrite, error code `languageUnsupported`).
pub(crate) fn unsupported_language_message(language: &str) -> String {
    format!(
        "language \"{language}\" is not a supported structural grammar. Use a language name, id, or extension such as \"typescript\", \"rust\", or \"py\"."
    )
}

pub(crate) fn language_extensions(language: &str) -> Option<BTreeSet<String>> {
    let selector = language.trim().to_ascii_lowercase();
    let capabilities = octocode_engine::portable::grammar_capabilities();
    if let Some(extension) = selector.strip_prefix('.') {
        return capabilities
            .iter()
            .any(|capability| capability.extensions.iter().any(|item| *item == extension))
            .then(|| BTreeSet::from([extension.to_owned()]));
    }
    let mut extensions: BTreeSet<String> = capabilities
        .into_iter()
        .filter(|capability| {
            capability.language.eq_ignore_ascii_case(&selector)
                || capability
                    .language_id
                    .as_deref()
                    .is_some_and(|id| id.eq_ignore_ascii_case(&selector))
                || capability
                    .selector_aliases
                    .iter()
                    .any(|alias| alias.eq_ignore_ascii_case(&selector))
                || capability
                    .extensions
                    .iter()
                    .any(|extension| extension.eq_ignore_ascii_case(&selector))
        })
        .flat_map(|capability| capability.extensions)
        .map(|extension| extension.to_ascii_lowercase())
        .collect();
    if !extensions.is_empty() && (selector == "cpp" || selector == "c++") {
        extensions.insert("h".to_owned());
    }
    (!extensions.is_empty()).then_some(extensions)
}

pub(crate) fn has_extension_in(path: &std::path::Path, extensions: &BTreeSet<String>) -> bool {
    extensions.contains(&octocode_engine::text::extension_of(
        &path.to_string_lossy(),
        true,
        "",
    ))
}
