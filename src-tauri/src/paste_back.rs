// 复制后贴到刚才的窗口 (D-081): a copy in the mini window can go straight into the chat window the person came from.
// The shell keeps track of the last window that was in front (not ours, not the taskbar or desktop), and after a
// copy brings it back and presses paste once for them. Off unless the setting is on; never a global shortcut (D-005).
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// What the last paste put where: (window, text). Same text to the same window again is skipped; a different
/// text to the same window goes on its own line (owner, 2026-10-19).
static LAST_PASTE: Mutex<Option<(u64, String)>> = Mutex::new(None);
const NEWLINE: &str = if cfg!(target_os = "windows") { "\r\n" } else { "\n" };

#[derive(Default)]
pub struct PasteBack {
    enabled: AtomicBool,
}

impl PasteBack {
    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }
}

#[tauri::command]
pub fn set_paste_back(state: tauri::State<PasteBack>, enabled: bool) {
    state.enabled.store(enabled, Ordering::Relaxed);
    if enabled {
        remember_front();
    }
}

/// Windows shell windows a paste must never go to: clicking the tray or the desktop puts them in front.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn is_shell_class(class: &str) -> bool {
    matches!(class, "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW")
}

/// None: do not paste (same text to the same window as last time). Some(true): paste on a new line (another text
/// into the window that already got one). Some(false): paste as is. Pictures (no text) always paste as is.
fn paste_plan(last: Option<&(u64, String)>, target: u64, text: Option<&str>) -> Option<bool> {
    match (last, text) {
        (Some((window, pasted)), Some(text)) if *window == target && pasted == text => None,
        (Some((window, _)), Some(_)) if *window == target => Some(true),
        _ => Some(false),
    }
}

/// `{unix id, name}` as osascript prints it: "1234, WeChat".
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_front(output: &str) -> Option<(u32, String)> {
    let (pid, name) = output.trim().split_once(", ")?;
    Some((pid.parse().ok()?, name.to_string()))
}

#[cfg(target_os = "windows")]
mod os {
    use super::is_shell_class;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::time::Duration;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
    use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_V};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, IsWindow, SetForegroundWindow, EVENT_SYSTEM_FOREGROUND, OBJID_WINDOW, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS};

    /// The last window in front that was not ours (the hook skips our own process).
    static LAST: AtomicIsize = AtomicIsize::new(0);

    unsafe extern "system" fn on_foreground(_: HWINEVENTHOOK, _: u32, hwnd: HWND, id_object: i32, _: i32, _: u32, _: u32) {
        if id_object != OBJID_WINDOW.0 || hwnd.is_invalid() {
            return;
        }
        let mut name = [0u16; 64];
        let len = unsafe { GetClassNameW(hwnd, &mut name) } as usize;
        if is_shell_class(&String::from_utf16_lossy(&name[..len])) {
            return;
        }
        LAST.store(hwnd.0 as isize, Ordering::Relaxed);
    }

    /// Call once on the main thread: Windows tells us whenever another window comes to the front.
    pub fn start() {
        unsafe {
            SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, None, Some(on_foreground), 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        }
    }

    pub fn remember_front() {}

    fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { Default::default() }, time: 0, dwExtraInfo: 0 } },
        }
    }

    /// Brings the remembered window to the front; its id, or None when it is gone.
    pub fn activate() -> Option<u64> {
        let raw = LAST.load(Ordering::Relaxed);
        let hwnd = HWND(raw as *mut core::ffi::c_void);
        if hwnd.is_invalid() || !unsafe { IsWindow(Some(hwnd)) }.as_bool() || !unsafe { SetForegroundWindow(hwnd) }.as_bool() {
            return None;
        }
        std::thread::sleep(Duration::from_millis(80));
        Some(raw as u64)
    }

    pub fn send_paste() {
        let keys = [key(VK_CONTROL, false), key(VK_V, false), key(VK_V, true), key(VK_CONTROL, true)];
        unsafe { SendInput(&keys, std::mem::size_of::<INPUT>() as i32) };
    }
}

