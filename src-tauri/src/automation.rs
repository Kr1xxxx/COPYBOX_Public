// The command line door (macOS and Linux): a unix socket that takes one JSON command per connection, passes it to
// the page and sends the page's answer back. Same protocol as desktop/automation-server.cjs and automation-bridge.cjs,
// so the existing `clipbox` command keeps working.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
#[cfg(unix)]
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream};

const MAX_BYTES: usize = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(10);
/// The command line script the app installs next to the user's other tools.
#[cfg(unix)]
const CLI_SCRIPT: &str = include_str!("../../desktop/clipbox-cli.cjs");

pub type Failure = (String, String);

fn error_body(code: &str, message: &str) -> Value {
    json!({ "ok": false, "error": { "code": code, "message": message } })
}

fn failure_body(failure: &Failure) -> Value {
    error_body(&failure.0, &failure.1)
}

/// One request line to a JSON object, or the answer to send back instead.
pub fn parse_request(source: &str) -> Result<Value, Value> {
    let line = source.split('\n').next().unwrap_or("").trim();
    if line.is_empty() {
        return Err(error_body("EMPTY_REQUEST", "命令不能为空"));
    }
    match serde_json::from_str::<Value>(line) {
        Err(_) => Err(error_body("INVALID_JSON", "命令不是有效的 JSON")),
        Ok(value) if !value.is_object() => Err(error_body("INVALID_REQUEST", "命令必须是 JSON 对象")),
        Ok(value) => Ok(value),
    }
}

#[cfg(unix)]
async fn handle<F, Fut>(mut stream: UnixStream, forward: Arc<F>)
where
    F: Fn(Value) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<Value, Failure>> + Send + 'static,
{
    let mut source = Vec::new();
    let mut chunk = [0u8; 8192];
    let reply = loop {
        match stream.read(&mut chunk).await {
            Ok(0) => break parse_request(&String::from_utf8_lossy(&source)),
            Ok(n) => {
                source.extend_from_slice(&chunk[..n]);
                if source.len() > MAX_BYTES {
                    break Err(error_body("REQUEST_TOO_LARGE", "命令内容过大"));
                }
                if source.contains(&b'\n') {
                    break parse_request(&String::from_utf8_lossy(&source));
                }
            }
            Err(_) => return,
        }
    };
    let response = match reply {
        Err(body) => body,
        Ok(command) => match tokio::time::timeout(TIMEOUT, forward(command)).await {
            Err(_) => error_body("RENDERER_TIMEOUT", "Clipbox 窗口响应超时"),
            Ok(Err(failure)) => failure_body(&failure),
            Ok(Ok(value)) => value,
        },
    };
    let _ = stream.write_all(format!("{response}\n").as_bytes()).await;
    let _ = stream.shutdown().await;
}

#[cfg(unix)]
pub async fn serve<F, Fut>(listener: UnixListener, forward: F)
where
    F: Fn(Value) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<Value, Failure>> + Send + 'static,
{
    let forward = Arc::new(forward);
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
        tauri::async_runtime::spawn(handle(stream, forward.clone()));
    }
}

/// Makes the place for the socket: a private folder, and no stale file in the way.
/// Fails when another running Clipbox already answers on it.
#[cfg(unix)]
pub async fn prepare_socket(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::{FileTypeExt, PermissionsExt};
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        if meta.file_type().is_socket() {
            let probe = tokio::time::timeout(Duration::from_millis(120), UnixStream::connect(path)).await;
            if matches!(probe, Ok(Ok(_))) {
                return Err("Clipbox automation socket is already active".into());
            }
        }
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(unix)]
pub fn default_socket_path(app: &AppHandle) -> PathBuf {
    if let Ok(custom) = std::env::var("CLIPBOX_AUTOMATION_SOCKET_PATH") {
        return PathBuf::from(custom);
    }
    // The same place the command line looks first (it was the Electron app's data folder).
    let home = app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."));
    home.join("Library").join("Application Support").join("Clipbox").join("automation.sock")
}

/// Waiting commands and whether the page is listening yet.
#[derive(Clone, Default)]
pub struct Bridge {
    ready: Arc<AtomicBool>,
    next_id: Arc<AtomicU64>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
}

impl Bridge {
    pub async fn forward(&self, app: &AppHandle, command: Value) -> Result<Value, Failure> {
        let window = app.get_webview_window("main");
        let Some(window) = window.filter(|_| self.ready.load(Ordering::SeqCst)) else {
            return Err(("WINDOW_UNAVAILABLE".into(), "Clipbox 窗口尚未就绪".into()));
        };
        let id = format!("{}-{}", std::process::id(), self.next_id.fetch_add(1, Ordering::SeqCst));
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);
        if window.emit("clipbox:automation-command", json!({ "requestId": id, "command": command })).is_err() {
            self.pending.lock().unwrap().remove(&id);
            return Err(("COMMAND_FAILED".into(), "命令执行失败".into()));
        }
        match tokio::time::timeout(TIMEOUT, rx).await {
            Ok(Ok(value)) => Ok(value),
            _ => {
                self.pending.lock().unwrap().remove(&id);
                Err(("RENDERER_TIMEOUT".into(), "Clipbox 窗口响应超时".into()))
            }
        }
    }

    pub fn respond(&self, request_id: &str, response: Value) -> bool {
        match self.pending.lock().unwrap().remove(request_id) {
            Some(tx) => tx.send(response).is_ok(),
            None => false,
        }
    }

    pub fn set_ready(&self, ready: bool) {
        self.ready.store(ready, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn automation_ready(bridge: tauri::State<Bridge>) {
    bridge.set_ready(true);
}

#[tauri::command]
pub fn automation_response(bridge: tauri::State<Bridge>, request_id: String, response: Value) {
    bridge.respond(&request_id, response);
}

/// Keeps `~/.local/bin/clipbox` the same as the script that ships with the app.
#[cfg(unix)]
fn install_cli(home: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let target = home.join(".local").join("bin").join("clipbox");
    std::fs::create_dir_all(target.parent().unwrap())?;
    if std::fs::read_to_string(&target).ok().as_deref() != Some(CLI_SCRIPT) {
        std::fs::write(&target, CLI_SCRIPT)?;
    }
    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))
}

