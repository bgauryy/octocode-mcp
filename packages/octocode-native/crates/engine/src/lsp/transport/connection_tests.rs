use super::super::codec::{Frame, encode_frame, read_frame};
use super::super::patience::{DEADLINE_RESERVE, with_caller_deadline};
use super::*;
use crate::error::{ErrorCode, ErrorKind};
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncBufReadExt, DuplexStream, ReadBuf, duplex};

/// The fake server's two pipe ends.
struct Server {
    reader: BufReader<DuplexStream>,
    writer: DuplexStream,
}

impl Server {
    async fn read_message(&mut self) -> Value {
        match read_frame(&mut self.reader).await {
            Ok(Frame::Body(body)) => serde_json::from_slice(&body).expect("client sent valid JSON"),
            other => panic!("expected a client frame, got {other:?}"),
        }
    }

    async fn send(&mut self, message: Value) {
        let frame = encode_frame(&message).expect("encode");
        self.writer.write_all(&frame).await.expect("server write");
        self.writer.flush().await.expect("server flush");
    }

    async fn send_raw(&mut self, bytes: &[u8]) {
        self.writer.write_all(bytes).await.expect("server write");
    }
}

fn context() -> ClientRequestContext {
    ClientRequestContext {
        configuration: json!({"gopls": {"a": 1}}),
        section_root: None,
        workspace_folders: json!([{ "uri": "file:///w", "name": "workspace" }]),
    }
}

fn connect_with_buffer(client_to_server: usize) -> (JsonRpcConnection, Server) {
    let (client_w, server_r) = duplex(client_to_server);
    let (server_w, client_r) = duplex(64 * 1024);
    let connection =
        JsonRpcConnection::new(client_r, client_w, context(), ProgressTracker::new(), None);
    (
        connection,
        Server {
            reader: BufReader::new(server_r),
            writer: server_w,
        },
    )
}

fn connect() -> (JsonRpcConnection, Server) {
    connect_with_buffer(64 * 1024)
}

fn pending_len(connection: &JsonRpcConnection) -> Option<usize> {
    connection
        .shared
        .pending
        .lock()
        .expect("pending lock")
        .as_ref()
        .map(HashMap::len)
}

async fn wait_until_dead(connection: &JsonRpcConnection) {
    for _ in 0..100 {
        if !connection.is_alive() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("connection should be marked dead");
}

/// A writer whose pipe never drains: models a server that stopped reading stdin.
struct StalledWriter;

impl AsyncWrite for StalledWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _: &mut Context<'_>,
        _: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Poll::Pending
    }
    fn poll_flush(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Pending
    }
    fn poll_shutdown(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Poll::Pending
    }
}

/// A reader that never yields bytes.
struct SilentReader;

impl AsyncRead for SilentReader {
    fn poll_read(
        self: Pin<&mut Self>,
        _: &mut Context<'_>,
        _: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Poll::Pending
    }
}

#[test]
fn notify_write_deadline_scales_with_payload_size() {
    assert_eq!(notify_write_deadline_ms(0), NOTIFY_BASE_DEADLINE_MS);
    assert_eq!(notify_write_deadline_ms(1_024), NOTIFY_BASE_DEADLINE_MS);
    assert_eq!(
        notify_write_deadline_ms(3 * 1024 * 1024),
        NOTIFY_BASE_DEADLINE_MS + 3 * NOTIFY_MS_PER_MIB
    );
    assert!(notify_write_deadline_ms(8 * 1024 * 1024) > notify_write_deadline_ms(1024 * 1024));
}

#[tokio::test]
async fn request_with_partials_collects_progress_before_final_response() {
    let (connection, mut server) = connect();
    let server_task = tokio::spawn(async move {
        let request = server.read_message().await;
        let token = request["params"]["partialResultToken"].clone();
        let id = request["id"].clone();
        server
            .send(json!({"jsonrpc":"2.0","method":"$/progress","params":{"token":token,"value":[{"uri":"partial"}]}}))
            .await;
        server
            .send(json!({"jsonrpc":"2.0","id":id,"result":[{"uri":"final"}]}))
            .await;
        server
    });
    let result = connection
        .request_with_partials("textDocument/references", json!({}), 1_000)
        .await
        .expect("partial request");
    let _server = server_task.await.expect("server");
    assert_eq!(result, json!([{"uri":"partial"},{"uri":"final"}]));
    assert_eq!(connection.shared.partial_results.len(), 0);
}

