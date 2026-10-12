//! Process-level fixtures: a real child language server (a Node script) that
//! crashes mid-request, and an acquire/stop loop that must leave no child
//! processes behind. Unix-only (process groups, `kill -0`).

use super::failure::LspFailure;
use octocode_engine::error::ErrorKind;
use octocode_engine::lsp::client::NativeLspClient;
use octocode_engine::lsp::pool::{LspClientPool, LspPoolOptions};
use octocode_engine::lsp::types::JsLanguageServerConfig;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Answers `initialize`; exits without replying to `textDocument/hover`
/// (crash mid-request). Records its own pid and a grandchild's pid.
const FAKE_SERVER: &str = r#"#!/usr/bin/env node
const fs = require('fs');
const { spawn } = require('child_process');
const pids = process.env.FAKE_LSP_PIDS;
if (pids) {
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  fs.appendFileSync(pids, process.pid + '\n' + child.pid + '\n');
}
let buf = Buffer.alloc(0);
function send(m) {
  const s = JSON.stringify(m);
  process.stdout.write('Content-Length: ' + Buffer.byteLength(s) + '\r\n\r\n' + s);
}
function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { capabilities: { hoverProvider: true, textDocumentSync: 1 } } });
  } else if (msg.method === 'textDocument/hover') {
    process.exit(3);
  } else if (msg.method === 'exit') {
    process.exit(0);
  } else if (msg.id !== undefined && msg.method) {
    send({ jsonrpc: '2.0', id: msg.id, result: null });
  }
}
process.stdin.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) return;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, i).toString());
    const n = Number(m[1]);
    if (buf.length < i + 4 + n) return;
    const msg = JSON.parse(buf.slice(i + 4, i + 4 + n).toString());
    buf = buf.slice(i + 4 + n);
    handle(msg);
  }
});
"#;

fn node_available() -> bool {
    std::process::Command::new("node")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn fixture(tag: &str) -> (PathBuf, PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let root = std::env::temp_dir().join(format!("octocode-lsp-proc-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("root");
    let root = root.canonicalize().expect("canonical root");
    let script = root.join("fake-lsp.js");
    std::fs::write(&script, FAKE_SERVER).expect("script");
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    std::fs::write(root.join("a.ts"), "const a = 1;\n").expect("source");
    (root, script)
}

fn config(root: &Path, script: &Path, pids: Option<&Path>) -> JsLanguageServerConfig {
    JsLanguageServerConfig {
        command: script.to_string_lossy().into_owned(),
        args: Some(Vec::new()),
        workspace_root: root.to_string_lossy().into_owned(),
        language_id: Some("plaintext".into()),
        initialization_options: None,
        env: pids.map(|pids| {
            [(
                "FAKE_LSP_PIDS".to_owned(),
                pids.to_string_lossy().into_owned(),
            )]
            .into_iter()
            .collect()
        }),
        max_memory_mb: None,
    }
}

fn alive(pid: &str) -> bool {
    std::process::Command::new("kill")
        .args(["-0", pid])
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

/// A server that dies mid-request fails the pending request fast with a
/// typed `ConnectionClosed` (`lsp.serverCrashed`), not a timeout.
#[test]
fn server_crash_mid_request_fails_pending_fast_as_server_crashed() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let (root, script) = fixture("crash");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let client = NativeLspClient::new(config(&root, &script, None));
        client.start().await.expect("fake server starts");
        let started = Instant::now();
        let error = tokio::time::timeout(
            Duration::from_secs(10),
            client.get_hover(root.join("a.ts").to_string_lossy().into_owned(), 0, 6),
        )
        .await
        .expect("pending request settles well before the request timeout")
        .expect_err("server crashed mid-request");
        assert!(
            matches!(error.kind(), ErrorKind::ConnectionClosed),
            "{error:?}"
        );
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "{:?}",
            started.elapsed()
        );
        assert_eq!(LspFailure::from_engine(&error).code, "serverCrashed");
        let _ = client.stop().await;
    });
    let _ = std::fs::remove_dir_all(root);
}

/// Repeated acquire/stop through the pool leaves no server or grandchild
/// process running.
#[test]
fn acquire_stop_loop_leaves_no_child_processes() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let (root, script) = fixture("leak");
    let pids = root.join("pids.txt");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let pool = LspClientPool::new(LspPoolOptions {
            idle_timeout_ms: 60_000,
            max_entries: 4,
            max_resident_bytes: 0,
        });
        let config = config(&root, &script, Some(&pids));
        for _ in 0..5 {
            let (client, lease) = pool
                .acquire_leased(config.clone())
                .await
                .expect("acquire")
                .expect("client");
            assert!(client.is_alive().await);
            drop(lease);
            assert!(pool.clear(&config).await.expect("clear"));
        }
        assert!(pool.is_empty());
    });
    let recorded = std::fs::read_to_string(&pids).expect("pid log");
    let recorded = recorded.lines().collect::<Vec<_>>();
    assert_eq!(recorded.len(), 10, "5 servers × (server + grandchild)");
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let survivors = recorded.iter().filter(|pid| alive(pid)).collect::<Vec<_>>();
        if survivors.is_empty() {
            break;
        }
        assert!(Instant::now() < deadline, "leaked processes: {survivors:?}");
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = std::fs::remove_dir_all(root);
}

/// A prewarm whose file is over the open cap (or unreadable) warmed
/// only the server, so it reports not-warm and frees its key; a small file
/// is opened and the warm completes.
#[test]
fn prewarm_frees_its_key_when_the_file_is_not_opened() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let (root, script) = fixture("prewarm");
    let large = root.join("large.ts");
    std::fs::write(&large, "x".repeat(2 * 1024 * 1024 + 1)).expect("large source");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let pool = LspClientPool::new(LspPoolOptions::default());
        let config = config(&root, &script, None);
        let file = |path: PathBuf| path.to_string_lossy().into_owned();
        assert!(
            !super::prewarm::warm(&pool, config.clone(), file(large.clone())).await,
            "an over-cap file is not a completed warm"
        );
        assert!(
            !super::prewarm::warm(&pool, config.clone(), file(root.join("missing.ts"))).await,
            "an unreadable file is not a completed warm"
        );
        assert!(super::prewarm::warm(&pool, config.clone(), file(root.join("a.ts"))).await);
        assert_eq!(pool.len(), 1, "every warm reused one pooled server");
        pool.clear_all().await;
    });
    let _ = std::fs::remove_dir_all(root);
}

