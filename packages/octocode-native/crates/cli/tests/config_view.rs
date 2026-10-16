#![allow(clippy::expect_used, clippy::unwrap_used)]

use crate::support::Workspace;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Stdio};
use std::time::{Duration, Instant};

const DEADLINE: Duration = Duration::from_secs(15);

struct Viewer(Child);

impl Drop for Viewer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn request(origin: &str, path: &str, token: &str, body: &str, extra: &str) -> String {
    let address = origin.trim_start_matches("http://");
    let mut stream = std::net::TcpStream::connect(address).expect("connect config view");
    stream
        .set_read_timeout(Some(DEADLINE))
        .expect("read deadline");
    stream
        .set_write_timeout(Some(DEADLINE))
        .expect("write deadline");
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {address}\r\nOrigin: {origin}\r\nContent-Type: application/json\r\nX-Octocode-Session: {token}\r\nConnection: close\r\nContent-Length: {}\r\n{extra}\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).expect("write request");
    let mut response = String::new();
    stream.read_to_string(&mut response).expect("read response");
    response
}

fn start(workspace: &Workspace) -> (Viewer, String, String) {
    let mut child = Viewer(
        workspace
            .cli()
            .args(["config", "view", "--no-open"])
            .stdout(Stdio::piped())
            .spawn()
            .expect("start config view"),
    );
    let stdout = child.0.stdout.take().expect("stdout");
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
        let _ = sender.send(result);
    });
    let line = receiver
        .recv_timeout(DEADLINE)
        .expect("URL deadline")
        .expect("read URL");
    let url = line
        .trim()
        .strip_prefix("Octocode config view: ")
        .expect("URL");
    let (origin, bootstrap) = url.split_once("/#").expect("fragment credential");
    (child, origin.to_owned(), bootstrap.to_owned())
}

#[test]
fn config_view_uses_loopback_one_use_credentials_and_rejects_cross_site_requests() {
    let workspace = Workspace::new();
    let (mut child, origin, bootstrap) = start(&workspace);
    let session_response = request(&origin, "/api/session", &bootstrap, "{}", "");
    assert!(
        session_response.starts_with("HTTP/1.1 200"),
        "{session_response}"
    );
    let session = session_response
        .split("\r\n\r\n")
        .nth(1)
        .and_then(|body| serde_json::from_str::<serde_json::Value>(body).ok())
        .and_then(|value| value["token"].as_str().map(str::to_owned))
        .expect("session token");
    let replay = request(&origin, "/api/session", &bootstrap, "{}", "");
    assert!(replay.starts_with("HTTP/1.1 401"), "{replay}");
    let cross_site = request(
        &origin,
        "/api/request",
        &session,
        r#"{"operation":"inspect"}"#,
        "Sec-Fetch-Site: cross-site\r\n",
    );
    assert!(cross_site.starts_with("HTTP/1.1 403"), "{cross_site}");
    let close = request(&origin, "/api/close", &session, "{}", "");
    assert!(close.starts_with("HTTP/1.1 200"), "{close}");
    let deadline = Instant::now() + DEADLINE;
    loop {
        if let Some(status) = child.0.try_wait().expect("viewer status") {
            assert!(status.success(), "{status}");
            break;
        }
        assert!(Instant::now() < deadline, "viewer did not exit after close");
        std::thread::sleep(Duration::from_millis(10));
    }
}
