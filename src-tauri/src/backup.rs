// Daily automatic backup: the page hands over one finished backup file (raw bytes) and this keeps the newest few in
// `backups/` inside the app data folder. The page decides what is in the file; this only stores, lists and reads files
// whose names have exactly the shape `clipbox-auto-YYYY-MM-DD.json`, so nothing outside that folder is ever touched.
use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

const KEEP: usize = 7;
const MAX_BYTES: usize = 512 * 1024 * 1024;
const DIR: &str = "backups";

/// Only `clipbox-auto-YYYY-MM-DD.json` (digits in the date), never a path.
pub fn is_backup_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    let (prefix, suffix) = ("clipbox-auto-", ".json");
    if !name.starts_with(prefix) || !name.ends_with(suffix) || name.len() != prefix.len() + 10 + suffix.len() {
        return false;
    }
    let date = &bytes[prefix.len()..prefix.len() + 10];
    date.iter().enumerate().all(|(i, b)| if i == 4 || i == 7 { *b == b'-' } else { b.is_ascii_digit() })
}

/// The names to delete so only the newest `keep` remain (names sort by date); unknown names are never listed.
pub fn names_to_delete(names: &[String], keep: usize) -> Vec<String> {
    let mut valid: Vec<&String> = names.iter().filter(|name| is_backup_name(name)).collect();
    valid.sort();
    valid.reverse();
    valid.into_iter().skip(keep).cloned().collect()
}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn existing_names(dir: &PathBuf) -> Vec<String> {
    fs::read_dir(dir).map(|entries| entries.filter_map(|e| e.ok()).filter_map(|e| e.file_name().into_string().ok()).collect()).unwrap_or_default()
}

#[derive(Serialize)]
pub struct BackupInfo {
    name: String,
    size: u64,
}

/// Writes today's file (name in the `x-backup-name` header, bytes as the body) through a temporary file, then removes
/// the oldest ones beyond the newest seven.
#[tauri::command]
pub fn backup_save(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() && bytes.len() <= MAX_BYTES => bytes,
        _ => return Err("input".into()),
    };
    let name = request.headers().get("x-backup-name").and_then(|value| value.to_str().ok()).unwrap_or("").to_string();
    if !is_backup_name(&name) {
        return Err("name".into());
    }
    let dir = folder(&app)?;
    let temp = dir.join(format!("{name}.tmp"));
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temp, dir.join(&name)).map_err(|e| e.to_string())?;
    for old in names_to_delete(&existing_names(&dir), KEEP) {
        let _ = fs::remove_file(dir.join(old));
    }
    Ok(())
}

#[tauri::command]
pub fn backup_list(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let dir = folder(&app)?;
    let mut list: Vec<BackupInfo> = existing_names(&dir)
        .into_iter()
        .filter(|name| is_backup_name(name))
        .filter_map(|name| fs::metadata(dir.join(&name)).ok().map(|meta| BackupInfo { name, size: meta.len() }))
        .collect();
    list.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(list)
}

#[tauri::command]
pub fn backup_read(app: AppHandle, name: String) -> Result<Response, String> {
    if !is_backup_name(&name) {
        return Err("name".into());
    }
    let bytes = fs::read(folder(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_names_are_accepted() {
        assert!(is_backup_name("clipbox-auto-2026-10-12.json"));
        for bad in ["", "../clipbox-auto-2026-10-12.json", "clipbox-auto-2026-10-12.json.tmp", "clipbox-auto-2026-1-12.json", "clipbox-auto-2026/10/12.json", "clipbox-auto-abcd-10-12.json", "other-2026-10-12.json"] {
            assert!(!is_backup_name(bad), "{bad}");
        }
    }

    #[test]
    fn the_oldest_beyond_seven_go_and_strangers_stay() {
        let mut names: Vec<String> = (1..=9).map(|d| format!("clipbox-auto-2026-10-{d:02}.json")).collect();
        names.push("notes.txt".into());
        names.push("clipbox-auto-2026-10-05.json.tmp".into());
        assert_eq!(names_to_delete(&names, 7), vec!["clipbox-auto-2026-10-02.json", "clipbox-auto-2026-10-01.json"]);
        assert!(names_to_delete(&names[..5], 7).is_empty());
    }
}
