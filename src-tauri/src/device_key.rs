// The vault's device key on Windows (D-053): kept in Windows Credential Manager, which encrypts it for this Windows user
// (DPAPI), instead of next to the data in the page's storage. The page moves the key here itself and only removes its own
// copy after this side has stored it and read the same value back (app/device-key-store.ts). macOS and Linux keep the
// old place (an unsigned Mac app can lose its Keychain item after an update, D-012), so these commands refuse there.
const SERVICE: &str = "com.clipbox.tauri";
const KEY_NAME: &str = "device-key";

/// A device key is 32 random bytes in base64 (44 characters); anything else is refused, never stored.
pub fn is_device_key(value: &str) -> bool {
    value.len() == 44
        && value.ends_with('=')
        && !value[..43].contains('=')
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
}

#[cfg(windows)]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, KEY_NAME).map_err(|_| "unavailable".to_string())
}

/// The stored key; `None` only when there is none yet. Any other problem is an error, so the page never takes
/// "could not read" for "no key" (it then keeps using its own copy).
#[tauri::command]
pub fn device_key_get() -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        match entry()?.get_password() {
            Ok(key) if is_device_key(&key) => Ok(Some(key)),
            Ok(_) => Err("invalid".into()),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("unavailable".into()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (SERVICE, KEY_NAME);
        Err("unsupported".into())
    }
}

/// Stores the key and reads it back; succeeds only when the same value comes back.
#[tauri::command]
pub fn device_key_set(key: String) -> Result<(), String> {
    if !is_device_key(&key) {
        return Err("invalid".into());
    }
    #[cfg(windows)]
    {
        let entry = entry()?;
        entry.set_password(&key).map_err(|_| "unavailable".to_string())?;
        match entry.get_password() {
            Ok(back) if back == key => Ok(()),
            _ => Err("unavailable".into()),
        }
    }
    #[cfg(not(windows))]
    {
        Err("unsupported".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_32_byte_base64_key_is_accepted() {
        assert!(is_device_key("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
        assert!(is_device_key("q+/9ZmV3Vt1u2WIvEXk4oGzH1yKQh0sO5o0cT7l9R2w="));
        for bad in ["", "short=", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-=", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="] {
            assert!(!is_device_key(bad), "{bad}");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn other_systems_keep_the_old_place() {
        assert!(device_key_get().is_err());
        assert!(device_key_set("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=".into()).is_err());
    }
}
