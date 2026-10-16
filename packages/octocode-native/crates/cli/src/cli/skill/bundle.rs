use std::{
    collections::{BTreeMap, BTreeSet},
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub(super) struct EmbeddedFile {
    pub path: &'static str,
    pub bytes: &'static [u8],
    #[cfg_attr(
        not(unix),
        allow(dead_code, reason = "Only Unix applies executable permission bits")
    )]
    pub executable: bool,
}

#[derive(Debug)]
pub(super) struct EmbeddedSkill {
    pub name: &'static str,
    pub instructions: &'static str,
    pub files: &'static [EmbeddedFile],
}

include!(concat!(env!("OUT_DIR"), "/skills.rs"));

impl EmbeddedSkill {
    pub fn text(&self) -> &'static str {
        self.instructions
    }

    pub fn description(&self) -> Result<String, String> {
        metadata(self.text()).map(|(_, description)| description)
    }

    pub fn matches(&self, destination: &Path) -> bool {
        self.compare(destination, false).unwrap_or(false)
    }

    pub fn freshness(&self, destination: &Path) -> Option<&'static str> {
        self.compare(destination, true)
            .ok()
            .map(|equal| if equal { "fresh" } else { "stale" })
    }

    fn compare(&self, destination: &Path, freshness: bool) -> io::Result<bool> {
        fn entries(
            root: &Path,
            path: &Path,
            freshness: bool,
            found: &mut BTreeMap<String, u64>,
            ancestors: &mut BTreeSet<PathBuf>,
        ) -> io::Result<()> {
            let real = path.canonicalize()?;
            if !ancestors.insert(real.clone()) {
                return Err(io::Error::other("skill directory link cycle"));
            }
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                if freshness && entry.file_name() == ".DS_Store" {
                    continue;
                }
                let metadata = if freshness {
                    fs::metadata(entry.path())?
                } else {
                    fs::symlink_metadata(entry.path())?
                };
                let relative = entry
                    .path()
                    .strip_prefix(root)
                    .map_err(io::Error::other)?
                    .to_string_lossy()
                    .replace('\\', "/");
                if metadata.is_dir() {
                    if !freshness {
                        found.insert(format!("{relative}/"), 0);
                    }
                    entries(root, &entry.path(), freshness, found, ancestors)?;
                } else if metadata.is_file() {
                    found.insert(relative, metadata.len());
                } else {
                    return Err(io::Error::other("unexpected link or special file"));
                }
            }
            ancestors.remove(&real);
            Ok(())
        }
        if !freshness && !fs::symlink_metadata(destination)?.is_dir() {
            return Ok(false);
        }
        let mut found = BTreeMap::new();
        entries(
            destination,
            destination,
            freshness,
            &mut found,
            &mut BTreeSet::new(),
        )?;
        let mut expected = BTreeMap::new();
        for file in self.files {
            expected.insert(file.path.to_owned(), file.bytes.len() as u64);
            if !freshness {
                let mut parent = Path::new(file.path).parent();
                while let Some(path) = parent.filter(|path| !path.as_os_str().is_empty()) {
                    expected.insert(format!("{}/", path.to_string_lossy().replace('\\', "/")), 0);
                    parent = path.parent();
                }
            }
        }
        if found != expected {
            return Ok(false);
        }
        for file in self.files {
            if fs::read(destination.join(file.path))? != file.bytes {
                return Ok(false);
            }
        }
        Ok(true)
    }

    pub fn write(&self, destination: &Path) -> io::Result<()> {
        for file in self.files {
            let path = destination.join(file.path);
            fs::create_dir_all(
                path.parent()
                    .ok_or_else(|| io::Error::other("file has no parent"))?,
            )?;
            fs::write(&path, file.bytes)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(
                    path,
                    fs::Permissions::from_mode(if file.executable { 0o755 } else { 0o644 }),
                )?;
            }
        }
        Ok(())
    }
}

pub(super) fn valid_name(name: &str) -> bool {
    name.as_bytes()
        .first()
        .is_some_and(u8::is_ascii_alphanumeric)
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

pub(super) fn metadata(text: &str) -> Result<(String, String), String> {
    let mut lines = text.lines();
    if lines.next() != Some("---") {
        return Err("SKILL.md must begin with YAML frontmatter".into());
    }
    let mut header = Vec::new();
    let mut closed = false;
    for line in lines {
        if line == "---" {
            closed = true;
            break;
        }
        header.push(line);
    }
    if !closed {
        return Err("SKILL.md frontmatter is not closed".into());
    }
    let value: serde_yaml_ng::Value =
        serde_yaml_ng::from_str(&header.join("\n")).map_err(|error| error.to_string())?;
    let name = value["name"]
        .as_str()
        .filter(|name| valid_name(name))
        .ok_or("SKILL.md needs a valid name")?;
    let description = value["description"]
        .as_str()
        .filter(|text| !text.trim().is_empty())
        .ok_or("SKILL.md needs a description")?;
    Ok((name.into(), description.into()))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn every_embedded_skill_is_valid_and_round_trips() {
        assert!(!SKILLS.is_empty());
        for skill in SKILLS {
            let (name, _) = metadata(skill.text()).expect(skill.name);
            assert_eq!(name, skill.name);
            let directory = tempfile::tempdir().expect("tempdir");
            skill.write(directory.path()).expect("extract");
            assert!(skill.matches(directory.path()), "{}", skill.name);
            fs::write(directory.path().join("unexpected.txt"), "user file").expect("write");
            assert!(!skill.matches(directory.path()));
        }
    }

    #[test]
    fn freshness_detects_same_size_edits_and_ignores_finder_metadata() {
        let skill = &SKILLS[0];
        let directory = tempfile::tempdir().expect("tempdir");
        skill.write(directory.path()).expect("write");
        fs::write(directory.path().join(".DS_Store"), "finder").expect("metadata");
        assert_eq!(skill.freshness(directory.path()), Some("fresh"));
        assert!(
            !skill.matches(directory.path()),
            "installation equality protects extra files"
        );
        let path = directory.path().join("SKILL.md");
        let original = fs::read(&path).expect("read");
        let mut edited = original.clone();
        edited[0] ^= 1;
        fs::write(&path, edited).expect("edit");
        assert_eq!(skill.freshness(directory.path()), Some("stale"));
        fs::write(path, original).expect("restore");
        assert_eq!(skill.freshness(directory.path()), Some("fresh"));
        fs::remove_file(directory.path().join("SKILL.md")).expect("remove");
        assert_eq!(skill.freshness(directory.path()), Some("stale"));
    }

    #[cfg(unix)]
    #[test]
    fn cyclic_or_missing_trees_have_unknown_freshness() {
        let skill = &SKILLS[0];
        let directory = tempfile::tempdir().expect("tempdir");
        skill.write(directory.path()).expect("write");
        std::os::unix::fs::symlink(directory.path(), directory.path().join("cycle"))
            .expect("cycle");
        assert_eq!(skill.freshness(directory.path()), None);
        assert_eq!(skill.freshness(&directory.path().join("missing")), None);
    }
}
