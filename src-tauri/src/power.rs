//! Saves pending edits when the computer is about to sleep, the screen locks, or Windows is shutting down.
//! Windows only for now; on macOS the page still saves within a second on its own (see app/lazy-writer.ts).

#[cfg(windows)]
mod imp {
    use crate::flush::Flush;
    use tauri::{AppHandle, Manager, WebviewWindow};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};

    const WM_QUERYENDSESSION: u32 = 0x0011;
    const WM_POWERBROADCAST: u32 = 0x0218;
    const WM_WTSSESSION_CHANGE: u32 = 0x02B1;
    const PBT_APMSUSPEND: usize = 4;
    const WTS_SESSION_LOCK: usize = 7;
    const SUBCLASS_ID: usize = 0xC11B;

    /// True for the messages that mean "the page should save now".
    pub fn wants_flush(message: u32, wparam: usize) -> bool {
        match message {
            WM_QUERYENDSESSION => true,
            WM_POWERBROADCAST => wparam == PBT_APMSUSPEND,
            WM_WTSSESSION_CHANGE => wparam == WTS_SESSION_LOCK,
            _ => false,
        }
    }

    unsafe extern "system" fn watch(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, data: usize) -> LRESULT {
        if wants_flush(message, wparam.0) {
            // `data` is the leaked AppHandle from `watch_window`. The page cannot answer while this thread is
            // blocked, so ask from a helper thread and return at once.
            let app = unsafe { &*(data as *const AppHandle) }.clone();
            std::thread::spawn(move || {
                app.state::<Flush>().request(&app);
            });
        }
        unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
    }

    pub fn watch_window(app: &AppHandle, window: &WebviewWindow) {
        let Ok(handle) = window.hwnd() else { return };
        let hwnd = HWND(handle.0);
        let data = Box::into_raw(Box::new(app.clone())) as usize;
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(watch), SUBCLASS_ID, data);
            let _ = WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION);
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn only_sleep_lock_and_shutdown_ask_for_a_save() {
            assert!(wants_flush(WM_QUERYENDSESSION, 0));
            assert!(wants_flush(WM_POWERBROADCAST, PBT_APMSUSPEND));
            assert!(!wants_flush(WM_POWERBROADCAST, 18)); // resume
            assert!(wants_flush(WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK));
            assert!(!wants_flush(WM_WTSSESSION_CHANGE, 8)); // unlock
            assert!(!wants_flush(0x0001, 4));
        }
    }
}

#[cfg(windows)]
pub use imp::watch_window;

#[cfg(not(windows))]
pub fn watch_window(_app: &tauri::AppHandle, _window: &tauri::WebviewWindow) {}
