//! Every supported MCP client, one row each; install and agent management
//! derive all per-client behavior from `CLIENTS`.
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum ConfigFormat {
    Json,
    Toml,
    Yaml,
}

/// Layout of the Octocode server entry a client reads.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum EntryShape {
    /// `{command, type: "stdio", args, env}`.
    Stdio,
    /// `{command, args, env}` with no transport type.
    Untyped,
    /// `{type: "local", command: [runner, ...args], environment}`.
    Opencode,
    /// `{cmd, args, type: "stdio", name, enabled, envs}`.
    Goose,
}

impl EntryShape {
    pub(super) fn env_key(self) -> &'static str {
        match self {
            Self::Opencode => "environment",
            Self::Goose => "envs",
            Self::Stdio | Self::Untyped => "env",
        }
    }

    pub(super) fn command_key(self) -> &'static str {
        match self {
            Self::Goose => "cmd",
            Self::Stdio | Self::Untyped | Self::Opencode => "command",
        }
    }
}

/// The boolean a client reads to switch an entry off.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum EnableFlag {
    Enabled,
    Disabled,
}

pub(super) struct ClientSpec {
    pub(super) id: &'static str,
    pub(super) format: ConfigFormat,
    pub(super) shape: EntryShape,
    /// Map that holds the `octocode` entry.
    pub(super) servers: &'static str,
    /// Enable flag verified against the client's published configuration docs.
    pub(super) enable: Option<EnableFlag>,
    /// Workspace config, relative to the working directory.
    pub(super) workspace: Option<&'static str>,
    /// Per-project entries under `projects.<cwd>` of the home config.
    pub(super) local: bool,
    /// Env var that moves the home config somewhere we cannot resolve safely.
    pub(super) config_dir_env: Option<&'static str>,
    home: fn(&Dirs) -> PathBuf,
}

struct Dirs {
    home: PathBuf,
    app_support: PathBuf,
    config: PathBuf,
    /// `CODEX_HOME`, which moves Codex's directory.
    codex_home: Option<PathBuf>,
}

impl Dirs {
    fn vscode_storage(&self) -> PathBuf {
        self.app_support
            .join("Code")
            .join("User")
            .join("globalStorage")
    }
}