/// A V8 (Node) server reserves address space far past its resident use; it
/// must start and answer under the default Linux memory policy (RSS watchdog,
/// no address-space cap).
#[cfg(target_os = "linux")]
#[test]
fn node_server_starts_under_the_default_address_space_cap() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let (root, script) = fixture("rlimit");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let client = NativeLspClient::new(config(&root, &script, None));
        client
            .start()
            .await
            .expect("node initializes under the default memory policy");
        assert!(client.is_alive().await);
        let _ = client.stop().await;
    });
    let _ = std::fs::remove_dir_all(root);
}

/// A real provider answers the first definition with an alias location, then
/// fails the follow-up. Useful locations survive, but identity stays partial.
#[test]
fn nested_definition_failure_keeps_location_with_partial_provenance() {
    use super::ops::Operation;
    use super::source::{SourceCache, snippet_policy};
    use crate::tools::cancel::NeverCancel;
    use serde_json::json;
    assert!(
        node_available(),
        "Node is required for the real LSP fixture"
    );
    for fail in [true, false] {
        let (root, script) = fixture(if fail {
            "definition-error"
        } else {
            "definition-ok"
        });
        std::fs::write(root.join("b.ts"), "const b = 1;\n").expect("alias source");
        let server = FAKE_SERVER
            .replace("hoverProvider: true", "definitionProvider: true")
            .replace(
                "  } else if (msg.method === 'textDocument/hover') {\n    process.exit(3);",
                &format!(r#"  }} else if (msg.method === 'textDocument/definition') {{
    if (msg.params.textDocument.uri.endsWith('/a.ts')) {{
      send({{jsonrpc:'2.0',id:msg.id,result:{{uri:msg.params.textDocument.uri.replace('/a.ts','/b.ts'),range:{{start:{{line:0,character:6}},end:{{line:0,character:7}}}}}}}});
    }} else if ({fail}) {{
      send({{jsonrpc:'2.0',id:msg.id,error:{{code:-32603,message:'injected follow-up failure'}}}});
    }} else {{
      send({{jsonrpc:'2.0',id:msg.id,result:[]}});
    }}"#),
            );
        std::fs::write(&script, server).expect("definition fixture server");
        let paths = crate::tools::test_support::workspace_policy(&root);
        let path = root.join("a.ts").to_string_lossy().into_owned();
        let uri = octocode_engine::lsp::uri::path_to_uri(&path).expect("uri");
        let query = serde_json::from_value(json!({
            "operation":"definition", "mainGoal":"test", "reasoning":"test",
            "path":uri, "symbolName":"x", "line":1
        }))
        .expect("query");
        tokio::runtime::Runtime::new().expect("rt").block_on(async {
            let client = NativeLspClient::new(config(&root, &script, None));
            client.start().await.expect("server starts");
            let mut sources = SourceCache::new(&paths);
            let policy = snippet_policy(&paths);
            let row = Operation {
                client: &client,
                query: &query,
                sources: &mut sources,
                snippet_policy: &policy,
                cancel: &NeverCancel,
                path: &path,
                scope: &super::scope::Scope::new(root.to_string_lossy().into_owned(), Vec::new()),
                root_only: false,
                line: 0,
                character: 6,
                language_id: Some("typescript"),
                budget: 16_000,
            }
            .run()
            .await
            .expect("definition row retains earlier evidence");
            let text = row.to_string();
            assert!(text.contains("b.ts"), "{row}");
            if fail {
                assert_eq!(row["isPartial"], true, "{row}");
                assert!(
                    row["partialReasons"]
                        .as_array()
                        .expect("reasons")
                        .contains(&json!("definitionHopFailed")),
                    "{row}"
                );
                assert!(text.contains("injected follow-up failure"), "{row}");
                assert!(text.contains("not verified terminal identity"), "{row}");
                assert_eq!(row["next"]["retry"]["tool"], "lspSearch");
            } else {
                assert!(
                    !row["partialReasons"]
                        .as_array()
                        .is_some_and(|reasons| reasons.contains(&json!("definitionHopFailed"))),
                    "{row}"
                );
                assert!(!text.contains("injected follow-up failure"), "{row}");
            }
            client.stop().await.expect("fixture server closed");
        });
        std::fs::remove_dir_all(root).expect("fixture removed");
    }
}

/// A server with no `typeHierarchyProvider` still answers supertypes and
/// subtypes: subtypes are its implementation answer (never the queried
/// declaration itself), supertypes are the definitions of the heritage
/// clause, and each row names its source.
#[test]
fn type_hierarchy_falls_back_when_the_server_has_no_type_hierarchy() {
    use super::ops::Operation;
    use super::source::{SourceCache, snippet_policy};
    use crate::tools::cancel::NeverCancel;
    use serde_json::json;
    assert!(
        node_available(),
        "Node is required for the real LSP fixture"
    );
    let (root, script) = fixture("type-hierarchy-fallback");
    std::fs::write(root.join("b.ts"), "export interface Base {}\n").expect("base");
    std::fs::write(root.join("a.ts"), "export class Child extends Base {}\n").expect("child");
    let server = FAKE_SERVER
        .replace(
            "hoverProvider: true",
            "implementationProvider: true, definitionProvider: true",
        )
        .replace(
            "  } else if (msg.method === 'textDocument/hover') {\n    process.exit(3);",
            r#"  } else if (msg.method === 'textDocument/implementation') {
    const dir = msg.params.textDocument.uri.slice(0, msg.params.textDocument.uri.lastIndexOf('/') + 1);
    const at = (name, line) => ({ uri: dir + name, range: { start: { line, character: 13 }, end: { line, character: 18 } } });
    send({ jsonrpc: '2.0', id: msg.id, result: [at('a.ts', 0), at('b.ts', 0)] });
  } else if (msg.method === 'textDocument/definition') {
    const dir = msg.params.textDocument.uri.slice(0, msg.params.textDocument.uri.lastIndexOf('/') + 1);
    send({ jsonrpc: '2.0', id: msg.id, result: [{ uri: dir + 'b.ts', range: { start: { line: 0, character: 17 }, end: { line: 0, character: 21 } } }] });"#,
        );
    std::fs::write(&script, server).expect("fixture server");
    let paths = crate::tools::test_support::workspace_policy(&root);
    let path = root.join("a.ts").to_string_lossy().into_owned();
    let uri = octocode_engine::lsp::uri::path_to_uri(&path).expect("uri");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let client = NativeLspClient::new(config(&root, &script, None));
        client.start().await.expect("server starts");
        for (operation, source) in [("subtypes", "implementation"), ("supertypes", "heritage")] {
            let query = serde_json::from_value(json!({
                "operation":operation, "mainGoal":"test", "reasoning":"test",
                "path":uri, "symbolName":"Child", "line":1
            }))
            .expect("query");
            let mut sources = SourceCache::new(&paths);
            let policy = snippet_policy(&paths);
            let row = Operation {
                client: &client,
                query: &query,
                sources: &mut sources,
                snippet_policy: &policy,
                cancel: &NeverCancel,
                path: &path,
                scope: &super::scope::Scope::new(root.to_string_lossy().into_owned(), Vec::new()),
                root_only: false,
                line: 0,
                character: 13,
                language_id: Some("typescript"),
                budget: 16_000,
            }
            .run()
            .await
            .unwrap_or_else(|error| panic!("{operation} fails without a hierarchy: {error:?}"));
            assert_eq!(row["lsp"]["source"], source, "{row}");
            let paths = row["matches"]
                .as_array()
                .expect("matches")
                .iter()
                .map(|found| found["path"].as_str().unwrap_or_default().to_owned())
                .collect::<Vec<_>>();
            assert!(
                paths.iter().all(|found| found.ends_with("b.ts")),
                "{operation} lists only other declarations: {row}"
            );
            assert_eq!(paths.len(), 1, "{row}");
        }
        client.stop().await.expect("fixture server closed");
    });
    std::fs::remove_dir_all(root).expect("fixture removed");
}

