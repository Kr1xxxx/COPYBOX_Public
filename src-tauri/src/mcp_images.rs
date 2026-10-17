// Local image-import preparation. Only this module reads the paths supplied by MCP.
use crate::automation::Failure;
use serde::Deserialize;
use serde_json::Value;
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::path::Path;

const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 20 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportRequest {
    action: String,
    files: Vec<ImportFile>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportFile {
    path: String,
    title: Option<String>,
    folder: Option<String>,
}

fn invalid(message: &str) -> Failure { ("INVALID_IMAGE_IMPORT".into(), message.into()) }

/// Inspect and read the opened file handle, never a second path. O_NOFOLLOW refuses a replaced
/// symlink, and O_NONBLOCK prevents a concurrent replacement with a FIFO from hanging a worker.
fn open_regular(path: &Path) -> Result<File, Failure> {
    let before = std::fs::symlink_metadata(path).map_err(|_| invalid("无法读取图片文件"))?;
    if !before.file_type().is_file() { return Err(invalid("图片路径必须指向普通文件")); }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(0x100 | 0x4); // O_NOFOLLOW | O_NONBLOCK (Darwin)
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(0x20000 | 0x800); // O_NOFOLLOW | O_NONBLOCK (Linux)
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000); // FILE_FLAG_OPEN_REPARSE_POINT
    }
    let file = options.open(path).map_err(|_| invalid("无法读取图片文件"))?;
    let after = file.metadata().map_err(|_| invalid("无法读取图片文件"))?;
    if !after.file_type().is_file() { return Err(invalid("图片路径必须指向普通文件")); }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if before.dev() != after.dev() || before.ino() != after.ino() { return Err(invalid("图片文件已改变，请重试")); }
    }
    if after.len() > MAX_FILE_BYTES as u64 { return Err(invalid("每张图片不能超过 10 MiB")); }
    Ok(file)
}

fn read_bounded(reader: impl Read, limit: usize) -> Result<Vec<u8>, Failure> {
    let mut bytes = Vec::new();
    reader.take(limit as u64 + 1).read_to_end(&mut bytes).map_err(|_| invalid("无法读取图片文件"))?;
    if bytes.len() > limit { return Err(invalid("图片文件超过大小限制")); }
    Ok(bytes)
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { Some("image/png") }
    else if bytes.starts_with(b"\xff\xd8\xff") { Some("image/jpeg") }
    else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { Some("image/gif") }
    else if bytes.len() >= 16 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" && matches!(&bytes[12..16], b"VP8 " | b"VP8L" | b"VP8X") { Some("image/webp") }
    else { None }
}

pub(crate) fn is_local_absolute_path(raw: &str) -> bool {
    let path = Path::new(raw);
    if !path.is_absolute() { return false; }
    #[cfg(windows)]
    if matches!(path.components().next(), Some(std::path::Component::Prefix(prefix)) if !matches!(prefix.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_))) {
        return false;
    }
    true
}

fn prepare_file(input: &ImportFile, original: &Value, total: &mut usize) -> Result<Value, Failure> {
    let path = Path::new(&input.path);
    if !is_local_absolute_path(&input.path) { return Err(invalid("图片路径必须是本机绝对路径")); }
    let file = open_regular(path)?;
    let remaining = MAX_TOTAL_BYTES - *total;
    if file.metadata().map_err(|_| invalid("无法读取图片文件"))?.len() > remaining as u64 {
        return Err(invalid("每次导入的图片合计不能超过 20 MiB"));
    }
    // The outer reader also bounds a growing file by the remaining batch budget.
    // Count bytes consumed even if reading or validation later fails.
    let mut bounded = (&file).take(remaining as u64);
    let read = read_bounded(&mut bounded, MAX_FILE_BYTES);
    *total += remaining - bounded.limit() as usize;
    let bytes = read?;
    if file.metadata().map_err(|_| invalid("无法读取图片文件"))?.len() != bytes.len() as u64 {
        return Err(invalid("图片文件已改变或超过大小限制，请重试"));
    }
    let mime = image_mime(&bytes).ok_or_else(|| invalid("仅支持 PNG、JPEG、WebP 和 GIF 图片"))?;
    let source_name = path.file_name().and_then(|name| name.to_str()).ok_or_else(|| invalid("图片文件名无效"))?;
    let mut output = original.clone();
    output["data"] = Value::String(crate::site_icon::base64_encode(&bytes));
    output["mimeType"] = Value::String(mime.into());
    output["sourceName"] = Value::String(source_name.into());
    // Retained in the original command; deserialization validates their types.
    let _ = (&input.title, &input.folder);
    Ok(output)
}

