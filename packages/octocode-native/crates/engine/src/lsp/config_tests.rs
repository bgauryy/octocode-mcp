use super::{
    LspDiscoveryOptions, default_server_for_file, default_server_for_workspace_root,
    detect_language_id, invocation::is_node_executable, invocation::resolve_known_server_command,
    is_rust_analyzer_command, workspace_root_representative_source,
};
#[cfg(unix)]
use super::{
    command_resolves_to_executable, current_node_command, invocation::resolve_server_invocation,
    invocation::resolve_server_invocation_with_environment, is_command_available,
    serves_requests_concurrently,
};
use crate::lsp::types::{LspLanguageServerConfig, ServerSource};
use crate::test_support::TmpDir;
use serde_json::json;
use std::collections::BTreeMap;
use std::path::PathBuf;

#[test]
fn server_languages_keep_catalog_order_and_drop_unresolved_servers() {
    use super::{LspLanguageServerConfig, catalog::server_languages_with};
    let config = |command: &str| LspLanguageServerConfig {
        command: command.to_owned(),
        args: Some(Vec::new()),
        workspace_root: "/w".to_owned(),
        language_id: None,
        initialization_options: None,
        env: None,
        max_memory_mb: None,
        source: Default::default(),
    };
    let languages = server_languages_with(
        |extension| match extension {
            ".java" => Some(config("jdtls")),
            ".rs" => Some(config("rust-analyzer")),
            ".ts" => Some(config("node")),
            ".go" => Some(config("gopls")),
            _ => None,
        },
        |config| config.command != "gopls",
    );
    assert_eq!(languages, vec!["ts/js", "rust", "java"]);
}