/// When the implementation request cannot be answered (here a server error;
/// a timeout takes the same path), `subtypes` is the heritage-clause scan
/// of every workspace file spelling the base: labelled rows, never a bare
/// failure.
#[test]
fn subtypes_fall_back_to_a_labelled_heritage_scan_when_implementation_fails() {
    use super::ops::Operation;
    use super::source::{SourceCache, snippet_policy};
    use crate::tools::cancel::NeverCancel;
    use serde_json::json;
    assert!(
        node_available(),
        "Node is required for the real LSP fixture"
    );
    let (root, script) = fixture("subtypes-scan");
    std::fs::write(root.join("b.ts"), "export interface Base {}\n").expect("base");
    std::fs::write(root.join("a.ts"), "export class Child extends Base {}\n").expect("child");
    std::fs::write(
        root.join("c.ts"),
        "export interface Wide extends Other, Base {}\n",
    )
    .expect("wide");
    std::fs::write(root.join("d.ts"), "export class Skip extends Other {}\n").expect("other");
    std::fs::write(root.join("e.ts"), "// Base\nconst x: Base = {};\n").expect("mention");
    let server = FAKE_SERVER
        .replace("hoverProvider: true", "implementationProvider: true")
        .replace(
            "  } else if (msg.method === 'textDocument/hover') {\n    process.exit(3);",
            r#"  } else if (msg.method === 'textDocument/implementation') {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Debug Failure' } });"#,
        );
    std::fs::write(&script, server).expect("fixture server");
    let paths = crate::tools::test_support::workspace_policy(&root);
    let path = root.join("b.ts").to_string_lossy().into_owned();
    let uri = octocode_engine::lsp::uri::path_to_uri(&path).expect("uri");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let client = NativeLspClient::new(config(&root, &script, None));
        client.start().await.expect("server starts");
        let query = serde_json::from_value(json!({
            "operation":"subtypes", "mainGoal":"test", "reasoning":"test",
            "path":uri, "symbolName":"Base", "line":1
        }))
        .expect("query");
        let mut sources = SourceCache::new(&paths);
        let policy = snippet_policy(&paths);
        let row = Operation {
            client: &client,
            query: &query,
            sources: &mut sources,
            snippet_policy: &policy,
            cancel: &NeverCancel,
            path: &path,
            scope: &super::scope::Scope::new(
                root.to_string_lossy().into_owned(),
                vec!["*.ts".into()],
            ),
            root_only: false,
            line: 0,
            character: 17,
            language_id: Some("typescript"),
            budget: 16_000,
        }
        .run()
        .await
        .unwrap_or_else(|error| panic!("a failed implementation request falls back: {error:?}"));
        assert_eq!(row["lsp"]["source"], "native-graph-facts", "{row}");
        let found = row["matches"]
            .as_array()
            .expect("matches")
            .iter()
            .map(|found| {
                Path::new(found["path"].as_str().unwrap_or_default())
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>();
        assert_eq!(found, ["a.ts", "c.ts"], "{row}");
        assert!(
            row["warnings"].to_string().contains("unverified"),
            "the rows are labelled unverified: {row}"
        );
        assert_contract_valid(&row);
        // The scan is a labelled stand-in: the same query, retried, asks the
        // server again.
        assert_eq!(row["next"]["retry"]["tool"], "lspSearch", "{row}");
        assert_eq!(row["isPartial"], true, "{row}");
        client.stop().await.expect("fixture server closed");
    });
    std::fs::remove_dir_all(root).expect("fixture removed");
}

