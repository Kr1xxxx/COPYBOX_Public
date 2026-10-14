//! Windows: moves launch at login over from a copy installed under an older product name (D-046).
//!
//! Every rename of `productName` installs a new app beside the old one. The old copy's launch-at-login entry
//! (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\<old name>`) would keep starting the OLD app at login, and
//! because both share the single-instance lock (identifier `com.clipbox.tauri`) the new app then only brings up the
//! old window. On startup the current app removes those old entries and, if one of them was switched on, switches
//! launch at login on for itself through the autostart plugin (so 设置 shows it on). The current name's entry is only
//! ever touched through the plugin. Nothing happens on macOS.

/// Earlier `productName`s of the Tauri app (D-029 "Clipbox", D-044 "Clipboxx"); "CLIP BOX" in case a test build
/// used it. The Electron app's entry is never touched: it is named after its AppUserModelId and its program is
/// `Clipbox.exe`, which `is_our_program` does not match.
pub const OLD_NAMES: &[&str] = &["Clipbox", "Clipboxx", "CLIP BOX"];

/// The Cargo binary name; the Tauri installer keeps it as `clipbox.exe` under every product name.
const PROGRAM: &str = "clipbox.exe";

/// One `Run` value found under an old name.
#[derive(Clone, Debug, PartialEq)]
pub struct OldEntry {
    pub name: String,
    /// The command line stored in the `Run` value.
    pub command: String,
    /// The matching `Explorer\StartupApproved\Run` value (Task Manager's on/off switch), when there is one.
    pub approved: Option<Vec<u8>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Plan {
    /// Old names whose `Run` (and `StartupApproved`) values are removed.
    pub remove: Vec<String>,
    /// Switch launch at login on for the current app first; when that fails nothing is removed.
    pub enable_current: bool,
}

/// True for the names to look at: an old name, never the current one (registry names ignore case).
pub fn is_old_name(name: &str, current: &str) -> bool {
    !name.eq_ignore_ascii_case(current) && OLD_NAMES.iter().any(|old| old.eq_ignore_ascii_case(name))
}

/// Splits a `Run` command into program and arguments: quoted (`"C:\…\x.exe" --hidden`) or, as the autostart plugin writes it,
/// unquoted with spaces allowed in the path (`C:\Users\A B\…\x.exe --hidden`).
/// Returns (program, arguments).
fn split_command(command: &str) -> (&str, &str) {
    let command = command.trim();
    if let Some(rest) = command.strip_prefix('"') {
        return rest.split_once('"').unwrap_or((rest, ""));
    }
    // The first ".exe" followed by a space or the end. Lower-casing ASCII keeps byte offsets, so the index is valid
    // in the original (paths may hold Chinese).
    let lower = command.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(".exe") {
        let end = from + found + 4;
        if lower[end..].chars().next().map_or(true, char::is_whitespace) {
            return command.split_at(end);
        }
        from = end;
    }
    (command, "")
}

/// True when the command starts the Tauri app at login: program `clipbox.exe` (exact case; the Electron app's is
/// `Clipbox.exe`) with the `--hidden` argument the autostart plugin adds.
pub fn is_our_program(command: &str) -> bool {
    let (program, args) = split_command(command);
    let file = program.rsplit(['\\', '/']).next().unwrap_or("");
    file == PROGRAM && args.split_whitespace().any(|arg| arg == "--hidden")
}

/// Task Manager's switch: no value, or the trailing eight bytes all zero, means on (the rule auto-launch uses).
pub fn is_switched_on(approved: Option<&[u8]>) -> bool {
    match approved {
        None => true,
        Some(bytes) if bytes.len() < 8 => true,
        Some(bytes) => bytes.iter().rev().take(8).all(|b| *b == 0),
    }
}

/// What to do with the old entries found at startup.
pub fn plan(current: &str, entries: &[OldEntry], current_enabled: bool) -> Plan {
    let ours: Vec<&OldEntry> = entries.iter().filter(|e| is_old_name(&e.name, current) && is_our_program(&e.command)).collect();
    let was_on = ours.iter().any(|e| is_switched_on(e.approved.as_deref()));
    Plan { remove: ours.iter().map(|e| e.name.clone()).collect(), enable_current: was_on && !current_enabled }
}

#[cfg(windows)]
mod registry {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_EXPAND_SZ,
        REG_SZ, REG_VALUE_TYPE,
    };

    pub const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    pub const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    /// An open HKCU key, closed when dropped.
    pub struct Key(HKEY);

    impl Key {
        pub fn open(path: &str) -> Option<Key> {
            let mut key = HKEY::default();
            let status = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(path), None, KEY_QUERY_VALUE | KEY_SET_VALUE, &mut key) };
            status.is_ok().then_some(Key(key))
        }

        /// The raw value and its type, or None when it does not exist.
        pub fn read(&self, name: &str) -> Option<(REG_VALUE_TYPE, Vec<u8>)> {
            let name = HSTRING::from(name);
            let mut kind = REG_VALUE_TYPE::default();
            let mut size = 0u32;
            if unsafe { RegQueryValueExW(self.0, &name, None, Some(&mut kind), None, Some(&mut size)) }.is_err() {
                return None;
            }
            let mut data = vec![0u8; size as usize];
            if unsafe { RegQueryValueExW(self.0, &name, None, Some(&mut kind), Some(data.as_mut_ptr()), Some(&mut size)) }.is_err() {
                return None;
            }
            data.truncate(size as usize);
            Some((kind, data))
        }

        pub fn read_string(&self, name: &str) -> Option<String> {
            let (kind, data) = self.read(name)?;
            if kind != REG_SZ && kind != REG_EXPAND_SZ {
                return None;
            }
            let wide: Vec<u16> = data.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|c| *c != 0).collect();
            Some(String::from_utf16_lossy(&wide))
        }

        pub fn delete(&self, name: &str) {
            let _ = unsafe { RegDeleteValueW(self.0, &HSTRING::from(name)) };
        }
    }

    impl Drop for Key {
        fn drop(&mut self) {
            let _ = unsafe { RegCloseKey(self.0) };
        }
    }
}

