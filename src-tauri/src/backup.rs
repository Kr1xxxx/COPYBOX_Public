// Daily automatic backup: the page hands over one finished backup file (raw bytes) and this keeps the newest few in
// `backups/` inside the app data folder. The page decides what is in the file; this only stores, lists and reads files
// whose names have exactly the shape `clipbox-auto-YYYY-MM-DD.json`, so nothing outside that folder is ever touched.
// Pictures (D-043) are kept once each in `backups/images/`, named `<64 lowercase hex>.bin` (the page names them after a
// SHA-256 of their bytes and checks that when reading back); the day files point at them, and the page says which to keep.
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

const KEEP: usize = 7;
const MAX_BYTES: usize = 512 * 1024 * 1024;
// One picture record: pictures are at most 10 MB before encryption, so this leaves plenty of room.
const MAX_IMAGE_BYTES: usize = 64 * 1024 * 1024;
const DIR: &str = "backups";
const IMAGE_DIR: &str = "images";

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

/// Only `<64 lowercase hex digits>.bin`, never a path.
pub fn is_image_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 68 && name.ends_with(".bin") && bytes[..64].iter().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
}

/// The names to delete so only the newest `keep` remain (names sort by date); unknown names are never listed.
pub fn names_to_delete(names: &[String], keep: usize) -> Vec<String> {
    let mut valid: Vec<&String> = names.iter().filter(|name| is_backup_name(name)).collect();
    valid.sort();
    valid.reverse();
    valid.into_iter().skip(keep).cloned().collect()
}

/// The picture files that are not in `keep`; names of any other shape are never listed.
pub fn images_to_delete(names: &[String], keep: &[String]) -> Vec<String> {
    let keep: HashSet<&str> = keep.iter().map(String::as_str).collect();
    names.iter().filter(|name| is_image_name(name) && !keep.contains(name.as_str())).cloned().collect()
}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn image_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = folder(app)?.join(IMAGE_DIR);
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

fn list_files(dir: &PathBuf, valid: fn(&str) -> bool) -> Vec<BackupInfo> {
    let mut list: Vec<BackupInfo> = existing_names(dir)
        .into_iter()
        .filter(|name| valid(name))
        .filter_map(|name| fs::metadata(dir.join(&name)).ok().map(|meta| BackupInfo { name, size: meta.len() }))
        .collect();
    list.sort_by(|a, b| b.name.cmp(&a.name));
    list
}

/// The body (not empty, at most `max` bytes: "too-large" above that, so the page can say why) and the checked name header.
fn body_and_name<'a>(request: &'a Request<'_>, max: usize, valid: fn(&str) -> bool) -> Result<(&'a [u8], String), String> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if bytes.len() > max => return Err("too-large".into()),
        InvokeBody::Raw(bytes) if !bytes.is_empty() => bytes,
        _ => return Err("input".into()),
    };
    let name = request.headers().get("x-backup-name").and_then(|value| value.to_str().ok()).unwrap_or("").to_string();
    if !valid(&name) {
        return Err("name".into());
    }
    Ok((bytes, name))
}

/// Writes through a temporary file, so a cut-off write never leaves half a file under the real name.
fn write_file(dir: &PathBuf, name: &str, bytes: &[u8]) -> Result<(), String> {
    let temp = dir.join(format!("{name}.tmp"));
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temp, dir.join(name)).map_err(|e| e.to_string())
}

/// Writes today's file (name in the `x-backup-name` header, bytes as the body) through a temporary file, then removes
/// the oldest ones beyond the newest seven.
#[tauri::command]
pub fn backup_save(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let (bytes, name) = body_and_name(&request, MAX_BYTES, is_backup_name)?;
    let dir = folder(&app)?;
    write_file(&dir, &name, bytes)?;
    for old in names_to_delete(&existing_names(&dir), KEEP) {
        let _ = fs::remove_file(dir.join(old));
    }
    Ok(())
}

#[tauri::command]
pub fn backup_list(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    Ok(list_files(&folder(&app)?, is_backup_name))
}

#[tauri::command]
pub fn backup_read(app: AppHandle, name: String) -> Result<Response, String> {
    if !is_backup_name(&name) {
        return Err("name".into());
    }
    let bytes = fs::read(folder(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

/// Writes one picture file (same body and header as `backup_save`).
#[tauri::command]
pub fn backup_image_save(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let (bytes, name) = body_and_name(&request, MAX_IMAGE_BYTES, is_image_name)?;
    write_file(&image_folder(&app)?, &name, bytes)
}

#[tauri::command]
pub fn backup_image_list(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    Ok(list_files(&image_folder(&app)?, is_image_name))
}

#[tauri::command]
pub fn backup_image_read(app: AppHandle, name: String) -> Result<Response, String> {
    if !is_image_name(&name) {
        return Err("name".into());
    }
    let bytes = fs::read(image_folder(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

/// Removes the picture files not named in `keep` (only names of the picture shape, only inside `backups/images/`).
#[tauri::command]
pub fn backup_image_prune(app: AppHandle, keep: Vec<String>) -> Result<(), String> {
    let dir = image_folder(&app)?;
    for old in images_to_delete(&existing_names(&dir), &keep) {
        let _ = fs::remove_file(dir.join(old));
    }
    Ok(())
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

    #[test]
    fn only_exact_picture_names_are_accepted() {
        assert!(is_image_name(&format!("{}.bin", "0123456789abcdef".repeat(4))));
        let hex = "a".repeat(64);
        for bad in [
            String::new(),
            format!("{}.bin", "A".repeat(64)),
            format!("{}.bin", "a".repeat(63)),
            format!("{}.bin", "a".repeat(65)),
            format!("{}.bin", "g".repeat(64)),
            format!("{hex}.bin.tmp"),
            format!("{hex}.json"),
            format!("../{}.bin", "a".repeat(61)),
            format!("{}/{}.bin", "a".repeat(31), "a".repeat(32)),
            format!("{}\\{}.bin", "a".repeat(31), "a".repeat(32)),
            "clipbox-auto-2026-10-12.json".into(),
        ] {
            assert!(!is_image_name(&bad), "{bad}");
        }
    }

    #[test]
    fn only_pictures_left_out_of_keep_go_and_strangers_stay() {
        let (a, b, c) = (format!("{}.bin", "a".repeat(64)), format!("{}.bin", "b".repeat(64)), format!("{}.bin", "c".repeat(64)));
        let names = vec![a.clone(), b.clone(), c.clone(), format!("{a}.tmp"), "notes.txt".into(), "clipbox-auto-2026-10-12.json".into()];
        assert_eq!(images_to_delete(&names, &[b.clone()]), vec![a.clone(), c.clone()]);
        assert!(images_to_delete(&names, &[a, b, c]).is_empty());
    }
}
