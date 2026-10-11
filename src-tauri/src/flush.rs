//! Asks the page to save anything it is still holding back (app/lazy-writer.ts) before the app quits or
//! restarts, and waits for its answer, but never longer than 1.5 s so a stuck page cannot block quitting.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Default)]
pub struct Flush {
    answered: Mutex<bool>,
    signal: Condvar,
    /// Set once the page has been asked on the way out, so the second exit request goes through.
    pub done_before_exit: AtomicBool,
}

impl Flush {
    fn answer(&self) {
        *self.answered.lock().unwrap() = true;
        self.signal.notify_all();
    }

    /// Blocks (call from a helper thread, never the main one). Returns whether the page answered in time.
    pub fn request(&self, app: &AppHandle) -> bool {
        *self.answered.lock().unwrap() = false;
        if app.get_webview_window("main").is_none() || app.emit("clipbox:flush", ()).is_err() {
            return false;
        }
        let guard = self.answered.lock().unwrap();
        let (guard, _) = self.signal.wait_timeout_while(guard, TIMEOUT, |answered| !*answered).unwrap();
        *guard
    }
}

/// The page calls this when it has saved everything.
#[tauri::command]
pub async fn flush_done(flush: tauri::State<'_, Flush>) -> Result<(), String> {
    flush.answer();
    Ok(())
}

/// Runs `then` on a helper thread after the page has been asked to save.
pub fn then_after_flush(app: &AppHandle, then: impl FnOnce(&AppHandle) + Send + 'static) {
    let app = app.clone();
    std::thread::spawn(move || {
        app.state::<Flush>().request(&app);
        app.state::<Flush>().done_before_exit.store(true, Ordering::SeqCst);
        then(&app);
    });
}
