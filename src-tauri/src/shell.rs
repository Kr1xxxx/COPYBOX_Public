// Tray, close behaviour, launch at login, data folder and "hide after copy": the shell parts of desktop/main.cjs.
use crate::window_mode::WindowMode;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CloseBehavior {
    Tray,
    Taskbar,
    Quit,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MiniHidePolicy {
    Hotkey,
    Always,
    Never,
}

struct Settings {
    close: CloseBehavior,
    mini_hide: MiniHidePolicy,
    quitting: bool,
}

#[derive(Clone)]
pub struct Shell {
    settings: Arc<Mutex<Settings>>,
}

impl Default for Shell {
    fn default() -> Self {
        Shell { settings: Arc::new(Mutex::new(Settings { close: CloseBehavior::Tray, mini_hide: MiniHidePolicy::Never, quitting: false })) }
    }
}

/// What happens when the close button is pressed.
#[derive(Debug, PartialEq)]
pub enum CloseAction {
    Quit,
    Minimize,
    Hide,
}

pub fn close_action(behavior: CloseBehavior, quitting: bool, is_windows: bool) -> CloseAction {
    if quitting || behavior == CloseBehavior::Quit {
        CloseAction::Quit
    } else if behavior == CloseBehavior::Taskbar && is_windows {
        // "taskbar" keeps the taskbar button, so a click on it brings the window back; "tray" hides it completely.
        CloseAction::Minimize
    } else {
        CloseAction::Hide
    }
}

/// Whether a copy should make the mini window hide itself.
pub fn hides_after_copy(policy: MiniHidePolicy, is_mini: bool, auto_hide: bool) -> bool {
    is_mini && policy != MiniHidePolicy::Never && (policy == MiniHidePolicy::Always || auto_hide)
}

impl Shell {
    pub fn quit(&self, app: &AppHandle, mode: &WindowMode) {
        self.begin_quit(app, mode);
        // The exit request makes the page save first (see flush.rs).
        app.exit(0);
    }

    /// Marks a quit as under way and keeps the window's place; the caller then asks the page to save and exits.
    pub fn begin_quit(&self, app: &AppHandle, mode: &WindowMode) {
        self.settings.lock().unwrap().quitting = true;
        if let Some(window) = app.get_webview_window("main") {
            mode.save_now(&window);
        }
    }

    /// A quit that could not finish (the update installer did not start): the app carries on as before.
    pub fn cancel_quit(&self) {
        self.settings.lock().unwrap().quitting = false;
    }

    /// Returns true when the close should go ahead: only while a quit is already under way (the page was asked to save
    /// first). 「关闭即退出」 itself hides the window and quits through `quit`, so the page is still there to save.
    pub fn on_close_requested(&self, window: &WebviewWindow, mode: &WindowMode) -> bool {
        mode.save_now(window);
        let (behavior, quitting) = {
            let s = self.settings.lock().unwrap();
            (s.close, s.quitting)
        };
        match close_action(behavior, quitting, cfg!(target_os = "windows")) {
            // A quit already asked the page to save; the window may now close as before.
            CloseAction::Quit if quitting => true,
            CloseAction::Quit => {
                // Do not let the window close yet: once it is gone the page cannot save what it still holds back
                // (flush.rs needs the window). Hide it and quit like the tray's 退出, which asks the page to save first.
                let _ = window.hide();
                self.quit(window.app_handle(), mode);
                false
            }
            CloseAction::Minimize => {
                let _ = window.minimize();
                false
            }
            CloseAction::Hide => {
                let _ = window.hide();
                false
            }
        }
    }
}

/// A tray click or "快速搜索" opens the mini window (it hides again after a copy, by setting).
/// Every other way of opening Clipbox returns to the full window.
pub fn show_window(app: &AppHandle, as_quick_search: bool) {
    let Some(window) = app.get_webview_window("main") else { return };
    let mode = app.state::<WindowMode>();
    if as_quick_search {
        mode.enter_mini(&window, true);
    } else {
        mode.enter_full(&window);
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("clipbox:focus-search", ());
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let quick = MenuItem::with_id(app, "quick", "快速搜索", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "打开 Copyboxx", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quick, &open, &PredefinedMenuItem::separator(app)?, &quit])?;
    let mut tray = TrayIconBuilder::with_id("clipbox")
        .tooltip("Copyboxx")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quick" => show_window(app, true),
            "open" => show_window(app, false),
            "quit" => app.state::<Shell>().quit(app, &app.state::<WindowMode>()),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                match app.get_webview_window("main") {
                    Some(w) if w.is_visible().unwrap_or(false) => {
                        let _ = w.hide();
                    }
                    _ => show_window(app, true),
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon_as_template(true);
    }
    tray.build(app)?;
    Ok(())
}

#[tauri::command]
pub fn set_close_behavior(state: tauri::State<Shell>, behavior: String) {
    let b = match behavior.as_str() {
        "tray" => CloseBehavior::Tray,
        "taskbar" => CloseBehavior::Taskbar,
        "quit" => CloseBehavior::Quit,
        _ => return,
    };
    state.settings.lock().unwrap().close = b;
}

#[tauri::command]
pub fn set_mini_hide_policy(state: tauri::State<Shell>, policy: String) {
    let p = match policy.as_str() {
        "hotkey" => MiniHidePolicy::Hotkey,
        "always" => MiniHidePolicy::Always,
        "never" => MiniHidePolicy::Never,
        _ => return,
    };
    state.settings.lock().unwrap().mini_hide = p;
}

/// The page copied something: the mini window may go away after a moment.
#[tauri::command]
pub fn did_copy(app: AppHandle, shell: tauri::State<Shell>, mode: tauri::State<WindowMode>) {
    let policy = shell.settings.lock().unwrap().mini_hide;
    if !hides_after_copy(policy, mode.is_mini(), mode.mini_auto_hide()) {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1200));
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    });
}

