// 登录同步 (D-064): sends one request from the page to the Copyboxx server. Only https://copyboxx.com and only the
// /api/ paths the app uses; no redirects, no cookies, a size limit both ways and a timeout. The sign-in token comes
// from the page (Windows keeps it in Credential Manager, secret_store.rs) and goes out only as the Authorization header.
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::site_icon::read_capped;

const BASE: &str = "https://copyboxx.com";
const TIMEOUT: Duration = Duration::from_secs(30);
/// A route that cannot even connect in this time is given up for the next one.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// The page refuses to upload more than 5 MB; a little room for the JSON around it.
const MAX_BYTES: usize = 6 * 1024 * 1024;
const PATHS: [(&str, &str); 8] = [
    ("POST", "/api/auth/code"),
    ("POST", "/api/auth/verify"),
    ("POST", "/api/activate"),
    ("GET", "/api/vault"),
    ("PUT", "/api/vault"),
    ("GET", "/api/library"),
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

/// "network: <why>" with the whole cause chain (dns, connect, timeout, certificate), so the login page can say
/// what failed instead of only "cannot reach the server".
fn describe(error: reqwest::Error) -> String {
    let mut text = format!("network: {error}");
    let mut source = std::error::Error::source(&error);
    while let Some(cause) = source {
        text.push_str(&format!(": {cause}"));
        source = cause.source();
    }
    text
}

/// Two ways to the server, tried in this order: through the computer's system proxy (the same route as the browser;
/// without a proxy this is already a direct connection), then directly, so a proxy that cannot reach copyboxx.com
/// does not lock anyone out (owner, 2026-10-20). The next route is only for a route that could not connect (D-089).
pub(crate) fn clients(configure: impl Fn(reqwest::ClientBuilder) -> reqwest::ClientBuilder) -> Vec<reqwest::Client> {
    [false, true]
        .into_iter()
        .filter_map(|direct| {
            let builder = configure(reqwest::Client::builder());
            (if direct { builder.no_proxy() } else { builder }).build().ok()
        })
        .collect()
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
    let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|_| "invalid".to_string())?;
    if request.token.as_deref().is_some_and(|token| !is_token(token)) {
        return Err("invalid".into());
    }
    let mut failure = "network".to_string();
    for client in clients(|builder| builder.redirect(reqwest::redirect::Policy::none()).connect_timeout(CONNECT_TIMEOUT).timeout(TIMEOUT)) {
        let mut builder = client.request(method.clone(), format!("{BASE}{}", request.path)).header("accept", "application/json");
        if let Some(token) = request.token.as_deref() {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        if let Some(bytes) = &body {
            builder = builder.header("content-type", "application/json").body(bytes.clone());
        }
        match builder.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let Some(bytes) = read_capped(response, MAX_BYTES).await.map_err(describe)? else {
                    return Err("too large".into());
                };
                return Ok(CloudResponse { status, text: String::from_utf8_lossy(&bytes).into_owned() });
            }
            Err(error) if error.is_connect() => failure = describe(error),
            // The request may already have reached the server: sending it again could mean a second 验证码 email.
            Err(error) => return Err(describe(error)),
        }
    }
    Err(failure)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_app_s_own_requests_are_sent() {
        assert!(is_allowed("POST", "/api/auth/code"));
        assert!(is_allowed("PUT", "/api/vault"));
        assert!(is_allowed("DELETE", "/api/account"));
        assert!(is_allowed("GET", "/api/library"));
        assert!(is_allowed("POST", "/api/activate"));
        for (method, path) in [("GET", "/api/account"), ("POST", "/api/vault/../x"), ("GET", "https://evil.example/api/vault"), ("GET", "//evil.example/api/vault"), ("PATCH", "/api/vault"), ("PUT", "/api/library"), ("GET", "/api/library/../vault"), ("GET", "")] {
            assert!(!is_allowed(method, path), "{method} {path}");
        }
    }

    #[test]
    fn the_server_is_tried_through_the_proxy_and_then_directly() {
        assert_eq!(clients(|builder| builder.timeout(TIMEOUT)).len(), 2);
    }

    #[test]
    fn only_a_request_that_never_connected_counts_as_a_connect_failure() {
        let client = reqwest::Client::builder().no_proxy().connect_timeout(CONNECT_TIMEOUT).timeout(Duration::from_millis(300)).build().unwrap();
        let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap();
        let silent = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let silent_address = silent.local_addr().unwrap();
        tauri::async_runtime::block_on(async {
            let refused = client.get(format!("http://{closed}/api/library")).send().await.unwrap_err();
            assert!(refused.is_connect(), "{refused:?}");
            // Connected and sent, but no answer comes back: not tried again on the other route.
            let unanswered = client.post(format!("http://{silent_address}/api/auth/code")).send().await.unwrap_err();
            assert!(unanswered.is_timeout() && !unanswered.is_connect(), "{unanswered:?}");
        });
        drop(silent);
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