#[tokio::test]
async fn partial_chunks_with_a_kind_field_are_results_not_progress() {
    let (connection, mut server) = connect();
    let server_task = tokio::spawn(async move {
        let request = server.read_message().await;
        let token = request["params"]["partialResultToken"].clone();
        server
            .send(json!({"jsonrpc":"2.0","method":"$/progress","params":{"token":token,"value":{"kind":"full","items":[1]}}}))
            .await;
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"result":{"kind":"full","items":[2]}}))
            .await;
        server
    });
    let result = connection
        .request_with_partials("textDocument/diagnostic", json!({}), 1_000)
        .await
        .expect("partial request");
    let _server = server_task.await.expect("server");
    assert_eq!(result, json!({"kind":"full","items":[1,2]}));
}

#[tokio::test(start_paused = true)]
async fn dropped_partial_request_releases_its_token_buffer() {
    let (connection, mut server) = connect();
    let dropped = tokio::time::timeout(
        Duration::from_millis(10),
        connection.request_with_partials("textDocument/references", json!({}), 5_000),
    )
    .await;
    assert!(dropped.is_err(), "outer timeout drops the request future");
    let request = server.read_message().await;
    assert_eq!(connection.shared.partial_results.len(), 0);
    // A late chunk for the released token is ignored, not buffered.
    server
        .send(json!({"jsonrpc":"2.0","method":"$/progress","params":{"token":request["params"]["partialResultToken"],"value":[1]}}))
        .await;
    tokio::task::yield_now().await;
    assert_eq!(connection.shared.partial_results.len(), 0);
}

#[tokio::test]
async fn rust_analyzer_server_status_feeds_progress_readiness() {
    let (client_w, server_r) = duplex(64 * 1024);
    let (server_w, client_r) = duplex(64 * 1024);
    let progress = ProgressTracker::new();
    let _connection =
        JsonRpcConnection::new(client_r, client_w, context(), Arc::clone(&progress), None);
    let mut server = Server {
        reader: BufReader::new(server_r),
        writer: server_w,
    };
    let mut active = progress.subscribe();
    server
        .send(json!({"jsonrpc":"2.0","method":"experimental/serverStatus","params":{"health":"ok","quiescent":false}}))
        .await;
    tokio::time::timeout(Duration::from_secs(5), active.wait_for(|count| *count == 1))
        .await
        .expect("non-quiescent status opens a progress token")
        .expect("tracker alive");
    server
        .send(json!({"jsonrpc":"2.0","method":"experimental/serverStatus","params":{"health":"ok","quiescent":true}}))
        .await;
    tokio::time::timeout(Duration::from_secs(5), active.wait_for(|count| *count == 0))
        .await
        .expect("quiescent status closes it")
        .expect("tracker alive");
}

#[tokio::test]
async fn connection_is_alive_until_the_server_stream_closes() {
    let (connection, server) = connect();
    assert!(connection.is_alive());
    drop(server);
    wait_until_dead(&connection).await;
}

#[tokio::test]
async fn connection_caches_push_diagnostics_for_bounded_on_demand_reads() {
    let (connection, mut server) = connect();
    server
        .send(json!({
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {
                "uri": "file:///workspace/a.ts",
                "version": 3,
                "diagnostics": [{ "message": "broken" }]
            }
        }))
        .await;
    let report = connection
        .wait_for_push_diagnostics("file:///workspace/a.ts", 1_000, Some(3))
        .await
        .expect("push diagnostics report");
    assert_eq!(report["kind"], "full");
    assert_eq!(report["version"], 3);
    assert_eq!(report["items"][0]["message"], "broken");

    connection.clear_push_diagnostics("file:///workspace/a.ts");
    assert!(
        connection
            .wait_for_push_diagnostics("file:///workspace/a.ts", 1, Some(3))
            .await
            .is_none()
    );
}

#[tokio::test]
async fn lengthless_frame_is_skipped_and_string_ids_route() {
    let (connection, mut server) = connect();
    let server_task = tokio::spawn(async move {
        let request = server.read_message().await;
        server.send_raw(b"\r\n").await;
        let id = request["id"].as_u64().expect("integer id").to_string();
        server
            .send(json!({"jsonrpc":"2.0","id":id,"result":{"ok":true}}))
            .await;
        server
    });
    let value = connection
        .request("x", Value::Null, 1_000)
        .await
        .expect("response routed");
    assert_eq!(value, json!({"ok": true}));
    let _server = server_task.await;
    assert!(connection.is_alive());
}