#[cfg(unix)]
#[test]
fn rustup_proxy_counts_only_when_a_toolchain_ships_the_component() {
    use super::probe::rustup_proxy_component_installed;
    use std::os::unix::fs::PermissionsExt;
    let base = TmpDir::new();
    let bin = base.join("cargo/bin");
    let home = base.join("rustup");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::create_dir_all(home.join("toolchains/stable/bin")).unwrap();
    let executable = |path: &std::path::Path| {
        std::fs::write(path, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    };
    executable(&bin.join("rustup"));
    let proxy = bin.join("rust-analyzer");
    std::os::unix::fs::symlink("rustup", &proxy).unwrap();
    assert!(!rustup_proxy_component_installed(&proxy, Some(&home)));
    assert!(!rustup_proxy_component_installed(&proxy, None));
    executable(&home.join("toolchains/stable/bin/rust-analyzer"));
    assert!(rustup_proxy_component_installed(&proxy, Some(&home)));
    // A real (non-proxy) binary is the server itself.
    let real = base.join("real-rust-analyzer");
    executable(&real);
    assert!(rustup_proxy_component_installed(&real, None));
}

#[test]
fn available_server_languages_use_known_labels() {
    let first = super::available_server_languages(".", &LspDiscoveryOptions::default());
    for label in &first {
        assert!(
            ["ts/js", "py", "rust", "c/c++", "go", "c#", "java"].contains(label),
            "{label}"
        );
    }
}

#[test]
fn node_launcher_never_treats_the_native_octocode_binary_as_node() {
    assert!(is_node_executable(std::path::Path::new(
        "/usr/local/bin/node"
    )));
    assert!(is_node_executable(std::path::Path::new("C:/node.exe")));
    assert!(!is_node_executable(std::path::Path::new(
        "/usr/local/bin/octocode"
    )));
}

#[test]
fn routes_scala_to_metals_without_spurious_stdio_arguments() {
    for extension in [".scala", ".sc", ".sbt"] {
        let spec = super::catalog::spec_for_extension(extension).expect("Scala provider");
        assert_eq!(spec.language_id, "scala");
        assert_eq!(spec.command, "metals");
        assert!(spec.args.is_empty());
    }
}

#[test]
fn detects_protocol_language_ids_with_grammar_fallback() {
    let cases = [
        ("demo.ts", "typescript"),
        ("demo.tsx", "typescriptreact"),
        ("demo.js", "javascript"),
        ("demo.jsx", "javascriptreact"),
        ("demo.JSX", "javascriptreact"),
        ("demo.py", "python"),
        ("demo.go", "go"),
        ("demo.rs", "rust"),
        ("demo.java", "java"),
        ("demo.c", "c"),
        ("demo.cpp", "cpp"),
        ("demo.cu", "cuda"),
        ("demo.cuh", "cuda"),
        ("demo.asm", "asm"),
        ("demo.assembly", "asm"),
        ("demo.S", "asm"),
        ("demo.cs", "csharp"),
        ("demo.scala", "scala"),
        ("demo.sbt", "scala"),
    ];

    for (file_name, expected) in cases {
        assert_eq!(
            detect_language_id(file_name).as_deref(),
            Some(expected),
            "{file_name}"
        );
    }
}

#[test]
fn builtin_routes_intersect_enabled_grammars_exactly() {
    // Every enabled grammar routes to a built-in server except assembly,
    // which claims none.
    let mut expected: Vec<_> = crate::signatures::languages::supported_extensions()
        .into_iter()
        .filter(|extension| {
            crate::signatures::languages::find_entry(extension)
                .is_some_and(|entry| entry.language_id != Some("asm"))
        })
        .collect();
    expected.sort_unstable();
    let mut actual: Vec<_> = crate::signatures::languages::supported_extensions()
        .into_iter()
        .filter(|extension| super::catalog::spec_for_extension(&format!(".{extension}")).is_some())
        .collect();
    actual.sort_unstable();
    assert_eq!(actual, expected, "built-in LSP route inventory drift");
}

#[test]
fn only_rust_and_go_servers_take_options_as_a_configuration_section() {
    assert_eq!(
        super::configuration_section(Some("rust")),
        Some("rust-analyzer")
    );
    assert_eq!(super::configuration_section(Some("go")), Some("gopls"));
    for language_id in ["typescript", "python", "java", "cpp", "unknown"] {
        assert_eq!(
            super::configuration_section(Some(language_id)),
            None,
            "{language_id}"
        );
    }
    assert_eq!(super::configuration_section(None), None);
}

#[test]
fn all_cpp_extensions_resolve_to_clangd() {
    for extension in ["cpp", "cc", "cxx", "hpp", "hh", "hxx"] {
        let config = default_server_for_file(
            &format!("fixture.{extension}"),
            "/workspace",
            &LspDiscoveryOptions::default(),
        )
        .expect(extension);
        assert_eq!(config.command, "clangd");
        assert_eq!(config.language_id.as_deref(), Some("cpp"));
    }
}

#[test]
fn workspace_root_infers_its_server_from_project_markers() {
    let base = std::env::temp_dir().join(format!(
        "octocode-lsp-root-markers-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0)
    ));
    let cargo_workspace = ("Cargo.toml", "[workspace]\nmembers = []\n");
    let cases = [
        ("rust", &[("Cargo.toml", "")][..], "rust"),
        ("ts", &[("tsconfig.json", "")][..], "typescript"),
        ("node", &[("package.json", "")][..], "typescript"),
        // A tsconfig is the strongest TypeScript signal; Cargo beats a bare
        // package.json (npm wrappers around Rust crates).
        (
            "mixed",
            &[("package.json", ""), ("Cargo.toml", "")][..],
            "rust",
        ),
        (
            "ts-over-crate",
            &[("tsconfig.json", ""), ("Cargo.toml", "")][..],
            "typescript",
        ),
        // A Cargo workspace root is Rust's project; its tsconfig serves
        // JS bindings.
        (
            "cargo-workspace",
            &[("tsconfig.json", ""), cargo_workspace][..],
            "rust",
        ),
        // Both declare a workspace: marker order decides.
        (
            "both-workspaces",
            &[
                ("tsconfig.json", ""),
                ("package.json", "{\"workspaces\": []}"),
                cargo_workspace,
            ][..],
            "typescript",
        ),
    ];
    let options = LspDiscoveryOptions::default();
    for (name, markers, expected) in cases {
        let root = base.join(name);
        std::fs::create_dir_all(&root).expect("root");
        for (marker, content) in markers {
            std::fs::write(root.join(marker), content).expect("marker");
        }
        let root = root.to_string_lossy().into_owned();
        let config = default_server_for_workspace_root(&root, &options)
            .unwrap_or_else(|| panic!("{name}: no server inferred"));
        assert_eq!(config.language_id.as_deref(), Some(expected), "{name}");
        assert_eq!(config.workspace_root, root, "{name}");
    }
    let empty = base.join("empty");
    std::fs::create_dir_all(&empty).expect("empty root");
    assert!(default_server_for_workspace_root(&empty.to_string_lossy(), &options).is_none());
}

#[test]
fn workspace_root_representative_source_skips_vendored_dirs() {
    let root = std::env::temp_dir().join(format!(
        "octocode-lsp-root-representative-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(root.join("node_modules/dep")).expect("node_modules");
    std::fs::create_dir_all(root.join("src/nested")).expect("src");
    std::fs::write(root.join("tsconfig.json"), "{}").expect("tsconfig");
    std::fs::write(root.join("node_modules/dep/index.ts"), "").expect("vendored");
    std::fs::write(root.join("README.md"), "").expect("readme");
    std::fs::write(root.join("src/nested/app.ts"), "").expect("source");
    let found = workspace_root_representative_source(&root.to_string_lossy())
        .expect("a representative TypeScript source");
    assert!(found.ends_with("app.ts"), "{found}");

    let empty = root.join("src/nested");
    std::fs::remove_file(empty.join("app.ts")).expect("remove");
    assert!(workspace_root_representative_source(&root.to_string_lossy()).is_none());
}

#[test]
fn workspace_root_representative_source_prefers_project_include_roots() {
    let root = std::env::temp_dir().join(format!(
        "octocode-lsp-root-include-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(root.join("lib/core")).expect("lib");
    std::fs::create_dir_all(root.join("src")).expect("src");
    // A root-level build script sorts first but is outside the project.
    std::fs::write(root.join("build.mjs"), "").expect("build script");
    std::fs::write(root.join("lib/core/index.ts"), "").expect("included source");
    std::fs::write(root.join("src/other.ts"), "").expect("src source");
    std::fs::write(
        root.join("tsconfig.json"),
        r#"{"include": ["lib/**/*.ts"]}"#,
    )
    .expect("tsconfig");
    let found = workspace_root_representative_source(&root.to_string_lossy())
        .expect("an included TypeScript source");
    assert!(found.ends_with("lib/core/index.ts"), "{found}");

    // Without a parseable include list, `src/` still beats root scripts.
    std::fs::write(root.join("tsconfig.json"), "{ // jsonc\n}").expect("jsonc");
    let found = workspace_root_representative_source(&root.to_string_lossy())
        .expect("a src TypeScript source");
    assert!(found.ends_with("src/other.ts"), "{found}");
}

#[test]
fn all_cuda_extensions_resolve_to_clangd() {
    for extension in ["cu", "cuh"] {
        let config = default_server_for_file(
            &format!("fixture.{extension}"),
            "/workspace",
            &LspDiscoveryOptions::default(),
        )
        .expect(extension);
        assert_eq!(config.command, "clangd");
        assert_eq!(config.language_id.as_deref(), Some("cuda"));
    }
}

/// A `.cuh` with no compile command is a CUDA *header* to clang's
/// fallback command, which plans no job for it (`invalid AST`); CUDA
/// files get the language and a host-only target as fallback flags, and
/// the other C-family files are served as before.
#[test]
fn cuda_files_get_clangd_fallback_flags_and_other_c_family_files_do_not() {
    let options = LspDiscoveryOptions::default();
    for extension in ["cu", "cuh"] {
        let config =
            default_server_for_file(&format!("fixture.{extension}"), "/workspace", &options)
                .expect(extension);
        assert_eq!(
            config.initialization_options,
            Some(json!({ "fallbackFlags": ["-xcuda", "--cuda-host-only"] })),
            "{extension}"
        );
    }
    for extension in ["c", "h", "cpp", "hpp"] {
        let config =
            default_server_for_file(&format!("fixture.{extension}"), "/workspace", &options)
                .expect(extension);
        assert_eq!(config.initialization_options, None, "{extension}");
    }
}

#[test]
fn a_users_clangd_fallback_flags_replace_the_cuda_default() {
    let mut config = LspLanguageServerConfig {
        command: "/usr/bin/clangd-18".to_owned(),
        args: None,
        workspace_root: "/workspace".to_owned(),
        language_id: Some("cuda".to_owned()),
        initialization_options: Some(
            json!({ "fallbackFlags": ["-xcuda", "--cuda-path=/opt/cuda"] }),
        ),
        env: None,
        max_memory_mb: None,
        source: Default::default(),
    };
    super::apply_server_default_options(&mut config, None);
    super::apply_server_default_options(&mut config, None);
    assert_eq!(
        config.initialization_options,
        Some(json!({ "fallbackFlags": ["-xcuda", "--cuda-path=/opt/cuda"] }))
    );
}

#[test]
fn only_clangd_declares_project_config_files() {
    assert_eq!(
        super::project_config_files("clangd"),
        super::project_config_files("/usr/bin/clangd-18")
    );
    assert!(super::project_config_files("clangd").contains(&"compile_flags.txt"));
    assert!(super::project_config_files("clangd").contains(&".clangd"));
    assert!(super::project_config_files("clangd").contains(&"compile_commands.json"));
    assert!(super::project_config_files("rust-analyzer").is_empty());
    assert!(super::project_config_files("typescript-language-server").is_empty());
}

#[test]
fn assembly_server_requires_user_config() {
    for extension in ["asm", "assembly", "s", "S"] {
        assert!(
            default_server_for_file(
                &format!("fixture.{extension}"),
                "/workspace",
                &LspDiscoveryOptions::default(),
            )
            .is_none(),
            ".{extension} must not auto-launch a server"
        );
    }

    // Retired `OCTOCODE_ASM_SERVER_PATH` launches nothing.
    let options = LspDiscoveryOptions {
        env: BTreeMap::from([(
            "OCTOCODE_ASM_SERVER_PATH".to_owned(),
            "/opt/asm-lsp".to_owned(),
        )]),
        ..LspDiscoveryOptions::default()
    };
    assert!(default_server_for_file("fixture.asm", "/workspace", &options).is_none());
}

#[test]
fn removed_languages_have_no_builtin_server() {
    for extension in [
        "sh", "php", "json", "yaml", "html", "css", "scss", "less", "sql", "swift", "rb", "kt",
        "ex",
    ] {
        assert!(
            default_server_for_file(
                &format!("fixture.{extension}"),
                "/workspace",
                &LspDiscoveryOptions::default(),
            )
            .is_none(),
            ".{extension} must require trusted custom configuration"
        );
    }
}

#[test]
fn typescript_language_server_remains_the_stable_default() {
    let spec = super::catalog::spec_for_extension(".ts").expect("TypeScript provider");
    assert_eq!(spec.command, "typescript-language-server");
    assert_eq!(spec.args, ["--stdio"]);
}

#[test]
fn detects_rust_analyzer_command_names() {
    assert!(is_rust_analyzer_command("rust-analyzer"));
    assert!(is_rust_analyzer_command("/usr/local/bin/rust-analyzer"));
    assert!(!is_rust_analyzer_command("typescript-language-server"));
}

#[test]
fn workspace_lsp_config_is_ignored_by_default() {
    let root = TmpDir::new();
    write_lsp_config(
        &root,
        r#"{"languageServers":{".ts":{"command":"node","args":["-e","process.exit(99)"],"languageId":"typescript"}}}"#,
    );

    let Some(root_str) = root.to_str() else {
        panic!("temporary root is not utf-8");
    };
    let config = default_server_for_file("demo.ts", root_str, &LspDiscoveryOptions::default())
        .expect("default ts server config");

    assert_ne!(config.command, "node");
    assert_ne!(
        config.args.as_deref(),
        Some(&["-e".to_owned(), "process.exit(99)".to_owned()][..])
    );
}

#[test]
fn trusted_workspace_lsp_config_rejects_interpreter_eval_launch() {
    let root = TmpDir::new();
    write_lsp_config(
        &root,
        r#"{"languageServers":{".ts":{"command":"node","args":["-e","process.exit(99)"],"languageId":"typescript"}}}"#,
    );
    let options = LspDiscoveryOptions {
        trust_project_config: true,
        ..LspDiscoveryOptions::default()
    };

    let Some(root_str) = root.to_str() else {
        panic!("temporary root is not utf-8");
    };
    let config =
        default_server_for_file("demo.ts", root_str, &options).expect("default ts server config");

    assert_ne!(config.command, "node");
    assert_ne!(
        config.args.as_deref(),
        Some(&["-e".to_owned(), "process.exit(99)".to_owned()][..])
    );
}

#[test]
fn explicit_discovery_options_support_arbitrary_extensions() {
    let root = TmpDir::new();
    std::fs::create_dir_all(&root).expect("create temporary root");
    let config_path = root.join("native-lsp.json");
    std::fs::write(
        &config_path,
        r#"{"languageServers":{".php":{"command":"custom-php-server","args":["--stdio"],"languageId":"php"}}}"#,
    )
    .expect("write explicit lsp config");
    let root_str = root.to_string_lossy().into_owned();
    let config = default_server_for_file(
        "demo.php",
        &root_str,
        &LspDiscoveryOptions {
            config_path: Some(config_path),
            ..LspDiscoveryOptions::default()
        },
    )
    .expect("explicit server config");
    assert_eq!(config.command, "custom-php-server");
    assert_eq!(config.language_id.as_deref(), Some("php"));
}

/// Settings come from the host's resolved configuration (which includes
/// the home `.env`), not the process env, and the user server file lives
/// in the octocode home.
#[test]
fn resolved_settings_and_octocode_home_drive_discovery() {
    let home = TmpDir::new();
    std::fs::create_dir_all(&home).expect("create home");
    std::fs::write(
        home.join("lsp-servers.json"),
        r#"{"languageServers":{".php":{"command":"home-php-server","args":[],"languageId":"php"},".ts":{"command":"tsgo","args":["--lsp","-stdio"],"languageId":"typescript"}}}"#,
    )
    .expect("write user lsp config");
    let options = LspDiscoveryOptions {
        octocode_home: Some(home.to_path_buf()),
        ..LspDiscoveryOptions::default()
    };
    // A user entry replaces a built-in server (the retired
    // `OCTOCODE_TS_SERVER_PATH` route): here `tsgo` with its own args.
    let ts = default_server_for_file("demo.ts", "/workspace", &options).expect("ts server");
    assert_eq!(ts.command, "tsgo");
    assert_eq!(
        ts.args.as_deref(),
        Some(&["--lsp".to_owned(), "-stdio".to_owned()][..])
    );
    let php = default_server_for_file("demo.php", "/workspace", &options)
        .expect("user server from the octocode home");
    assert_eq!(php.command, "home-php-server");
}

#[test]
fn retired_server_path_env_does_not_override_the_trusted_workspace_config() {
    let root = TmpDir::new();
    write_lsp_config(
        &root,
        r#"{"languageServers":{".ts":{"command":"custom-language-server","args":["--stdio"],"languageId":"typescript"}}}"#,
    );
    let options = LspDiscoveryOptions {
        trust_project_config: true,
        env: BTreeMap::from([(
            "OCTOCODE_TS_SERVER_PATH".to_owned(),
            "env-ts-server".to_owned(),
        )]),
        ..LspDiscoveryOptions::default()
    };

    let Some(root_str) = root.to_str() else {
        panic!("temporary root is not utf-8");
    };
    let config =
        default_server_for_file("demo.ts", root_str, &options).expect("default ts server config");

    assert_eq!(config.command, "custom-language-server");
}

#[test]
fn keeps_unknown_server_commands_unchanged() {
    assert_eq!(
        resolve_known_server_command("definitely-not-an-octocode-server"),
        "definitely-not-an-octocode-server"
    );
}

#[cfg(unix)]
#[test]
fn wraps_non_executable_typescript_cli_with_current_node() {
    let root = TmpDir::new();
    let cli = root
        .join("node_modules")
        .join("typescript-language-server")
        .join("lib")
        .join("cli.mjs");
    std::fs::create_dir_all(cli.parent().unwrap_or(&root))
        .expect("create temporary typescript-language-server dir");
    std::fs::write(&cli, "#!/usr/bin/env node\n").expect("write temporary cli");

    let Some(root_str) = root.to_str() else {
        panic!("temporary root is not utf-8");
    };
    let Some(cli_str) = cli.to_str() else {
        panic!("temporary cli path is not utf-8");
    };

    let (command, args, _) =
        resolve_server_invocation(cli_str, vec!["--stdio".to_owned()], root_str, false, None);
    assert_eq!(Some(command), current_node_command());
    assert_eq!(args.len(), 2);
    assert_eq!(
        PathBuf::from(&args[0]),
        std::fs::canonicalize(&cli).expect("canonicalize temporary cli")
    );
    assert_eq!(args[1], "--stdio");
}

#[cfg(unix)]
#[test]
fn resolves_bundled_typescript_server_from_current_dir_for_external_workspace() {
    let workspace_root = TmpDir::new();
    let package_root = TmpDir::new();
    let cli = package_root
        .join("node_modules")
        .join("typescript-language-server")
        .join("lib")
        .join("cli.mjs");
    std::fs::create_dir_all(&workspace_root).expect("create external workspace");
    std::fs::create_dir_all(cli.parent().unwrap_or(&package_root))
        .expect("create bundled typescript-language-server dir");
    std::fs::write(&cli, "#!/usr/bin/env node\n").expect("write temporary cli");

    let Some(workspace_str) = workspace_root.to_str() else {
        panic!("temporary workspace path is not utf-8");
    };
    let (command, args, source) = resolve_server_invocation_with_environment(
        "typescript-language-server",
        vec!["--stdio".to_owned()],
        workspace_str,
        &super::invocation::TypeScriptServerSearch {
            managed_start: None,
            current_dir: Some(&package_root),
            workspace_trusted: false,
        },
        false,
    );

    assert_eq!(Some(command), current_node_command());
    assert_eq!(
        PathBuf::from(&args[0]),
        std::fs::canonicalize(&cli).expect("canonicalize temporary cli")
    );
    assert_eq!(args[1], "--stdio");
    assert_eq!(source, crate::lsp::types::ServerSource::Workspace);
}

/// A scanned checkout's own `node_modules` cannot supply the
/// TypeScript server unless the workspace is trusted (opt-in, or the
/// user's own invocation directory); octocode's install tree and the
/// invocation directory are searched first.
#[cfg(unix)]
#[test]
fn workspace_typescript_server_requires_a_trusted_workspace() {
    let base = TmpDir::new();
    let write_cli = |root: &std::path::Path| {
        let cli = root
            .join("node_modules")
            .join("typescript-language-server")
            .join("lib")
            .join("cli.mjs");
        std::fs::create_dir_all(cli.parent().unwrap_or(root)).expect("cli dir");
        std::fs::write(&cli, "#!/usr/bin/env node\n").expect("cli");
        std::fs::canonicalize(&cli).expect("canonical cli")
    };
    let checkout = base.join("clone");
    let checkout_cli = write_cli(&checkout);
    let elsewhere = base.join("elsewhere");
    std::fs::create_dir_all(&elsewhere).expect("elsewhere");
    let checkout_str = checkout.to_string_lossy().into_owned();
    let resolve = |search: &super::invocation::TypeScriptServerSearch<'_>| {
        super::invocation::resolve_typescript_server_cli(
            "typescript-language-server",
            &checkout_str,
            search,
            false,
        )
    };

    // Untrusted checkout, nothing else: no server (never the checkout's).
    let untrusted = super::invocation::TypeScriptServerSearch {
        managed_start: None,
        current_dir: Some(&elsewhere),
        workspace_trusted: false,
    };
    assert_eq!(resolve(&untrusted), None);

    // Trusted (opt-in or invocation root): the workspace's server.
    let trusted = super::invocation::TypeScriptServerSearch {
        workspace_trusted: true,
        ..untrusted
    };
    assert_eq!(
        resolve(&trusted),
        Some((
            checkout_cli.clone(),
            crate::lsp::types::ServerSource::Workspace
        ))
    );

    // octocode's own install tree wins over the workspace.
    let install = base.join("octocode-install");
    let managed_cli = write_cli(&install);
    let exe = install.join("bin").join("octocode");
    let managed = super::invocation::TypeScriptServerSearch {
        managed_start: Some(&exe),
        ..trusted
    };
    assert_eq!(
        resolve(&managed),
        Some((managed_cli, crate::lsp::types::ServerSource::Bundled))
    );

    // On PATH: the command runs as-is.
    assert_eq!(
        super::invocation::resolve_typescript_server_cli(
            "typescript-language-server",
            &checkout_str,
            &trusted,
            true
        ),
        None
    );

    // The invocation root: the workspace itself or a directory inside it.
    assert!(super::invocation::workspace_is_invocation_root(
        &checkout_str,
        Some(&checkout)
    ));
    assert!(super::invocation::workspace_is_invocation_root(
        &checkout.join("node_modules").to_string_lossy(),
        Some(&checkout)
    ));
    assert!(!super::invocation::workspace_is_invocation_root(
        &checkout_str,
        Some(&elsewhere)
    ));
    assert!(!super::invocation::workspace_is_invocation_root(
        &checkout_str,
        Some(std::path::Path::new("/"))
    ));
    if let Some(home) = std::env::home_dir() {
        assert!(
            !super::invocation::workspace_is_invocation_root(
                &home.join(".octocode/clones/x").to_string_lossy(),
                Some(&home)
            ),
            "a home-directory invocation does not trust every checkout under it"
        );
    }

    // The search trusts and looks up from the directory the host runs
    // the call for, never from the process's own directory: a server
    // answering for several directories decides per call.
    assert_ne!(std::env::current_dir().ok(), Some(checkout.clone()));
    let from = |dir: Option<&std::path::Path>| {
        let search =
            super::invocation::TypeScriptServerSearch::new(None, &checkout_str, false, dir);
        (
            search.workspace_trusted,
            search.current_dir.map(PathBuf::from),
        )
    };
    assert_eq!(from(Some(&checkout)), (true, Some(checkout.clone())));
    assert_eq!(from(Some(&elsewhere)), (false, Some(elsewhere.clone())));
    assert_eq!(from(None), (false, None));
    assert_eq!(
        resolve(&super::invocation::TypeScriptServerSearch::new(
            None,
            &checkout_str,
            false,
            Some(&checkout)
        )),
        Some((
            checkout_cli.clone(),
            crate::lsp::types::ServerSource::Workspace
        )),
        "invoked in the checkout, its server is the user's own"
    );
    assert_eq!(
        resolve(&super::invocation::TypeScriptServerSearch::new(
            None,
            &checkout_str,
            false,
            Some(&elsewhere)
        )),
        None,
        "invoked elsewhere, the checkout's server is never trusted"
    );
}

#[cfg(unix)]
#[test]
fn absolute_non_executable_non_node_command_is_unavailable() {
    let root = TmpDir::new();
    let command = root.join("server");
    std::fs::create_dir_all(&root).expect("create temporary command dir");
    std::fs::write(&command, "not executable\n").expect("write temporary command");

    let Some(command_str) = command.to_str() else {
        panic!("temporary command path is not utf-8");
    };
    assert!(!command_resolves_to_executable(command_str));
    assert!(!is_command_available(command_str).expect("check command availability"));
}

#[cfg(unix)]
#[test]
fn command_probe_is_bounded_and_kills_a_hung_command() {
    // System binaries, not freshly written scripts: exec'ing a file this
    // process just wrote races parallel tests' forks (ETXTBSY). Bounds are
    // generous so a loaded machine cannot turn scheduling delay into a
    // failure: the property is "returns long before the 30 s sleep ends".
    let started = std::time::Instant::now();
    assert!(!super::probe::probe_command_succeeds(
        "/bin/sleep",
        &["30"],
        std::time::Duration::from_millis(200),
    ));
    assert!(
        started.elapsed() < std::time::Duration::from_secs(20),
        "a hung probe must be killed at its deadline"
    );
    assert!(super::probe::probe_command_succeeds(
        "/bin/sh",
        &["-c", "exit 0"],
        std::time::Duration::from_secs(60),
    ));
    assert!(!super::probe::probe_command_succeeds(
        "/bin/sh",
        &["-c", "exit 3"],
        std::time::Duration::from_secs(60),
    ));
    assert!(!super::probe::probe_command_succeeds(
        "/nonexistent/octocode-probe-missing",
        &[],
        std::time::Duration::from_secs(1),
    ));
}

#[cfg(unix)]
#[test]
fn command_probe_timeout_kills_the_whole_process_group() {
    // A rustup-style proxy forks the real binary; killing only the
    // leader would leave that child running after the probe returns.
    let root = TmpDir::new();
    std::fs::create_dir_all(&root).expect("root");
    let pid_file = root.join("child.pid");
    let script = format!(
        "/bin/sleep 30 & echo $! > '{}'; wait",
        pid_file.to_string_lossy()
    );
    assert!(!super::probe::probe_command_succeeds(
        "/bin/sh",
        &["-c", &script],
        std::time::Duration::from_millis(1_500),
    ));
    let pid: i32 = std::fs::read_to_string(&pid_file)
        .expect("the probe recorded its child pid")
        .trim()
        .parse()
        .expect("numeric pid");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    // SAFETY: signal 0 only checks whether the pid still exists.
    while unsafe { libc::kill(pid, 0) } == 0 {
        assert!(
            std::time::Instant::now() < deadline,
            "the probe's grandchild outlived the timeout"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

/// A probe child that calls `setsid` leaves the process group; the
/// timeout's descendant sweep must still kill it.
#[cfg(any(target_os = "macos", target_os = "linux"))]
#[test]
fn command_probe_timeout_kills_a_setsid_descendant() {
    let has_python = std::process::Command::new("python3")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success());
    if !has_python {
        return;
    }
    let root = TmpDir::new();
    std::fs::create_dir_all(&root).expect("root");
    let pid_file = root.join("escaped.pid");
    let pid_arg = pid_file.to_string_lossy().into_owned();
    let script = "import os,sys,time\nif os.fork()==0:\n    os.setsid()\n    open(sys.argv[1],'w').write(str(os.getpid()))\n    time.sleep(60)\nelse:\n    time.sleep(60)\n";
    assert!(!super::probe::probe_command_succeeds(
        "python3",
        &["-c", script, &pid_arg],
        std::time::Duration::from_millis(1_500),
    ));
    let pid: i32 = std::fs::read_to_string(&pid_file)
        .expect("the escaped child recorded its pid")
        .trim()
        .parse()
        .expect("numeric pid");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    // SAFETY: signal 0 only checks whether the pid still exists.
    while unsafe { libc::kill(pid, 0) } == 0 {
        if std::time::Instant::now() >= deadline {
            // SAFETY: clean up the leaked process before failing.
            unsafe { libc::kill(pid, libc::SIGKILL) };
            panic!("the setsid child outlived the probe timeout");
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

#[test]
fn builtin_rust_route_runs_rust_analyzer_headless_by_default() {
    let config =
        default_server_for_file("src/lib.rs", "/workspace", &LspDiscoveryOptions::default())
            .expect("rust route");
    let options = config
        .initialization_options
        .expect("headless rust-analyzer options");
    assert_eq!(
        options.pointer("/cargo/buildScripts/enable"),
        Some(&json!(false))
    );
    assert_eq!(options.pointer("/procMacro/enable"), Some(&json!(false)));
    assert_eq!(options.pointer("/checkOnSave"), Some(&json!(false)));
    assert_eq!(options.pointer("/cachePriming/enable"), Some(&json!(false)));
    assert_eq!(options.pointer("/cargo/targetDir"), Some(&json!(true)));
}

#[test]
fn user_rust_analyzer_options_win_over_headless_defaults() {
    let root = TmpDir::new();
    std::fs::create_dir_all(&root).expect("root");
    let config_path = root.join("lsp.json");
    std::fs::write(
        &config_path,
        r#"{"languageServers":{".rs":{"command":"rust-analyzer","languageId":"rust","initializationOptions":{"procMacro":{"enable":true},"cargo":{"features":"all"}}}}}"#,
    )
    .expect("config");
    let config = default_server_for_file(
        "src/lib.rs",
        &root.to_string_lossy(),
        &LspDiscoveryOptions {
            config_path: Some(config_path),
            ..LspDiscoveryOptions::default()
        },
    )
    .expect("user rust route");
    let options = config.initialization_options.expect("options");
    // User keys win…
    assert_eq!(options.pointer("/procMacro/enable"), Some(&json!(true)));
    assert_eq!(options.pointer("/cargo/features"), Some(&json!("all")));
    // …and the defaults fill in everything the user left out.
    assert_eq!(
        options.pointer("/cargo/buildScripts/enable"),
        Some(&json!(false))
    );
    assert_eq!(options.pointer("/checkOnSave"), Some(&json!(false)));
}

#[test]
fn server_defaults_touch_only_rust_analyzer_and_are_idempotent() {
    let mut config = crate::lsp::types::LspLanguageServerConfig {
        command: "/opt/bin/gopls".to_owned(),
        args: None,
        workspace_root: "/w".to_owned(),
        language_id: Some("go".to_owned()),
        initialization_options: None,
        env: None,
        max_memory_mb: None,
        source: Default::default(),
    };
    super::apply_server_default_options(&mut config, None);
    assert!(config.initialization_options.is_none());

    config.command = "C:/tools/Rust-Analyzer.exe".to_owned();
    config.initialization_options = Some(json!({"checkOnSave": true}));
    super::apply_server_default_options(&mut config, None);
    let once = config.initialization_options.clone();
    super::apply_server_default_options(&mut config, None);
    assert_eq!(config.initialization_options, once);
    let options = once.expect("options");
    assert_eq!(options.pointer("/checkOnSave"), Some(&json!(true)));
    assert_eq!(options.pointer("/procMacro/enable"), Some(&json!(false)));
}

/// clangd, jdtls, and Metals start headless and read-only by
/// default, on the built-in route and through `apply_server_default_options`;
/// user args and options still win.
#[test]
fn clangd_jdtls_and_metals_routes_start_headless() {
    let options = LspDiscoveryOptions {
        octocode_home: Some(PathBuf::from("/home/fixture/.octocode")),
        ..LspDiscoveryOptions::default()
    };
    let clangd =
        default_server_for_file("src/main.cpp", "/workspace", &options).expect("clangd route");
    let args = clangd.args.expect("clangd args");
    for flag in super::defaults::CLANGD_HEADLESS_ARGS {
        assert!(args.iter().any(|arg| arg == flag), "{flag} in {args:?}");
    }

    let jdtls =
        default_server_for_file("src/Main.java", "/workspace/java", &options).expect("jdtls route");
    let args = jdtls.args.expect("jdtls args");
    let data = args
        .iter()
        .position(|arg| arg == "-data")
        .and_then(|index| args.get(index + 1))
        .expect("-data <dir>");
    assert!(
        !std::path::Path::new(data).starts_with("/workspace"),
        "jdtls data stays outside the repository: {data}"
    );
    let home = options.octocode_home.clone().expect("octocode home");
    assert_eq!(
        PathBuf::from(data),
        super::defaults::jdtls_data_dir(&home, "/workspace/java")
    );
    assert_ne!(
        super::defaults::jdtls_data_dir(&home, "/workspace/java"),
        super::defaults::jdtls_data_dir(&home, "/workspace/other"),
        "one data dir per workspace"
    );
    let jdtls_options = jdtls.initialization_options.expect("jdtls options");
    assert_eq!(
        jdtls_options.pointer("/settings/java/autobuild/enabled"),
        Some(&json!(false))
    );

    let metals =
        default_server_for_file("build.sbt", "/workspace", &options).expect("metals route");
    let metals_options = metals.initialization_options.expect("metals options");
    assert_eq!(metals_options["isHttpEnabled"], json!(false));
    assert_eq!(metals_options["statusBarProvider"], json!("off"));

    // User values win; defaults fill the rest; re-applying is a no-op.
    let mut config = crate::lsp::types::LspLanguageServerConfig {
        command: "/usr/bin/clangd-18".to_owned(),
        args: Some(vec![
            "--background-index".to_owned(),
            "--log=verbose".to_owned(),
        ]),
        workspace_root: "/w".to_owned(),
        language_id: Some("cpp".to_owned()),
        initialization_options: None,
        env: None,
        max_memory_mb: None,
        source: Default::default(),
    };
    super::apply_server_default_options(&mut config, None);
    super::apply_server_default_options(&mut config, None);
    assert_eq!(
        config.args.as_deref().unwrap_or_default(),
        [
            "--background-index",
            "--log=verbose",
            "--clang-tidy=false",
            "--pch-storage=memory"
        ]
    );
    config.command = "jdtls".to_owned();
    config.args = Some(vec!["-data".to_owned(), "/mine".to_owned()]);
    config.initialization_options =
        Some(json!({"settings": {"java": {"autobuild": {"enabled": true}}}}));
    super::apply_server_default_options(&mut config, None);
    assert_eq!(
        config.args.as_deref().unwrap_or_default(),
        ["-data", "/mine"]
    );
    let merged = config.initialization_options.clone().expect("options");
    assert_eq!(
        merged.pointer("/settings/java/autobuild/enabled"),
        Some(&json!(true))
    );
    assert_eq!(
        merged.pointer("/settings/java/import/generatesMetadataFilesAtProjectRoot"),
        Some(&json!(false))
    );
}

#[cfg(unix)]
#[test]
fn python_route_prefers_basedpyright_then_pyright_then_pylsp() {
    use std::os::unix::fs::PermissionsExt;
    let root = TmpDir::new();
    let path_dir = root.join("path-bin");
    let workspace = root.join("workspace");
    let workspace_bin = workspace.join("node_modules").join(".bin");
    std::fs::create_dir_all(&path_dir).expect("path dir");
    std::fs::create_dir_all(&workspace_bin).expect("workspace bin");
    let fake = |dir: &std::path::Path, name: &str| {
        let path = dir.join(name);
        std::fs::write(&path, "#!/bin/sh\n").expect("fake server");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        path
    };
    let workspace_str = workspace.to_string_lossy().into_owned();
    let resolve =
        || super::invocation::resolve_pyright_family(&workspace_str, Some(path_dir.as_os_str()));

    // Nothing installed: the caller falls back to pylsp.
    assert_eq!(resolve(), None);

    // A checkout-shipped server is never picked automatically.
    fake(&workspace_bin, "pyright-langserver");
    fake(&workspace_bin, "basedpyright-langserver");
    assert_eq!(resolve(), None);

    // pyright on PATH is found.
    let path_pyright = fake(&path_dir, "pyright-langserver");
    let (command, args) = resolve().expect("PATH pyright");
    assert_eq!(PathBuf::from(command), path_pyright);
    assert_eq!(args, ["--stdio"]);

    // basedpyright beats pyright.
    let path_based = fake(&path_dir, "basedpyright-langserver");
    assert_eq!(
        resolve().map(|(c, _)| PathBuf::from(c)),
        Some(path_based.clone())
    );

    // A non-executable file is not a server.
    std::fs::set_permissions(&path_based, std::fs::Permissions::from_mode(0o644)).expect("chmod");
    assert_eq!(
        resolve().map(|(c, _)| PathBuf::from(c)),
        Some(path_dir.join("pyright-langserver"))
    );
}

fn write_lsp_config(root: &std::path::Path, json: &str) {
    let config_dir = root.join(".octocode");
    std::fs::create_dir_all(&config_dir).expect("create .octocode dir");
    std::fs::write(config_dir.join("lsp-servers.json"), json).expect("write lsp config");
}

#[test]
fn managed_install_resolves_ahead_of_path_and_behind_an_override() {
    let home = TmpDir::new();
    let bin = crate::lsp::managed::cached_server_bin_path(
        &home.join("lsp"),
        "rust-analyzer",
        &crate::lsp::managed::platform_id(),
    )
    .expect("rust-analyzer ships for this platform");
    std::fs::create_dir_all(bin.parent().expect("bin dir")).expect("install dir");
    std::fs::write(&bin, b"managed").expect("binary");
    std::fs::write(
        crate::lsp::managed::marker_path(&bin),
        json!({
            "assetSha256": crate::lsp::managed::manifest()["rust-analyzer"].platforms
                [crate::lsp::managed::platform_id().as_str()]
            .sha256
            .expect("pinned asset"),
            "binarySha256": crate::digest::sha256(b"managed"),
            "size": 7,
        })
        .to_string(),
    )
    .expect("marker");
    let mut options = LspDiscoveryOptions {
        octocode_home: Some(home.to_path_buf()),
        ..LspDiscoveryOptions::default()
    };
    let managed =
        default_server_for_file("src/lib.rs", "/workspace", &options).expect("rust route");
    assert_eq!(PathBuf::from(&managed.command), bin);
    assert_eq!(managed.source, ServerSource::Managed);
    assert!(
        managed.initialization_options.is_some(),
        "headless defaults"
    );

    options.env = BTreeMap::from([(
        "OCTOCODE_LSP_CACHE_DIR".to_owned(),
        home.join("elsewhere").to_string_lossy().into_owned(),
    )]);
    let unmanaged =
        default_server_for_file("src/lib.rs", "/workspace", &options).expect("rust route");
    assert_ne!(PathBuf::from(&unmanaged.command), bin);
    assert_eq!(unmanaged.source, ServerSource::Path);
}

/// A built-in server takes the host-derived memory cap; a per-server
/// `maxMemoryMb` in `lsp-servers.json` (0 disables it) is the one
/// override, and `env` of a user entry reaches the server process.
#[test]
fn the_memory_cap_is_host_derived_with_a_per_server_override() {
    let home = TmpDir::new();
    std::fs::create_dir_all(&home).expect("create home");
    std::fs::write(
        home.join("lsp-servers.json"),
        r#"{"languageServers":{".php":{"command":"home-php-server","args":[],"languageId":"php","maxMemoryMb":1500,"env":{"GOMEMLIMIT":"1GiB"}},".lua":{"command":"home-lua-server","args":[],"languageId":"lua","maxMemoryMb":0}}}"#,
    )
    .expect("write user lsp config");
    let options = LspDiscoveryOptions {
        octocode_home: Some(home.to_path_buf()),
        ..LspDiscoveryOptions::default()
    };
    let unset = default_server_for_file("a.go", "/workspace", &options).expect("go");
    assert_eq!(unset.max_memory_mb, None, "unset: the host-derived default");
    let user = default_server_for_file("a.php", "/workspace", &options).expect("php");
    assert_eq!(user.max_memory_mb, Some(1500), "per-server wins");
    // A user entry reports its config file, not where its program lives.
    assert_eq!(user.source, ServerSource::User);
    assert_eq!(
        user.env
            .as_ref()
            .and_then(|env| env.get("GOMEMLIMIT"))
            .map(String::as_str),
        Some("1GiB")
    );
    let disabled = default_server_for_file("a.lua", "/workspace", &options).expect("lua");
    assert_eq!(disabled.max_memory_mb, Some(0), "0 disables the cap");
}

/// typescript-language-server runs headless: no network typings, one
/// process, a V8 heap that stays under the cap, and no package.json
/// import scan. Options the user set win.
#[test]
fn typescript_server_gets_headless_options_sized_to_the_cap() {
    let capped = |max_memory_mb: Option<u32>| {
        let mut config = crate::lsp::types::LspLanguageServerConfig {
            command: "typescript-language-server".to_owned(),
            args: None,
            workspace_root: "/workspace".to_owned(),
            language_id: Some("typescript".to_owned()),
            initialization_options: None,
            env: None,
            max_memory_mb,
            source: Default::default(),
        };
        crate::lsp::config::apply_server_default_options(&mut config, None);
        config
    };
    let ts = super::catalog::default_server_for_file_from(
        "a.ts",
        "/workspace",
        &LspDiscoveryOptions::default(),
        None,
    )
    .expect("ts");
    assert!(ts.initialization_options.is_some(), "headless defaults");
    let init = capped(Some(8192))
        .initialization_options
        .expect("init options");
    assert_eq!(init["disableAutomaticTypingAcquisition"], true, "{init}");
    assert_eq!(init["tsserver"]["useSyntaxServer"], "never", "{init}");
    assert_eq!(init["maxTsServerMemory"], 8192 - 512, "{init}");
    assert_eq!(
        init["preferences"]["includePackageJsonAutoImports"], "off",
        "{init}"
    );
    // No cap, no heap bound.
    assert!(capped(Some(0)).initialization_options.expect("init")["maxTsServerMemory"].is_null());
    // A user value wins.
    let mut config = crate::lsp::types::LspLanguageServerConfig {
        command: "typescript-language-server".to_owned(),
        args: None,
        workspace_root: "/workspace".to_owned(),
        language_id: Some("typescript".to_owned()),
        initialization_options: Some(json!({"maxTsServerMemory": 1234})),
        env: None,
        max_memory_mb: Some(8192),
        source: Default::default(),
    };
    crate::lsp::config::apply_server_default_options(&mut config, None);
    let init = config.initialization_options.expect("init");
    assert_eq!(init["maxTsServerMemory"], 1234, "{init}");
}

/// The default cap follows host memory: a quarter of it, within
/// 4 GiB..8 GiB; an unreadable host keeps the floor.
#[test]
fn the_default_cap_is_a_quarter_of_host_memory_within_bounds() {
    use crate::lsp::spawn_limits::default_memory_cap_mb;
    assert_eq!(default_memory_cap_mb(None), 4_096);
    assert_eq!(default_memory_cap_mb(Some(8_192)), 4_096);
    assert_eq!(default_memory_cap_mb(Some(20_000)), 5_000);
    assert_eq!(default_memory_cap_mb(Some(32_768)), 8_192);
    assert_eq!(default_memory_cap_mb(Some(262_144)), 8_192);
}

/// A trusted workspace's native TypeScript server is preferred over
/// tsserver; an untrusted one never swaps in a checkout's executable.
#[cfg(unix)]
#[test]
fn a_trusted_workspace_tsgo_is_preferred_over_tsserver() {
    use std::os::unix::fs::PermissionsExt;
    let root = TmpDir::new();
    let bin = root.join("node_modules").join(".bin");
    std::fs::create_dir_all(&bin).expect("bin dir");
    let tsgo = bin.join("tsgo");
    std::fs::write(&tsgo, "#!/bin/sh\n").expect("tsgo");
    std::fs::set_permissions(&tsgo, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    let Some(root_str) = root.to_str() else {
        panic!("temporary root is not utf-8");
    };
    let trusted = LspDiscoveryOptions {
        trust_project_config: true,
        ..LspDiscoveryOptions::default()
    };
    let config =
        super::catalog::default_server_for_file_from("a.ts", root_str, &trusted, None).expect("ts");
    assert_eq!(PathBuf::from(&config.command), tsgo);
    assert_eq!(
        config.args.as_deref(),
        Some(&["--lsp".to_owned(), "-stdio".to_owned()][..])
    );
    // tsgo is a Go program: its GC works toward GOMEMLIMIT, set 512 MiB
    // under the memory cap unless the user's `env` already chose one.
    let cap = crate::lsp::spawn_limits::effective_memory_cap_mb(config.max_memory_mb)
        .expect("the default cap is on");
    assert_eq!(
        config.env.as_ref().and_then(|env| env.get("GOMEMLIMIT")),
        Some(&format!("{}MiB", cap - 512)),
        "{config:?}"
    );
    // tsgo drops constructor functions and `this` expandos, so JavaScript
    // stays on tsserver; every TypeScript extension takes the native one.
    for file in ["a.tsx", "a.mts", "a.cts"] {
        let ts = super::catalog::default_server_for_file_from(file, root_str, &trusted, None)
            .expect(file);
        assert_eq!(PathBuf::from(&ts.command), tsgo, "{file}");
    }
    for file in ["a.js", "a.jsx", "a.mjs", "a.cjs"] {
        let js = super::catalog::default_server_for_file_from(file, root_str, &trusted, None)
            .expect(file);
        assert_ne!(PathBuf::from(&js.command), tsgo, "{file} stays on tsserver");
    }
    // `None`: an install tree without a bundled tsgo (the checkout that
    // runs these tests ships one beside the test binary); the bundled
    // route has its own tests below.
    let untrusted = super::catalog::default_server_for_file_from(
        "a.ts",
        root_str,
        &LspDiscoveryOptions::default(),
        None,
    )
    .expect("ts");
    assert_ne!(PathBuf::from(&untrusted.command), tsgo);
    assert!(
        format!("{} {:?}", untrusted.command, untrusted.args)
            .contains("typescript-language-server"),
        "{untrusted:?}"
    );
}

/// An install tree whose `node_modules` ships octocode's own tsgo, plus
/// the anchor file (the executable or addon) inside it.
#[cfg(unix)]
fn install_with_bundled_tsgo() -> (TmpDir, PathBuf, PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let install = TmpDir::new();
    let package = install
        .join("node_modules")
        .join("@typescript")
        .join(format!(
            "native-preview-{}",
            crate::lsp::managed::npm_platform_id()
        ))
        .join("lib");
    std::fs::create_dir_all(&package).expect("package dir");
    let tsgo = package.join("tsgo");
    std::fs::write(&tsgo, "#!/bin/sh\n").expect("tsgo");
    std::fs::set_permissions(&tsgo, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    let anchor = install.join("node_modules/octocode-native/octocode.node");
    std::fs::create_dir_all(anchor.parent().expect("parent")).expect("anchor dir");
    std::fs::write(&anchor, "").expect("anchor");
    let tsgo = std::fs::canonicalize(tsgo).expect("canonical tsgo");
    (install, anchor, tsgo)
}

/// Octocode's own tsgo serves TypeScript whatever the trust state, and
/// a tsgo the scanned checkout ships is never run untrusted.
#[cfg(unix)]
#[test]
fn the_bundled_tsgo_serves_typescript_in_an_untrusted_workspace() {
    use super::catalog::default_server_for_file_from;
    use std::os::unix::fs::PermissionsExt;
    let (_install, anchor, tsgo) = install_with_bundled_tsgo();
    let workspace = TmpDir::new();
    let shipped = workspace.join("node_modules").join(".bin");
    std::fs::create_dir_all(&shipped).expect("bin dir");
    let shipped_tsgo = shipped.join("tsgo");
    std::fs::write(&shipped_tsgo, "#!/bin/sh\n").expect("shipped tsgo");
    std::fs::set_permissions(&shipped_tsgo, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    let root = workspace.to_str().expect("utf-8 root");
    let untrusted = LspDiscoveryOptions::default();

    for file in ["a.ts", "a.tsx", "a.mts", "a.cts"] {
        let config =
            default_server_for_file_from(file, root, &untrusted, Some(&anchor)).expect(file);
        assert_eq!(PathBuf::from(&config.command), tsgo, "{file}");
        assert_eq!(config.source, ServerSource::Bundled, "{file}");
        assert_eq!(
            config.args.as_deref(),
            Some(&["--lsp".to_owned(), "-stdio".to_owned()][..])
        );
    }
    // The Go GC works toward GOMEMLIMIT, set under the memory cap.
    let config = default_server_for_file_from("a.ts", root, &untrusted, Some(&anchor)).expect("ts");
    let cap = crate::lsp::spawn_limits::effective_memory_cap_mb(config.max_memory_mb)
        .expect("the default cap is on");
    assert_eq!(
        config.env.as_ref().and_then(|env| env.get("GOMEMLIMIT")),
        Some(&format!("{}MiB", cap - 512)),
        "{config:?}"
    );
    // JavaScript stays on tsserver.
    for file in ["a.js", "a.jsx", "a.mjs", "a.cjs"] {
        let js = default_server_for_file_from(file, root, &untrusted, Some(&anchor)).expect(file);
        assert_ne!(PathBuf::from(&js.command), tsgo, "{file}");
    }
}

/// A trusted workspace's own tsgo (its TypeScript version) still wins
/// over octocode's bundled one.
#[cfg(unix)]
#[test]
fn a_trusted_workspace_tsgo_wins_over_the_bundled_one() {
    use super::catalog::default_server_for_file_from;
    use std::os::unix::fs::PermissionsExt;
    let (_install, anchor, bundled) = install_with_bundled_tsgo();
    let workspace = TmpDir::new();
    let shipped = workspace.join("node_modules").join(".bin");
    std::fs::create_dir_all(&shipped).expect("bin dir");
    let shipped_tsgo = shipped.join("tsgo");
    std::fs::write(&shipped_tsgo, "#!/bin/sh\n").expect("shipped tsgo");
    std::fs::set_permissions(&shipped_tsgo, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    let root = workspace.to_str().expect("utf-8 root");
    let trusted = LspDiscoveryOptions {
        trust_project_config: true,
        ..LspDiscoveryOptions::default()
    };
    let config = default_server_for_file_from("a.ts", root, &trusted, Some(&anchor)).expect("ts");
    assert_eq!(PathBuf::from(&config.command), shipped_tsgo);
    assert_ne!(PathBuf::from(&config.command), bundled);
}

/// Without a bundled tsgo the route stays tsserver, and the fallback is
/// offered only where a native route exists: a user server entry is the
/// user's explicit choice and has no fallback.
#[cfg(unix)]
#[test]
fn only_tsgo_serves_requests_concurrently() {
    let config = |command: &str| LspLanguageServerConfig {
        command: command.to_owned(),
        args: None,
        workspace_root: "/workspace".to_owned(),
        language_id: Some("typescript".to_owned()),
        initialization_options: None,
        env: None,
        max_memory_mb: None,
        source: Default::default(),
    };
    assert!(serves_requests_concurrently(&config(
        "/i/@typescript/native-preview-darwin-arm64/lib/tsgo"
    )));
    assert!(serves_requests_concurrently(&config("tsgo")));
    assert!(!serves_requests_concurrently(&config(
        "typescript-language-server"
    )));
    assert!(!serves_requests_concurrently(&config("gopls")));
}

/// tsgo answers `workspace/symbol` with at most 256 symbols
/// (typescript-go `internal/ls/symbols.go`); other servers have no
/// known cap.
#[test]
fn only_tsgo_caps_workspace_symbols() {
    let config = |command: &str| LspLanguageServerConfig {
        command: command.to_owned(),
        args: None,
        workspace_root: "/workspace".to_owned(),
        language_id: Some("typescript".to_owned()),
        initialization_options: None,
        env: None,
        max_memory_mb: None,
        source: Default::default(),
    };
    assert_eq!(
        super::workspace_symbol_limit(&config(
            "/i/@typescript/native-preview-darwin-arm64/lib/tsgo"
        )),
        Some(256)
    );
    assert_eq!(
        super::workspace_symbol_limit(&config("tsgo.cmd")),
        Some(256)
    );
    assert_eq!(
        super::workspace_symbol_limit(&config("typescript-language-server")),
        None
    );
    assert_eq!(super::workspace_symbol_limit(&config("gopls")), None);
}

#[cfg(unix)]
#[test]
fn tsserver_is_the_fallback_when_tsgo_is_absent_or_fails() {
    use super::{catalog::default_server_for_file_from, catalog::typescript_server_fallback_from};
    let (_install, anchor, tsgo) = install_with_bundled_tsgo();
    let bare = TmpDir::new();
    std::fs::create_dir_all(&bare).expect("bare install");
    let bare_anchor = bare.join("octocode");
    let workspace = TmpDir::new();
    std::fs::create_dir_all(&workspace).expect("workspace");
    let root = workspace.to_str().expect("utf-8 root");
    let options = LspDiscoveryOptions::default();

    let absent = default_server_for_file_from("a.ts", root, &options, Some(&bare_anchor))
        .expect("ts without tsgo");
    assert!(
        format!("{} {:?}", absent.command, absent.args).contains("typescript-language-server"),
        "{absent:?}"
    );
    assert!(
        typescript_server_fallback_from("a.ts", root, &options, Some(&bare_anchor)).is_none(),
        "nothing to fall back from"
    );

    let fallback = typescript_server_fallback_from("a.ts", root, &options, Some(&anchor))
        .expect("tsgo route has a tsserver fallback");
    assert_ne!(PathBuf::from(&fallback.command), tsgo);
    assert!(
        format!("{} {:?}", fallback.command, fallback.args).contains("typescript-language-server"),
        "{fallback:?}"
    );
    assert!(
        typescript_server_fallback_from("a.js", root, &options, Some(&anchor)).is_none(),
        "JavaScript never used tsgo"
    );

    let home = TmpDir::new();
    std::fs::create_dir_all(&home).expect("home");
    std::fs::write(
        home.join("lsp-servers.json"),
        r#"{"languageServers":{".ts":{"command":"my-ts","args":[],"languageId":"typescript"}}}"#,
    )
    .expect("user config");
    let user = LspDiscoveryOptions {
        octocode_home: Some(home.to_path_buf()),
        ..LspDiscoveryOptions::default()
    };
    assert!(
        typescript_server_fallback_from("a.ts", root, &user, Some(&anchor)).is_none(),
        "an explicit user entry has no silent fallback"
    );
}