#[cfg(target_os = "macos")]
mod os {
    use super::parse_front;
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

    /// Process id of the last app in front that was not us (and not the Finder: ⌘V there would make a clipping file).
    static LAST: AtomicU32 = AtomicU32::new(0);
    static SETTINGS_OPENED: AtomicBool = AtomicBool::new(false);

    fn osascript(lines: &[&str]) -> Option<String> {
        let mut cmd = Command::new("osascript");
        for line in lines {
            cmd.arg("-e").arg(line);
        }
        let out = cmd.output().ok()?;
        out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    }

    pub fn start() {}

    /// Asks System Events which app is in front; the first call shows the system's permission question.
    pub fn remember_front() {
        let Some(out) = osascript(&["tell application \"System Events\" to tell (first process whose frontmost is true) to get {unix id, name}"]) else { return };
        if let Some((pid, name)) = parse_front(&out) {
            if pid != std::process::id() && name != "Finder" {
                LAST.store(pid, Ordering::Relaxed);
            }
        }
    }

    /// Brings the remembered app to the front; its process id, or None when it is gone.
    pub fn activate() -> Option<u64> {
        let pid = LAST.load(Ordering::Relaxed);
        if pid == 0 {
            return None;
        }
        osascript(&[&format!("tell application \"System Events\" to set frontmost of (first process whose unix id is {pid}) to true")])?;
        std::thread::sleep(std::time::Duration::from_millis(150));
        Some(pid as u64)
    }

    pub fn send_paste() {
        if osascript(&["tell application \"System Events\" to keystroke \"v\" using command down"]).is_none() && !SETTINGS_OPENED.swap(true, Ordering::Relaxed) {
            // No 辅助功能 permission yet: show the pane once per run so the person can allow Copyboxx there.
            let _ = Command::new("open").arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility").status();
        }
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod os {
    pub fn start() {}
    pub fn remember_front() {}
    pub fn activate() -> Option<u64> {
        None
    }
    pub fn send_paste() {}
}

/// Call once from the main thread when the app starts.
pub fn start(_app: &AppHandle) {
    os::start();
}

/// The window is about to be shown or has just lost focus: note which app is in front now.
pub fn remember_front() {
    os::remember_front();
}

/// Bring the remembered window back and paste into it (after the copy has landed on the clipboard).
pub fn paste_into_front(app: AppHandle) {
    let mut last = LAST_PASTE.lock().unwrap();
    let Some(target) = os::activate() else { return };
    let text = app.clipboard().read_text().ok();
    let Some(own_line) = paste_plan(last.as_ref(), target, text.as_deref()) else { return };
    if own_line {
        // The chat box still holds the earlier text: start this one on a fresh line (stays so on the clipboard).
        let _ = app.clipboard().write_text(format!("{NEWLINE}{}", text.as_deref().unwrap_or_default()));
    }
    os::send_paste();
    *last = text.map(|text| (target, text));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taskbar_and_desktop_are_never_paste_targets() {
        assert!(is_shell_class("Shell_TrayWnd"));
        assert!(is_shell_class("WorkerW"));
        assert!(!is_shell_class("WeChatMainWndForPC"));
    }

    #[test]
    fn same_text_to_same_window_pastes_once_and_another_text_gets_its_own_line() {
        let last = Some((7, "你好".to_string()));
        assert_eq!(paste_plan(None, 7, Some("你好")), Some(false));
        assert_eq!(paste_plan(last.as_ref(), 7, Some("你好")), None);
        assert_eq!(paste_plan(last.as_ref(), 7, Some("再见")), Some(true));
        // Another window starts fresh; a picture has no text to compare.
        assert_eq!(paste_plan(last.as_ref(), 8, Some("你好")), Some(false));
        assert_eq!(paste_plan(last.as_ref(), 7, None), Some(false));
    }

    #[test]
    fn reads_pid_and_name_from_osascript() {
        assert_eq!(parse_front("1234, WeChat\n"), Some((1234, "WeChat".to_string())));
        assert_eq!(parse_front("garbage"), None);
        assert_eq!(parse_front("x, Finder"), None);
    }
}