/// Runs `operation` on `file`'s symbol (zero-based `line`/`character`)
/// against a server whose `textDocument/implementation` fails, over a
/// workspace where `Child` extends `Base` and `Impl` implements it.
fn implementation_failing_row(
    tag: &str,
    operation: &str,
    (file, symbol, line, character): (&str, &str, u32, u32),
) -> Result<serde_json::Value, super::LspFailure> {
    use super::ops::Operation;
    use super::source::{SourceCache, snippet_policy};
    use crate::tools::cancel::NeverCancel;
    use serde_json::json;
    assert!(
        node_available(),
        "Node is required for the real LSP fixture"
    );
    let (root, script) = fixture(tag);
    std::fs::write(
        root.join("b.ts"),
        "export interface Base {\n  run(): void;\n}\nexport class Plain {\n  go(): void {}\n}\n",
    )
    .expect("base");
    std::fs::write(root.join("a.ts"), "export class Child extends Base {}\n").expect("child");
    std::fs::write(
        root.join("c.ts"),
        "export class Impl implements Other, Base { run(): void {} }\n",
    )
    .expect("impl");
    std::fs::write(root.join("e.ts"), "// Base\nconst x: Base = {};\n").expect("mention");
    let server = FAKE_SERVER
        .replace("hoverProvider: true", "implementationProvider: true")
        .replace(
            "  } else if (msg.method === 'textDocument/hover') {\n    process.exit(3);",
            r#"  } else if (msg.method === 'textDocument/implementation') {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Debug Failure' } });"#,
        );
    std::fs::write(&script, server).expect("fixture server");
    let paths = crate::tools::test_support::workspace_policy(&root);
    let path = root.join(file).to_string_lossy().into_owned();
    let uri = octocode_engine::lsp::uri::path_to_uri(&path).expect("uri");
    let outcome = tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let client = NativeLspClient::new(config(&root, &script, None));
        client.start().await.expect("server starts");
        let query = serde_json::from_value(json!({
            "operation": operation, "mainGoal": "test", "reasoning": "test",
            "path": uri, "symbolName": symbol, "line": line + 1
        }))
        .expect("query");
        let mut sources = SourceCache::new(&paths);
        let policy = snippet_policy(&paths);
        let outcome = Operation {
            client: &client,
            query: &query,
            sources: &mut sources,
            snippet_policy: &policy,
            cancel: &NeverCancel,
            path: &path,
            scope: &super::scope::Scope::new(
                root.to_string_lossy().into_owned(),
                vec!["*.ts".into()],
            ),
            root_only: false,
            line,
            character,
            language_id: Some("typescript"),
            budget: 16_000,
        }
        .run()
        .await;
        client.stop().await.expect("fixture server closed");
        outcome
    });
    std::fs::remove_dir_all(root).expect("fixture removed");
    outcome
}

/// `implementation` on a type is answered by the same labelled heritage
/// scan as `subtypes` when the server cannot answer in time (a failed
/// request stands in for the timeout): rows by name, labelled unverified,
/// with a retry that asks the server again.
#[test]
fn implementation_on_a_type_falls_back_to_the_labelled_heritage_scan() {
    let row = implementation_failing_row("impl-scan", "implementation", ("b.ts", "Base", 0, 17))
        .unwrap_or_else(|error| panic!("a type anchor falls back: {error:?}"));
    assert_eq!(row["lsp"]["source"], "native-graph-facts", "{row}");
    assert_eq!(row["kind"], "implementation", "{row}");
    let files = row["matches"]
        .as_array()
        .expect("matches")
        .iter()
        .map(|found| {
            Path::new(found["path"].as_str().unwrap_or_default())
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    assert_eq!(files, ["a.ts", "c.ts"], "{row}");
    let warnings = row["warnings"].to_string();
    assert!(warnings.contains("unverified"), "{row}");
    assert!(
        warnings.contains("implementations") && !warnings.contains("subtypes are"),
        "the note speaks of the operation asked: {row}"
    );
    assert_eq!(row["isPartial"], true, "{row}");
    assert_eq!(row["next"]["retry"]["tool"], "lspSearch", "{row}");
    assert_eq!(
        row["next"]["retry"]["query"]["queries"][0]["operation"], "implementation",
        "{row}"
    );
    assert_contract_valid(&row);
}

/// A member has no heritage clause to scan: `implementation` on it keeps
/// the server failure (a scan would claim "no implementations").
#[test]
fn implementation_on_a_member_keeps_the_server_failure() {
    let failure =
        implementation_failing_row("impl-member", "implementation", ("b.ts", "run", 1, 2))
            .expect_err("no scan can answer a member");
    assert_eq!(failure.code, "requestFailed");
    assert!(!failure.hint.contains("workspaceRoot"), "{}", failure.hint);
}

/// A TS-like server that logs every request it answers: references from
/// the declaration miss `c.ts` (importer recovery finds it), and every
/// definition resolves to the declaration in `a.ts`.
const REUSE_SERVER: &str = r#"#!/usr/bin/env node
const fs = require('fs');
const log = process.env.FAKE_LSP_LOG;
let buf = Buffer.alloc(0);
function send(m) {
  const s = JSON.stringify(m);
  process.stdout.write('Content-Length: ' + Buffer.byteLength(s) + '\r\n\r\n' + s);
}
function at(uri, line, start, end) {
  return { uri, range: { start: { line, character: start }, end: { line, character: end } } };
}
function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { capabilities: { referencesProvider: true, definitionProvider: true, textDocumentSync: 1 } } });
    return;
  }
  if (msg.method === 'exit') process.exit(0);
  if (msg.id === undefined || !msg.method) return;
  fs.appendFileSync(log, msg.method + '\n');
  const uri = msg.params && msg.params.textDocument && msg.params.textDocument.uri;
  const dir = uri ? uri.slice(0, uri.lastIndexOf('/') + 1) : '';
  const decl = at(dir + 'a.ts', 0, 16, 19);
  if (msg.method === 'textDocument/definition') {
    send({ jsonrpc: '2.0', id: msg.id, result: [decl] });
  } else if (msg.method === 'textDocument/references') {
    const found = [decl, at(dir + 'b.ts', 1, 0, 3), at(dir + 'b.ts', 2, 0, 3)];
    if (uri.endsWith('/c.ts')) found.push(at(dir + 'c.ts', 1, 0, 3));
    send({ jsonrpc: '2.0', id: msg.id, result: found });
  } else {
    send({ jsonrpc: '2.0', id: msg.id, result: null });
  }
}
process.stdin.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) return;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, i).toString());
    const n = Number(m[1]);
    if (buf.length < i + 4 + n) return;
    const msg = JSON.parse(buf.slice(i + 4, i + 4 + n).toString());
    buf = buf.slice(i + 4 + n);
    handle(msg);
  }
});
"#;

