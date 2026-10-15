// The local door for other programs: one JSON command per connection, passed to the page, whose answer goes back.
// macOS and Linux: a private unix socket (the `clipbox` command line uses it; same protocol as the former Electron
// shell). Windows: a named pipe for this user only (D-060). Both carry the commands of the MCP server (mcp.rs) that
// Codex and similar tools start with `Copyboxx --mcp`.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
#[cfg(unix)]
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::oneshot;
#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream};

const MAX_BYTES: usize = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(10);
/// A program that connects but never sends its line is let go after this long.
const READ_TIMEOUT: Duration = Duration::from_secs(10);
/// After answering, wait this long for the other side to read the answer and hang up.
const LINGER: Duration = Duration::from_secs(2);
/// The name a program may give for itself (`"_client"`, e.g. "Codex"); passed to the page next to the command.
pub const CLIENT_FIELD: &str = "_client";
/// A command that hands out a 秘密 waits for the person at the app to allow it (the page gives up after 45 s).
const SECRET_TIMEOUT: Duration = Duration::from_secs(60);

pub fn is_secret_command(command: &Value) -> bool {
    matches!(command["action"].as_str(), Some("secret-get" | "secret-verify" | "secret-export"))
}

fn timeout_for(command: &Value) -> Duration {
    if is_secret_command(command) { SECRET_TIMEOUT } else { TIMEOUT }
}
/// The command line script the app installs next to the user's other tools.
#[cfg(unix)]
const CLI_SCRIPT: &str = include_str!("../../tools/clipbox-cli.cjs");

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

/// Takes the program's name out of a command: the page only accepts its own fields. Short, printable text only.
pub fn take_client(command: &mut Value) -> Option<String> {
    let raw = command.as_object_mut()?.remove(CLIENT_FIELD)?;
    let name: String = raw.as_str()?.chars().filter(|c| !c.is_control()).take(40).collect();
    let name = name.trim().to_string();
    (!name.is_empty()).then_some(name)
}

