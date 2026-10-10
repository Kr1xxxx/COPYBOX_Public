// Full and mini window, remembered position, theme: the window parts of desktop/main.cjs.
use crate::window_state::{self as ws, Bounds, Point};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Theme, WebviewWindow};

const SAVE_DELAY: Duration = Duration::from_millis(180);
const FILE_FULL: &str = "window-state.json";
const FILE_MINI: &str = "mini-window-state.json";

#[derive(Default)]
struct Inner {
    quick_mode: bool,
    normal: Option<Bounds>,
}

#[derive(Clone, Default)]
pub struct WindowMode {
    inner: Arc<Mutex<Inner>>,
    generation: Arc<AtomicU64>,
}

fn data_file(app: &AppHandle, name: &str) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(name))
}

/// Visible area of every screen, in the same logical units the window uses.
fn work_areas(app: &AppHandle) -> Vec<Bounds> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let s = m.scale_factor();
            let r = m.work_area();
            Bounds {
                x: r.position.x as f64 / s,
                y: r.position.y as f64 / s,
                width: r.size.width as f64 / s,
                height: r.size.height as f64 / s,
            }
        })
        .collect()
}

/// Where the full window starts: the saved place, or None for the default size in the middle.
pub fn saved_full_bounds(app: &AppHandle) -> Option<Bounds> {
    let saved = ws::read_json::<Bounds>(&data_file(app, FILE_FULL)?);
    ws::normalize_bounds(saved, &work_areas(app))
}

fn current_bounds(window: &WebviewWindow) -> Option<Bounds> {
    let s = window.scale_factor().ok()?;
    let pos = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(Bounds { x: pos.x as f64 / s, y: pos.y as f64 / s, width: size.width as f64 / s, height: size.height as f64 / s })
}

impl WindowMode {
    fn emit_mode(&self, window: &WebviewWindow) {
        let mode = if self.inner.lock().unwrap().quick_mode { "mini" } else { "full" };
        let _ = window.emit("clipbox:window-mode", mode);
    }

    pub fn is_mini(&self) -> bool {
        self.inner.lock().unwrap().quick_mode
    }

    /// Writes the full-window size or the mini position, whichever is showing.
    pub fn save_now(&self, window: &WebviewWindow) {
        let app = window.app_handle();
        let quick = self.is_mini();
        if quick {
            if let (Some(b), Some(path)) = (current_bounds(window), data_file(app, FILE_MINI)) {
                if ws::normalize_mini_position(Some(Point { x: b.x, y: b.y }), &work_areas(app)).is_some() {
                    ws::write_json(&path, &Point { x: b.x, y: b.y });
                }
            }
        } else if !window.is_minimized().unwrap_or(false) && !window.is_maximized().unwrap_or(false) && !window.is_fullscreen().unwrap_or(false) {
            if let Some(b) = current_bounds(window) {
                self.inner.lock().unwrap().normal = Some(b);
                if let (Some(b), Some(path)) = (ws::normalize_bounds(Some(b), &work_areas(app)), data_file(app, FILE_FULL)) {
                    ws::write_json(&path, &b);
                }
            }
        }
    }

    /// Called on every move or resize; writes once the window has been still for a moment.
    pub fn schedule_save(&self, window: &WebviewWindow) {
        let ticket = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let (this, window) = (self.clone(), window.clone());
        std::thread::spawn(move || {
            std::thread::sleep(SAVE_DELAY);
            if this.generation.load(Ordering::SeqCst) == ticket {
                this.save_now(&window);
            }
        });
    }

    pub fn enter_mini(&self, window: &WebviewWindow) {
        if self.is_mini() {
            self.emit_mode(window);
            return;
        }
        if window.is_fullscreen().unwrap_or(false) {
            let _ = window.set_fullscreen(false);
        }
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        self.save_now(window);
        let normal = self.inner.lock().unwrap().normal;
        self.inner.lock().unwrap().quick_mode = true;
        let app = window.app_handle();
        let saved = data_file(app, FILE_MINI)
            .and_then(|p| ws::read_json::<Point>(&p))
            .and_then(|p| ws::normalize_mini_position(Some(p), &work_areas(app)));
        // The mini window keeps the top-right corner of the full window unless the person moved it.
        let place = saved.unwrap_or_else(|| {
            let b = normal.or_else(|| current_bounds(window)).unwrap_or(Bounds { x: 100.0, y: 100.0, width: ws::DEFAULT_WIDTH, height: ws::DEFAULT_HEIGHT });
            Point { x: (b.x + b.width - ws::MINI_WIDTH).round(), y: b.y.round() }
        });
        let _ = window.set_min_size(Some(LogicalSize::new(ws::MINI_WIDTH, ws::MINI_HEIGHT)));
        let _ = window.set_size(LogicalSize::new(ws::MINI_WIDTH, ws::MINI_HEIGHT));
        let _ = window.set_position(LogicalPosition::new(place.x, place.y));
        // Same minimum and maximum keeps the mini window one fixed size on every platform.
        let _ = window.set_max_size(Some(LogicalSize::new(ws::MINI_WIDTH, ws::MINI_HEIGHT)));
        let _ = window.set_maximizable(false);
        let _ = window.set_always_on_top(true);
        // Some platforms apply the new minimum size only after the first resize, so ask again.
        let _ = window.set_size(LogicalSize::new(ws::MINI_WIDTH, ws::MINI_HEIGHT));
        self.emit_mode(window);
    }

    pub fn enter_full(&self, window: &WebviewWindow) {
        if !self.is_mini() {
            self.emit_mode(window);
            return;
        }
        self.save_now(window);
        let normal = self.inner.lock().unwrap().normal;
        self.inner.lock().unwrap().quick_mode = false;
        let _ = window.set_always_on_top(false);
        let _ = window.set_max_size(None::<LogicalSize<f64>>);
        let _ = window.set_maximizable(true);
        let _ = window.set_min_size(Some(LogicalSize::new(ws::MIN_WIDTH, ws::MIN_HEIGHT)));
        if let Some(b) = normal {
            let _ = window.set_size(LogicalSize::new(b.width, b.height));
            let _ = window.set_position(LogicalPosition::new(b.x, b.y));
        }
        self.emit_mode(window);
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "no window".to_string())
}

#[tauri::command]
pub fn set_window_mode(app: AppHandle, state: tauri::State<WindowMode>, mode: String) -> Result<(), String> {
    let window = main_window(&app)?;
    if mode == "mini" { state.enter_mini(&window) } else { state.enter_full(&window) }
    Ok(())
}

#[tauri::command]
pub fn get_window_mode(state: tauri::State<WindowMode>) -> &'static str {
    if state.is_mini() { "mini" } else { "full" }
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let theme = match theme.as_str() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        "system" => None,
        _ => return Ok(()),
    };
    main_window(&app)?.set_theme(theme).map_err(|e| e.to_string())
}

/// The page tells us it has drawn; only then is the window shown, so there is no white flash.
#[tauri::command]
pub fn page_ready(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.show().map_err(|e| e.to_string())
}
