// Small settings the user typed that should not sit in plain text next to the data (D-057): the two own TinyPNG keys and
// the 企业同步码 (or company library address). On Windows they live in Credential Manager (DPAPI, this Windows user only),
// like the AI key and the device key. The page reads them once on start and keeps them in memory, and removes its own
// plain copy only after this side has stored the value and read the same value back (app/secret-settings.ts).
// macOS and Linux keep the page's storage for now (an unsigned Mac app can lose its Keychain items after an update,
// D-012), so these commands refuse there.
const SERVICE: &str = "com.clipbox.tauri";
/// Only these names can be stored; the page cannot use this to write anything else into Credential Manager.
const NAMES: [&str; 3] = ["tinify-key-1", "tinify-key-2", "shared-library-url"];
/// Far above a TinyPNG key or a sync address, and well inside Credential Manager's 2560-byte limit.
const MAX_CHARS: usize = 1000;

pub fn is_known_name(name: &str) -> bool {
    NAMES.contains(&name)
}

pub fn is_storable(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= MAX_CHARS
}

#[cfg(windows)]
fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !is_known_name(name) {
        return Err("invalid".into());
    }
    keyring::Entry::new(SERVICE, name).map_err(|_| "unavailable".to_string())
}

/// The stored value; `None` only when there is none. Any other problem is an error, so the page never takes
/// "could not read" for "nothing saved" (it then keeps its own copy).
#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        match entry(&name)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("unavailable".into()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (SERVICE, name);
        Err("unsupported".into())
    }
}

/// Stores the value and reads it back; succeeds only when the same value comes back.
#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    if !is_known_name(&name) || !is_storable(&value) {
        return Err("invalid".into());
    }
    #[cfg(windows)]
    {
        let entry = entry(&name)?;
        entry.set_password(&value).map_err(|_| "unavailable".to_string())?;
        match entry.get_password() {
            Ok(back) if back == value => Ok(()),
            _ => Err("unavailable".into()),
        }
    }
    #[cfg(not(windows))]
    {
        Err("unsupported".into())
    }
}

/// Removes the value; nothing stored counts as removed.
#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    if !is_known_name(&name) {
        return Err("invalid".into());
    }
    #[cfg(windows)]
    {
        match entry(&name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("unavailable".into()),
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
    fn only_the_three_names_and_sensible_values_are_accepted() {
        for name in ["tinify-key-1", "tinify-key-2", "shared-library-url"] {
            assert!(is_known_name(name), "{name}");
        }
        for name in ["", "device-key", "ai-key", "tinify-key-3", "../x"] {
            assert!(!is_known_name(name), "{name}");
        }
        assert!(is_storable("abc123"));
        assert!(is_storable(&"x".repeat(1000)));
        assert!(!is_storable(""));
        assert!(!is_storable("   "));
        assert!(!is_storable(&"x".repeat(1001)));
        assert_eq!(secret_set("device-key".into(), "x".into()), Err("invalid".into()));
        assert_eq!(secret_delete("ai-key".into()), Err("invalid".into()));
    }

    #[cfg(not(windows))]
    #[test]
    fn other_systems_keep_the_old_place() {
        assert!(secret_get("tinify-key-1".into()).is_err());
        assert!(secret_set("tinify-key-1".into(), "abc".into()).is_err());
        assert!(secret_delete("tinify-key-1".into()).is_err());
    }
}