/// A warm repeat of an incoming TS operation under an unchanged response
/// generation asks the server nothing, authorizes and reads each snippet
/// file once per request (however many responses name it), and answers
/// exactly what the cold call did.
#[test]
fn warm_references_repeat_sends_no_requests_and_reads_each_file_once() {
    use super::ops::Operation;
    use super::source::SourceCache;
    use crate::tools::cancel::NeverCancel;
    use octocode_engine::lsp::client::{RESPONSE_SCOPE, ResponseScope, SnippetReadPolicy};
    use serde_json::json;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    assert!(
        node_available(),
        "Node is required for the real LSP fixture"
    );
    let (root, script) = fixture("warm-reuse");
    std::fs::write(&script, REUSE_SERVER).expect("server");
    std::fs::write(root.join("a.ts"), "export function foo() {}\n").expect("a");
    std::fs::write(
        root.join("b.ts"),
        "import { foo } from './a';\nfoo();\nfoo();\n",
    )
    .expect("b");
    std::fs::write(root.join("c.ts"), "import { foo } from './a';\nfoo();\n").expect("c");
    let log = root.join("requests.log");
    let mut server = config(&root, &script, None);
    server.language_id = Some("typescript".into());
    server.env = Some(
        [(
            "FAKE_LSP_LOG".to_owned(),
            log.to_string_lossy().into_owned(),
        )]
        .into_iter()
        .collect(),
    );
    let paths = crate::tools::test_support::workspace_policy(&root);
    let path = root.join("a.ts").to_string_lossy().into_owned();
    let uri = octocode_engine::lsp::uri::path_to_uri(&path).expect("uri");
    let query = serde_json::from_value(json!({
        "operation":"references", "mainGoal":"test", "reasoning":"test",
        "path":uri, "symbolName":"foo", "line":1
    }))
    .expect("query");
    let requests = || {
        std::fs::read_to_string(&log)
            .unwrap_or_default()
            .lines()
            .count()
    };
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let client = NativeLspClient::new(server);
        client.start().await.expect("server starts");
        let authorized = Arc::new(AtomicUsize::new(0));
        // One request: its own snippet policy, canonical memo, and scope;
        // the response generation (anchor + scope fingerprint) is unchanged.
        let request = || {
            let (client, paths, query, path, root) = (&client, &paths, &query, &path, &root);
            let authorized = Arc::clone(&authorized);
            let generation = ResponseScope {
                reuse: true,
                generation: "anchor+fingerprint".into(),
            };
            RESPONSE_SCOPE.scope(
                std::cell::RefCell::new(generation),
                super::scope::with_canonical_memo(async move {
                    let policy = {
                        let paths = paths.clone();
                        SnippetReadPolicy::with_authorizer(move |file| {
                            authorized.fetch_add(1, Ordering::SeqCst);
                            paths.validate_read(file).ok().map(|valid| valid.canonical)
                        })
                        .shared_reads()
                    };
                    let scope = super::scope::Scope::new(
                        root.to_string_lossy().into_owned(),
                        vec!["*.ts".into()],
                    );
                    scope.set_fingerprint(format!("warm-reuse-{}", std::process::id()));
                    let mut sources = SourceCache::new(paths);
                    Operation {
                        client,
                        query,
                        sources: &mut sources,
                        snippet_policy: &policy,
                        cancel: &NeverCancel,
                        path,
                        scope: &scope,
                        root_only: false,
                        line: 0,
                        character: 16,
                        language_id: Some("typescript"),
                        budget: 16_000,
                    }
                    .run()
                    .await
                    .expect("references row")
                }),
            )
        };
        let cold = request().await;
        let cold_requests = requests();
        let cold_reads = authorized.swap(0, Ordering::SeqCst);
        assert!(
            cold.to_string().contains("c.ts"),
            "importer recovered: {cold}"
        );
        assert!(cold_requests > 0);
        // a.ts, b.ts, c.ts: once each, though several responses name them.
        assert_eq!(cold_reads, 3, "{cold}");
        let warm = request().await;
        assert_eq!(warm, cold);
        assert_eq!(
            requests(),
            cold_requests,
            "the warm repeat asked the server"
        );
        assert_eq!(authorized.load(Ordering::SeqCst), 3);
        client.stop().await.expect("fixture server closed");
    });
    std::fs::remove_dir_all(root).expect("fixture removed");
}

/// A TypeScript-like server whose project sees only the anchor file (an
/// inferred project): `references` from the anchor lists the declaration
/// alone; from an importer it lists the importer's own two sites plus a
/// shared site in `f000.ts`. Every position resolves to the declaration.
const IMPORTER_SERVER: &str = r#"#!/usr/bin/env node
const root = process.env.FAKE_ROOT || __ROOT__;
const declUri = 'file://' + root + '/a.ts';
const at = (line, character, length) => ({ start: { line, character }, end: { line, character: character + length } });
const decl = { uri: declUri, range: at(0, 16, 6) };
let buf = Buffer.alloc(0);
function send(m) {
  const s = JSON.stringify(m);
  process.stdout.write('Content-Length: ' + Buffer.byteLength(s) + '\r\n\r\n' + s);
}
function result(msg) {
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize':
      return { capabilities: { textDocumentSync: 1, definitionProvider: true, referencesProvider: true, callHierarchyProvider: true, documentSymbolProvider: true } };
    case 'textDocument/definition': {
      // `n*.ts` files mention the name but bind another declaration.
      const uri = p.textDocument.uri;
      const other = 'file://' + root + '/other.ts';
      if (/\/n\d+\.ts$/.test(uri)) return [{ uri: other, range: at(0, 16, 5) }];
      if (uri === other) return [{ uri, range: at(0, 16, 5) }];
      return [decl];
    }
    case 'textDocument/references': {
      const uri = p.textDocument.uri;
      if (uri === declUri) return [decl];
      return [{ uri, range: at(0, 9, 6) }, { uri, range: at(1, 0, 6) }, { uri: 'file://' + root + '/f000.ts', range: at(1, 0, 6) }];
    }
    case 'textDocument/prepareCallHierarchy':
      return [{ name: 'target', kind: 12, uri: declUri, range: at(0, 0, 28), selectionRange: decl.range }];
    case 'callHierarchy/incomingCalls':
    case 'textDocument/documentSymbol':
      return [];
    default:
      return null;
  }
}
function handle(msg) {
  if (msg.method === 'exit') process.exit(0);
  if (msg.id !== undefined && msg.method) send({ jsonrpc: '2.0', id: msg.id, result: result(msg) });
}
process.stdin.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const i = buf.indexOf('\r\n\r\n');
    if (i < 0) return;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, i).toString());
    const n = Number(m[1]);
    if (buf.length < i + 4 + n) return;
    const msg = JSON.parse(buf.slice(i + 4, i + 4 + n).toString());
    buf = buf.slice(i + 4 + n);
    handle(msg);
  }
});
"#;

/// Importer candidates in the fixture: 24 + 24 + 12 (three windows).
const IMPORTERS: usize = 60;