#[tokio::test]
async fn concurrent_requests_resolve_out_of_order() {
    let (connection, mut server) = connect();
    let connection = Arc::new(connection);
    let first = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("a", Value::Null, 5_000).await }
    });
    let second = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("b", Value::Null, 5_000).await }
    });
    let one = server.read_message().await;
    let two = server.read_message().await;
    for request in [two, one] {
        let method = request["method"].clone();
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"result":method}))
            .await;
    }
    assert_eq!(first.await.expect("join").expect("a"), json!("a"));
    assert_eq!(second.await.expect("join").expect("b"), json!("b"));
}

#[tokio::test]
async fn rpc_errors_are_typed_through_the_connection() {
    let (connection, mut server) = connect();
    let server_task = tokio::spawn(async move {
        let request = server.read_message().await;
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32801,"message":"content modified"}}))
            .await;
        server
    });
    let error = connection
        .request("x", Value::Null, 1_000)
        .await
        .expect_err("rpc error");
    let _server = server_task.await;
    assert_eq!(
        error.rpc_error().map(|error| error.code),
        Some(ErrorCode::ContentModified)
    );
    assert!(error.reason.contains("content modified"));
    assert!(
        connection.is_alive(),
        "an RPC error is not a transport fault"
    );
}

#[tokio::test(start_paused = true)]
async fn request_timeout_bounds_a_blocked_write() {
    let (client_w, _server_r) = duplex(1);
    let (_server_w, client_r) = duplex(8192);
    let connection =
        JsonRpcConnection::new(client_r, client_w, context(), ProgressTracker::new(), None);
    let error = connection
        .request("blocked", Value::Null, 20)
        .await
        .expect_err("write cannot complete");
    assert!(error.reason.contains("timed out"), "{}", error.reason);
    assert_eq!(
        pending_len(&connection),
        None,
        "pending map taken on failure"
    );
    assert!(
        !connection.is_alive(),
        "a partial frame cannot be safely reused"
    );
}

#[tokio::test(start_paused = true)]
async fn request_timeout_bounds_a_blocked_cancellation() {
    let frame_size =
        encode_frame(&json!({"jsonrpc":"2.0","id":1,"method":"blocked","params":null}))
            .expect("encode")
            .len();
    let (connection, _server) = connect_with_buffer(frame_size);
    let started = Instant::now();
    let error = connection
        .request("blocked", Value::Null, 20)
        .await
        .expect_err("response timed out");
    assert!(error.reason.contains("timed out"));
    assert!(started.elapsed() <= Duration::from_millis(20 + CANCEL_WRITE_WAIT_MS));
    assert!(!connection.is_alive());
}

/// One slow request is cancelled with `$/cancelRequest` and the server is
/// kept: the next request on the same connection is answered, with no
/// retirement (and so no cold restart by the pool).
#[tokio::test(start_paused = true)]
async fn timed_out_request_sends_cancel_and_keeps_the_connection() {
    let (connection, mut server) = connect();
    let error = connection
        .request("textDocument/references", Value::Null, 50)
        .await
        .expect_err("server never answers in time");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert!(error.reason.contains("timed out"));
    assert!(
        connection.is_alive(),
        "one slow request does not retire the server"
    );
    assert_eq!(pending_len(&connection), Some(0), "entry freed on timeout");
    assert_eq!(server.read_message().await["id"], 1);
    let cancel = server.read_message().await;
    assert_eq!(cancel["method"], "$/cancelRequest");
    assert_eq!(cancel["params"]["id"], 1);
    // The server acknowledges the cancel late; the next request is answered.
    server
        .send(json!({"jsonrpc":"2.0","id":1,"error":{"code":-32800,"message":"cancelled"}}))
        .await;
    let answer = tokio::spawn(async move {
        let request = server.read_message().await;
        assert_eq!(request["method"], "textDocument/definition");
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"result":[]}))
            .await;
        server
    });
    assert_eq!(
        connection
            .request("textDocument/definition", Value::Null, 5_000)
            .await
            .expect("same server answers the next request"),
        json!([])
    );
    let _server = answer.await;
    assert!(connection.is_alive());
}

