// Reads the company 话术 library file from the address typed in Settings (same rules as desktop/shared-fetch.cjs):
// a plain GET with no cookies and no keys, http(s) only, no login in the address, a size limit, a timeout.
use std::time::Duration;

use url::Url;

const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_BYTES: usize = 5 * 1024 * 1024;

pub fn parse_shared_url(value: &str) -> Result<Url, String> {
    let bad = || "地址不对，要以 https:// 开头".to_string();
    let url = Url::parse(value.trim()).map_err(|_| bad())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err(bad());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("地址里不要带账号密码".into());
    }
    Ok(url)
}

fn unreachable_or_timeout(error: &reqwest::Error) -> String {
    if error.is_timeout() { "连接公司话术库超时".into() } else { "无法连接到公司话术库地址".into() }
}

#[tauri::command]
pub async fn fetch_shared_library(url: String) -> Result<String, String> {
    let target = parse_shared_url(&url)?;
    let client = reqwest::Client::builder().timeout(TIMEOUT).build().map_err(|_| "无法连接到公司话术库地址".to_string())?;
    let response = client.get(target).header("accept", "application/json").send().await.map_err(|e| unreachable_or_timeout(&e))?;
    if !response.status().is_success() {
        return Err(format!("公司话术库地址打不开（{}）", response.status().as_u16()));
    }
    if response.content_length().is_some_and(|len| len as usize > MAX_BYTES) {
        return Err("公司话术库文件太大".into());
    }
    let text = response.text().await.map_err(|e| unreachable_or_timeout(&e))?;
    if text.len() > MAX_BYTES {
        return Err("公司话术库文件太大".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_http_addresses_without_a_login_are_accepted() {
        assert_eq!(parse_shared_url(" https://example.com/lib.json ").unwrap().as_str(), "https://example.com/lib.json");
        assert!(parse_shared_url("http://intranet.local/lib.json").is_ok());
        for bad in ["", "ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "not a url"] {
            assert_eq!(parse_shared_url(bad).unwrap_err(), "地址不对，要以 https:// 开头", "{bad}");
        }
        assert_eq!(parse_shared_url("https://user:pw@example.com/x").unwrap_err(), "地址里不要带账号密码");
    }
}