/// Starts the socket server and installs the command line. Problems are only logged: the app works without it.
#[cfg(unix)]
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(home) = app.path().home_dir() {
            if let Err(e) = install_cli(&home) {
                eprintln!("clipbox: could not install the command line: {e}");
            }
        }
        let path = default_socket_path(&app);
        if let Err(e) = prepare_socket(&path).await {
            eprintln!("clipbox: automation socket not started: {e}");
            return;
        }
        let listener = match UnixListener::bind(&path) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("clipbox: automation socket not started: {e}");
                return;
            }
        };
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        let bridge = app.state::<Bridge>().inner().clone();
        let handle = app.clone();
        serve(listener, move |command| {
            let (bridge, handle) = (bridge.clone(), handle.clone());
            async move { bridge.forward(&handle, command).await }
        })
        .await;
    });
}

#[cfg(unix)]
pub fn cleanup(app: &AppHandle) {
    let _ = std::fs::remove_file(default_socket_path(app));
}

// Windows has no command line door (the automation server only runs on macOS and Linux).
#[cfg(not(unix))]
pub fn start(_app: &AppHandle) {}

#[cfg(not(unix))]
pub fn cleanup(_app: &AppHandle) {}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn temp_socket(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("clipbox-auto-{}-{name}.sock", std::process::id()))
    }

    async fn ask(path: &Path, text: &str) -> Value {
        let mut stream = UnixStream::connect(path).await.unwrap();
        stream.write_all(text.as_bytes()).await.unwrap();
        stream.shutdown().await.unwrap();
        let mut answer = String::new();
        stream.read_to_string(&mut answer).await.unwrap();
        serde_json::from_str(answer.trim()).unwrap()
    }

    #[test]
    fn requests_are_checked() {
        assert!(parse_request("{\"action\":\"status\"}\n").is_ok());
        assert_eq!(parse_request("   \n").unwrap_err()["error"]["code"], "EMPTY_REQUEST");
        assert_eq!(parse_request("nope").unwrap_err()["error"]["code"], "INVALID_JSON");
        assert_eq!(parse_request("[1]").unwrap_err()["error"]["code"], "INVALID_REQUEST");
    }

    #[test]
    fn server_passes_commands_and_answers() {
        tauri::async_runtime::block_on(async {
            let path = temp_socket("serve");
            prepare_socket(&path).await.unwrap();
            let listener = UnixListener::bind(&path).unwrap();
            tauri::async_runtime::spawn(serve(listener, |command: Value| async move {
                match command["action"].as_str() {
                    Some("status") => Ok(json!({ "ok": true, "action": "status", "snippetCount": 3 })),
                    _ => Err(("NOT_FOUND".to_string(), "没有这个命令".to_string())),
                }
            }));
            let ok = ask(&path, "{\"action\":\"status\"}\n").await;
            assert_eq!(ok["snippetCount"], 3);
            // A client that closes its side without a newline is still answered.
            let ok2 = ask(&path, "{\"action\":\"status\"}").await;
            assert_eq!(ok2["ok"], true);
            let bad = ask(&path, "{\"action\":\"other\"}\n").await;
            assert_eq!(bad["error"]["code"], "NOT_FOUND");
            let junk = ask(&path, "x\n").await;
            assert_eq!(junk["error"]["code"], "INVALID_JSON");
            let _ = std::fs::remove_file(&path);
        });
    }

    #[test]
    fn a_running_server_blocks_a_second_one_but_a_stale_file_does_not() {
        tauri::async_runtime::block_on(async {
            let path = temp_socket("busy");
            prepare_socket(&path).await.unwrap();
            let listener = UnixListener::bind(&path).unwrap();
            assert!(prepare_socket(&path).await.is_err());
            drop(listener);
            // The file stays behind after a crash; nobody answers, so it is replaced.
            prepare_socket(&path).await.unwrap();
            assert!(!path.exists());
        });
    }

    #[test]
    fn answers_from_the_page_reach_the_waiting_command() {
        tauri::async_runtime::block_on(async {
            let bridge = Bridge::default();
            let (tx, rx) = oneshot::channel();
            bridge.pending.lock().unwrap().insert("7".into(), tx);
            assert!(bridge.respond("7", json!({ "ok": true })));
            assert_eq!(rx.await.unwrap()["ok"], true);
            assert!(!bridge.respond("7", json!({})));
        });
    }

    #[test]
    fn the_shipped_command_line_is_the_node_script() {
        assert!(CLI_SCRIPT.starts_with("#!/usr/bin/env node"));
    }
}
