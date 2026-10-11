// A website's own small icon for the 保险箱 (Mac): one plain GET to the site itself, nothing else is contacted.
// Same rules as desktop/site-icon.cjs: https only, public addresses only (the answer of the name lookup is pinned for
// the request), redirects followed by hand and only within the same site, images only (no SVG), size-limited.
use std::net::IpAddr;
use std::time::{Duration, UNIX_EPOCH};

use url::Url;

const TIMEOUT: Duration = Duration::from_secs(6);
const MAX_ICON_BYTES: usize = 100 * 1024;
const MAX_HTML_BYTES: usize = 200 * 1024;
const MAX_REDIRECTS: usize = 3;
const TWO_PART_SUFFIX: [&str; 10] = ["co.uk", "com.cn", "com.au", "co.jp", "com.hk", "com.tw", "com.br", "co.in", "org.uk", "net.cn"];

pub fn normalize_host(value: &str) -> String {
    let host = value.trim().to_lowercase();
    let host = host.strip_suffix('.').unwrap_or(&host).to_string();
    if host.len() < 4 || host.len() > 253 {
        return String::new();
    }
    let labels: Vec<&str> = host.split('.').collect();
    let (last, inner) = match labels.split_last() {
        Some((last, inner)) if !inner.is_empty() => (*last, inner),
        _ => return String::new(),
    };
    let label_ok = |label: &str| {
        let bytes = label.as_bytes();
        !bytes.is_empty()
            && bytes.len() <= 63
            && bytes.iter().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
            && bytes[0] != b'-'
            && bytes[bytes.len() - 1] != b'-'
    };
    if inner.iter().all(|label| label_ok(label)) && last.len() >= 2 && last.bytes().all(|b| b.is_ascii_lowercase()) {
        host
    } else {
        String::new()
    }
}

pub fn site_of(host: &str) -> String {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() <= 2 {
        return host.to_string();
    }
    let take = if TWO_PART_SUFFIX.contains(&parts[parts.len() - 2..].join(".").as_str()) { 3 } else { 2 };
    parts[parts.len() - take..].join(".")
}

pub fn is_private_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, _, _] = v4.octets();
            a == 0 || a == 10 || a == 127 || (a == 100 && (64..=127).contains(&b)) || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168) || a >= 224
        }
        IpAddr::V6(v6) => {
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return is_private_address(IpAddr::V4(mapped));
            }
            let first = v6.segments()[0];
            v6.is_unspecified() || v6.is_loopback() || first & 0xfe00 == 0xfc00 || first & 0xffc0 == 0xfe80
        }
    }
}

pub fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]) && bytes.len() >= 8 {
        Some("image/png")
    } else if bytes.starts_with(&[0, 0, 1, 0]) {
        Some("image/x-icon")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF8") && bytes.len() >= 6 {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn attribute(tag: &str, lower: &str, name: &str) -> Option<String> {
    let mut from = 0;
    while let Some(found) = lower[from..].find(name) {
        let start = from + found;
        let before_ok = start == 0 || !lower.as_bytes()[start - 1].is_ascii_alphanumeric() && lower.as_bytes()[start - 1] != b'-';
        let rest = lower[start + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let offset = lower.len() - rest.len() + 1;
            let value = tag[offset..].trim_start();
            let quote = value.chars().next()?;
            if quote == '"' || quote == '\'' {
                let inner = &value[1..];
                return inner.find(quote).map(|end| inner[..end].to_string());
            }
            return None;
        }
        from = start + name.len();
    }
    None
}

pub fn icon_link_from(html: &str, base: &Url) -> Option<Url> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find("<link") {
        let start = from + found;
        let end = lower[start..].find('>').map(|n| start + n + 1).unwrap_or(lower.len());
        let (tag, tag_lower) = (&html[start..end], &lower[start..end]);
        from = end;
        let rel = attribute(tag, tag_lower, "rel").unwrap_or_default().to_lowercase();
        let Some(href) = attribute(tag, tag_lower, "href") else { continue };
        let is_svg = href.to_ascii_lowercase().split('?').next().is_some_and(|path| path.ends_with(".svg"));
        if !rel.split_whitespace().any(|token| token == "icon") || is_svg {
            continue;
        }
        if let Ok(url) = base.join(&href) {
            return Some(url);
        }
    }
    None
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

async fn read_limited(mut response: reqwest::Response, max: usize) -> Result<Vec<u8>, ()> {
    if response.content_length().is_some_and(|len| len as usize > max) {
        return Err(());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        body.extend_from_slice(&chunk);
        if body.len() > max {
            return Err(());
        }
    }
    Ok(body)
}

