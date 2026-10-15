// 登录同步 (D-064): sends one request from the page to the Copyboxx server. Only https://copyboxx.com and only the
// /api/ paths the app uses; no redirects, no cookies, a size limit both ways and a timeout. The sign-in token comes
// from the page (Windows keeps it in Credential Manager, secret_store.rs) and goes out only as the Authorization header.
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::site_icon::read_capped;

const BASE: &str = "https://copyboxx.com";
const TIMEOUT: Duration = Duration::from_secs(30);
/// The page refuses to upload more than 5 MB; a little room for the JSON around it.
const MAX_BYTES: usize = 6 * 1024 * 1024;
const PATHS: [(&str, &str); 6] = [
    ("POST", "/api/auth/code"),
    ("POST", "/api/auth/verify"),
    ("GET", "/api/vault"),
    ("PUT", "/api/vault"),
    ("POST", "/api/auth/logout"),
    ("DELETE", "/api/account"),
];

#[derive(Deserialize)]
pub struct CloudRequest {
    method: String,
    path: String,
    body: Option<serde_json::Value>,
    token: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct CloudResponse {
    status: u16,
    text: String,
}

pub fn is_allowed(method: &str, path: &str) -> bool {
    PATHS.iter().any(|(m, p)| *m == method && *p == path)
}

fn is_token(value: &str) -> bool {
    !value.is_empty() && value.len() <= 512 && value.bytes().all(|byte| byte.is_ascii_graphic())
}

#[tauri::command]
pub async fn cloud_request(request: CloudRequest) -> Result<CloudResponse, String> {
    if !is_allowed(&request.method, &request.path) {
        return Err("invalid".into());
    }
    let body = match &request.body {
        Some(value) => Some(serde_json::to_vec(value).map_err(|_| "invalid".to_string())?),
        None => None,
    };
    if body.as_ref().is_some_and(|bytes| bytes.len() > MAX_BYTES) {
        return Err("too large".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| "network".to_string())?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "invalid".to_string())?;
    let mut builder = client.request(method, format!("{BASE}{}", request.path)).header("accept", "application/json");
    if let Some(token) = request.token.as_deref() {
        if !is_token(token) {
            return Err("invalid".into());
        }
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    if let Some(bytes) = body {
        builder = builder.header("content-type", "application/json").body(bytes);
    }
    let response = builder.send().await.map_err(|_| "network".to_string())?;
    let status = response.status().as_u16();
    let Some(bytes) = read_capped(response, MAX_BYTES).await.map_err(|_| "network".to_string())? else {
        return Err("too large".into());
    };
    Ok(CloudResponse { status, text: String::from_utf8_lossy(&bytes).into_owned() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_app_s_own_requests_are_sent() {
        assert!(is_allowed("POST", "/api/auth/code"));
        assert!(is_allowed("PUT", "/api/vault"));
        assert!(is_allowed("DELETE", "/api/account"));
        for (method, path) in [("GET", "/api/account"), ("POST", "/api/vault/../x"), ("GET", "https://evil.example/api/vault"), ("GET", "//evil.example/api/vault"), ("PATCH", "/api/vault"), ("GET", "")] {
            assert!(!is_allowed(method, path), "{method} {path}");
        }
    }

    #[test]
    fn a_token_is_one_plain_word() {
        assert!(is_token("abc.DEF-123_xyz"));
        assert!(!is_token(""));
        assert!(!is_token("two words"));
        assert!(!is_token("line\r\nInjected: header"));
        assert!(!is_token(&"x".repeat(513)));
    }
}