/// A workspace with `a.ts` declaring `target`, [`IMPORTERS`] files that
/// import and call it, the fake server, and an explicit server config.
fn importer_fixture(tag: &str) -> (PathBuf, super::LspExecutionConfig) {
    importer_fixture_of(tag, &[("f", IMPORTERS)])
}

/// Like [`importer_fixture`], with `layout` listing `(prefix, count)` runs of
/// files that spell `target`; candidates sort by name, so runs fill importer
/// windows in order. An `n` file spells the name but binds another
/// declaration (no reference); any other prefix imports and calls it.
fn importer_fixture_of(
    tag: &str,
    layout: &[(&str, usize)],
) -> (PathBuf, super::LspExecutionConfig) {
    use std::os::unix::fs::PermissionsExt;
    let root = std::env::temp_dir().join(format!(
        "octocode-lsp-importers-{tag}-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("root");
    let root = root.canonicalize().expect("canonical root");
    // The server script lives beside the workspace: it spells the symbol,
    // and a candidate scan must not count it.
    let script = root.with_extension("fake-ts-lsp.js");
    let source = IMPORTER_SERVER.replace(
        "__ROOT__",
        &serde_json::to_string(&root.to_string_lossy()).expect("root literal"),
    );
    std::fs::write(&script, source).expect("script");
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).expect("chmod");
    std::fs::write(root.join("tsconfig.json"), "{}\n").expect("tsconfig");
    std::fs::write(root.join("a.ts"), "export function target() {}\n").expect("anchor");
    std::fs::write(root.join("other.ts"), "export function other() {}\n").expect("other");
    for (prefix, count) in layout {
        for index in 0..*count {
            write_importer(&root, &format!("{prefix}{index:03}.ts"));
        }
    }
    let config = root.join("lsp-servers.json");
    std::fs::write(
        &config,
        serde_json::json!({"languageServers": {".ts": {
            "command": script.to_string_lossy(), "args": [], "languageId": "typescript"
        }}})
        .to_string(),
    )
    .expect("config");
    let execution = super::LspExecutionConfig {
        config_path: Some(config.to_string_lossy().into_owned()),
        ..super::LspExecutionConfig::default()
    };
    (root, execution)
}

fn remove_importer_fixture(root: &Path) {
    let _ = std::fs::remove_file(root.with_extension("fake-ts-lsp.js"));
    let _ = std::fs::remove_dir_all(root);
}

fn write_importer(root: &Path, name: &str) {
    std::fs::write(
        root.join(name),
        "import { target } from './a';\ntarget();\n",
    )
    .expect("importer");
}

/// One page as the public response validates it.
fn assert_contract_valid(row: &serde_json::Value) {
    let mut out = serde_json::json!({"results":[{"index":0,"data":row}]});
    crate::response::continuations::finalize(
        &mut out,
        crate::tools::id::ToolId::LspSearch,
        &crate::response::continuations::Sources::Rows(&[]),
        &crate::response::continuations::Scope::everything(),
    )
    .expect("valid continuations");
    crate::contracts::validate_output("lspSearch", &out).expect("page satisfies the contract");
}

/// The single query row of a continuation.
fn next_row(row: &serde_json::Value, name: &str) -> Option<serde_json::Value> {
    row.pointer(&format!("/next/{name}/query/queries/0"))
        .cloned()
}

/// One walked page: the row and the importer page it belongs to.
struct Walked {
    importer_page: u64,
    row: serde_json::Value,
}

/// Run `start`, then every `next.nextPage`, then every
/// `next.nextImporterPage`, until neither is left. Also returns the
/// continuations seen, by name, for stale checks.
async fn walk_pages(
    pool: &LspClientPool,
    root: &Path,
    execution: &super::LspExecutionConfig,
    start: serde_json::Value,
) -> (Vec<Walked>, Vec<(String, serde_json::Value)>) {
    let paths = crate::tools::test_support::workspace_policy(root);
    let mut pages = Vec::new();
    let mut continuations = Vec::new();
    let mut next = Some(start);
    while let Some(row) = next.take() {
        assert!(pages.len() < 40, "the walk terminates");
        let importer_page = row
            .get("importerPage")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(1);
        let query = serde_json::from_value(row).expect("continuation is a valid query");
        let result = super::execute(
            query,
            &crate::tools::cancel::NeverCancel,
            pool,
            &paths,
            execution,
            None,
        )
        .await
        .expect("page");
        assert_ne!(result["status"], "error", "{result}");
        assert_contract_valid(&result);
        let page = next_row(&result, "nextPage");
        let importer = next_row(&result, "nextImporterPage");
        assert!(
            page.is_none() || importer.is_none(),
            "nextImporterPage only on a window's last location page: {result}"
        );
        for (name, call) in [("nextPage", &page), ("nextImporterPage", &importer)] {
            if let Some(call) = call {
                continuations.push((name.to_owned(), call.clone()));
            }
        }
        next = page.or(importer);
        pages.push(Walked {
            importer_page,
            row: result,
        });
    }
    (pages, continuations)
}

/// `(file name, line, column)` of every reference row on a page.
fn reference_rows(row: &serde_json::Value) -> Vec<(String, u64, u64)> {
    let mut rows = Vec::new();
    for file in row
        .pointer("/files")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
    {
        let name = Path::new(file["path"].as_str().expect("path"))
            .file_name()
            .expect("file name")
            .to_string_lossy()
            .into_owned();
        for site in file["matches"].as_array().expect("matches") {
            rows.push((
                name.clone(),
                site["line"].as_u64().expect("line"),
                site["column"].as_u64().expect("column"),
            ));
        }
    }
    rows
}

/// Walks `operation` over a workspace whose first window imports `target`,
/// then `silent` files that spell it without binding it, then one importer.
async fn walk_across_silent_windows(
    tag: &str,
    operation: &str,
    silent: usize,
) -> (PathBuf, Vec<Walked>) {
    let (root, execution) = importer_fixture_of(tag, &[("f", 24), ("n", silent), ("z", 1)]);
    let pool = LspClientPool::new(LspPoolOptions::default());
    let start = serde_json::json!({
        "operation": operation, "path": root.join("a.ts").to_string_lossy(),
        "symbolName": "target", "line": 1, "pageSize": 100,
        "workspaceRoot": root.to_string_lossy()
    });
    let (pages, _) = walk_pages(&pool, &root, &execution, start).await;
    (root, pages)
}

/// An importer window with no verified site is a step of a continuing scan,
/// not an empty answer: the request goes on to the next window, so a later
/// page always lists sites or ends the scan, and the sites past the silent
/// windows are one `next.nextImporterPage` away.
#[test]
fn importer_windows_without_sites_are_skipped_not_returned_empty() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    for operation in ["references", "callers"] {
        let (root, pages) =
            tokio::runtime::Runtime::new()
                .expect("rt")
                .block_on(walk_across_silent_windows(
                    &format!("skip-{operation}"),
                    operation,
                    48,
                ));
        // Windows: f000-f023 | n000-n023 | n024-n047 | z000.
        assert_eq!(
            pages.len(),
            2,
            "{operation}: the silent windows cost no page"
        );
        let landed = &pages[1].row;
        assert!(landed.get("status").is_none(), "{operation}: {landed}");
        assert!(
            landed.to_string().contains("z000.ts"),
            "{operation}: the importer behind the silent windows is listed: {landed}"
        );
        assert!(landed.get("isPartial").is_none(), "{operation}: {landed}");
        remove_importer_fixture(&root);
    }
}

