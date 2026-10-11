// Looks up the newest published version. It only tells the person; it never downloads or installs anything.
// Same rules as desktop/update-check.cjs.
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const CHECK_TIMEOUT: Duration = Duration::from_secs(10);

/// Where the app looks for the newest version: a small JSON file {"version","notes","url"}.
/// Empty means the reminder is off. CLIPBOX_UPDATE_URL overrides it (for testing).
const DEFAULT_UPDATE_URL: &str = "";

#[derive(Clone, Default)]
pub struct Updates {
    download_url: Arc<Mutex<String>>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct UpdateInfo {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<Vec<String>>,
}

impl UpdateInfo {
    fn status(status: &'static str) -> Self {
        UpdateInfo { status, version: None, notes: None }
    }
}

fn parse_version(value: &str) -> Option<[u64; 3]> {
    let v = value.trim().trim_start_matches('v');
    let mut parts = v.split('.');
    let out = [parts.next()?.parse().ok()?, parts.next()?.parse().ok()?, parts.next()?.parse().ok()?];
    parts.next().is_none().then_some(out)
}

/// 1 when a is newer, -1 when older, 0 when equal; None when either is not a version.
pub fn compare_versions(a: &str, b: &str) -> Option<i8> {
    let (left, right) = (parse_version(a)?, parse_version(b)?);
    Some(match left.cmp(&right) {
        std::cmp::Ordering::Greater => 1,
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Equal => 0,
    })
}

pub fn is_safe_download_url(value: &str) -> bool {
    url::Url::parse(value).map(|u| u.scheme() == "https").unwrap_or(false)
}

fn clean_notes(notes: &serde_json::Value) -> Vec<String> {
    let lines: Vec<String> = match notes {
        serde_json::Value::Array(items) => items.iter().map(|i| i.as_str().map(str::to_string).unwrap_or_else(|| i.to_string())).collect(),
        serde_json::Value::String(text) => text.split('\n').map(str::to_string).collect(),
        _ => vec![],
    };
    lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).take(5).map(|l| l.chars().take(80).collect()).collect()
}

/// Decides what a downloaded manifest means for the version that is running.
pub fn evaluate_manifest(manifest: &serde_json::Value, current: &str) -> (UpdateInfo, Option<String>) {
    let version = manifest.get("version").and_then(|v| v.as_str()).unwrap_or("");
    match compare_versions(version, current) {
        None => (UpdateInfo::status("error"), None),
        Some(order) if order <= 0 => (UpdateInfo::status("current"), None),
        Some(_) => {
            let url = manifest.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if !is_safe_download_url(url) {
                return (UpdateInfo::status("error"), None);
            }
            let notes = clean_notes(manifest.get("notes").unwrap_or(&serde_json::Value::Null));
            (
                UpdateInfo { status: "available", version: Some(version.trim().trim_start_matches('v').to_string()), notes: Some(notes) },
                Some(url.to_string()),
            )
        }
    }
}

#[tauri::command]
pub async fn check_update(app: AppHandle, state: tauri::State<'_, Updates>) -> Result<UpdateInfo, String> {
    let url = std::env::var("CLIPBOX_UPDATE_URL").unwrap_or_else(|_| DEFAULT_UPDATE_URL.to_string());
    if url.is_empty() {
        return Ok(UpdateInfo::status("disabled"));
    }
    let current = app.package_info().version.to_string();
    let fetched = async {
        let client = reqwest::Client::builder().timeout(CHECK_TIMEOUT).build().ok()?;
        let response = client.get(&url).header("cache-control", "no-store").send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        serde_json::from_str::<serde_json::Value>(&response.text().await.ok()?).ok()
    }
    .await;
    let Some(manifest) = fetched else { return Ok(UpdateInfo::status("error")) };
    let (info, download) = evaluate_manifest(&manifest, &current);
    if let Some(download) = download {
        *state.download_url.lock().unwrap() = download;
    }
    Ok(info)
}

#[tauri::command]
pub fn open_update(app: AppHandle, state: tauri::State<Updates>) -> Result<bool, String> {
    let url = state.download_url.lock().unwrap().clone();
    if url.is_empty() {
        return Ok(false);
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compares_versions() {
        assert_eq!(compare_versions("0.3.0", "0.2.24"), Some(1));
        assert_eq!(compare_versions("v0.2.24", "0.2.24"), Some(0));
        assert_eq!(compare_versions("0.2.9", "0.2.24"), Some(-1));
        assert_eq!(compare_versions("abc", "0.2.24"), None);
        assert_eq!(compare_versions("1.2", "0.2.24"), None);
    }

    #[test]
    fn only_https_downloads_are_safe() {
        assert!(is_safe_download_url("https://example.com/Clipbox.exe"));
        assert!(!is_safe_download_url("http://example.com/Clipbox.exe"));
        assert!(!is_safe_download_url("file:///etc/passwd"));
        assert!(!is_safe_download_url("nonsense"));
    }

    #[test]
    fn newer_version_is_reported_with_clean_notes() {
        let manifest = json!({"version": "v0.3.0", "url": "https://example.com/c.exe", "notes": ["  快了  ", "", "稳了"]});
        let (info, url) = evaluate_manifest(&manifest, "0.2.24");
        assert_eq!(info.status, "available");
        assert_eq!(info.version.as_deref(), Some("0.3.0"));
        assert_eq!(info.notes.unwrap(), vec!["快了", "稳了"]);
        assert_eq!(url.as_deref(), Some("https://example.com/c.exe"));
    }

    #[test]
    fn same_or_older_is_current_and_bad_data_is_an_error() {
        let same = json!({"version": "0.2.24", "url": "https://example.com/c.exe"});
        assert_eq!(evaluate_manifest(&same, "0.2.24").0.status, "current");
        let bad_url = json!({"version": "0.3.0", "url": "http://example.com/c.exe"});
        assert_eq!(evaluate_manifest(&bad_url, "0.2.24").0.status, "error");
        assert_eq!(evaluate_manifest(&json!({}), "0.2.24").0.status, "error");
    }

    #[test]
    fn notes_are_capped() {
        let many = json!({"version": "0.3.0", "url": "https://e.com/c", "notes": (0..9).map(|i| format!("n{i}")).collect::<Vec<_>>()});
        assert_eq!(evaluate_manifest(&many, "0.2.24").0.notes.unwrap().len(), 5);
        let long = json!({"version": "0.3.0", "url": "https://e.com/c", "notes": ["字".repeat(200)]});
        assert_eq!(evaluate_manifest(&long, "0.2.24").0.notes.unwrap()[0].chars().count(), 80);
    }
}