/// An answered request between two timeouts resets the count: only
/// back-to-back timeouts retire the server.
#[tokio::test(start_paused = true)]
async fn an_answered_request_resets_the_timeout_count() {
    let (connection, mut server) = connect();
    let connection = Arc::new(connection);
    assert!(connection.request("slow", Value::Null, 50).await.is_err());
    assert_eq!(server.read_message().await["method"], "slow");
    assert_eq!(server.read_message().await["method"], "$/cancelRequest");
    let answered = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("quick", Value::Null, 5_000).await }
    });
    let request = server.read_message().await;
    server
        .send(json!({"jsonrpc":"2.0","id":request["id"],"result":"ok"}))
        .await;
    assert_eq!(answered.await.expect("join").expect("quick"), json!("ok"));
    assert!(connection.request("slow", Value::Null, 50).await.is_err());
    assert!(
        connection.is_alive(),
        "a timeout after an answered request is again the first"
    );
}

#[tokio::test(start_paused = true)]
async fn second_consecutive_timeout_retires_the_connection() {
    let (connection, mut server) = connect();
    for _ in 0..RETIRE_AFTER_TIMEOUTS {
        let error = connection
            .request("textDocument/definition", Value::Null, 50)
            .await
            .expect_err("server never answers");
        assert_eq!(error.kind(), &ErrorKind::Timeout);
    }
    assert!(
        !connection.is_alive(),
        "a server that answers nothing across timeouts is retired as wedged"
    );
    for id in 1..=u64::from(RETIRE_AFTER_TIMEOUTS) {
        assert_eq!(server.read_message().await["id"], id);
        let cancel = server.read_message().await;
        assert_eq!(cancel["method"], "$/cancelRequest");
        assert_eq!(cancel["params"]["id"], id);
    }
}

#[tokio::test(start_paused = true)]
async fn retirement_fails_all_pending_immediately() {
    let (connection, _server) = connect();
    let connection = Arc::new(connection);
    let started = Instant::now();
    let slow = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move {
            let result = connection.request("slow", Value::Null, 60_000).await;
            (result, Instant::now())
        }
    });
    tokio::task::yield_now().await;
    let _ = connection.request("fast", Value::Null, 100).await;
    assert!(connection.is_alive(), "first timeout keeps the server");
    let _ = connection.request("fast", Value::Null, 100).await;
    let (result, finished) = slow.await.expect("join");
    let error = result.expect_err("other waiters fail with the connection");
    assert_eq!(error.kind(), &ErrorKind::ConnectionClosed);
    assert!(error.reason.contains("retired"), "{}", error.reason);
    assert!(
        finished.duration_since(started) < Duration::from_secs(1),
        "the slow waiter must not sit out its own 60s timeout"
    );
    assert!(connection.request("after", Value::Null, 100).await.is_err());
}

#[tokio::test(start_paused = true)]
async fn dropped_request_sends_cancel_and_frees_its_entry() {
    let (connection, mut server) = connect();
    let dropped = tokio::time::timeout(
        Duration::from_millis(10),
        connection.request("slow", Value::Null, 5_000),
    )
    .await;
    assert!(dropped.is_err());
    assert_eq!(pending_len(&connection), Some(0), "entry freed on drop");
    assert!(
        connection.is_alive(),
        "cancellation by the caller is not a fault"
    );
    assert_eq!(server.read_message().await["id"], 1);
    let cancel = server.read_message().await;
    assert_eq!(cancel["method"], "$/cancelRequest");
    assert_eq!(cancel["params"]["id"], 1);
    // A late response for the cancelled id is ignored; the next request works.
    server
        .send(json!({"jsonrpc":"2.0","id":1,"error":{"code":-32800,"message":"cancelled"}}))
        .await;
    let next = tokio::spawn(async move {
        let request = server.read_message().await;
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"result":"ok"}))
            .await;
        server
    });
    assert_eq!(
        connection
            .request("next", Value::Null, 5_000)
            .await
            .expect("next"),
        json!("ok")
    );
    let _server = next.await;
}