/// All preparation finishes before any file reaches the renderer. The renderer decodes every
/// image again before importing: signatures are an allowlist, not proof that a file is decodable.
/// Invalid requests fail together; individual files retain ordered errors alongside valid files.
pub fn prepare(mut command: Value) -> Result<Value, Failure> {
    let request: ImportRequest = serde_json::from_value(command.clone()).map_err(|_| invalid("图片导入参数无效"))?;
    if request.action != "image-import" || request.files.is_empty() || request.files.len() > 10 {
        return Err(invalid("每次请选择 1 至 10 张图片"));
    }
    // Option<String> permits null in serde; the external contract permits only absent or text.
    for entry in command["files"].as_array().ok_or_else(|| invalid("图片导入参数无效"))? {
        if ["title", "folder"].iter().any(|key| entry.get(key).is_some_and(|value| !value.is_string())) {
            return Err(invalid("图片标题和目录必须是文字"));
        }
    }
    let mut total = 0;
    for (index, input) in request.files.iter().enumerate() {
        command["files"][index] = match prepare_file(input, &command["files"][index], &mut total) {
            Ok(prepared) => prepared,
            Err((code, message)) => serde_json::json!({"path":input.path, "error":{"code":code,"message":message}}),
        };
    }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!("copyboxx-mcp-images-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
        fn file(&self, name: &str, bytes: &[u8]) -> std::path::PathBuf {
            let path = self.0.join(name);
            std::fs::write(&path, bytes).unwrap();
            path
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
    const PNG: &[u8] = &[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,4,0,0,0,181,28,12,2,0,0,0,11,73,68,65,84,120,218,99,100,248,15,0,1,5,1,1,39,24,227,102,0,0,0,0,73,69,78,68,174,66,96,130];

    #[test]
    fn prepares_a_real_fixture_and_keeps_metadata() {
        let f = Fixture::new();
        let path = f.file("sample.png", PNG);
        let result = prepare(json!({"action":"image-import","files":[{"path":path,"title":"Sample","folder":"Test"}]})).unwrap();
        assert_eq!(result["files"][0]["data"], crate::site_icon::base64_encode(PNG));
        assert_eq!(result["files"][0]["mimeType"], "image/png");
        assert_eq!(result["files"][0]["sourceName"], "sample.png");
        assert_eq!(result["files"][0]["title"], "Sample");
        assert_eq!(result["files"][0]["folder"], "Test");
        assert_eq!(result["files"][0]["path"], json!(path));
    }

    #[test]
    fn rejects_structural_errors_and_prepared_data_injection() {
        let f = Fixture::new();
        let good = f.file("sample.png", PNG);
        for command in [
            json!({"action":"image-import","files":[]}),
            json!({"action":"image-import","files":vec![json!({"path":good});11]}),
            json!({"action":"image-import","files":[{"path":good,"data":"injected"}]}),
            json!({"action":"image-import","files":[{"path":good,"error":{"code":"injected","message":"injected"}}]}),
            json!({"action":"image-import","files":[{"path":good,"mimeType":"image/png"}]}),
            json!({"action":"image-import","files":[{"path":good,"title":2}]}),
            json!({"action":"image-import","files":[{"path":good}],"extra":true}),
        ] { assert!(prepare(command).is_err()); }
    }

    #[test]
    fn keeps_order_and_valid_files_when_other_files_fail() {
        let f = Fixture::new();
        let good = f.file("sample.png", PNG);
        let bad = f.file("fake.png", b"not an image");
        let missing = f.0.join("missing.png");
        let result = prepare(json!({"action":"image-import","files":[
            {"path":good,"title":"Keep"}, {"path":missing}, {"path":bad}, {"path":good},
            {"path":"relative.png"}, {"path":f.0}
        ]})).unwrap();
        assert_eq!(result["files"].as_array().unwrap().len(), 6);
        for index in [0,3] { assert_eq!(result["files"][index]["data"], crate::site_icon::base64_encode(PNG)); }
        assert_eq!(result["files"][0]["title"], "Keep");
        assert_eq!(result["files"][1]["path"], json!(missing));
        assert_eq!(result["files"][2]["path"], json!(bad));
        for index in [1,2,4,5] {
            let entry = &result["files"][index];
            assert_eq!(entry["error"]["code"], "INVALID_IMAGE_IMPORT");
            assert_eq!(entry.as_object().unwrap().len(), 2);
            assert!(entry.get("data").is_none());
            assert!(entry.get("mimeType").is_none());
        }
    }

    #[test]
    fn bounds_reads_and_total_size() {
        assert!(read_bounded(&b"12345"[..], 4).is_err());
        assert_eq!(read_bounded(&b"1234"[..], 4).unwrap(), b"1234");
        let f = Fixture::new();
        let oversized = f.file("large.png", PNG);
        std::fs::OpenOptions::new().write(true).open(&oversized).unwrap().set_len((MAX_FILE_BYTES + 1) as u64).unwrap();
        let result = prepare(json!({"action":"image-import","files":[{"path":oversized}]})).unwrap();
        assert!(result["files"][0]["error"].is_object());
        let full = f.file("full.png", PNG);
        std::fs::OpenOptions::new().write(true).open(&full).unwrap().set_len(MAX_FILE_BYTES as u64).unwrap();
        let result = prepare(json!({"action":"image-import","files":[{"path":full},{"path":full},{"path":full}]})).unwrap();
        assert!(result["files"][0]["data"].is_string());
        assert!(result["files"][1]["data"].is_string());
        assert!(result["files"][2]["error"].is_object());
        // Failed signature checks consume their read budget too.
        let invalid = f.file("invalid.png", b"not a PNG");
        std::fs::OpenOptions::new().write(true).open(&invalid).unwrap().set_len(MAX_FILE_BYTES as u64).unwrap();
        let good = f.file("small.png", PNG);
        let result = prepare(json!({"action":"image-import","files":[{"path":invalid},{"path":invalid},{"path":good}]})).unwrap();
        for entry in result["files"].as_array().unwrap() { assert!(entry["error"].is_object()); }
    }

    #[test]
    fn detects_only_supported_signatures() {
        assert_eq!(image_mime(PNG), Some("image/png"));
        assert_eq!(image_mime(b"\xff\xd8\xff\xe0rest"), Some("image/jpeg"));
        assert_eq!(image_mime(b"GIF89a\x01\0\x01\0"), Some("image/gif"));
        assert_eq!(image_mime(b"RIFFxxxxWEBPVP8 "), Some("image/webp"));
        for bytes in [b"".as_slice(), b"<svg></svg>", b"RIFFxxxxWAVE", b"GIF", b"\x89PNG"] { assert_eq!(image_mime(bytes), None); }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symbolic_links() {
        let f = Fixture::new();
        let original = f.file("original.png", PNG);
        let link = f.0.join("link.png");
        std::os::unix::fs::symlink(original, &link).unwrap();
        let result = prepare(json!({"action":"image-import","files":[{"path":link}]})).unwrap();
        assert!(result["files"][0]["error"].is_object());
    }
}
