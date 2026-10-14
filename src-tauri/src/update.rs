// Looks up the newest published version and, on Windows, can download that installer and install it over this app
// (D-023, D-047). Same version rules as desktop/update-check.cjs. Only an installer signed with the update key is
// installed (D-054).
use minisign_verify::{PublicKey, Signature};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

const CHECK_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// A download that receives nothing for this long counts as a broken network.
const CHUNK_TIMEOUT: Duration = Duration::from_secs(30);
/// The page gets at most about ten progress messages a second.
const PROGRESS_EVERY: Duration = Duration::from_millis(100);
/// No installer is this big (today about 2–5 MB); a manifest that says so is wrong.
const MAX_INSTALLER_BYTES: u64 = 200 * 1024 * 1024;
const PROGRESS_EVENT: &str = "clipbox:update-progress";

/// Where the app looks for the newest version: a small JSON file {"version","notes","url","size","sha256","signature"}
/// (D-047, D-054).
/// Only Windows looks: the website has no Mac installer. CLIPBOX_UPDATE_URL overrides it (for testing).
const DEFAULT_UPDATE_URL: &str = if cfg!(target_os = "windows") { "https://copyboxx.com/download/latest.json" } else { "" };

/// The only host an installer may come from.
const DOWNLOAD_HOST: &str = "copyboxx.com";

/// The public half of the update signing key (D-054, tools/update-signing.mjs). The private half lives only in a
/// GitHub secret and the owner's offline backup, never next to the website, so whoever takes over the website still
/// cannot make this app install anything.
const UPDATE_PUBLIC_KEY: &str = include_str!("../update-public-key.txt");

/// NSIS installer switches (Tauri's template, D-047): /P small progress window and no questions, /R start the app
/// again when done, /UPDATE install over the old version without uninstalling it first (keeps launch at login).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub const INSTALLER_ARGS: [&str; 3] = ["/P", "/R", "/UPDATE"];

/// What the last check found: where the installer is, what it must look like and its signature (minisign text whose
/// key and version were already checked; the bytes are checked while downloading).
#[derive(Clone, Debug, PartialEq)]
pub struct Release {
    pub url: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
    pub signature: String,
}

impl Release {
    /// The app may only install a file it can check completely.
    pub fn installable(&self) -> bool {
        self.size.is_some() && self.sha256.is_some()
    }
}