#[tokio::test]
async fn dropped_mid_write_cannot_corrupt_the_stream() {
    // A 16-byte pipe forces the writer to block mid-frame; the caller's future
    // is dropped while the frame is half on the wire.
    let (connection, mut server) = connect_with_buffer(16);
    let connection = Arc::new(connection);
    let big = "x".repeat(8 * 1024);
    let request = tokio::spawn({
        let connection = Arc::clone(&connection);
        let big = big.clone();
        async move {
            connection
                .request("big", json!({ "text": big }), 5_000)
                .await
        }
    });
    // Peek (without consuming) until the writer has put part of the frame on
    // the wire and is blocked on the full pipe.
    let started = server.reader.fill_buf().await.expect("frame started").len();
    assert!(started > 0);
    request.abort();
    let _ = request.await;
    // Everything that follows still decodes frame by frame.
    let mut rest = server.read_message().await;
    assert_eq!(
        rest["params"]["text"].take(),
        json!(big),
        "frame written whole"
    );
    let cancel = server.read_message().await;
    assert_eq!(cancel["method"], "$/cancelRequest");
    assert!(connection.is_alive());
    let next = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("next", Value::Null, 5_000).await }
    });
    let request = server.read_message().await;
    assert_eq!(request["method"], "next");
    server
        .send(json!({"jsonrpc":"2.0","id":request["id"],"result":1}))
        .await;
    assert_eq!(next.await.expect("join").expect("next"), json!(1));
}

#[tokio::test]
async fn server_request_is_answered_per_section_via_the_writer() {
    let (connection, mut server) = connect();
    server
        .send(json!({
            "jsonrpc":"2.0","id":"cfg-1","method":"workspace/configuration",
            "params":{"items":[{"section":"gopls"},{"section":"unknown"}]}
        }))
        .await;
    let reply = server.read_message().await;
    assert_eq!(reply["id"], "cfg-1");
    assert_eq!(reply["result"], json!([{"a": 1}, null]));
    server
        .send(json!({"jsonrpc":"2.0","id":7,"method":"custom/unknown"}))
        .await;
    assert_eq!(server.read_message().await["error"]["code"], -32601);
    assert!(connection.is_alive());
}

#[tokio::test]
async fn server_request_reply_does_not_block_reads_when_server_stops_reading() {
    let (server_w, client_r) = duplex(64 * 1024);
    let mut server_w = server_w;
    let connection = Arc::new(JsonRpcConnection::new(
        client_r,
        StalledWriter,
        context(),
        ProgressTracker::new(),
        None,
    ));
    let request = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("a", Value::Null, 5_000).await }
    });
    while pending_len(&connection) != Some(1) {
        tokio::task::yield_now().await;
    }
    for message in [
        json!({"jsonrpc":"2.0","id":"s1","method":"workspace/configuration","params":{"items":[{}]}}),
        json!({"jsonrpc":"2.0","id":1,"result":"read despite a stalled stdin"}),
    ] {
        server_w
            .write_all(&encode_frame(&message).expect("encode"))
            .await
            .expect("server write");
    }
    let result = tokio::time::timeout(Duration::from_secs(2), request)
        .await
        .expect("reader must not block on the reply write")
        .expect("join");
    assert_eq!(
        result.expect("response"),
        json!("read despite a stalled stdin")
    );
}

#[tokio::test]
async fn garbage_content_length_fails_every_pending_request() {
    let (connection, mut server) = connect();
    let connection = Arc::new(connection);
    let request = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("a", Value::Null, 5_000).await }
    });
    let _ = server.read_message().await;
    server.send_raw(b"Content-Length: abc\r\n\r\n{}").await;
    let error = request.await.expect("join").expect_err("fatal framing");
    assert!(
        error.reason.contains("invalid Content-Length"),
        "{}",
        error.reason
    );
    assert!(!connection.is_alive());
}

#[tokio::test]
async fn oversized_frame_fails_pending_and_marks_dead() {
    let (connection, mut server) = connect();
    let connection = Arc::new(connection);
    let request = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("a", Value::Null, 5_000).await }
    });
    let _ = server.read_message().await;
    server
        .send_raw(
            format!(
                "Content-Length: {}\r\n\r\n",
                super::super::codec::MAX_CONTENT_LENGTH + 1
            )
            .as_bytes(),
        )
        .await;
    let error = request.await.expect("join").expect_err("oversized frame");
    assert!(error.reason.contains("maximum JSON-RPC frame size"));
    assert!(!connection.is_alive());
}

#[tokio::test]
async fn unparseable_frames_are_counted_and_reported() {
    let (connection, mut server) = connect();
    let connection = Arc::new(connection);
    let request = tokio::spawn({
        let connection = Arc::clone(&connection);
        async move { connection.request("a", Value::Null, 5_000).await }
    });
    let _ = server.read_message().await;
    server.send_raw(b"Content-Length: 3\r\n\r\nabc").await;
    server.send_raw(b"Content-Length: 2\r\n\r\n[]").await;
    drop(server);
    let error = request.await.expect("join").expect_err("closed");
    assert_eq!(connection.unparseable_frames(), 2);
    assert!(
        error.reason.contains("2 unparseable frame(s)"),
        "{}",
        error.reason
    );
}

