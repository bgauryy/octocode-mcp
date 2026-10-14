//! Fixtures shared by the engine's unit tests.
use std::path::PathBuf;

/// A fresh temporary directory, removed (with everything under it) on drop.
/// `.0` is its path.
pub(crate) struct TmpDir(
    pub PathBuf,
    #[expect(dead_code, reason = "held only to remove the directory on drop")] tempfile::TempDir,
);

impl TmpDir {
    pub(crate) fn new() -> Self {
        let dir = tempfile::Builder::new()
            .prefix("octocode-engine-test-")
            .tempdir()
            .expect("temp dir");
        Self(dir.path().to_path_buf(), dir)
    }

    /// Write `content` to `relative` under the root, creating its parents.
    pub(crate) fn write(&self, relative: &str, content: impl AsRef<[u8]>) -> PathBuf {
        let path = self.0.join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create parent");
        }
        std::fs::write(&path, content).expect("write file");
        path
    }

    /// The root as a string, as engine options take paths.
    pub(crate) fn path(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}
