// Reads the company 话术 library file from the address typed in Settings (same rules as desktop/shared-fetch.cjs):
// a plain GET with no cookies and no keys, http(s) only, no login in the address, a size limit, a timeout.
// The file may live on the company network (D-026 leaves the place open and allows http), so office addresses
// (10.x, 192.168.x, …) are fine; this computer itself, link-local (cloud metadata 169.254.169.254), multicast and
// "nowhere" addresses are not. Redirects are followed by hand so every hop gets the same checks.
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use url::Url;

use crate::site_icon::{embedded_ipv4, read_capped};

const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_BYTES: usize = 5 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const UNREACHABLE: &str = "无法连接到公司话术库地址";

pub fn parse_shared_url(value: &str) -> Result<Url, String> {
    let bad = || "地址不对，要以 https:// 开头".to_string();
    let url = Url::parse(value.trim()).map_err(|_| bad())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err(bad());
    }
    if matches!(url.host_str(), None | Some("")) {
        return Err(bad());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("地址里不要带账号密码".into());
    }
    Ok(url)
}

/// The next address after a redirect, checked like a typed one.
pub fn next_hop(current: &Url, location: &str) -> Result<Url, String> {
    let joined = current.join(location).map_err(|_| UNREACHABLE.to_string())?;
    parse_shared_url(joined.as_str())
}

/// Addresses the library file may never come from: this computer, link-local, multicast, broadcast, "nowhere".
pub fn is_refused_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_unspecified() || v4.is_link_local() || v4.is_multicast() || v4.is_broadcast() || v4.octets()[0] == 0
        }
        IpAddr::V6(v6) => {
            if let Some(inner) = embedded_ipv4(v6) {
                return is_refused_address(IpAddr::V4(inner));
            }
            let first = v6.segments()[0];
            v6.is_loopback() || v6.is_unspecified() || first & 0xffc0 == 0xfe80 || first & 0xff00 == 0xff00
        }
    }
}

fn unreachable_or_timeout(error: &reqwest::Error) -> String {
    if error.is_timeout() { "连接公司话术库超时".into() } else { UNREACHABLE.into() }
}

async fn checked_addresses(url: &Url) -> Result<(String, Vec<SocketAddr>), String> {
    let host = url.host_str().ok_or_else(|| UNREACHABLE.to_string())?;
    let port = url.port_or_known_default().ok_or_else(|| UNREACHABLE.to_string())?;
    // An IPv6 literal comes back in brackets; the name lookup wants it without.
    let lookup = host.trim_start_matches('[').trim_end_matches(']').to_string();
    let addresses: Vec<SocketAddr> = tokio::net::lookup_host((lookup.as_str(), port)).await.map_err(|_| UNREACHABLE.to_string())?.collect();
    if addresses.is_empty() || addresses.iter().any(|address| is_refused_address(address.ip())) {
        return Err(UNREACHABLE.into());
    }
    Ok((lookup, addresses))
}

#[tauri::command]
pub async fn fetch_shared_library(url: String) -> Result<String, String> {
    let mut target = parse_shared_url(&url)?;
    for _ in 0..=MAX_REDIRECTS {
        let (host, addresses) = checked_addresses(&target).await?;
        // The checked answer of the name lookup is used for the request, and no proxy makes its own lookup.
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .timeout(TIMEOUT)
            .resolve(&host, addresses[0])
            .build()
            .map_err(|_| UNREACHABLE.to_string())?;
        let response = client.get(target.clone()).header("accept", "application/json").send().await.map_err(|e| unreachable_or_timeout(&e))?;
        if response.status().is_redirection() {
            let location = response.headers().get("location").and_then(|value| value.to_str().ok()).ok_or_else(|| UNREACHABLE.to_string())?;
            target = next_hop(&target, location)?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("公司话术库地址打不开（{}）", response.status().as_u16()));
        }
        let Some(bytes) = read_capped(response, MAX_BYTES).await.map_err(|e| unreachable_or_timeout(&e))? else {
            return Err("公司话术库文件太大".into());
        };
        return Ok(String::from_utf8_lossy(&bytes).into_owned());
    }
    Err(UNREACHABLE.into())
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

    #[test]
    fn redirects_get_the_same_checks_as_a_typed_address() {
        let start = Url::parse("https://example.com/lib.json").unwrap();
        assert_eq!(next_hop(&start, "/v2/lib.json").unwrap().as_str(), "https://example.com/v2/lib.json");
        assert_eq!(next_hop(&start, "http://intranet.local/lib.json").unwrap().as_str(), "http://intranet.local/lib.json");
        assert!(next_hop(&start, "file:///etc/passwd").is_err());
        assert!(next_hop(&start, "ftp://example.com/x").is_err());
        assert_eq!(next_hop(&start, "https://user:pw@example.com/x").unwrap_err(), "地址里不要带账号密码");
    }

    #[test]
    fn this_computer_and_link_local_are_refused_but_the_office_network_is_not() {
        for address in [
            "127.0.0.1", "127.8.9.1", "0.0.0.0", "169.254.169.254", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1",
            "ff02::1", "::ffff:127.0.0.1", "::127.0.0.1", "64:ff9b::169.254.169.254", "2002:7f00:1::",
        ] {
            assert!(is_refused_address(address.parse().unwrap()), "{address}");
        }
        for address in ["10.0.0.5", "192.168.1.20", "172.16.3.4", "fd00::5", "93.184.216.34", "2606:2800:220:1::1"] {
            assert!(!is_refused_address(address.parse().unwrap()), "{address}");
        }
    }
}