/// The first page is no exception: when its windows, up to the request cap,
/// held no site and the scan goes on, it is a page of a continuing scan
/// (exit 0 with the importer lead), never an `empty` result.
#[test]
fn a_first_page_of_silent_windows_with_more_to_scan_is_not_empty() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let silent = 24 * (super::importers::MAX_WINDOWS_PER_REQUEST + 2);
    for operation in ["references", "callers"] {
        let (root, execution) =
            importer_fixture_of(&format!("first-{operation}"), &[("n", silent), ("z", 1)]);
        let pool = LspClientPool::new(LspPoolOptions::default());
        let start = serde_json::json!({
            "operation": operation, "path": root.join("a.ts").to_string_lossy(),
            "symbolName": "target", "line": 1, "pageSize": 100,
            "workspaceRoot": root.to_string_lossy()
        });
        let (pages, _) = tokio::runtime::Runtime::new()
            .expect("rt")
            .block_on(walk_pages(&pool, &root, &execution, start));
        let first = &pages[0].row;
        assert_ne!(
            first.get("status").and_then(serde_json::Value::as_str),
            Some("empty"),
            "{operation}: {first}"
        );
        assert!(
            first["next"]["nextImporterPage"].is_object(),
            "{operation}: {first}"
        );
        assert!(
            pages
                .last()
                .is_some_and(|page| page.row.to_string().contains("z000.ts")),
            "{operation}: the walk reaches the importer past the silent windows"
        );
        remove_importer_fixture(&root);
    }
}

/// A request skips at most [`super::importers::MAX_WINDOWS_PER_REQUEST`] windows. A
/// page that ends there with no site says so plainly: it is a successful
/// page of a scan that continues (never an `empty` result), its note names
/// the candidates verified, and `next.nextImporterPage` reaches the rest.
#[test]
fn a_capped_run_of_silent_windows_is_a_page_of_a_continuing_scan() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let silent = 24 * (super::importers::MAX_WINDOWS_PER_REQUEST + 2);
    for operation in ["references", "callers"] {
        let (root, pages) =
            tokio::runtime::Runtime::new()
                .expect("rt")
                .block_on(walk_across_silent_windows(
                    &format!("cap-{operation}"),
                    operation,
                    silent,
                ));
        assert_eq!(pages.len(), 3, "{operation}: first, capped, landing");
        let capped = &pages[1].row;
        assert!(
            capped.get("status").is_none(),
            "{operation}: a page of a continuing scan is not an empty result: {capped}"
        );
        assert!(capped["next"]["nextImporterPage"].is_object(), "{capped}");
        assert_eq!(capped["isPartial"], true, "{capped}");
        let said = capped.to_string();
        assert!(
            said.contains("held no reference to this symbol") && said.contains("scan continues"),
            "{operation}: {capped}"
        );
        // One counter: sites are paged by `pagination`, the scan is told in
        // candidates, never as a second "page" count.
        assert!(!said.contains("importer page"), "{operation}: {capped}");
        assert!(pages[2].row.to_string().contains("z000.ts"), "{operation}");
        remove_importer_fixture(&root);
    }
}