// GET that follows redirects by hand, so every hop stays https, on the same site and on a public address.
async fn get_with_guards(start: Url, origin: &str) -> Result<(reqwest::Response, Url), ()> {
    let mut url = start;
    for _ in 0..=MAX_REDIRECTS {
        if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
            return Err(());
        }
        let host = normalize_host(url.host_str().ok_or(())?);
        if host.is_empty() || site_of(&host) != site_of(origin) {
            return Err(());
        }
        let addresses: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host.as_str(), 443)).await.map_err(|_| ())?.collect();
        if addresses.is_empty() || addresses.iter().any(|address| is_private_address(address.ip())) {
            return Err(());
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(TIMEOUT)
            .resolve(&host, addresses[0])
            .build()
            .map_err(|_| ())?;
        let response = client.get(url.clone()).header("accept", "image/*,text/html;q=0.5").send().await.map_err(|_| ())?;
        if response.status().is_redirection() {
            let location = response.headers().get("location").and_then(|value| value.to_str().ok()).ok_or(())?;
            url = url.join(location).map_err(|_| ())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(());
        }
        return Ok((response, url));
    }
    Err(())
}

async fn load_image(url: Url, origin: &str) -> Result<String, ()> {
    let (response, _) = get_with_guards(url, origin).await?;
    let bytes = read_limited(response, MAX_ICON_BYTES).await?;
    let kind = sniff_image(&bytes).ok_or(())?;
    Ok(format!("data:{kind};base64,{}", base64_encode(&bytes)))
}

// Returns a data: URL, or "" when the site has no usable icon (or is unreachable). Never fails.
#[tauri::command]
pub async fn fetch_site_icon(host: String) -> String {
    let host = normalize_host(&host);
    if host.is_empty() {
        return String::new();
    }
    let Ok(direct) = Url::parse(&format!("https://{host}/favicon.ico")) else { return String::new() };
    if let Ok(icon) = load_image(direct, &host).await {
        return icon;
    }
    let Ok(home) = Url::parse(&format!("https://{host}/")) else { return String::new() };
    let Ok((response, final_url)) = get_with_guards(home, &host).await else { return String::new() };
    let Ok(html) = read_limited(response, MAX_HTML_BYTES).await else { return String::new() };
    match icon_link_from(&String::from_utf8_lossy(&html), &final_url) {
        Some(link) => load_image(link, &host).await.unwrap_or_default(),
        None => String::new(),
    }
}

// The installed app changes when a new version is installed; the page shows this as "build time".
pub fn iso_from_unix(seconds: u64) -> String {
    let (days, rest) = ((seconds / 86_400) as i64, seconds % 86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000Z", rest / 3_600, rest % 3_600 / 60, rest % 60)
}

#[tauri::command]
pub fn get_build_time() -> String {
    std::env::current_exe()
        .and_then(|path| std::fs::metadata(path)?.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| iso_from_unix(elapsed.as_secs()))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_real_public_host_names_are_accepted() {
        assert_eq!(normalize_host(" Example.COM "), "example.com");
        for bad in ["", "localhost", "127.0.0.1", "10.0.0.5", "[::1]", "example", "a b.com", "https://example.com", "exa_mple.com", "example.com/path", "-a.example.com"] {
            assert_eq!(normalize_host(bad), "", "{bad}");
        }
        assert_eq!(normalize_host("a-b.example.co.uk."), "a-b.example.co.uk");
    }

    #[test]
    fn private_and_special_addresses_are_refused() {
        for address in ["127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"] {
            assert!(is_private_address(address.parse().unwrap()), "{address}");
        }
        assert!(!is_private_address("93.184.216.34".parse().unwrap()));
        assert!(!is_private_address("2606:2800:220:1::1".parse().unwrap()));
    }

    #[test]
    fn the_site_ignores_subdomains() {
        assert_eq!(site_of("www.example.com"), "example.com");
        assert_eq!(site_of("example.com"), "example.com");
        assert_eq!(site_of("a.b.example.co.uk"), "example.co.uk");
        assert_ne!(site_of("evil.test"), site_of("example.com"));
    }

    #[test]
    fn only_real_image_bytes_are_taken() {
        assert_eq!(sniff_image(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]), Some("image/png"));
        assert_eq!(sniff_image(&[0, 0, 1, 0, 1]), Some("image/x-icon"));
        assert_eq!(sniff_image(b"<html>not an image</html>"), None);
        assert_eq!(sniff_image(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"), None);
    }

    #[test]
    fn the_pages_own_icon_link_is_used_but_never_svg() {
        let base = Url::parse("https://example.com/").unwrap();
        let html = r#"<html><head><link rel="icon" type="image/svg+xml" href="/a.svg"><link rel="shortcut icon" href="/static/i.png"></head></html>"#;
        assert_eq!(icon_link_from(html, &base).unwrap().as_str(), "https://example.com/static/i.png");
        assert!(icon_link_from(r#"<link rel="stylesheet" href="/a.css">"#, &base).is_none());
        assert!(icon_link_from(r#"<LINK REL='ICON' HREF='x.ico?v=2'>"#, &base).is_some());
    }

    #[test]
    fn base64_matches_the_standard_examples() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn build_time_is_an_iso_date() {
        assert_eq!(iso_from_unix(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_from_unix(1_791_637_807), "2026-10-10T13:10:07.000Z");
        assert_eq!(iso_from_unix(951_782_400), "2000-02-29T00:00:00.000Z");
    }
}