pub(super) static CLIENTS: [ClientSpec; 15] = [
    ClientSpec {
        workspace: Some(".cursor/mcp.json"),
        ..ClientSpec::stdio("cursor", |dirs| dirs.home.join(".cursor").join("mcp.json"))
    },
    ClientSpec {
        ..ClientSpec::stdio("claude-desktop", |dirs| {
            dirs.app_support
                .join("Claude")
                .join("claude_desktop_config.json")
        })
    },
    ClientSpec {
        workspace: Some(".mcp.json"),
        local: true,
        config_dir_env: Some("CLAUDE_CONFIG_DIR"),
        ..ClientSpec::stdio("claude-code", |dirs| dirs.home.join(".claude.json"))
    },
    ClientSpec::stdio("windsurf", |dirs| {
        dirs.home
            .join(".codeium")
            .join("windsurf")
            .join("mcp_config.json")
    }),
    ClientSpec::stdio("trae", |dirs| {
        dirs.app_support.join("Trae").join("mcp.json")
    }),
    ClientSpec::stdio("antigravity", |dirs| {
        dirs.home
            .join(".gemini")
            .join("antigravity")
            .join("mcp_config.json")
    }),
    ClientSpec {
        enable: Some(EnableFlag::Disabled),
        ..ClientSpec::stdio("vscode-cline", |dirs| {
            dirs.vscode_storage()
                .join("saoudrizwan.claude-dev")
                .join("settings")
                .join("cline_mcp_settings.json")
        })
    },
    ClientSpec {
        enable: Some(EnableFlag::Disabled),
        ..ClientSpec::stdio("vscode-roo", |dirs| {
            dirs.vscode_storage()
                .join("rooveterinaryinc.roo-cline")
                .join("settings")
                .join("mcp_settings.json")
        })
    },
    ClientSpec {
        workspace: Some(".continue/mcpServers/octocode.json"),
        ..ClientSpec::stdio("vscode-continue", |dirs| {
            dirs.home
                .join(".continue")
                .join("mcpServers")
                .join("octocode.json")
        })
    },
    ClientSpec {
        shape: EntryShape::Untyped,
        servers: "context_servers",
        ..ClientSpec::stdio("zed", |dirs| dirs.config.join("zed").join("settings.json"))
    },
    ClientSpec {
        shape: EntryShape::Opencode,
        servers: "mcp",
        enable: Some(EnableFlag::Enabled),
        ..ClientSpec::stdio("opencode", |dirs| {
            let plain = dirs.config.join("opencode").join("opencode.json");
            let commented = plain.with_extension("jsonc");
            if !plain.exists() && commented.exists() {
                commented
            } else {
                plain
            }
        })
    },
    ClientSpec::stdio("gemini-cli", |dirs| {
        dirs.home.join(".gemini").join("settings.json")
    }),
    ClientSpec {
        enable: Some(EnableFlag::Disabled),
        workspace: Some(".kiro/settings/mcp.json"),
        ..ClientSpec::stdio("kiro", |dirs| {
            dirs.home.join(".kiro").join("settings").join("mcp.json")
        })
    },
    ClientSpec {
        format: ConfigFormat::Toml,
        shape: EntryShape::Untyped,
        servers: "mcp_servers",
        enable: Some(EnableFlag::Enabled),
        workspace: Some(".codex/config.toml"),
        ..ClientSpec::stdio("codex", |dirs| {
            dirs.codex_home
                .clone()
                .unwrap_or_else(|| dirs.home.join(".codex"))
                .join("config.toml")
        })
    },
    ClientSpec {
        format: ConfigFormat::Yaml,
        shape: EntryShape::Goose,
        servers: "extensions",
        enable: Some(EnableFlag::Enabled),
        ..ClientSpec::stdio("goose", |dirs| {
            if cfg!(windows) {
                dirs.app_support
                    .join("Block")
                    .join("goose")
                    .join("config")
                    .join("config.yaml")
            } else {
                dirs.config.join("goose").join("config.yaml")
            }
        })
    },
];

/// The client with this id.
pub(super) fn client(name: &str) -> Option<&'static ClientSpec> {
    CLIENTS.iter().find(|spec| spec.id == name)
}

impl ClientSpec {
    const fn stdio(id: &'static str, home: fn(&Dirs) -> PathBuf) -> Self {
        Self {
            id,
            format: ConfigFormat::Json,
            shape: EntryShape::Stdio,
            servers: "mcpServers",
            enable: None,
            workspace: None,
            local: false,
            config_dir_env: None,
            home,
        }
    }

    pub(super) fn home_path(&self) -> Option<PathBuf> {
        let home = octocode_io::env::home_dir()?;
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        Some((self.home)(&Dirs {
            app_support: app_support_dir(&home),
            home,
            config,
            codex_home: std::env::var_os("CODEX_HOME").map(PathBuf::from),
        }))
    }

    pub(super) fn scopes(&self) -> impl Iterator<Item = &'static str> {
        std::iter::once("home")
            .chain(self.workspace.map(|_| "workspace"))
            .chain(self.local.then_some("local"))
    }

    pub(super) fn config_dir_overridden(&self) -> bool {
        self.config_dir_env
            .is_some_and(|name| std::env::var_os(name).is_some())
    }

    /// `[server map, "octocode"]`.
    pub(super) fn server_keys(&self) -> Vec<String> {
        vec![self.servers.to_owned(), "octocode".to_owned()]
    }

    /// OpenCode's V2 layout nests servers under `mcp.servers` with a `disabled` flag.
    pub(super) fn nested_servers(&self, root: &Value) -> bool {
        self.shape == EntryShape::Opencode && root.pointer("/mcp/servers").is_some()
    }
}