#[tokio::test(start_paused = true)]
async fn exit_is_still_sent_after_a_timed_out_shutdown() {
    let (connection, mut server) = connect();
    for _ in 0..RETIRE_AFTER_TIMEOUTS {
        assert!(
            connection
                .request("shutdown", Value::Null, 50)
                .await
                .is_err()
        );
    }
    assert!(!connection.is_alive());
    assert!(
        connection.notify("x", Value::Null).await.is_err(),
        "failed connection refuses notify"
    );
    connection
        .notify_best_effort("exit", Value::Null)
        .await
        .expect("exit written even after the timeout");
    for _ in 0..RETIRE_AFTER_TIMEOUTS {
        assert_eq!(server.read_message().await["method"], "shutdown");
        assert_eq!(server.read_message().await["method"], "$/cancelRequest");
    }
    assert_eq!(server.read_message().await["method"], "exit");
}

#[tokio::test]
async fn dropping_the_connection_aborts_both_tasks() {
    let (connection, mut server) = connect();
    let shared = Arc::clone(&connection.shared);
    drop(connection);
    // Writer task aborted → the server sees stdin close.
    assert!(matches!(
        read_frame(&mut server.reader).await,
        Ok(Frame::Eof)
    ));
    // FailOnExit ran on abort.
    for _ in 0..100 {
        if !shared.is_alive() {
            break;
        }
        tokio::task::yield_now().await;
    }
    assert!(!shared.is_alive());
    assert_eq!(
        Arc::strong_count(&shared),
        1,
        "tasks released their handles"
    );
}

#[tokio::test(start_paused = true)]
async fn notify_times_out_when_the_server_stops_reading() {
    let connection = JsonRpcConnection::new(
        SilentReader,
        StalledWriter,
        context(),
        ProgressTracker::new(),
        None,
    );
    let error = connection
        .notify("initialized", json!({}))
        .await
        .expect_err("write cannot complete");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert!(!connection.is_alive());
}

/// A fake CPU clock: `cpu_at(n)` is the server tree's cumulative CPU time at
/// the `n`th read.
fn cpu_clock(cpu_at: impl Fn(u64) -> Duration + Send + Sync + 'static) -> CpuClock {
    let reads = std::sync::atomic::AtomicU64::new(0);
    Arc::new(move || Some(cpu_at(reads.fetch_add(1, Ordering::Relaxed))))
}

fn connect_watched(
    cpu_clock: Option<CpuClock>,
    progress: Arc<ProgressTracker>,
) -> (JsonRpcConnection, Server) {
    let (client_w, server_r) = duplex(64 * 1024);
    let (server_w, client_r) = duplex(64 * 1024);
    let connection = JsonRpcConnection::new(client_r, client_w, context(), progress, cpu_clock);
    (
        connection,
        Server {
            reader: BufReader::new(server_r),
            writer: server_w,
        },
    )
}

/// Base timeout for the starvation tests: the policy derives its check step
/// and ceiling from it, so every scenario runs in virtual milliseconds.
const BASE_MS: u32 = 1_000;

/// Answers the first request after `delay` of (virtual) time.
fn answer_after(mut server: Server, delay: Duration) -> tokio::task::JoinHandle<Server> {
    tokio::spawn(async move {
        let request = server.read_message().await;
        tokio::time::sleep(delay).await;
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"result":"late"}))
            .await;
        server
    })
}

/// A starved server (the machine is oversubscribed) answers after the base
/// timeout while its CPU time keeps growing: the request waits for it.
#[tokio::test(start_paused = true)]
async fn request_outlives_its_base_timeout_while_the_server_burns_cpu() {
    let (connection, server) =
        connect_watched(Some(cpu_clock(Duration::from_secs)), ProgressTracker::new());
    let _server = answer_after(server, Duration::from_millis(1_800));
    let started = Instant::now();
    let result = connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect("a progressing server is waited for");
    assert_eq!(result, json!("late"));
    assert!(started.elapsed() >= Duration::from_millis(1_800));
    assert!(connection.is_alive());
}