/// References past the importer cap: walking `nextPage` then
/// `nextImporterPage` reaches every importer file in exactly one window,
/// lists every row once (a recovered row in another window's file waits for
/// that window), and only importer page 1 lists the anchor's own answer.
/// A changed candidate list stales both a window's entry and its later
/// location pages, and the restart walks from the first window again.
#[test]
fn importer_pages_reach_every_reference_exactly_once() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let (root, execution) = importer_fixture("refs");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let pool = LspClientPool::new(LspPoolOptions::default());
        let start = serde_json::json!({
            "operation": "references", "path": root.join("a.ts").to_string_lossy(),
            "symbolName": "target", "line": 1, "pageSize": 10,
            "workspaceRoot": root.to_string_lossy()
        });
        let (pages, continuations) = walk_pages(&pool, &root, &execution, start.clone()).await;
        let windows = pages
            .iter()
            .map(|page| page.importer_page)
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(windows.into_iter().collect::<Vec<_>>(), vec![1, 2, 3]);
        let mut seen = std::collections::BTreeMap::new();
        for page in &pages {
            for row in reference_rows(&page.row) {
                if row.0 == "a.ts" {
                    assert_eq!(
                        page.importer_page, 1,
                        "only importer page 1 lists the anchor"
                    );
                }
                if let Some(earlier) = seen.insert(row.clone(), page.importer_page) {
                    panic!(
                        "{row:?} listed twice (windows {earlier} and {})",
                        page.importer_page
                    );
                }
            }
        }
        let mut expected = vec![("a.ts".to_owned(), 1, 17)];
        for index in 0..IMPORTERS {
            let name = format!("f{index:03}.ts");
            expected.push((name.clone(), 1, 10));
            expected.push((name, 2, 1));
        }
        expected.sort();
        assert_eq!(
            seen.keys().cloned().collect::<Vec<_>>(),
            expected,
            "no gaps"
        );
        // Each importer file is listed by its own window: f000-f023 in 1,
        // f024-f047 in 2, f048-f059 in 3.
        for ((name, _, _), window) in &seen {
            if let Some(index) = name
                .strip_prefix('f')
                .and_then(|rest| rest.strip_suffix(".ts"))
                .and_then(|index| index.parse::<usize>().ok())
            {
                assert_eq!(*window as usize, index / 24 + 1, "{name}");
            }
        }
        // Only the last window's last page is complete; earlier windows are
        // partial, never a terminal limit.
        for page in &pages {
            assert!(page.row.get("terminalLimit").is_none(), "{}", page.row);
        }
        let last = &pages.last().expect("pages").row;
        assert!(last.get("isPartial").is_none(), "{last}");
        let first = &pages[0].row;
        assert_eq!(first["isPartial"], true, "{first}");
        assert!(
            first["partialReasons"]
                .as_array()
                .is_some_and(|reasons| reasons.contains(&"importerScanCapped".into())),
            "{first}"
        );

        // A new candidate stales the second window's entry and its later
        // location page alike; the restart has no importer cursor.
        let entry = continuations
            .iter()
            .find(|(name, _)| name == "nextImporterPage")
            .map(|(_, row)| row.clone())
            .expect("a window entry");
        let inside = continuations
            .iter()
            .find(|(name, row)| name == "nextPage" && row["importerPage"] == 2)
            .map(|(_, row)| row.clone())
            .expect("a later location page of window 2");
        write_importer(&root, "f000a.ts");
        let paths = crate::tools::test_support::workspace_policy(&root);
        for stale in [entry, inside] {
            let query = serde_json::from_value(stale).expect("query");
            let row = super::execute(
                query,
                &crate::tools::cancel::NeverCancel,
                &pool,
                &paths,
                &execution,
                None,
            )
            .await
            .expect("stale page");
            assert_eq!(row["errorCode"], "staleSnapshot", "{row}");
            let restart = next_row(&row, "restart").expect("restart");
            assert!(restart.get("importerPage").is_none(), "{restart}");
            assert!(restart.get("snapshot").is_none(), "{restart}");
            assert_eq!(restart["page"], 1, "{restart}");
        }
        // The restart walks the changed list once more: 61 importers.
        let (pages, _) = walk_pages(&pool, &root, &execution, start).await;
        let rows = pages
            .iter()
            .flat_map(|page| reference_rows(&page.row))
            .collect::<Vec<_>>();
        let unique = rows.iter().collect::<std::collections::BTreeSet<_>>();
        assert_eq!(rows.len(), unique.len(), "no duplicates after restart");
        assert_eq!(rows.len(), 1 + 2 * (IMPORTERS + 1));
    });
    remove_importer_fixture(&root);
}

/// Callers past the importer cap: each importer file's reference-derived
/// caller is listed once, by its own window, and later windows leave out
/// the anchor's walk.
#[test]
fn importer_pages_reach_every_caller_exactly_once() {
    if !node_available() {
        eprintln!("skipping: node not available");
        return;
    }
    let (root, execution) = importer_fixture("callers");
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let pool = LspClientPool::new(LspPoolOptions::default());
        let start = serde_json::json!({
            "operation": "callers", "path": root.join("a.ts").to_string_lossy(),
            "symbolName": "target", "line": 1, "pageSize": 10,
            "workspaceRoot": root.to_string_lossy()
        });
        let (pages, _) = walk_pages(&pool, &root, &execution, start).await;
        let mut callers = Vec::new();
        for page in &pages {
            for file in page
                .row
                .pointer("/files")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
            {
                let name = Path::new(file["path"].as_str().expect("path"))
                    .file_name()
                    .expect("file name")
                    .to_string_lossy()
                    .into_owned();
                for _ in file["matches"].as_array().expect("matches") {
                    callers.push((name.clone(), page.importer_page));
                }
            }
        }
        callers.sort();
        let expected = (0..IMPORTERS)
            .map(|index| (format!("f{index:03}.ts"), (index / 24 + 1) as u64))
            .collect::<Vec<_>>();
        assert_eq!(
            callers, expected,
            "every importer's caller once, in its window"
        );
    });
    remove_importer_fixture(&root);
}

/// tsserver answers when octocode's tsgo cannot start, and the answer
/// says so; a target without a fallback still fails as `serverUnavailable`.
#[test]
fn a_tsgo_that_fails_to_start_falls_back_to_tsserver_and_says_so() {
    use super::{Exit, Target, acquire_leased_client};
    use crate::tools::cancel::NeverCancel;
    use serde_json::json;
    assert!(
        node_available(),
        "Node is required for the real LSP fixture"
    );
    let (root, script) = fixture("tsgo-fallback");
    let missing = root.join("no-such-tsgo");
    let path = root.join("a.ts").to_string_lossy().into_owned();
    let uri = octocode_engine::lsp::uri::path_to_uri(&path).expect("uri");
    let query: super::LspSearchQuery = serde_json::from_value(json!({
        "operation":"hover", "mainGoal":"test", "reasoning":"test",
        "path":uri, "symbolName":"a", "line":1
    }))
    .expect("query");
    let target = |fallback| Target {
        path: path.clone(),
        uri: uri.clone(),
        root_only: false,
        config: config(&root, &missing, None),
        fallback,
    };
    tokio::runtime::Runtime::new().expect("rt").block_on(async {
        let pool = LspClientPool::new(LspPoolOptions {
            idle_timeout_ms: 60_000,
            max_entries: 4,
            max_resident_bytes: 0,
        });
        let fallback = config(&root, &script, None);
        let leased =
            acquire_leased_client(&query, &target(Some(fallback.clone())), &pool, &NeverCancel)
                .await
                .map_err(|_| "the fallback must answer")
                .expect("leased");
        assert_eq!(leased.config.command, fallback.command);
        let reason = leased
            .fell_back_from
            .as_deref()
            .expect("fallback disclosed");
        assert!(reason.contains("no-such-tsgo"), "{reason}");
        assert!(leased.client.is_alive().await);

        // The failed key sits in its start backoff: the next request falls
        // back at once instead of retrying the broken server.
        let again = acquire_leased_client(&query, &target(Some(fallback)), &pool, &NeverCancel)
            .await
            .map_err(|_| "the fallback must answer")
            .expect("leased again");
        assert!(again.fell_back_from.is_some());

        match acquire_leased_client(&query, &target(None), &pool, &NeverCancel).await {
            Err(Exit::Row(row)) => {
                assert_eq!(row["errorCode"], "serverUnavailable", "{row}");
            }
            _ => panic!("no fallback means a serverUnavailable row"),
        }
        drop(leased);
        drop(again);
        pool.clear_all().await;
    });
    std::fs::remove_dir_all(root).expect("fixture removed");
}