fn app_support_dir(home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::BTreeSet;

    fn spec(id: &str) -> &'static ClientSpec {
        client(id).expect("supported client")
    }

    fn dirs(codex_home: Option<&str>) -> Dirs {
        Dirs {
            home: PathBuf::from("/h"),
            app_support: PathBuf::from("/as"),
            config: PathBuf::from("/c"),
            codex_home: codex_home.map(PathBuf::from),
        }
    }

    fn path_in(dirs: &Dirs, id: &str) -> PathBuf {
        (spec(id).home)(dirs)
    }

    #[test]
    fn the_registry_has_one_row_per_unique_client_id() {
        let ids = CLIENTS.iter().map(|spec| spec.id).collect::<BTreeSet<_>>();
        assert_eq!(ids.len(), CLIENTS.len());
        for spec in &CLIENTS {
            assert_eq!(client(spec.id).map(|found| found.id), Some(spec.id));
        }
        assert!(client("").is_none());
        assert!(client("Cursor").is_none(), "ids match exactly");
    }

    #[test]
    fn every_client_config_path_follows_its_documented_location() {
        let d = dirs(None);
        let storage = "/as/Code/User/globalStorage";
        let goose = if cfg!(windows) {
            "/as/Block/goose/config/config.yaml"
        } else {
            "/c/goose/config.yaml"
        };
        let expected = [
            ("cursor", "/h/.cursor/mcp.json"),
            ("claude-desktop", "/as/Claude/claude_desktop_config.json"),
            ("claude-code", "/h/.claude.json"),
            ("windsurf", "/h/.codeium/windsurf/mcp_config.json"),
            ("trae", "/as/Trae/mcp.json"),
            ("antigravity", "/h/.gemini/antigravity/mcp_config.json"),
            (
                "vscode-cline",
                &format!("{storage}/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"),
            ),
            (
                "vscode-roo",
                &format!("{storage}/rooveterinaryinc.roo-cline/settings/mcp_settings.json"),
            ),
            ("vscode-continue", "/h/.continue/mcpServers/octocode.json"),
            ("zed", "/c/zed/settings.json"),
            ("opencode", "/c/opencode/opencode.json"),
            ("gemini-cli", "/h/.gemini/settings.json"),
            ("kiro", "/h/.kiro/settings/mcp.json"),
            ("codex", "/h/.codex/config.toml"),
            ("goose", goose),
        ];
        assert_eq!(expected.len(), CLIENTS.len(), "every client is pinned");
        for (id, path) in expected {
            assert_eq!(path_in(&d, id), PathBuf::from(path), "{id}");
        }
    }

    #[test]
    fn codex_home_moves_the_codex_config() {
        assert_eq!(
            path_in(&dirs(Some("/custom")), "codex"),
            PathBuf::from("/custom/config.toml")
        );
    }

    #[test]
    fn opencode_prefers_plain_json_and_falls_back_to_an_existing_jsonc() {
        let root = tempfile::tempdir().expect("tempdir");
        let mut d = dirs(None);
        d.config = root.path().to_path_buf();
        let folder = root.path().join("opencode");
        std::fs::create_dir_all(&folder).expect("folder");
        assert_eq!(path_in(&d, "opencode"), folder.join("opencode.json"));
        std::fs::write(folder.join("opencode.jsonc"), "{}").expect("jsonc");
        assert_eq!(path_in(&d, "opencode"), folder.join("opencode.jsonc"));
        std::fs::write(folder.join("opencode.json"), "{}").expect("json");
        assert_eq!(path_in(&d, "opencode"), folder.join("opencode.json"));
    }

    #[test]
    fn home_path_is_rooted_in_the_user_home_directory() {
        let Some(home) = octocode_io::env::home_dir() else {
            return;
        };
        assert_eq!(
            spec("cursor").home_path(),
            Some(home.join(".cursor").join("mcp.json"))
        );
        assert_eq!(
            spec("claude-code").home_path(),
            Some(home.join(".claude.json"))
        );
    }

    #[test]
    fn app_support_follows_the_platform_convention() {
        let home = Path::new("/h");
        if cfg!(target_os = "macos") {
            assert_eq!(
                app_support_dir(home),
                PathBuf::from("/h/Library/Application Support")
            );
        } else if cfg!(windows) {
            assert!(app_support_dir(home).is_absolute() || std::env::var_os("APPDATA").is_some());
        } else if std::env::var_os("XDG_CONFIG_HOME").is_none() {
            assert_eq!(app_support_dir(home), PathBuf::from("/h/.config"));
        }
    }

    #[test]
    fn scopes_list_home_first_then_the_scopes_a_client_supports() {
        let scopes = |id| spec(id).scopes().collect::<Vec<_>>();
        assert_eq!(scopes("claude-desktop"), ["home"]);
        assert_eq!(scopes("cursor"), ["home", "workspace"]);
        assert_eq!(scopes("claude-code"), ["home", "workspace", "local"]);
        for spec in &CLIENTS {
            assert_eq!(spec.scopes().next(), Some("home"), "{}", spec.id);
            assert_eq!(
                spec.scopes().any(|scope| scope == "workspace"),
                spec.workspace.is_some(),
                "{}",
                spec.id
            );
            assert_eq!(
                spec.scopes().any(|scope| scope == "local"),
                spec.local,
                "{}",
                spec.id
            );
        }
    }

    #[test]
    fn the_config_dir_override_only_applies_to_clients_that_declare_one() {
        for spec in CLIENTS.iter().filter(|spec| spec.config_dir_env.is_none()) {
            assert!(!spec.config_dir_overridden(), "{}", spec.id);
        }
        let declared = spec("claude-code");
        assert_eq!(declared.config_dir_env, Some("CLAUDE_CONFIG_DIR"));
        assert_eq!(
            declared.config_dir_overridden(),
            std::env::var_os("CLAUDE_CONFIG_DIR").is_some()
        );
    }

    #[test]
    fn the_server_entry_is_keyed_by_the_clients_server_map() {
        assert_eq!(spec("cursor").server_keys(), ["mcpServers", "octocode"]);
        assert_eq!(spec("zed").server_keys(), ["context_servers", "octocode"]);
        assert_eq!(spec("codex").server_keys(), ["mcp_servers", "octocode"]);
        assert_eq!(spec("goose").server_keys(), ["extensions", "octocode"]);
    }

    #[test]
    fn entry_shapes_name_their_command_and_env_keys() {
        for (shape, command, env) in [
            (EntryShape::Stdio, "command", "env"),
            (EntryShape::Untyped, "command", "env"),
            (EntryShape::Opencode, "command", "environment"),
            (EntryShape::Goose, "cmd", "envs"),
        ] {
            assert_eq!(shape.command_key(), command, "{shape:?}");
            assert_eq!(shape.env_key(), env, "{shape:?}");
        }
    }

    #[test]
    fn only_opencode_documents_with_a_servers_map_are_nested() {
        let opencode = spec("opencode");
        assert!(opencode.nested_servers(&json!({"mcp": {"servers": {}}})));
        assert!(!opencode.nested_servers(&json!({"mcp": {"octocode": {}}})));
        assert!(!opencode.nested_servers(&json!({})));
        assert!(!spec("cursor").nested_servers(&json!({"mcp": {"servers": {}}})));
    }

    #[test]
    fn enable_flags_are_declared_where_the_client_documents_one() {
        let flagged = |flag| {
            CLIENTS
                .iter()
                .filter(|spec| spec.enable == Some(flag))
                .map(|spec| spec.id)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            flagged(EnableFlag::Disabled),
            ["vscode-cline", "vscode-roo", "kiro"]
        );
        assert_eq!(flagged(EnableFlag::Enabled), ["opencode", "codex", "goose"]);
    }
}