/// A server squeezed to a few percent of a core (measured: ~5% of one under
/// heavy oversubscription) still shows steady CPU growth: that is progress.
#[tokio::test(start_paused = true)]
async fn a_server_squeezed_to_a_sliver_of_cpu_still_counts_as_progressing() {
    // 6 ms of CPU per 250 ms check step is 2.4% of a core.
    let (connection, server) = connect_watched(
        Some(cpu_clock(|read| Duration::from_millis(read * 6))),
        ProgressTracker::new(),
    );
    let _server = answer_after(server, Duration::from_millis(1_800));
    connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect("a sliver of CPU is progress");
}

/// A server whose CPU time is flat is hung, not starved: the base timeout
/// stands, with the cancel and the keep-the-server policy unchanged.
#[tokio::test(start_paused = true)]
async fn request_times_out_at_the_base_when_the_server_shows_no_cpu() {
    let (connection, mut server) = connect_watched(
        Some(cpu_clock(|_| Duration::from_secs(5))),
        ProgressTracker::new(),
    );
    let started = Instant::now();
    let error = connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect_err("a hung server times out");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert!(
        error.reason.contains("timed out after 1000ms"),
        "{}",
        error.reason
    );
    assert_eq!(started.elapsed(), Duration::from_millis(1_000));
    assert!(connection.is_alive(), "one timeout keeps the server");
    assert_eq!(server.read_message().await["id"], 1);
    assert_eq!(server.read_message().await["method"], "$/cancelRequest");
}

/// CPU growth that is noise (a few ms of timer ticks per check) is not
/// progress.
#[tokio::test(start_paused = true)]
async fn negligible_cpu_growth_is_not_progress() {
    let (connection, _server) = connect_watched(
        Some(cpu_clock(Duration::from_millis)),
        ProgressTracker::new(),
    );
    let started = Instant::now();
    let error = connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect_err("idle server times out");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert_eq!(started.elapsed(), Duration::from_millis(1_000));
}

/// A server that never stops burning CPU is bounded by the ceiling.
#[tokio::test(start_paused = true)]
async fn request_stops_at_the_ceiling_while_progress_never_ends() {
    let (connection, _server) =
        connect_watched(Some(cpu_clock(Duration::from_secs)), ProgressTracker::new());
    let started = Instant::now();
    let error = connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect_err("the ceiling is terminal");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert!(
        error.reason.contains("timed out after 2000ms"),
        "{}",
        error.reason
    );
    assert_eq!(started.elapsed(), Duration::from_millis(2_000));
}

/// The extension ends as soon as the progress does, before the ceiling.
#[tokio::test(start_paused = true)]
async fn request_times_out_once_cpu_progress_stalls() {
    let (connection, _server) = connect_watched(
        Some(cpu_clock(|read| Duration::from_secs(read.min(2)))),
        ProgressTracker::new(),
    );
    let started = Instant::now();
    let error = connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect_err("progress stalled");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert_eq!(started.elapsed(), Duration::from_millis(1_500));
}

/// Attempts that share a [`WaitBudget`] (the content-modified retries of one
/// request) share its ceiling: the second attempt gets what the first left.
#[tokio::test(start_paused = true)]
async fn attempts_sharing_a_budget_share_its_ceiling() {
    let (connection, mut server) =
        connect_watched(Some(cpu_clock(Duration::from_secs)), ProgressTracker::new());
    let budget = WaitBudget::new(BASE_MS);
    let started = Instant::now();
    let first = tokio::spawn(async move {
        let request = server.read_message().await;
        tokio::time::sleep(Duration::from_millis(1_500)).await;
        server
            .send(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32801,"message":"content modified"}}))
            .await;
        server
    });
    connection
        .request("textDocument/references", Value::Null, budget)
        .await
        .expect_err("content modified");
    let _server = first.await.expect("server");
    let error = connection
        .request("textDocument/references", Value::Null, budget)
        .await
        .expect_err("the retry gets only the rest of the ceiling");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert_eq!(started.elapsed(), Duration::from_millis(2_000));
    assert!(
        error.reason.contains("timed out after 2000ms"),
        "the message counts the budget's whole wait, not the last attempt's: {}",
        error.reason
    );
}

/// An open `$/progress` token (rust-analyzer's "loading") is progress even
/// where no CPU clock exists; closing it ends the extension.
#[tokio::test(start_paused = true)]
async fn active_work_done_progress_extends_the_timeout() {
    let progress = ProgressTracker::new();
    progress.on_begin("indexing".to_owned()).await;
    let (connection, server) = connect_watched(None, Arc::clone(&progress));
    let _server = answer_after(server, Duration::from_millis(1_800));
    let result = connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect("indexing server is waited for");
    assert_eq!(result, json!("late"));

    progress.on_end("indexing").await;
    let started = Instant::now();
    connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect_err("no progress left");
    assert_eq!(started.elapsed(), Duration::from_millis(1_000));
}

