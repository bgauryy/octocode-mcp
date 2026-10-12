//! Where octocode's own code was loaded from.
//!
//! The CLI is a native executable, so `current_exe` is octocode's install
//! tree. Under the MCP server the engine is a Node addon: `current_exe` is
//! the `node` binary, and only the addon's own file leads to octocode's
//! `node_modules` (the bundled `typescript-language-server`).

use std::path::PathBuf;

/// The absolute path of the executable or shared library holding this code,
/// symlinks resolved; `None` when the loader cannot say.
pub(crate) fn module_path() -> Option<PathBuf> {
    module_path_containing(module_path as *const ())
}

/// The absolute path of the loaded module that contains `address`.
fn module_path_containing(address: *const ()) -> Option<PathBuf> {
    let path = PathBuf::from(loaded_module_file(address)?);
    // A relative name (an executable started through a relative path) cannot
    // be trusted once the working directory changes.
    if !path.is_absolute() {
        return None;
    }
    Some(std::fs::canonicalize(&path).unwrap_or(path))
}

#[cfg(unix)]
fn loaded_module_file(address: *const ()) -> Option<std::ffi::OsString> {
    use std::os::unix::ffi::OsStringExt;
    // SAFETY: `Dl_info` is plain data that `dladdr` fills in; `dli_fname`
    // points at a NUL-terminated name owned by the loader, which outlives the
    // copy taken here.
    unsafe {
        let mut info: libc::Dl_info = std::mem::zeroed();
        if libc::dladdr(address.cast(), &raw mut info) == 0 || info.dli_fname.is_null() {
            return None;
        }
        let name = std::ffi::CStr::from_ptr(info.dli_fname);
        Some(std::ffi::OsString::from_vec(name.to_bytes().to_vec()))
    }
}

#[cfg(windows)]
fn loaded_module_file(address: *const ()) -> Option<std::ffi::OsString> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::LibraryLoader::{
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        GetModuleFileNameW, GetModuleHandleExW,
    };
    let mut module = std::ptr::null_mut();
    // SAFETY: with FROM_ADDRESS the argument is an address, not a string;
    // UNCHANGED_REFCOUNT leaves nothing to release.
    let found = unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            address.cast(),
            &raw mut module,
        )
    };
    if found == 0 {
        return None;
    }
    let mut buffer = vec![0u16; 32_768];
    // SAFETY: `buffer` is writable for the length passed.
    let length = unsafe { GetModuleFileNameW(module, buffer.as_mut_ptr(), buffer.len() as u32) };
    let length = usize::try_from(length).ok().filter(|length| *length > 0)?;
    buffer.truncate(length);
    Some(std::ffi::OsString::from_wide(&buffer))
}

/// Where octocode's install tree starts: the file this code was loaded from
/// (the addon under MCP, the executable for the CLI), else `current_exe`.
pub(crate) fn install_anchor() -> Option<PathBuf> {
    module_path()
        .or_else(|| std::env::current_exe().ok())
        .map(|path| std::fs::canonicalize(&path).unwrap_or(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::path::Path;

    #[test]
    fn an_executable_reports_its_own_file() {
        let exe = std::fs::canonicalize(std::env::current_exe().expect("exe")).expect("canonical");
        assert_eq!(module_path(), Some(exe.clone()));
        assert_eq!(install_anchor(), Some(exe));
    }

    /// Code in a shared library (the Node addon) is located by the library's
    /// file, not by the process executable that loaded it.
    #[cfg(unix)]
    #[test]
    fn an_address_in_a_shared_library_reports_that_library() {
        let exe = std::fs::canonicalize(std::env::current_exe().expect("exe")).expect("canonical");
        let library = module_path_containing(libc::getpid as *const ()).expect("libc module");
        assert!(library.is_absolute(), "{}", library.display());
        assert_ne!(library, exe);
        assert!(Path::new(&library).exists(), "{}", library.display());
    }

    /// The Windows branch is Win32 FFI (`GetModuleHandleExW` +
    /// `GetModuleFileNameW`) with no pure part to split out, so its test runs
    /// only on Windows CI: an address inside a system DLL reports that DLL,
    /// not the executable.
    #[cfg(windows)]
    #[test]
    fn an_address_in_a_system_dll_reports_that_dll() {
        use windows_sys::Win32::System::LibraryLoader::GetModuleFileNameW;
        let exe = std::fs::canonicalize(std::env::current_exe().expect("exe")).expect("canonical");
        let library =
            module_path_containing(GetModuleFileNameW as *const ()).expect("system module");
        assert!(library.is_absolute(), "{}", library.display());
        assert_ne!(library, exe);
        let name = library.file_name().and_then(|name| name.to_str());
        assert!(
            name.is_some_and(|name| name.to_ascii_lowercase().ends_with(".dll")),
            "{}",
            library.display()
        );
    }
}
