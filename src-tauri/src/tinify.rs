// Compresses one picture with the TinyPNG API (D-037). The page cannot call the service itself, so it hands the bytes
// to this command. Only api.tinify.com is ever contacted. Failures are returned as one of the reason words the page
// understands: key, limit, type, service, network, input.
use std::time::Duration;

use tauri::ipc::{InvokeBody, Request, Response};

const ENDPOINT: &str = "https://api.tinify.com/shrink";
const HOST: &str = "api.tinify.com";
const TIMEOUT: Duration = Duration::from_secs(30);
const MAX_BYTES: usize = 10 * 1024 * 1024;
/// The key the person filled in 设置 (D-055: no key is built into the installer); an empty one means none.
pub fn resolve_key(asked: &str) -> Option<String> {
    let asked = asked.trim();
    if asked.is_empty() { None } else { Some(asked.to_string()) }
}

/// What a TinyPNG answer other than "created" means for the page.
pub fn reason_for_status(status: u16) -> &'static str {
    match status {
        401 => "key",
        429 => "limit",
        415 => "type",
        _ => "service",
    }
}

/// The compressed picture must be fetched from TinyPNG itself, never from an address a reply names.
pub fn is_tinify_url(value: &str) -> bool {
    url::Url::parse(value).map(|url| url.scheme() == "https" && url.host_str() == Some(HOST) && url.port().is_none()).unwrap_or(false)
}

#[tauri::command]
pub async fn compress_image(request: Request<'_>) -> Result<Response, String> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= MAX_BYTES => bytes.clone(),
        _ => return Err("input".into()),
    };
    let asked = request.headers().get("x-tinify-key").and_then(|value| value.to_str().ok()).unwrap_or("");
    let key = resolve_key(asked).ok_or_else(|| "key".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "service".to_string())?;
    let shrink = client.post(ENDPOINT).basic_auth("api", Some(&key)).body(bytes).send().await.map_err(|_| "network".to_string())?;
    if shrink.status().as_u16() != 201 {
        return Err(reason_for_status(shrink.status().as_u16()).into());
    }
    let location = shrink.headers().get("location").and_then(|value| value.to_str().ok()).unwrap_or("").to_string();
    if !is_tinify_url(&location) {
        return Err("service".into());
    }
    let result = client.get(&location).basic_auth("api", Some(&key)).send().await.map_err(|_| "network".to_string())?;
    if !result.status().is_success() {
        return Err("service".into());
    }
    let out = result.bytes().await.map_err(|_| "network".to_string())?;
    Ok(Response::new(out.to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_map_to_reasons() {
        assert_eq!(reason_for_status(401), "key");
        assert_eq!(reason_for_status(429), "limit");
        assert_eq!(reason_for_status(415), "type");
        assert_eq!(reason_for_status(500), "service");
        assert_eq!(reason_for_status(400), "service");
    }

    #[test]
    fn only_the_persons_own_key_is_sent() {
        assert_eq!(resolve_key(" mine ").as_deref(), Some("mine"));
        for bad in ["", "  "] {
            assert_eq!(resolve_key(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn only_tinypng_result_addresses_are_followed() {
        assert!(is_tinify_url("https://api.tinify.com/output/abc"));
        for bad in ["http://api.tinify.com/output/abc", "https://evil.example/x", "https://api.tinify.com.evil.example/x", "https://api.tinify.com:8443/x", "not a url", ""] {
            assert!(!is_tinify_url(bad), "{bad}");
        }
    }
}