/// Reads one command line, has it carried out and writes the answer back, on any kind of connection.
async fn handle<S, F, Fut>(mut stream: S, forward: Arc<F>)
where
    S: AsyncRead + AsyncWrite + Unpin,
    F: Fn(Value, Option<String>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<Value, Failure>> + Send + 'static,
{
    let mut source = Vec::new();
    let mut chunk = [0u8; 8192];
    let read = tokio::time::timeout(READ_TIMEOUT, async {
        loop {
            match stream.read(&mut chunk).await {
                Ok(0) => return Some(parse_request(&String::from_utf8_lossy(&source))),
                Ok(n) => {
                    source.extend_from_slice(&chunk[..n]);
                    if source.len() > MAX_BYTES {
                        return Some(Err(error_body("REQUEST_TOO_LARGE", "命令内容过大")));
                    }
                    if source.contains(&b'\n') {
                        return Some(parse_request(&String::from_utf8_lossy(&source)));
                    }
                }
                Err(_) => return None,
            }
        }
    })
    .await;
    let Ok(Some(reply)) = read else { return };
    let response = match reply {
        Err(body) => body,
        Ok(mut command) => {
            let client = take_client(&mut command);
            match tokio::time::timeout(timeout_for(&command), forward(command, client)).await {
                Err(_) => error_body("RENDERER_TIMEOUT", "Copyboxx 窗口响应超时"),
                Ok(Err(failure)) => failure_body(&failure),
                Ok(Ok(value)) => value,
            }
        }
    };
    let _ = stream.write_all(format!("{response}\n").as_bytes()).await;
    let _ = stream.flush().await;
    let _ = stream.shutdown().await;
    // A pipe drops what the other side has not read yet when it closes, so let the other side hang up first.
    let mut rest = [0u8; 256];
    let _ = tokio::time::timeout(LINGER, async { while matches!(stream.read(&mut rest).await, Ok(n) if n > 0) {} }).await;
}

#[cfg(unix)]
pub async fn serve<F, Fut>(listener: UnixListener, forward: F)
where
    F: Fn(Value, Option<String>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<Value, Failure>> + Send + 'static,
{
    let forward = Arc::new(forward);
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
        tauri::async_runtime::spawn(handle(stream, forward.clone()));
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
/// The pipe's name. Pipe names are shared by everyone on the computer, so it carries the user's name.
pub fn pipe_name(user: &str) -> String {
    let user: String = user.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    format!(r"\\.\pipe\copyboxx-automation-{}", if user.is_empty() { "user" } else { &user })
}

#[cfg(windows)]
pub fn default_pipe_name() -> String {
    pipe_name(&std::env::var("USERNAME").unwrap_or_default())
}

/// Windows: one pipe instance per waiting connection. The first instance must be ours (no other program may have taken
/// the name first), and connections from other computers are refused. The default pipe security lets only this user,
/// administrators and the system write to it, so other users on the computer cannot send commands.
#[cfg(windows)]
pub async fn serve_pipe<F, Fut>(name: String, forward: F) -> std::io::Result<()>
where
    F: Fn(Value, Option<String>) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<Value, Failure>> + Send + 'static,
{
    use tokio::net::windows::named_pipe::ServerOptions;
    let forward = Arc::new(forward);
    let mut server = ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).create(&name)?;
    loop {
        if server.connect().await.is_err() {
            server = ServerOptions::new().reject_remote_clients(true).create(&name)?;
            continue;
        }
        let connected = std::mem::replace(&mut server, ServerOptions::new().reject_remote_clients(true).create(&name)?);
        tauri::async_runtime::spawn(handle(connected, forward.clone()));
    }
}

/// Makes the place for the socket: a private folder, and no stale file in the way.
/// Fails when another running Clipbox already answers on it.
#[cfg(unix)]
pub async fn prepare_socket(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::{FileTypeExt, PermissionsExt};
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        // Never tighten a folder reached through a link: the link could point anywhere.
        let meta = std::fs::symlink_metadata(parent).map_err(|e| e.to_string())?;
        if !meta.file_type().is_dir() {
            return Err("Clipbox automation socket folder is not a plain folder".into());
        }
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    if let Ok(meta) = std::fs::symlink_metadata(path) {
        // Only a stale socket is removed; any other file in the way is left alone.
        if !meta.file_type().is_socket() {
            return Err("something other than a socket is in the way of the automation socket".into());
        }
        let probe = tokio::time::timeout(Duration::from_millis(120), UnixStream::connect(path)).await;
        if matches!(probe, Ok(Ok(_))) {
            return Err("Clipbox automation socket is already active".into());
        }
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `CLIPBOX_AUTOMATION_SOCKET_PATH` (for testing) is only honoured for a `*.sock` file in a folder of its own inside
/// the temporary folder (e.g. one made with `mktemp -d`) or inside the app's own folder, because the app makes that
/// folder private and replaces a stale socket there.
#[cfg(unix)]
pub fn allowed_socket_override(value: &str, temp: &Path, app_dir: &Path) -> Option<PathBuf> {
    use std::path::Component;
    let path = PathBuf::from(value);
    if !path.is_absolute() || path.components().any(|part| matches!(part, Component::ParentDir | Component::CurDir)) {
        return None;
    }
    if path.extension().and_then(|ext| ext.to_str()) != Some("sock") {
        return None;
    }
    let parent = path.parent()?;
    let inside_temp = parent.starts_with(temp) && parent != temp;
    (inside_temp || parent.starts_with(app_dir)).then_some(path)
}

#[cfg(unix)]
pub fn default_socket_path(app: &AppHandle) -> PathBuf {
    // The same place the command line looks first (it was the Electron app's data folder).
    let home = app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."));
    let app_dir = home.join("Library").join("Application Support").join("Clipbox");
    if let Ok(custom) = std::env::var("CLIPBOX_AUTOMATION_SOCKET_PATH") {
        match allowed_socket_override(&custom, &std::env::temp_dir(), &app_dir) {
            Some(path) => return path,
            None => eprintln!("clipbox: CLIPBOX_AUTOMATION_SOCKET_PATH ignored (must be a .sock file in its own temporary folder)"),
        }
    }
    app_dir.join("automation.sock")
}

/// Waiting commands and whether the page is listening yet.
#[derive(Clone, Default)]
pub struct Bridge {
    ready: Arc<AtomicBool>,
    next_id: Arc<AtomicU64>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
}

/// A waiting command's place in `pending`. It is given up however the wait ends, also when the socket side stops
/// waiting first (it has its own timeout and simply drops the waiting future).
struct PendingEntry {
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>,
    id: String,
}

impl Drop for PendingEntry {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&self.id);
        }
    }
}

impl Bridge {
    fn register(&self) -> (PendingEntry, oneshot::Receiver<Value>) {
        let id = format!("{}-{}", std::process::id(), self.next_id.fetch_add(1, Ordering::SeqCst));
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);
        (PendingEntry { pending: self.pending.clone(), id }, rx)
    }

    async fn wait_for(entry: PendingEntry, rx: oneshot::Receiver<Value>, limit: Duration) -> Result<Value, Failure> {
        let answer = tokio::time::timeout(limit, rx).await;
        drop(entry);
        match answer {
            Ok(Ok(value)) => Ok(value),
            _ => Err(("RENDERER_TIMEOUT".into(), "Copyboxx 窗口响应超时".into())),
        }
    }

    pub async fn forward(&self, app: &AppHandle, command: Value, client: Option<String>) -> Result<Value, Failure> {
        let window = app.get_webview_window("main");
        let Some(window) = window.filter(|_| self.ready.load(Ordering::SeqCst)) else {
            return Err(("WINDOW_UNAVAILABLE".into(), "Copyboxx 窗口尚未就绪".into()));
        };
        let limit = timeout_for(&command);
        if is_secret_command(&command) {
            // The page asks 允许 / 拒绝; bring the window forward so the person sees the question.
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        let (entry, rx) = self.register();
        if window.emit("clipbox:automation-command", json!({ "requestId": entry.id, "command": command, "client": client })).is_err() {
            return Err(("COMMAND_FAILED".into(), "命令执行失败".into()));
        }
        Self::wait_for(entry, rx, limit).await
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

/// Whether an existing file is a copy of our command line (any version): every version reads this variable.
#[cfg(unix)]
fn is_our_cli(content: &[u8]) -> bool {
    let text = String::from_utf8_lossy(content);
    text.starts_with("#!/usr/bin/env node") && text.contains("CLIPBOX_AUTOMATION_SOCKET_PATH")
}

/// Keeps `~/.local/bin/clipbox` the same as the script that ships with the app. A link, a folder or someone else's
/// `clipbox` there is left alone; the file is only written when its content differs, and the new copy replaces the
/// old one by rename, so nothing is ever written through a link.
#[cfg(unix)]
fn install_cli(home: &Path) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let dir = home.join(".local").join("bin");
    let target = dir.join("clipbox");
    std::fs::create_dir_all(&dir)?;
    match std::fs::symlink_metadata(&target) {
        Ok(meta) if !meta.file_type().is_file() => return Ok(()),
        Ok(meta) => {
            let current = std::fs::read(&target)?;
            if current == CLI_SCRIPT.as_bytes() {
                if meta.permissions().mode() & 0o777 != 0o755 {
                    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
                }
                return Ok(());
            }
            if !is_our_cli(&current) {
                return Ok(());
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let temp = dir.join(format!(".clipbox-{}.tmp", std::process::id()));
    let _ = std::fs::remove_file(&temp);
    let written = (|| {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o755).open(&temp)?;
        file.write_all(CLI_SCRIPT.as_bytes())?;
        file.set_permissions(std::fs::Permissions::from_mode(0o755))?;
        std::fs::rename(&temp, &target)
    })();
    if written.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    written
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
        serve(listener, move |command, client| {
            let (bridge, handle) = (bridge.clone(), handle.clone());
            async move { bridge.forward(&handle, command, client).await }
        })
        .await;
    });
}

#[cfg(unix)]
pub fn cleanup(app: &AppHandle) {
    let _ = std::fs::remove_file(default_socket_path(app));
}

/// Windows: starts the pipe server (no command line is installed; tools connect through `Copyboxx --mcp`).
#[cfg(windows)]
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let bridge = app.state::<Bridge>().inner().clone();
        let handle = app.clone();
        let served = serve_pipe(default_pipe_name(), move |command, client| {
            let (bridge, handle) = (bridge.clone(), handle.clone());
            async move { bridge.forward(&handle, command, client).await }
        })
        .await;
        if let Err(e) = served {
            eprintln!("clipbox: automation pipe not started: {e}");
        }
    });
}