/// Runs once at startup on Windows (main.rs, setup).
#[cfg(windows)]
pub fn migrate(app: &tauri::AppHandle) {
    use tauri_plugin_autostart::ManagerExt as AutostartExt;
    let current = app.package_info().name.clone();
    let Some(run) = registry::Key::open(registry::RUN) else { return };
    let approved = registry::Key::open(registry::APPROVED);
    let entries: Vec<OldEntry> = OLD_NAMES
        .iter()
        .filter(|name| is_old_name(name, &current))
        .filter_map(|name| {
            let command = run.read_string(name)?;
            let approved = approved.as_ref().and_then(|key| key.read(name)).map(|(_, bytes)| bytes);
            Some(OldEntry { name: name.to_string(), command, approved })
        })
        .collect();
    if entries.is_empty() {
        return;
    }
    let current_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let plan = plan(&current, &entries, current_enabled);
    if plan.enable_current && app.autolaunch().enable().is_err() {
        return;
    }
    for name in &plan.remove {
        run.delete(name);
        if let Some(key) = &approved {
            key.delete(name);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OLD_CMD: &str = r"C:\Users\A B\AppData\Local\Clipboxx\clipbox.exe --hidden";

    fn entry(name: &str, command: &str, approved: Option<Vec<u8>>) -> OldEntry {
        OldEntry { name: name.into(), command: command.into(), approved }
    }

    #[test]
    fn old_names_never_include_the_current_one() {
        assert!(is_old_name("Clipbox", "Copyboxx"));
        assert!(is_old_name("clipboxx", "Copyboxx"));
        assert!(is_old_name("CLIP BOX", "Copyboxx"));
        assert!(!is_old_name("Copyboxx", "Copyboxx"));
        assert!(!is_old_name("Clipboxx", "clipboxx"));
        assert!(!is_old_name("com.clipbox.desktop", "Copyboxx"));
        assert!(!is_old_name("OneDrive", "Copyboxx"));
    }

    #[test]
    fn only_the_tauri_program_with_hidden_counts() {
        // As the autostart plugin writes it: unquoted, spaces allowed in the path.
        assert!(is_our_program(OLD_CMD));
        assert!(is_our_program(r#""C:\Users\A B\AppData\Local\Clipbox\clipbox.exe" --hidden"#));
        assert!(is_our_program(r"C:\x\clipbox.exe  --hidden "));
        // The Electron app's program is Clipbox.exe; other programs and missing --hidden do not count.
        assert!(!is_our_program(r#""C:\Users\a\AppData\Local\Programs\Clipbox\Clipbox.exe" --hidden"#));
        assert!(!is_our_program(r"C:\x\clipbox.exe"));
        assert!(!is_our_program(r"C:\x\clipbox.exe --hiddenx"));
        assert!(!is_our_program(r"C:\x\other.exe --hidden"));
        assert!(!is_our_program(r"C:\clipbox.exe.d\other.exe --hidden"));
        assert!(!is_our_program(""));
    }

    #[test]
    fn task_manager_switch() {
        assert!(is_switched_on(None));
        assert!(is_switched_on(Some(&[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])));
        assert!(!is_switched_on(Some(&[3, 0, 0, 0, 0x10, 0x2a, 0x77, 0x1b, 0x5c, 0x3d, 0xdb, 0x01])));
        assert!(is_switched_on(Some(&[2])));
    }

    #[test]
    fn an_old_entry_that_was_on_moves_to_the_current_app() {
        let plan = plan("Copyboxx", &[entry("Clipboxx", OLD_CMD, None)], false);
        assert_eq!(plan, Plan { remove: vec!["Clipboxx".into()], enable_current: true });
    }

    #[test]
    fn several_old_entries_are_all_removed_and_launch_at_login_is_switched_on_once() {
        let entries = [entry("Clipbox", OLD_CMD, None), entry("Clipboxx", OLD_CMD, Some(vec![3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]))];
        let plan = plan("Copyboxx", &entries, false);
        assert_eq!(plan, Plan { remove: vec!["Clipbox".into(), "Clipboxx".into()], enable_current: true });
    }

    #[test]
    fn an_old_entry_switched_off_in_task_manager_is_removed_without_switching_on() {
        let off = Some(vec![3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
        let plan = plan("Copyboxx", &[entry("Clipboxx", OLD_CMD, off)], false);
        assert_eq!(plan, Plan { remove: vec!["Clipboxx".into()], enable_current: false });
    }

    #[test]
    fn already_on_for_the_current_app_only_removes() {
        let plan = plan("Copyboxx", &[entry("Clipbox", OLD_CMD, None)], true);
        assert_eq!(plan, Plan { remove: vec!["Clipbox".into()], enable_current: false });
    }

    #[test]
    fn nothing_happens_without_old_entries_or_for_foreign_ones() {
        assert_eq!(plan("Copyboxx", &[], false), Plan::default());
        let foreign = [
            entry("Copyboxx", r"C:\x\Copyboxx\clipbox.exe --hidden", None),
            entry("Clipbox", r#""C:\Programs\Clipbox\Clipbox.exe" --hidden"#, None),
            entry("OneDrive", r"C:\x\clipbox.exe --hidden", None),
        ];
        assert_eq!(plan("Copyboxx", &foreign, false), Plan::default());
    }
}