#[derive(Clone, Default)]
pub struct Updates {
    release: Arc<Mutex<Option<Release>>>,
    /// True while an installer is being downloaded, checked or started; a second request does nothing.
    installing: Arc<AtomicBool>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct UpdateInfo {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<Vec<String>>,
    /// Whether 「立即更新」 can download and install it here (Windows, with size and checksum in the manifest).
    #[serde(skip_serializing_if = "Option::is_none")]
    installable: Option<bool>,
}

impl UpdateInfo {
    fn status(status: &'static str) -> Self {
        UpdateInfo { status, version: None, notes: None, installable: None }
    }
}

/// The answer to 「立即更新」: installing (the app closes in a moment), busy (already under way) or error with a reason
/// the page turns into plain Chinese: network, incomplete, disk, start, unavailable, signature.
#[derive(Serialize, Debug, PartialEq)]
pub struct InstallResult {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
}

impl InstallResult {
    fn ok(status: &'static str) -> Self {
        InstallResult { status, reason: None }
    }
    fn error(reason: &'static str) -> Self {
        InstallResult { status: "error", reason: Some(reason) }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Progress {
    received: u64,
    total: u64,
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

/// Only https links on the product's own website, with no other port and no login in the link.
pub fn is_safe_download_url(value: &str) -> bool {
    url::Url::parse(value)
        .map(|u| u.scheme() == "https" && u.host_str() == Some(DOWNLOAD_HOST) && u.port().is_none() && u.username().is_empty() && u.password().is_none())
        .unwrap_or(false)
}

/// A SHA-256 written as 64 hex digits, in lower case; None for anything else.
pub fn parse_sha256(value: &str) -> Option<String> {
    let v = value.trim();
    (v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit())).then(|| v.to_ascii_lowercase())
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Whether the computed digest is the one the manifest promised.
pub fn sha256_matches(expected: &str, digest: &[u8]) -> bool {
    digest.len() == 32 && parse_sha256(expected).is_some_and(|e| e == to_hex(digest))
}

/// The update key built into this app; None only if the key file in the build is broken (then nothing is installed).
pub fn update_public_key() -> Option<PublicKey> {
    PublicKey::decode(UPDATE_PUBLIC_KEY.trim()).ok()
}

/// Keeps a manifest's signature only when it is minisign text made with `key`, in the prehashed mode that can be
/// checked while downloading, and its signed (trusted) comment names exactly `version` — so an older signed
/// installer cannot be passed off as a newer one. Whether it matches the installer's bytes is checked in the download.
pub fn accept_signature(text: &str, version: &str, key: &PublicKey) -> Option<String> {
    let text = text.trim();
    let signature = Signature::decode(text).ok()?;
    key.verify_stream(&signature).ok()?;
    let signed = signature.trusted_comment().split('\t').find_map(|part| part.strip_prefix("version:"))?;
    (signed == version).then(|| text.to_string())
}

/// The installer's file name, taken from the link (the product name may change); a safe fallback otherwise.
pub fn installer_file_name(url: &str) -> String {
    let last = url::Url::parse(url).ok().and_then(|u| u.path_segments().and_then(|mut s| s.next_back().map(str::to_string))).unwrap_or_default();
    let safe = !last.is_empty()
        && last.len() <= 80
        && last.to_ascii_lowercase().ends_with(".exe")
        && !last.starts_with('.')
        && last.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if safe { last } else { "update-setup.exe".to_string() }
}

/// Lets a progress message through at most once per `every`; the caller always sends the last one.
pub struct Throttle {
    every: Duration,
    last: Option<Instant>,
}

impl Throttle {
    pub fn new(every: Duration) -> Self {
        Throttle { every, last: None }
    }
    pub fn ready(&mut self, now: Instant) -> bool {
        match self.last {
            Some(last) if now.saturating_duration_since(last) < self.every => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

fn clean_notes(notes: &serde_json::Value) -> Vec<String> {
    let lines: Vec<String> = match notes {
        serde_json::Value::Array(items) => items.iter().map(|i| i.as_str().map(str::to_string).unwrap_or_else(|| i.to_string())).collect(),
        serde_json::Value::String(text) => text.split('\n').map(str::to_string).collect(),
        _ => vec![],
    };
    lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).take(5).map(|l| l.chars().take(80).collect()).collect()
}

/// Decides what a downloaded manifest means for the version that is running. A newer version without a good
/// signature for `key` is treated like a broken manifest: nothing is offered, not even the browser download, because
/// such a manifest can only come from someone other than us (D-054).
pub fn evaluate_manifest(manifest: &serde_json::Value, current: &str, key: Option<&PublicKey>) -> (UpdateInfo, Option<Release>) {
    let version = manifest.get("version").and_then(|v| v.as_str()).unwrap_or("");
    match compare_versions(version, current) {
        None => (UpdateInfo::status("error"), None),
        Some(order) if order <= 0 => (UpdateInfo::status("current"), None),
        Some(_) => {
            let version = version.trim().trim_start_matches('v');
            let url = manifest.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let signature = key.and_then(|key| accept_signature(manifest.get("signature").and_then(|v| v.as_str()).unwrap_or(""), version, key));
            let (true, Some(signature)) = (is_safe_download_url(url), signature) else {
                return (UpdateInfo::status("error"), None);
            };
            let release = Release {
                url: url.to_string(),
                size: manifest.get("size").and_then(|v| v.as_u64()).filter(|s| *s > 0 && *s <= MAX_INSTALLER_BYTES),
                sha256: manifest.get("sha256").and_then(|v| v.as_str()).and_then(parse_sha256),
                signature,
            };
            let notes = clean_notes(manifest.get("notes").unwrap_or(&serde_json::Value::Null));
            let info = UpdateInfo {
                status: "available",
                version: Some(version.to_string()),
                notes: Some(notes),
                installable: Some(cfg!(target_os = "windows") && release.installable()),
            };
            (info, Some(release))
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
    let (info, release) = evaluate_manifest(&manifest, &current, update_public_key().as_ref());
    if let Some(release) = release {
        *state.release.lock().unwrap() = Some(release);
    }
    Ok(info)
}

#[tauri::command]
pub fn open_update(app: AppHandle, state: tauri::State<Updates>) -> Result<bool, String> {
    let Some(url) = state.release.lock().unwrap().as_ref().map(|r| r.url.clone()) else { return Ok(false) };
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Downloads the installer the last check found, checks it, and then quits the normal way (the page saves first)
/// and starts the installer, which opens the new version when it is done.
#[tauri::command]
pub async fn install_update(app: AppHandle, state: tauri::State<'_, Updates>) -> Result<InstallResult, String> {
    if state.installing.swap(true, Ordering::SeqCst) {
        return Ok(InstallResult::ok("busy"));
    }
    let release = state.release.lock().unwrap().clone();
    let outcome = match release {
        Some(release) if cfg!(target_os = "windows") && release.installable() => download(&app, &release).await,
        _ => Err("unavailable"),
    };
    let path = match outcome {
        Ok(path) => path,
        Err(reason) => {
            state.installing.store(false, Ordering::SeqCst);
            return Ok(InstallResult::error(reason));
        }
    };
    // The installer replaces this app's files, so the page must have saved before it starts. Same order as 退出
    // and 重启: ask the page to save (flush.rs, 1.5 s at most), then start the installer, then exit.
    let (sender, receiver) = tokio::sync::oneshot::channel();
    begin_quit(&app);
    crate::flush::then_after_flush(&app, move |app| {
        let started = start_installer(&path);
        if started.is_ok() {
            app.exit(0);
        } else {
            let _ = std::fs::remove_file(&path);
            cancel_quit(app);
        }
        let _ = sender.send(started.is_ok());
    });
    if receiver.await.unwrap_or(false) {
        Ok(InstallResult::ok("installing"))
    } else {
        state.installing.store(false, Ordering::SeqCst);
        Ok(InstallResult::error("start"))
    }
}

fn begin_quit(app: &AppHandle) {
    let mode = app.state::<crate::window_mode::WindowMode>();
    app.state::<crate::shell::Shell>().begin_quit(app, &mode);
}

/// The installer could not be started: the app stays open as it was.
fn cancel_quit(app: &AppHandle) {
    app.state::<crate::shell::Shell>().cancel_quit();
    app.state::<crate::flush::Flush>().done_before_exit.store(false, Ordering::SeqCst);
}

fn download_folder() -> PathBuf {
    std::env::temp_dir().join("clipbox-update")
}

async fn download(app: &AppHandle, release: &Release) -> Result<PathBuf, &'static str> {
    let (Some(size), Some(sha256)) = (release.size, release.sha256.as_deref()) else { return Err("unavailable") };
    let folder = download_folder();
    std::fs::create_dir_all(&folder).map_err(|_| "disk")?;
    let path = folder.join(installer_file_name(&release.url));
    let _ = std::fs::remove_file(&path);
    let result = fetch_to_file(app, &release.url, size, sha256, &release.signature, &path).await;
    if result.is_err() {
        let _ = std::fs::remove_file(&path);
    }
    result.map(|_| path)
}

async fn fetch_to_file(app: &AppHandle, url: &str, size: u64, sha256: &str, signature: &str, path: &Path) -> Result<(), &'static str> {
    // The signature is checked over exactly the bytes that are written, while they arrive.
    let key = update_public_key().ok_or("signature")?;
    let signature = Signature::decode(signature).map_err(|_| "signature")?;
    let mut signed = key.verify_stream(&signature).map_err(|_| "signature")?;
    let client = reqwest::Client::builder().connect_timeout(CONNECT_TIMEOUT).build().map_err(|_| "network")?;
    let mut response = client.get(url).header("cache-control", "no-store").send().await.map_err(|_| "network")?;
    if !response.status().is_success() {
        return Err("network");
    }
    // A redirect may not lead somewhere else.
    if !is_safe_download_url(response.url().as_str()) {
        return Err("network");
    }
    if response.content_length().is_some_and(|length| length != size) {
        return Err("incomplete");
    }
    let mut file = std::fs::File::create(path).map_err(|_| "disk")?;
    let mut hasher = sha::Sha256::new().ok_or("incomplete")?;
    let mut received: u64 = 0;
    let mut throttle = Throttle::new(PROGRESS_EVERY);
    let _ = app.emit(PROGRESS_EVENT, Progress { received, total: size });
    loop {
        let chunk = tokio::time::timeout(CHUNK_TIMEOUT, response.chunk()).await.map_err(|_| "network")?.map_err(|_| "network")?;
        let Some(chunk) = chunk else { break };
        received += chunk.len() as u64;
        if received > size {
            return Err("incomplete");
        }
        file.write_all(&chunk).map_err(|_| "disk")?;
        if !hasher.update(&chunk) {
            return Err("incomplete");
        }
        signed.update(&chunk);
        if throttle.ready(Instant::now()) {
            let _ = app.emit(PROGRESS_EVENT, Progress { received, total: size });
        }
    }
    let _ = app.emit(PROGRESS_EVENT, Progress { received, total: size });
    file.sync_all().map_err(|_| "disk")?;
    drop(file);
    if received != size {
        return Err("incomplete");
    }
    match hasher.finish() {
        Some(digest) if sha256_matches(sha256, &digest) => {}
        _ => return Err("incomplete"),
    }
    // Complete and as the manifest promised, but not made by us: never started.
    signed.finalize().map_err(|_| "signature")
}

/// Starts the installer on its own, so it keeps running after this app has exited.
#[cfg(target_os = "windows")]
fn start_installer(path: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    std::process::Command::new(path)
        .args(INSTALLER_ARGS)
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
        .spawn()
        .map(|_| ())
}

#[cfg(not(target_os = "windows"))]
fn start_installer(_path: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "only the Windows installer can update itself"))
}

/// SHA-256 from Windows' own crypto library (BCrypt), fed chunk by chunk while the file downloads.
#[cfg(target_os = "windows")]
mod sha {
    use windows::Win32::Security::Cryptography::{BCryptCreateHash, BCryptDestroyHash, BCryptFinishHash, BCryptHashData, BCRYPT_HASH_HANDLE, BCRYPT_SHA256_ALG_HANDLE};

    pub struct Sha256(BCRYPT_HASH_HANDLE);

    // The handle is used by one task at a time; BCrypt hash handles may move between threads.
    unsafe impl Send for Sha256 {}

    impl Sha256 {
        pub fn new() -> Option<Self> {
            let mut handle = BCRYPT_HASH_HANDLE::default();
            let status = unsafe { BCryptCreateHash(BCRYPT_SHA256_ALG_HANDLE, &mut handle, None, None, 0) };
            (status.0 >= 0 && !handle.is_invalid()).then_some(Sha256(handle))
        }
        pub fn update(&mut self, data: &[u8]) -> bool {
            unsafe { BCryptHashData(self.0, data, 0) }.0 >= 0
        }
        pub fn finish(self) -> Option<[u8; 32]> {
            let mut digest = [0u8; 32];
            let status = unsafe { BCryptFinishHash(self.0, &mut digest, 0) };
            (status.0 >= 0).then_some(digest)
        }
    }

    impl Drop for Sha256 {
        fn drop(&mut self) {
            let _ = unsafe { BCryptDestroyHash(self.0) };
        }
    }
}

/// Elsewhere there is nothing to install, so there is nothing to hash either.
#[cfg(not(target_os = "windows"))]
mod sha {
    pub struct Sha256;
    impl Sha256 {
        pub fn new() -> Option<Self> {
            None
        }
        pub fn update(&mut self, _data: &[u8]) -> bool {
            false
        }
        pub fn finish(self) -> Option<[u8; 32]> {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const SITE: &str = "https://copyboxx.com/download/Copyboxx-Setup.exe";

    // A throwaway test key (made with tools/update-signing.mjs; its private half was never kept) and signatures of
    // TEST_INSTALLER as version 9.9.9: one with that key, one with another key.
    const TEST_KEY: &str = "untrusted comment: Copyboxx update public key 568D54A943DE8401\nRWRWjVSpQ96EAYGTg9PQGKuRsSfzLzABlTHtLFmB+3TaacRZQUrb3A4G\n";
    const TEST_INSTALLER: &[u8] = b"Copyboxx test installer";
    const GOOD_SIG: &str = "untrusted comment: signature from Copyboxx update key 568D54A943DE8401\nRURWjVSpQ96EARW+j1OSaPnD0ApeVDfEwYo8Jr3V8wPLZcASKB4vfRNPNiOI1warKBIwaAMFs3wvT0uIhaaKWlrSbR9fmp2EcwE=\ntrusted comment: version:9.9.9\tfile:Copyboxx-Windows-setup.exe\ttimestamp:1760000000\n2nvUZM6Xle29hOwpgn99p/EA8HL03GQxHTfwwXIKzMmgmt9qYoQWWJXHkAHnfwXXD9y1gbF4OBr3qDjD9b6ZAg==\n";
    const FOREIGN_SIG: &str = "untrusted comment: signature from Copyboxx update key A5639766ABF89829\nRUSlY5dmq/iYKSNQT/LNIJ64Iz0jrxzDHNCOKpITA/0/g3h9UlzOTxPt0sGlBf1ZhoG3GlJOFvOAfaBsAEjwv9glqMbpLQyzwwA=\ntrusted comment: version:9.9.9\tfile:Copyboxx-Windows-setup.exe\ttimestamp:1760000000\n6sSVI6wZU8fvjIQfJDX213YZA9WFa1qdU3l/sSOpS7JyYOtQg3AOs8CNUBpuXdDM6KDJ530vvEducxHKctphBQ==\n";

    fn test_key() -> PublicKey {
        PublicKey::decode(TEST_KEY.trim()).unwrap()
    }

    fn evaluate(manifest: &serde_json::Value, current: &str) -> (UpdateInfo, Option<Release>) {
        evaluate_manifest(manifest, current, Some(&test_key()))
    }

    /// The same check the download does, on bytes fed in two chunks.
    fn bytes_match(signature: &str, bytes: &[u8]) -> bool {
        let key = test_key();
        let signature = Signature::decode(signature).unwrap();
        let mut signed = key.verify_stream(&signature).unwrap();
        let (a, b) = bytes.split_at(bytes.len() / 2);
        signed.update(a);
        signed.update(b);
        signed.finalize().is_ok()
    }

    #[test]
    fn compares_versions() {
        assert_eq!(compare_versions("9.9.9", "0.2.24"), Some(1));
        assert_eq!(compare_versions("v0.2.24", "0.2.24"), Some(0));
        assert_eq!(compare_versions("0.2.9", "0.2.24"), Some(-1));
        assert_eq!(compare_versions("abc", "0.2.24"), None);
        assert_eq!(compare_versions("1.2", "0.2.24"), None);
    }

    #[test]
    fn only_https_downloads_from_the_website_are_safe() {
        assert!(is_safe_download_url(SITE));
        assert!(is_safe_download_url("https://copyboxx.com/download/Clipboxx-Setup.exe"));
        assert!(!is_safe_download_url("http://copyboxx.com/download/Copyboxx-Setup.exe"));
        assert!(!is_safe_download_url("https://example.com/Clipbox.exe"));
        assert!(!is_safe_download_url("https://copyboxx.com.evil.com/a.exe"));
        assert!(!is_safe_download_url("https://evilcopyboxx.com/a.exe"));
        assert!(!is_safe_download_url("https://www.copyboxx.com/a.exe"));
        assert!(!is_safe_download_url("https://copyboxx.com:8443/a.exe"));
        assert!(!is_safe_download_url("https://user@copyboxx.com/a.exe"));
        assert!(!is_safe_download_url("file:///etc/passwd"));
        assert!(!is_safe_download_url("nonsense"));
    }

    #[test]
    fn newer_version_is_reported_with_clean_notes_size_and_checksum() {
        let manifest = json!({"version": "v9.9.9", "url": SITE, "notes": ["  快了  ", "", "稳了"], "size": 2_400_000, "sha256": ABC_SHA256.to_uppercase(), "signature": GOOD_SIG});
        let (info, release) = evaluate(&manifest, "0.2.24");
        assert_eq!(info.status, "available");
        assert_eq!(info.version.as_deref(), Some("9.9.9"));
        assert_eq!(info.notes.unwrap(), vec!["快了", "稳了"]);
        assert_eq!(info.installable, Some(cfg!(target_os = "windows")));
        assert_eq!(release, Some(Release { url: SITE.to_string(), size: Some(2_400_000), sha256: Some(ABC_SHA256.to_string()), signature: GOOD_SIG.trim().to_string() }));
    }

    #[test]
    fn a_manifest_without_size_or_checksum_can_only_be_downloaded_by_hand() {
        for manifest in [
            json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG}),
            json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "size": 10, "sha256": "abc"}),
            json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "size": 0, "sha256": ABC_SHA256}),
            json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "size": -5, "sha256": ABC_SHA256}),
            json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "size": "10", "sha256": ABC_SHA256}),
            json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "size": MAX_INSTALLER_BYTES + 1, "sha256": ABC_SHA256}),
        ] {
            let (info, release) = evaluate(&manifest, "0.2.24");
            assert_eq!(info.status, "available");
            assert_eq!(info.installable, Some(false), "{manifest}");
            assert!(!release.unwrap().installable());
        }
    }

    #[test]
    fn same_or_older_is_current_and_bad_data_is_an_error() {
        let same = json!({"version": "0.2.24", "url": SITE, "signature": GOOD_SIG});
        assert_eq!(evaluate(&same, "0.2.24").0.status, "current");
        let bad_url = json!({"version": "9.9.9", "url": "http://copyboxx.com/c.exe", "signature": GOOD_SIG});
        assert_eq!(evaluate(&bad_url, "0.2.24").0.status, "error");
        let other_host = json!({"version": "9.9.9", "url": "https://example.com/c.exe", "signature": GOOD_SIG, "size": 3, "sha256": ABC_SHA256});
        assert_eq!(evaluate(&other_host, "0.2.24"), (UpdateInfo::status("error"), None));
        assert_eq!(evaluate(&json!({}), "0.2.24").0.status, "error");
    }

    #[test]
    fn a_good_signature_is_kept_and_matches_only_the_signed_bytes() {
        let (info, release) = evaluate(&json!({"version": "9.9.9", "url": SITE, "size": 23, "sha256": ABC_SHA256, "signature": GOOD_SIG}), "1.71.0");
        assert_eq!(info.installable, Some(cfg!(target_os = "windows")));
        let release = release.unwrap();
        assert!(bytes_match(&release.signature, TEST_INSTALLER));
        // A file changed by one byte, cut short or grown is refused.
        let mut changed = TEST_INSTALLER.to_vec();
        changed[0] ^= 1;
        assert!(!bytes_match(&release.signature, &changed));
        assert!(!bytes_match(&release.signature, &TEST_INSTALLER[..22]));
        assert!(!bytes_match(&release.signature, &[TEST_INSTALLER, b"!"].concat()));
    }

    #[test]
    fn a_wrong_signature_offers_nothing() {
        let with = |signature: &str| json!({"version": "9.9.9", "url": SITE, "size": 23, "sha256": ABC_SHA256, "signature": signature});
        // Made with another key.
        assert_eq!(evaluate(&with(FOREIGN_SIG), "1.71.0"), (UpdateInfo::status("error"), None));
        // The signed comment (and so the version) edited: the key id matches, so this only fails on the bytes.
        let edited = GOOD_SIG.replace("timestamp:1760000000", "timestamp:1760000001");
        assert!(!bytes_match(&evaluate(&with(&edited), "1.71.0").1.unwrap().signature, TEST_INSTALLER));
        // A real signature of 9.9.9 offered as another version (an old installer passed off as new).
        let renamed = json!({"version": "10.0.0", "url": SITE, "size": 23, "sha256": ABC_SHA256, "signature": GOOD_SIG});
        assert_eq!(evaluate(&renamed, "1.71.0"), (UpdateInfo::status("error"), None));
        // Garbage, and the legacy (not prehashed) minisign mode.
        assert_eq!(evaluate(&with("nonsense"), "1.71.0").0.status, "error");
        let legacy = GOOD_SIG.replacen("RURW", "RWRW", 1);
        assert_eq!(evaluate(&with(&legacy), "1.71.0").0.status, "error");
    }

    #[test]
    fn a_missing_signature_offers_nothing() {
        let unsigned = json!({"version": "9.9.9", "url": SITE, "size": 23, "sha256": ABC_SHA256});
        assert_eq!(evaluate(&unsigned, "1.71.0"), (UpdateInfo::status("error"), None));
        assert_eq!(evaluate(&json!({"version": "9.9.9", "url": SITE, "signature": ""}), "1.71.0").0.status, "error");
        assert_eq!(evaluate(&json!({"version": "9.9.9", "url": SITE, "signature": 5}), "1.71.0").0.status, "error");
        // Without a usable key built in, nothing is ever offered.
        assert_eq!(evaluate_manifest(&json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG}), "1.71.0", None).0.status, "error");
        // Being up to date needs no signature.
        assert_eq!(evaluate(&json!({"version": "1.71.0"}), "1.71.0").0.status, "current");
    }

    #[test]
    fn the_built_in_update_key_is_a_minisign_key() {
        assert!(update_public_key().is_some());
    }

    #[test]
    fn notes_are_capped() {
        let many = json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "notes": (0..9).map(|i| format!("n{i}")).collect::<Vec<_>>()});
        assert_eq!(evaluate(&many, "0.2.24").0.notes.unwrap().len(), 5);
        let long = json!({"version": "9.9.9", "url": SITE, "signature": GOOD_SIG, "notes": ["字".repeat(200)]});
        assert_eq!(evaluate(&long, "0.2.24").0.notes.unwrap()[0].chars().count(), 80);
    }

    #[test]
    fn checksums_are_compared_as_hex() {
        let digest: Vec<u8> = (0..ABC_SHA256.len()).step_by(2).map(|i| u8::from_str_radix(&ABC_SHA256[i..i + 2], 16).unwrap()).collect();
        assert_eq!(to_hex(&digest), ABC_SHA256);
        assert!(sha256_matches(ABC_SHA256, &digest));
        assert!(sha256_matches(&format!("  {}  ", ABC_SHA256.to_uppercase()), &digest));
        let mut other = digest.clone();
        other[31] ^= 1;
        assert!(!sha256_matches(ABC_SHA256, &other));
        assert!(!sha256_matches(ABC_SHA256, &digest[..31]));
        assert!(!sha256_matches("", &digest));
        assert!(!sha256_matches(&ABC_SHA256[..63], &digest));
        assert_eq!(parse_sha256(&format!("{}g", &ABC_SHA256[..63])), None);
        assert_eq!(to_hex(&[0x00, 0x0f, 0xa0]), "000fa0");
    }

    #[test]
    fn the_installer_keeps_the_name_from_the_link() {
        assert_eq!(installer_file_name(SITE), "Copyboxx-Setup.exe");
        assert_eq!(installer_file_name("https://copyboxx.com/download/Clipboxx-Setup.exe?x=1"), "Clipboxx-Setup.exe");
        assert_eq!(installer_file_name("https://copyboxx.com/download/"), "update-setup.exe");
        assert_eq!(installer_file_name("https://copyboxx.com/download/setup.msi"), "update-setup.exe");
        assert_eq!(installer_file_name("https://copyboxx.com/download/..%5C..%5Cevil.exe"), "update-setup.exe");
        assert_eq!(installer_file_name("https://copyboxx.com/download/a%20b.exe"), "update-setup.exe");
        assert_eq!(installer_file_name("nonsense"), "update-setup.exe");
    }

    #[test]
    fn progress_is_sent_at_most_ten_times_a_second() {
        let start = Instant::now();
        let mut throttle = Throttle::new(PROGRESS_EVERY);
        let sent = (0..100).filter(|i| throttle.ready(start + Duration::from_millis(i * 10))).count();
        assert_eq!(sent, 10);
        let mut fresh = Throttle::new(PROGRESS_EVERY);
        assert!(fresh.ready(start));
        assert!(!fresh.ready(start + Duration::from_millis(99)));
        assert!(fresh.ready(start + Duration::from_millis(100)));
    }

    #[test]
    fn the_installer_runs_passive_restarts_and_updates_in_place() {
        assert_eq!(INSTALLER_ARGS, ["/P", "/R", "/UPDATE"]);
    }

    #[test]
    fn install_answers_serialize_for_the_page() {
        assert_eq!(serde_json::to_value(InstallResult::ok("installing")).unwrap(), json!({"status": "installing"}));
        assert_eq!(serde_json::to_value(InstallResult::error("network")).unwrap(), json!({"status": "error", "reason": "network"}));
        assert_eq!(serde_json::to_value(Progress { received: 5, total: 9 }).unwrap(), json!({"received": 5, "total": 9}));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_hashes_in_chunks() {
        let mut hasher = sha::Sha256::new().unwrap();
        assert!(hasher.update(b"a"));
        assert!(hasher.update(b"bc"));
        assert!(sha256_matches(ABC_SHA256, &hasher.finish().unwrap()));
    }
}
