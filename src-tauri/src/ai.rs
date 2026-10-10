// The user's own AI interface: the key lives in the operating system's credential store (Windows Credential
// Manager / macOS Keychain) and requests are sent from here, so the key never has to live in the page.
// Same rules and messages as desktop/ai.cjs.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const SERVICE: &str = "com.clipbox.tauri";
const KEY_NAME: &str = "ai-key";
const ORIGIN_FILE: &str = "ai-key.json";

#[derive(Serialize, Deserialize, Default)]
struct StoredOrigin {
    origin: String,
}

#[derive(Serialize)]
pub struct AiStatus {
    #[serde(rename = "hasKey")]
    has_key: bool,
    origin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettings {
    base_url: String,
    key: Option<String>,
}

#[derive(Deserialize)]
pub struct RequestPayload {
    url: String,
    body: Option<serde_json::Value>,
    method: Option<String>,
}

#[derive(Serialize)]
pub struct AiResponse {
    ok: bool,
    status: u16,
    text: String,
}

/// https only; plain http is for this computer's own address.
pub fn parse_endpoint(value: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value).map_err(|_| "接口地址无效".to_string())?;
    let local = matches!(url.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]") | Some("::1"));
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("接口地址需要 https://（本机地址可用 http://）".into());
    }
    Ok(url)
}

fn origin_of(url: &url::Url) -> String {
    url.origin().ascii_serialization()
}

/// An empty key keeps the saved one, but only for the same server.
pub fn resolve_key(next: &str, current: Option<(&str, &str)>, origin: &str) -> Result<String, String> {
    let next = next.trim();
    if !next.is_empty() {
        return Ok(next.to_string());
    }
    match current {
        Some((saved_origin, key)) if saved_origin == origin => Ok(key.to_string()),
        _ => Err("请填写 API Key".into()),
    }
}

fn origin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(ORIGIN_FILE))
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, KEY_NAME).map_err(|_| "这台电脑的系统不支持安全保存密钥".to_string())
}

/// The saved server and key, if both are there.
fn read(app: &AppHandle) -> Option<(String, String)> {
    let stored: StoredOrigin = serde_json::from_str(&std::fs::read_to_string(origin_path(app).ok()?).ok()?).ok()?;
    let key = entry().ok()?.get_password().ok()?;
    (!stored.origin.is_empty()).then_some((stored.origin, key))
}

fn status_of(app: &AppHandle) -> AiStatus {
    match read(app) {
        Some((origin, _)) => AiStatus { has_key: true, origin },
        None => AiStatus { has_key: false, origin: String::new() },
    }
}

#[tauri::command]
pub fn ai_status(app: AppHandle) -> AiStatus {
    status_of(&app)
}

#[tauri::command]
pub fn ai_save(app: AppHandle, settings: SaveSettings) -> Result<AiStatus, String> {
    let origin = origin_of(&parse_endpoint(&settings.base_url)?);
    let current = read(&app);
    let key = resolve_key(
        settings.key.as_deref().unwrap_or(""),
        current.as_ref().map(|(o, k)| (o.as_str(), k.as_str())),
        &origin,
    )?;
    entry()?.set_password(&key).map_err(|_| "这台电脑的系统不支持安全保存密钥".to_string())?;
    let text = serde_json::to_string(&StoredOrigin { origin }).map_err(|e| e.to_string())?;
    std::fs::write(origin_path(&app)?, text).map_err(|e| e.to_string())?;
    Ok(status_of(&app))
}

#[tauri::command]
pub fn ai_clear(app: AppHandle) -> Result<AiStatus, String> {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
    if let Ok(path) = origin_path(&app) {
        let _ = std::fs::remove_file(path);
    }
    Ok(status_of(&app))
}

#[tauri::command]
pub async fn ai_request(app: AppHandle, payload: RequestPayload) -> Result<AiResponse, String> {
    let get = payload.method.as_deref() == Some("GET");
    let target = parse_endpoint(&payload.url)?;
    let (saved_origin, key) = read(&app).ok_or_else(|| "还没有保存 API Key".to_string())?;
    if saved_origin != origin_of(&target) {
        return Err("接口地址与已保存的密钥不匹配，请在设置里重新保存".into());
    }
    let client = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).build().map_err(|e| e.to_string())?;
    let mut request = if get { client.get(target) } else { client.post(target).header("content-type", "application/json") };
    request = request.bearer_auth(key);
    if !get {
        let body = match payload.body {
            Some(serde_json::Value::String(text)) => text,
            Some(other) => other.to_string(),
            None => String::new(),
        };
        request = request.body(body);
    }
    let response = request.send().await.map_err(|e| if e.is_timeout() { "请求超时".to_string() } else { "无法连接到接口".to_string() })?;
    let (ok, status) = (response.status().is_success(), response.status().as_u16());
    let text = response.text().await.map_err(|e| if e.is_timeout() { "请求超时".to_string() } else { "无法连接到接口".to_string() })?;
    Ok(AiResponse { ok, status, text })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_needs_https_unless_local() {
        assert!(parse_endpoint("https://api.example.com/v1").is_ok());
        assert!(parse_endpoint("http://127.0.0.1:11434/v1").is_ok());
        assert!(parse_endpoint("http://localhost:8080").is_ok());
        assert_eq!(parse_endpoint("http://api.example.com").unwrap_err(), "接口地址需要 https://（本机地址可用 http://）");
        assert_eq!(parse_endpoint("not a url").unwrap_err(), "接口地址无效");
        assert!(parse_endpoint("ftp://example.com").is_err());
    }

    #[test]
    fn origin_drops_the_path() {
        let url = parse_endpoint("https://api.example.com:8443/v1/chat").unwrap();
        assert_eq!(origin_of(&url), "https://api.example.com:8443");
    }

    #[test]
    fn empty_key_keeps_the_saved_one_for_the_same_server_only() {
        let saved = Some(("https://a.example", "sk-old"));
        assert_eq!(resolve_key("  sk-new ", saved, "https://a.example").unwrap(), "sk-new");
        assert_eq!(resolve_key("", saved, "https://a.example").unwrap(), "sk-old");
        assert_eq!(resolve_key("", saved, "https://b.example").unwrap_err(), "请填写 API Key");
        assert_eq!(resolve_key("", None, "https://a.example").unwrap_err(), "请填写 API Key");
    }
}
