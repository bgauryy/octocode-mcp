use crate::error::Result;
use crate::text::lexical as normalize_lexically;
use std::path::{Path, PathBuf};

mod cargo;
pub use cargo::{cargo_workspace_root, declares_cargo_workspace};

const MARKERS: [&str; 12] = [
    "package.json",
    "pnpm-workspace.yaml",
    "yarn.lock",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "tsconfig.json",
    ".git",
    "pom.xml",
    "build.gradle",
    "Makefile",
];

/// The language server root of `file_path`: for a Rust file, the root of
/// the Cargo workspace its package belongs to (one rust-analyzer analyzes
/// every member crate, so a member crate never roots a second one);
/// otherwise the nearest ancestor holding a project marker. With no marker
/// anywhere, the file's own directory. Never the process cwd: a server
/// rooted there would analyze an unrelated tree.
pub fn resolve_workspace_root_for_file(file_path: String) -> Result<String> {
    let directory = Path::new(&file_path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map_or_else(|| PathBuf::from(&file_path), Path::to_path_buf);
    let cargo_root = (Path::new(&file_path).extension() == Some("rs".as_ref()))
        .then(|| cargo_package_dir(&directory))
        .flatten()
        .map(|package| cargo_workspace_root(&package).unwrap_or(package));
    let root = cargo_root
        .or_else(|| project_root_of_dir(&directory))
        .unwrap_or(directory);
    Ok(root.to_string_lossy().into_owned())
}

/// The nearest ancestor of `directory` (itself included) holding a
/// `Cargo.toml`: the Cargo package (or virtual workspace) a Rust file
/// belongs to.
pub fn cargo_package_dir(directory: &Path) -> Option<PathBuf> {
    directory
        .ancestors()
        .find(|dir| dir.join(CARGO_MANIFEST).is_file())
        .map(Path::to_path_buf)
}

/// Whether `dir` is the root of a multi-package workspace in any ecosystem:
/// `pnpm-workspace.yaml`, `lerna.json`, `go.work`, a `package.json` with
/// `workspaces`, or a `Cargo.toml` declaring a workspace.
pub fn is_workspace_manifest_root(dir: &Path) -> bool {
    dir.join("pnpm-workspace.yaml").is_file()
        || dir.join("lerna.json").is_file()
        || dir.join("go.work").is_file()
        || std::fs::read_to_string(dir.join("package.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .is_some_and(|manifest| manifest.get("workspaces").is_some())
        || declares_cargo_workspace(dir)
}

/// Source a Cargo package `include!`s that rust-analyzer may not load.
/// rust-analyzer loads a package's own directory (and, once build scripts
/// ran, their `OUT_DIR`); an `include!` it cannot load leaves every item the
/// included file defines unknown, so uses that reach a symbol through those
/// types (a method called through `Deref` to one, a field of one) do not
/// resolve.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PackageIncludes {
    /// Package files that `include!` build-script output (`env!(…)`, such
    /// as `concat!(env!("OUT_DIR"), …)`): loaded only when the package has a
    /// build script and rust-analyzer runs it.
    pub generated: Vec<PathBuf>,
    /// Literal `include!` targets outside the package directory (lexically
    /// normalized): never loaded, whatever the build context.
    pub outside: Vec<PathBuf>,
    /// The scan stopped at its file bound: more includes may exist.
    pub has_more: bool,
}

/// [`PackageIncludes`] of the Cargo package `file` belongs to, scanning at
/// most `limit` of its `.rs` files (nested packages and ignored files are
/// not its sources). `generated` is empty when the package has no build
/// script: without one no build-script output exists to load.
pub fn cargo_package_includes(file: &Path, limit: usize) -> Option<PackageIncludes> {
    let package = cargo_package_dir(file.parent()?)?;
    let has_build_script = cargo_package_build_script(&package).is_some();
    let root = package.clone();
    let walker = ignore::WalkBuilder::new(&package)
        .filter_entry(move |entry| {
            entry.path() == root
                || !entry.file_type().is_some_and(|kind| kind.is_dir())
                || !entry.path().join(CARGO_MANIFEST).is_file()
        })
        .build();
    let mut includes = PackageIncludes::default();
    let mut visited = 0;
    for entry in walker.flatten() {
        let path = entry.path();
        if !entry.file_type().is_some_and(|kind| kind.is_file())
            || path.extension().is_none_or(|ext| ext != "rs")
        {
            continue;
        }
        if visited >= limit {
            includes.has_more = true;
            break;
        }
        visited += 1;
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        for argument in include_arguments(&text) {
            match argument {
                IncludeArgument::Generated => {
                    if has_build_script && !includes.generated.iter().any(|seen| seen == path) {
                        includes.generated.push(path.to_path_buf());
                    }
                }
                IncludeArgument::Literal(target) => {
                    let target = crate::text::lexical(&path.parent().unwrap_or(path).join(target));
                    if !target.starts_with(&package) && !includes.outside.contains(&target) {
                        includes.outside.push(target);
                    }
                }
            }
        }
    }
    Some(includes)
}

/// What an `include!` reads: a build-script value (`env!`, possibly in a
/// `concat!`) or a literal path relative to the including file.
#[derive(Debug, PartialEq, Eq)]
enum IncludeArgument {
    Generated,
    Literal(String),
}

/// The arguments of the `include!` invocations in `text`, outside line
/// comments. `include_str!`/`include_bytes!` read data, not source.
fn include_arguments(text: &str) -> Vec<IncludeArgument> {
    let mut found = Vec::new();
    for line in text.lines() {
        let code = line.split("//").next().unwrap_or(line);
        for (at, _) in code.match_indices("include!") {
            if code[..at]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_alphanumeric() || c == '_')
            {
                continue;
            }
            let rest = code[at + "include!".len()..].trim_start();
            let Some(argument) = rest
                .strip_prefix('(')
                .or_else(|| rest.strip_prefix('{'))
                .or_else(|| rest.strip_prefix('['))
                .map(str::trim_start)
            else {
                continue;
            };
            if let Some(literal) = argument.strip_prefix('"') {
                if let Some(end) = literal.find('"') {
                    found.push(IncludeArgument::Literal(literal[..end].to_owned()));
                }
            } else if argument.starts_with("env!") || argument.starts_with("concat!") {
                found.push(IncludeArgument::Generated);
            }
        }
    }
    found
}

/// The build script of the Cargo package at `package` (its manifest
/// directory), when it has one: `[package] build = "path"`, else `build.rs`
/// beside the manifest (Cargo's default), unless `build = false`.
fn cargo_package_build_script(package: &Path) -> Option<PathBuf> {
    let manifest = std::fs::read_to_string(package.join(CARGO_MANIFEST)).ok()?;
    let mut table = "";
    let mut is_package = false;
    let mut declared = None;
    for line in manifest.lines().map(str::trim) {
        if let Some(header) = table_header(line) {
            table = header;
            is_package |= table == "package";
            continue;
        }
        if table == "package"
            && let Some(value) = line
                .strip_prefix("build")
                .map(str::trim_start)
                .and_then(|rest| rest.strip_prefix('='))
        {
            declared = Some(value.trim());
        }
    }
    // A virtual manifest (no `[package]`) builds nothing.
    if !is_package {
        return None;
    }
    let script = match declared {
        Some("false") => return None,
        Some(value) if value.starts_with('"') => package.join(value.trim_matches('"')),
        _ => package.join("build.rs"),
    };
    script.is_file().then_some(script)
}

const CARGO_MANIFEST: &str = "Cargo.toml";

fn table_header(line: &str) -> Option<&str> {
    let inner = line.strip_prefix('[')?;
    let inner = inner.strip_prefix('[').unwrap_or(inner);
    let end = inner.find(']')?;
    Some(inner[..end].trim())
}

/// The nearest ancestor of `directory` (itself included) holding a project
/// marker, or `None` when no ancestor has one.
pub fn project_root_of_dir(directory: &Path) -> Option<PathBuf> {
    directory
        .ancestors()
        .find(|dir| MARKERS.iter().any(|marker| dir.join(marker).exists()))
        .map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("octocode_ws_{name}_{nanos}"));
        fs::create_dir_all(&root).expect("create temp dir");
        root
    }

    /// A source directory resolves to the project above it; a tree with no
    /// marker has no project root.
    #[test]
    fn project_root_of_dir_walks_up_to_the_marker() {
        let root = temp_dir("dir_marker");
        fs::write(root.join("tsconfig.json"), b"{}").expect("write marker");
        let src = root.join("src").join("cli");
        fs::create_dir_all(&src).expect("create src");
        let bare = temp_dir("dir_bare");
        let found = project_root_of_dir(&src);
        let none = project_root_of_dir(&bare);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&bare);
        assert_eq!(found, Some(root));
        // The temp dir's ancestors may hold a marker on some hosts; only a
        // found root must be an ancestor.
        assert!(none.is_none_or(|dir| bare.starts_with(dir)));
    }

    #[test]
    fn resolves_root_from_nearest_marker() {
        // Layout: root/package.json  root/src/index.ts
        let root = temp_dir("marker");
        fs::write(root.join("package.json"), b"{}").expect("write marker");
        let src = root.join("src");
        fs::create_dir_all(&src).expect("create src");
        let file = src.join("index.ts");
        fs::write(&file, b"export {}").expect("write file");

        let result =
            resolve_workspace_root_for_file(file.to_string_lossy().into_owned()).expect("resolve");

        let _ = fs::remove_dir_all(&root);
        // Normalize both sides in case of symlink-resolved paths (macOS /var → /private/var).
        let resolved = PathBuf::from(&result)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&result));
        let expected = root.canonicalize().unwrap_or(root);
        assert_eq!(resolved, expected);
    }

    #[test]
    fn resolves_root_skips_deep_nested_marker_in_favour_of_parent() {
        // Layout: root/Cargo.toml  root/a/b/file.rs
        // Nearest marker walking upward from file.rs is root/ (a/ and a/b/ have none).
        let root = temp_dir("nested");
        fs::write(root.join("Cargo.toml"), b"[package]").expect("write marker");
        let deep = root.join("a").join("b");
        fs::create_dir_all(&deep).expect("create deep");
        let file = deep.join("file.rs");
        fs::write(&file, b"fn main() {}").expect("write file");

        let result =
            resolve_workspace_root_for_file(file.to_string_lossy().into_owned()).expect("resolve");

        let _ = fs::remove_dir_all(&root);
        let resolved = PathBuf::from(&result)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&result));
        let expected = root.canonicalize().unwrap_or(root);
        assert_eq!(resolved, expected);
    }

    /// A member crate's file roots the server at its Cargo workspace, so
    /// every member shares one rust-analyzer; a standalone package roots
    /// at itself, and a non-Rust file keeps the nearest marker.
    #[test]
    fn rust_files_root_at_their_cargo_workspace() {
        let root = temp_dir("cargo_ws");
        fs::write(
            root.join("Cargo.toml"),
            b"[workspace]\nmembers = [\"crates/*\"]\n",
        )
        .expect("workspace manifest");
        let member = root.join("crates").join("engine");
        fs::create_dir_all(member.join("src")).expect("member src");
        fs::write(member.join("Cargo.toml"), b"[package]\nname = \"engine\"\n").expect("member");
        fs::write(member.join("package.json"), b"{}").expect("npm wrapper");
        let rust = member.join("src").join("lib.rs");
        let script = member.join("src").join("gen.js");
        let standalone = temp_dir("cargo_alone");
        fs::write(standalone.join("Cargo.toml"), b"[package]\nname = \"x\"\n").expect("alone");
        let resolve = |file: &Path| {
            PathBuf::from(
                resolve_workspace_root_for_file(file.to_string_lossy().into_owned()).expect("root"),
            )
        };
        let (member_root, script_root, alone_root) = (
            resolve(&rust),
            resolve(&script),
            resolve(&standalone.join("main.rs")),
        );
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&standalone);
        assert_eq!(member_root, root);
        assert_eq!(script_root, member);
        assert_eq!(alone_root, standalone);
    }

    #[test]
    fn build_script_follows_cargo_defaults() {
        let package = temp_dir("build_script");
        fs::create_dir_all(package.join("src")).expect("src");
        let manifest = package.join("Cargo.toml");
        fs::write(&manifest, b"[package]\nname = \"p\"\n").expect("manifest");
        let none = cargo_package_build_script(&package);
        fs::write(package.join("build.rs"), b"fn main() {}").expect("build.rs");
        let default = cargo_package_build_script(&package);
        fs::write(&manifest, b"[package]\nname = \"p\"\nbuild = false\n").expect("off");
        let off = cargo_package_build_script(&package);
        fs::write(package.join("gen.rs"), b"fn main() {}").expect("gen.rs");
        fs::write(&manifest, b"[package]\nname = \"p\"\nbuild = \"gen.rs\"\n").expect("named");
        let named = cargo_package_build_script(&package);
        fs::write(&manifest, b"[workspace]\nmembers = []\n").expect("virtual");
        let virtual_manifest = cargo_package_build_script(&package);
        let _ = fs::remove_dir_all(&package);
        assert_eq!(none, None);
        assert_eq!(default, Some(package.join("build.rs")));
        assert_eq!(off, None);
        assert_eq!(named, Some(package.join("gen.rs")));
        assert_eq!(virtual_manifest, None);
    }

    /// Build-script includes count only in a package with a build script;
    /// a literal include outside the package is never loadable; nested
    /// packages, comments and `include_str!` are not includes.
    #[test]
    fn package_includes_name_what_rust_analyzer_cannot_load() {
        let outer = temp_dir("includes");
        let package = outer.join("pkg");
        fs::create_dir_all(package.join("src/inner")).expect("src");
        fs::create_dir_all(package.join("nested/src")).expect("nested");
        fs::create_dir_all(outer.join("contract")).expect("contract");
        fs::write(package.join("Cargo.toml"), b"[package]\nname = \"p\"\n").expect("manifest");
        let lib = package.join("src/lib.rs");
        fs::write(
            &lib,
            concat!(
                "include!(concat!(env!(\"OUT_DIR\"), \"/ids.rs\"));\n",
                "include!(\"inner/local.rs\");\n",
                "// include!(\"../../contract/commented.rs\");\n",
                "const DATA: &str = include_str!(\"../../contract/data.txt\");\n",
            ),
        )
        .expect("lib");
        fs::write(
            package.join("src/inner/types.rs"),
            b"include!(\"../../../contract/types.rs\");\n",
        )
        .expect("types");
        fs::write(
            package.join("nested/Cargo.toml"),
            b"[package]\nname = \"n\"\n",
        )
        .expect("nested manifest");
        fs::write(
            package.join("nested/src/lib.rs"),
            b"include!(\"../../../contract/nested.rs\");\n",
        )
        .expect("nested lib");
        let no_script = cargo_package_includes(&lib, 100).expect("package");
        fs::write(package.join("build.rs"), b"fn main() {}").expect("build.rs");
        let with_script = cargo_package_includes(&lib, 100).expect("package");
        let capped = cargo_package_includes(&lib, 1).expect("package");
        let _ = fs::remove_dir_all(&outer);
        let outside = vec![outer.join("contract/types.rs")];
        assert_eq!(no_script.generated, Vec::<PathBuf>::new());
        assert_eq!(no_script.outside, outside);
        assert!(!no_script.has_more);
        assert_eq!(with_script.generated, vec![lib.clone()]);
        assert_eq!(with_script.outside, outside);
        assert!(capped.has_more);
    }

    #[test]
    fn falls_back_to_file_dir_not_cwd() {
        // A temp directory with no marker anywhere above it resolves to the
        // file's own directory, never the process cwd.
        let root = temp_dir("no_marker");
        let file = root.join("orphan.ts");
        fs::write(&file, b"// nothing").expect("write file");
        let has_marker_above = root
            .ancestors()
            .any(|dir| MARKERS.iter().any(|marker| dir.join(marker).exists()));

        let result = resolve_workspace_root_for_file(file.to_string_lossy().into_owned())
            .expect("resolve must not error");
        let _ = fs::remove_dir_all(&root);
        let cwd = std::env::current_dir().expect("cwd");
        assert_ne!(PathBuf::from(&result), cwd);
        if !has_marker_above {
            assert_eq!(PathBuf::from(&result), root);
        }
    }
}