/// Without a clock and without progress the policy is the plain base timeout.
#[tokio::test(start_paused = true)]
async fn no_clock_and_no_progress_times_out_at_the_base() {
    let (connection, _server) = connect_watched(None, ProgressTracker::new());
    let started = Instant::now();
    connection
        .request("textDocument/references", Value::Null, BASE_MS)
        .await
        .expect_err("times out");
    assert_eq!(started.elapsed(), Duration::from_millis(1_000));
}

/// Under a caller's deadline a starved server is waited for as long as it
/// progresses and the caller still has time: far past the fixed ceiling a
/// caller-less request keeps (twice the base).
#[tokio::test(start_paused = true)]
async fn a_progressing_server_is_waited_for_until_the_callers_deadline() {
    let (connection, server) =
        connect_watched(Some(cpu_clock(Duration::from_secs)), ProgressTracker::new());
    let _server = answer_after(server, Duration::from_millis(7_000));
    let started = Instant::now();
    let result = with_caller_deadline(
        started + Duration::from_secs(10),
        connection.request("textDocument/references", Value::Null, BASE_MS),
    )
    .await
    .expect("the caller still had time and the server progressed");
    assert_eq!(result, json!("late"));
    assert!(started.elapsed() >= Duration::from_millis(7_000));
}

/// A server that never stops progressing ends at the caller's deadline less
/// the reserve the caller needs to shape the answer.
#[tokio::test(start_paused = true)]
async fn a_request_never_waits_past_its_callers_deadline() {
    let (connection, _server) =
        connect_watched(Some(cpu_clock(Duration::from_secs)), ProgressTracker::new());
    let started = Instant::now();
    let caller_deadline = started + Duration::from_secs(6);
    let error = with_caller_deadline(
        caller_deadline,
        connection.request("textDocument/references", Value::Null, BASE_MS),
    )
    .await
    .expect_err("the caller's deadline is terminal");
    assert_eq!(error.kind(), &ErrorKind::Timeout);
    assert_eq!(Instant::now(), caller_deadline - DEADLINE_RESERVE);
}

/// A caller's deadline lends time only to a server that shows progress: a
/// hung one still fails at the base.
#[tokio::test(start_paused = true)]
async fn a_hung_server_still_times_out_at_the_base_under_a_callers_deadline() {
    let (connection, _server) = connect_watched(
        Some(cpu_clock(|_| Duration::from_secs(5))),
        ProgressTracker::new(),
    );
    let started = Instant::now();
    with_caller_deadline(
        started + Duration::from_secs(60),
        connection.request("textDocument/references", Value::Null, BASE_MS),
    )
    .await
    .expect_err("a hung server times out");
    assert_eq!(started.elapsed(), Duration::from_millis(1_000));
}

/// A caller with less time left than the base ends the wait at its deadline.
#[tokio::test(start_paused = true)]
async fn a_callers_deadline_inside_the_base_cuts_the_wait() {
    let (connection, _server) = connect_watched(None, ProgressTracker::new());
    let started = Instant::now();
    let caller_deadline = started + Duration::from_millis(1_500);
    with_caller_deadline(
        caller_deadline,
        connection.request("textDocument/references", Value::Null, 5 * BASE_MS),
    )
    .await
    .expect_err("the caller ran out of time");
    assert_eq!(Instant::now(), caller_deadline - DEADLINE_RESERVE);
}

/// Dropping the request future during an extension still cancels the request.
#[tokio::test(start_paused = true)]
async fn dropping_an_extended_request_still_sends_cancel() {
    let (connection, mut server) =
        connect_watched(Some(cpu_clock(Duration::from_secs)), ProgressTracker::new());
    let dropped = tokio::time::timeout(
        Duration::from_millis(1_500),
        connection.request("textDocument/references", Value::Null, BASE_MS),
    )
    .await;
    assert!(dropped.is_err(), "the caller gave up during the extension");
    assert_eq!(server.read_message().await["id"], 1);
    let cancel = server.read_message().await;
    assert_eq!(cancel["method"], "$/cancelRequest");
    assert_eq!(cancel["params"]["id"], 1);
    assert_eq!(pending_len(&connection), Some(0));
}
