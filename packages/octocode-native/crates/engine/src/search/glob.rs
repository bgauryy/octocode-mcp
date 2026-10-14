//! The one glob dialect of every local walk: gitignore glob semantics, as the
//! `ignore` crate compiles them. `*` and `?` never cross `/`, `**` spans
//! directories, `{a,b}` alternates and `[...]` is a class. A glob without a
//! `/` matches an entry's name at any depth; one with a `/` matches its path
//! below the root, and a trailing `/` matches directories only. A glob that
//! does not compile is an [`ErrorKind::InvalidGlob`] error, never a pattern
//! silently dropped.

use std::path::Path;

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use ignore::overrides::{Override, OverrideBuilder};

use crate::error::{Error, ErrorKind};

/// A request's `include` and `exclude` globs, compiled once for a walk rooted
/// at `root`.
#[derive(Clone, Debug)]
pub struct Globs {
    include: Option<Gitignore>,
    exclude: Option<Gitignore>,
    overrides: Override,
}

/// Compile `include` + `exclude` against `root`. `!x` in `exclude` means the
/// same as `x`.
pub fn compile(root: &Path, include: &[String], exclude: &[String]) -> Result<Globs, Error> {
    let mut overrides = OverrideBuilder::new(root);
    for glob in include {
        overrides
            .add(glob)
            .map_err(|error| invalid("include", glob, &error))?;
    }
    let exclude: Vec<&str> = exclude
        .iter()
        .map(|glob| glob.strip_prefix('!').unwrap_or(glob))
        .collect();
    for glob in &exclude {
        overrides
            .add(&format!("!{glob}"))
            .map_err(|error| invalid("exclude", glob, &error))?;
    }
    Ok(Globs {
        include: set(root, include.iter().map(String::as_str), "include")?,
        exclude: set(root, exclude.into_iter(), "exclude")?,
        overrides: overrides
            .build()
            .map_err(|error| Error::with_kind(ErrorKind::InvalidGlob, error.to_string()))?,
    })
}

/// One set of globs (`names`, one `languageGlobs` grammar) against `root`;
/// `None` when `globs` is empty. `label` names the field in an error.
pub fn set<'a>(
    root: &Path,
    globs: impl Iterator<Item = &'a str>,
    label: &str,
) -> Result<Option<Gitignore>, Error> {
    let mut builder = GitignoreBuilder::new(root);
    builder.allow_unclosed_class(false);
    let mut any = false;
    for glob in globs {
        any = true;
        builder
            .add_line(None, glob)
            .map_err(|error| invalid(label, glob, &error))?;
    }
    if !any {
        return Ok(None);
    }
    builder
        .build()
        .map(Some)
        .map_err(|error| Error::with_kind(ErrorKind::InvalidGlob, error.to_string()))
}

/// Whether one compiled set matches `path` (under the set's root).
pub fn matches(set: &Gitignore, path: &Path, is_dir: bool) -> bool {
    set.matched(path, is_dir).is_ignore()
}

fn invalid(label: &str, glob: &str, error: &ignore::Error) -> Error {
    Error::with_kind(
        ErrorKind::InvalidGlob,
        format!("invalid {label} glob '{glob}': {error}"),
    )
}

impl Globs {
    /// The override set an `ignore` walk applies: a file must match an
    /// include glob when there are any, and no exclude glob.
    pub fn overrides(&self) -> Override {
        self.overrides.clone()
    }

    /// Whether `path` matches an include glob (true when there are none).
    pub fn includes(&self, path: &Path, is_dir: bool) -> bool {
        self.include
            .as_ref()
            .is_none_or(|include| matches(include, path, is_dir))
    }

    /// Whether `path` matches an exclude glob.
    pub fn excludes(&self, path: &Path, is_dir: bool) -> bool {
        self.exclude
            .as_ref()
            .is_some_and(|exclude| matches(exclude, path, is_dir))
    }

    /// Whether neither glob list was given.
    pub fn is_empty(&self) -> bool {
        self.include.is_none() && self.exclude.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn globs(include: &[&str], exclude: &[&str]) -> Result<Globs, Error> {
        let owned = |list: &[&str]| {
            list.iter()
                .map(|glob| (*glob).to_owned())
                .collect::<Vec<_>>()
        };
        compile(Path::new("/r"), &owned(include), &owned(exclude))
    }

    #[test]
    fn a_slash_free_glob_matches_a_name_at_any_depth_and_star_never_crosses_a_slash() {
        let set = globs(&["*.ts", "src/*.rs"], &[]).expect("compiles");
        assert!(set.includes(Path::new("/r/a/b/c.ts"), false));
        assert!(set.includes(Path::new("/r/src/lib.rs"), false));
        assert!(!set.includes(Path::new("/r/src/deep/lib.rs"), false));
        assert!(!set.includes(Path::new("/r/lib.rs"), false));
    }

    #[test]
    fn braces_classes_and_double_stars_follow_gitignore() {
        let set = globs(&["packages/{react,react-dom}/src/**", "*.[jt]s"], &[]).expect("compiles");
        assert!(set.includes(Path::new("/r/packages/react/src/a/b.js"), false));
        assert!(set.includes(Path::new("/r/packages/react-dom/src/x.js"), false));
        assert!(!set.includes(Path::new("/r/packages/scheduler/src/x.c"), false));
        assert!(set.includes(Path::new("/r/deep/a.ts"), false));
        assert!(!set.includes(Path::new("/r/deep/a.cs"), false));
    }

    #[test]
    fn excludes_skip_names_paths_and_directories() {
        let set = globs(&[], &["vendor", "!*.min.js", "src/gen/**"]).expect("compiles");
        assert!(set.excludes(Path::new("/r/a/vendor"), true));
        assert!(set.excludes(Path::new("/r/a/b.min.js"), false));
        assert!(set.excludes(Path::new("/r/src/gen/deep/b.ts"), false));
        assert!(!set.excludes(Path::new("/r/src/a.ts"), false));
        assert!(set.includes(Path::new("/r/src/a.ts"), false));
    }

    #[test]
    fn an_invalid_glob_is_an_invalid_glob_error() {
        for (include, exclude) in [
            (&["[.ts"][..], &[][..]),
            (&[], &["{a,b"]),
            (&["a/**/[z-a]"], &[]),
        ] {
            let error = globs(include, exclude).expect_err("invalid");
            assert_eq!(*error.kind(), ErrorKind::InvalidGlob, "{error}");
        }
        let error = set(Path::new("/r"), ["["].into_iter(), "names").expect_err("invalid");
        assert!(
            error.reason.starts_with("invalid names glob '['"),
            "{error}"
        );
    }
}