#[cfg(not(any(unix, windows)))]
pub fn start(_app: &AppHandle) {}

#[cfg(not(unix))]
pub fn cleanup(_app: &AppHandle) {}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    // Each test socket sits in a folder of its own: the server makes that folder private.
    fn temp_socket(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("clipbox-auto-{}-{name}", std::process::id())).join("automation.sock")
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
    fn the_pipe_name_is_per_user_and_safe() {
        assert_eq!(pipe_name("Krix"), r"\\.\pipe\copyboxx-automation-Krix");
        assert_eq!(pipe_name("a b\\c"), r"\\.\pipe\copyboxx-automation-a_b_c");
        assert_eq!(pipe_name(""), r"\\.\pipe\copyboxx-automation-user");
    }

    #[test]
    fn the_program_name_is_taken_out_of_the_command() {
        let mut command = json!({ "action": "status", "_client": "  Codex\n " });
        assert_eq!(take_client(&mut command).as_deref(), Some("Codex"));
        assert_eq!(command, json!({ "action": "status" }));
        let mut odd = json!({ "action": "status", "_client": 7 });
        assert_eq!(take_client(&mut odd), None);
        assert_eq!(odd, json!({ "action": "status" }));
        let long = "x".repeat(100);
        assert_eq!(take_client(&mut json!({ "_client": long })).unwrap().len(), 40);
    }

    #[test]
    fn secret_commands_wait_longer_for_the_person_to_answer() {
        for action in ["secret-get", "secret-verify", "secret-export"] {
            assert!(is_secret_command(&json!({ "action": action })), "{action}");
            assert_eq!(timeout_for(&json!({ "action": action })), SECRET_TIMEOUT);
        }
        for action in ["status", "list", "get", "add", "secret"] {
            assert!(!is_secret_command(&json!({ "action": action })), "{action}");
            assert_eq!(timeout_for(&json!({ "action": action })), TIMEOUT);
        }
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
            tauri::async_runtime::spawn(serve(listener, |command: Value, client: Option<String>| async move {
                if command["action"] == "whoami" {
                    return Ok(json!({ "ok": true, "client": client, "command": command }));
                }
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
            // The program's name is taken out of the command and passed next to it.
            let who = ask(&path, "{\"action\":\"whoami\",\"_client\":\"Codex\"}\n").await;
            assert_eq!(who["client"], "Codex");
            assert_eq!(who["command"], json!({ "action": "whoami" }));
            // A client that writes its line but keeps its side open is still answered.
            let mut open = UnixStream::connect(&path).await.unwrap();
            open.write_all(b"{\"action\":\"status\"}\n").await.unwrap();
            let mut line = String::new();
            let mut buf = [0u8; 256];
            while !line.contains('\n') {
                let n = open.read(&mut buf).await.unwrap();
                assert!(n > 0);
                line.push_str(std::str::from_utf8(&buf[..n]).unwrap());
            }
            assert_eq!(serde_json::from_str::<Value>(line.trim()).unwrap()["snippetCount"], 3);
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

    #[cfg(unix)]
    #[test]
    fn the_launcher_is_installed_executable_and_replaced_when_it_differs() {
        use std::os::unix::fs::PermissionsExt;
        let home = std::env::temp_dir().join(format!("clipbox-cli-test-{}", std::process::id()));
        let target = home.join(".local").join("bin").join("clipbox");
        install_cli(&home).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), CLI_SCRIPT);
        assert_eq!(std::fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o755);
        // An older copy of our command line is brought up to date.
        std::fs::write(&target, "#!/usr/bin/env node\nconst p = process.env.CLIPBOX_AUTOMATION_SOCKET_PATH; // old").unwrap();
        install_cli(&home).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), CLI_SCRIPT);
        assert_eq!(std::fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o755);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn the_launcher_never_writes_through_a_link_or_over_someone_elses_file() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let home = std::env::temp_dir().join(format!("clipbox-cli-link-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let bin = home.join(".local").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let target = bin.join("clipbox");
        // A link to another file: neither the link nor the file it points to changes.
        let victim = home.join("victim.txt");
        std::fs::write(&victim, "keep me").unwrap();
        std::fs::set_permissions(&victim, std::fs::Permissions::from_mode(0o600)).unwrap();
        std::os::unix::fs::symlink(&victim, &target).unwrap();
        install_cli(&home).unwrap();
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "keep me");
        assert_eq!(std::fs::metadata(&victim).unwrap().permissions().mode() & 0o777, 0o600);
        assert!(std::fs::symlink_metadata(&target).unwrap().file_type().is_symlink());
        // A dangling link is not followed to create a file either.
        std::fs::remove_file(&target).unwrap();
        let elsewhere = home.join("created-through-link");
        std::os::unix::fs::symlink(&elsewhere, &target).unwrap();
        install_cli(&home).unwrap();
        assert!(!elsewhere.exists());
        // Someone else's program called clipbox stays as it is.
        std::fs::remove_file(&target).unwrap();
        std::fs::write(&target, "#!/bin/sh\necho other tool").unwrap();
        install_cli(&home).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "#!/bin/sh\necho other tool");
        // A file that is already up to date is not rewritten (same inode), only made executable again.
        std::fs::remove_file(&target).unwrap();
        install_cli(&home).unwrap();
        let before = std::fs::metadata(&target).unwrap().ino();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o644)).unwrap();
        install_cli(&home).unwrap();
        let after = std::fs::metadata(&target).unwrap();
        assert_eq!(after.ino(), before);
        assert_eq!(after.permissions().mode() & 0o777, 0o755);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn the_socket_override_must_stay_in_its_own_temporary_or_app_folder() {
        let temp = Path::new("/tmp");
        let app = Path::new("/Users/a/Library/Application Support/Clipbox");
        let ok = "/tmp/tmp.X1/automation.sock";
        assert_eq!(allowed_socket_override(ok, temp, app), Some(PathBuf::from(ok)));
        assert!(allowed_socket_override("/Users/a/Library/Application Support/Clipbox/test.sock", temp, app).is_some());
        for bad in [
            "",
            "automation.sock",
            "/tmp/automation.sock", // the shared temporary folder itself would be made private
            "/tmp/x/../../etc/automation.sock",
            "/tmp/x/notes.txt",
            "/Users/a/Documents/automation.sock",
            "/etc/automation.sock",
            "/tmpfoo/x/automation.sock",
        ] {
            assert_eq!(allowed_socket_override(bad, temp, app), None, "{bad}");
        }
    }

    #[test]
    fn preparing_the_socket_never_removes_a_plain_file_or_follows_a_linked_folder() {
        tauri::async_runtime::block_on(async {
            let dir = std::env::temp_dir().join(format!("clipbox-auto-guard-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let file = dir.join("automation.sock");
            std::fs::write(&file, "not a socket").unwrap();
            assert!(prepare_socket(&file).await.is_err());
            assert_eq!(std::fs::read_to_string(&file).unwrap(), "not a socket");
            let real = dir.join("real");
            std::fs::create_dir_all(&real).unwrap();
            let link = dir.join("link");
            std::os::unix::fs::symlink(&real, &link).unwrap();
            assert!(prepare_socket(&link.join("automation.sock")).await.is_err());
            let _ = std::fs::remove_dir_all(&dir);
        });
    }

    #[test]
    fn a_command_nobody_answers_leaves_no_waiting_entry_behind() {
        tauri::async_runtime::block_on(async {
            let bridge = Bridge::default();
            // The socket side stops waiting first and drops the wait.
            let (entry, rx) = bridge.register();
            assert_eq!(bridge.pending.lock().unwrap().len(), 1);
            assert!(tokio::time::timeout(Duration::from_millis(20), Bridge::wait_for(entry, rx, TIMEOUT)).await.is_err());
            assert!(bridge.pending.lock().unwrap().is_empty());
            // An answered command is gone as well.
            let (entry, rx) = bridge.register();
            let id = entry.id.clone();
            assert!(bridge.respond(&id, json!({ "ok": true })));
            assert_eq!(Bridge::wait_for(entry, rx, TIMEOUT).await.unwrap()["ok"], true);
            assert!(bridge.pending.lock().unwrap().is_empty());
        });
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;

    #[test]
    fn the_pipe_carries_a_command_and_its_answer_and_refuses_a_second_server() {
        let name = format!(r"\\.\pipe\copyboxx-automation-test-{}", std::process::id());
        let served = name.clone();
        tauri::async_runtime::spawn(async move {
            let _ = serve_pipe(served, |command: Value, client: Option<String>| async move {
                Ok(json!({ "ok": true, "client": client, "command": command }))
            })
            .await;
        });
        std::thread::sleep(Duration::from_millis(200));
        for round in 0..3 {
            let answer = crate::mcp::ask_pipe(&name, json!({ "action": "status", "_client": "Codex", "round": round })).unwrap();
            assert_eq!(answer["client"], "Codex");
            assert_eq!(answer["command"], json!({ "action": "status", "round": round }));
        }
        // The name is taken: a second Copyboxx (or another program) cannot serve it.
        let second = tauri::async_runtime::block_on(serve_pipe(name.clone(), |_: Value, _: Option<String>| async { Ok(json!({})) }));
        assert!(second.is_err());
        assert!(crate::mcp::ask_pipe(r"\\.\pipe\copyboxx-automation-nobody-here", json!({ "action": "status" })).is_err());
    }
}