#[tauri::command]
pub fn get_launch_at_login(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let launcher = app.autolaunch();
    if enabled { launcher.enable() } else { launcher.disable() }.map_err(|e| e.to_string())?;
    Ok(launcher.is_enabled().unwrap_or(false))
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Restart the app (the page asks for this after settings that need it).
#[tauri::command]
pub fn relaunch(app: AppHandle, shell: tauri::State<Shell>, mode: tauri::State<WindowMode>) {
    shell.settings.lock().unwrap().quitting = true;
    if let Some(window) = app.get_webview_window("main") {
        mode.save_now(&window);
    }
    crate::flush::then_after_flush(&app, |app| app.restart());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_button_follows_the_setting() {
        assert_eq!(close_action(CloseBehavior::Tray, false, true), CloseAction::Hide);
        assert_eq!(close_action(CloseBehavior::Taskbar, false, true), CloseAction::Minimize);
        // The taskbar choice only exists on Windows; elsewhere it hides.
        assert_eq!(close_action(CloseBehavior::Taskbar, false, false), CloseAction::Hide);
        assert_eq!(close_action(CloseBehavior::Quit, false, true), CloseAction::Quit);
        assert_eq!(close_action(CloseBehavior::Tray, true, true), CloseAction::Quit);
    }

    #[test]
    fn mini_hides_after_copy_by_policy() {
        // 快速搜索 opened it: hide unless the person said never.
        assert!(hides_after_copy(MiniHidePolicy::Hotkey, true, true));
        // Opened by hand from the full window: stay.
        assert!(!hides_after_copy(MiniHidePolicy::Hotkey, true, false));
        assert!(hides_after_copy(MiniHidePolicy::Always, true, false));
        assert!(!hides_after_copy(MiniHidePolicy::Never, true, true));
        // The full window never hides after a copy.
        assert!(!hides_after_copy(MiniHidePolicy::Always, false, true));
    }
}
