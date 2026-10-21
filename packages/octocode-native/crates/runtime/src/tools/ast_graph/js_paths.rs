//! Build-output mapping and declaration suffixes shared by graph resolution and roots.
use super::graph::{join, join_within_root, normalize};
use std::collections::BTreeSet;

/// Package-relative build-output roots mapped back to sources.
pub(super) const BUILD_DIRS: &[&str] = &[
    "dist",
    "build",
    "out",
    "lib",
    "esm",
    "cjs",
    "es",
    "types",
    "declarations",
];

/// Output flavor directories nested under a build root (`dist/esm/…`).
const FLAVOR_DIRS: &[&str] = &[
    "esm",
    "cjs",
    "es",
    "mjs",
    "lib",
    "types",
    "prod",
    "dev",
    "production",
    "development",
    "node",
    "browser",
    "module",
    "commonjs",
    "src",
];

/// Source suffixes (leading dot) in the order TypeScript probes an
/// extensionless module path. Not the engine's `JS_EXTENSIONS`, which holds
/// the dotless JavaScript-only set.
const MODULE_SUFFIXES: &[&str] = &[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

pub(super) const DECLARATION_EXTENSIONS: &[&str] = &[".d.ts", ".d.mts", ".d.cts"];

pub(super) fn is_declaration(path: &str) -> bool {
    DECLARATION_EXTENSIONS.iter().any(|ext| path.ends_with(ext))
}

/// Strip a JavaScript/TypeScript or declaration extension.
fn strip_code_extension(path: &str) -> &str {
    DECLARATION_EXTENSIONS
        .iter()
        .chain(MODULE_SUFFIXES)
        .find_map(|ext| path.strip_suffix(ext))
        .unwrap_or(path)
}

/// Map a package-relative build-output target (`dist/esm/x.js`,
/// `lib/x.d.ts`) back to its source (`src/x.ts`, `x.ts`).
pub(super) fn source_equivalent(
    dir: &str,
    target: &str,
    known: &BTreeSet<String>,
) -> Option<String> {
    let target = normalize(target);
    let segments = target.split('/').collect::<Vec<_>>();
    if !segments
        .first()
        .is_some_and(|first| BUILD_DIRS.contains(first))
    {
        return None;
    }
    let mut rests = vec![segments[1..].join("/")];
    let mut index = 1;
    while index + 1 < segments.len() && FLAVOR_DIRS.contains(&segments[index]) {
        index += 1;
        rests.push(segments[index..].join("/"));
    }
    rests.iter().find_map(|rest| {
        let stem = strip_code_extension(rest);
        ["src", "."].iter().find_map(|base| {
            let candidate = join_within_root(&join(dir, base), stem)?;
            probe_js(&candidate, known)
        })
    })
}

/// Probe a module path the way relative imports are linked: exact file,
/// `.js`→`.ts` style swaps, extension probing, and `index` files.
pub(super) fn probe_js(stem: &str, known: &BTreeSet<String>) -> Option<String> {
    if stem.is_empty() || stem == "." {
        return MODULE_SUFFIXES
            .iter()
            .map(|ext| format!("index{ext}"))
            .find(|candidate| known.contains(candidate));
    }
    if MODULE_SUFFIXES.iter().any(|ext| stem.ends_with(ext)) {
        if known.contains(stem) {
            return Some(stem.to_owned());
        }
        // TypeScript resolves `./x.js` to the source or declaration that
        // `x.js` is built from, in this order.
        let (base, extension) = stem.rsplit_once('.')?;
        return octocode_engine::signatures::languages::js_source_swaps(extension)
            .iter()
            .map(|swap| format!("{base}.{swap}"))
            .find(|candidate| known.contains(candidate));
    }
    // `./x` is `x.ts` … or `x.d.ts`, then the directory's `index`.
    let probed = |name: String| {
        MODULE_SUFFIXES
            .iter()
            .chain(&DECLARATION_EXTENSIONS[..1])
            .map(|ext| format!("{name}{ext}"))
            .collect::<Vec<_>>()
    };
    std::iter::once(stem.to_owned())
        .chain(probed(stem.to_owned()))
        .chain(probed(join(stem, "index")))
        .find(|candidate| known.contains(candidate))
}

/// Type declarations from non-JavaScript languages.
pub(super) const TYPE_STUB_EXTENSIONS: &[&str] = &[".pyi"];
/// Bundle classification stays narrower than source mapping: `lib` and
/// `esm` can contain hand-authored JavaScript whose symbols must stay visible.
pub(super) const BUNDLED_OUTPUT_DIRS: &[&str] =
    &["dist", "build", "out", ".next", ".output", ".nuxt"];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn declaration_extensions_agree() {
        for extension in DECLARATION_EXTENSIONS {
            let path = format!("types/api{extension}");
            assert!(is_declaration(&path));
            assert!(super::super::store::classify::is_declaration(&path));
        }
        for extension in TYPE_STUB_EXTENSIONS {
            assert!(super::super::store::classify::is_declaration(&format!(
                "api{extension}"
            )));
        }
        assert!(!is_declaration("src/api.ts"));
    }
    #[test]
    fn build_roots_resolve_only_matching_scanned_sources() {
        let known = BTreeSet::from(["pkg/src/a.ts".to_owned(), "pkg/src/index.ts".to_owned()]);
        for dir in BUILD_DIRS {
            assert_eq!(
                source_equivalent("pkg", &format!("{dir}/a.js"), &known),
                Some("pkg/src/a.ts".to_owned())
            );
            assert_eq!(
                source_equivalent("pkg", &format!("{dir}/absent.js"), &known),
                None
            );
        }
        assert_eq!(
            source_equivalent("pkg", "dist/esm/a.d.ts", &known),
            Some("pkg/src/a.ts".to_owned())
        );
    }
}
