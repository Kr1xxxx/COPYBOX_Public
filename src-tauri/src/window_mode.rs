// Full and mini window, remembered position, theme: the window parts of desktop/main.cjs.
use crate::window_state::{self as ws, Bounds, Edge, Point};
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
    /// 固定在最上层 in the full window (the page remembers it and sends it on start).
    pinned: bool,
    normal: Option<Bounds>,
    /// Windows 贴边 (D-079): the mini window sticks to a screen edge and folds away while the mouse is elsewhere.
    edge_snap: bool,
    dock: Option<(Edge, Point)>,
    folded: bool,
}

/// Whether the window stays above others: the mini window always does, the full window only when pinned.
pub fn stays_on_top(mini: bool, pinned: bool) -> bool {
    mini || pinned
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
    let b = ws::normalize_bounds(saved, &work_areas(app))?;
    // A window saved before the Mac size limit (D-079) opens at the limit.
    let (w, h) = ws::full_max_size().unwrap_or((b.width, b.height));
    Some(Bounds { width: b.width.min(w), height: b.height.min(h), ..b })
}

fn full_max_size() -> Option<LogicalSize<f64>> {
    ws::full_max_size().map(|(w, h)| LogicalSize::new(w, h))
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
            self.settle_mini(window);
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

    /// Once the mini window has come to rest (Windows, 贴边 on): stick it to a nearby screen edge, or forget the edge.
    fn settle_mini(&self, window: &WebviewWindow) {
        let (snap, folded) = {
            let inner = self.inner.lock().unwrap();
            (inner.edge_snap, inner.folded)
        };
        if !snap || folded {
            return;
        }
        let app = window.app_handle();
        let here = current_bounds(window);
        let dock = here.and_then(|b| ws::mini_dock(Point { x: b.x, y: b.y }, &work_areas(app)));
        if let (Some((_, p)), Some(b)) = (dock, here) {
            // Only move when it is really somewhere else: moving fires another Moved event, which lands here again.
            if (b.x - p.x).abs() > 1.0 || (b.y - p.y).abs() > 1.0 {
                let _ = window.set_position(LogicalPosition::new(p.x, p.y));
            }
        }
        self.inner.lock().unwrap().dock = dock;
    }

    /// Brings a folded mini window back out and forgets its edge.
    fn undock(&self, window: &WebviewWindow) {
        let folded = {
            let mut inner = self.inner.lock().unwrap();
            let folded = inner.folded.then_some(inner.dock).flatten();
            inner.dock = None;
            inner.folded = false;
            folded
        };
        if let Some((_, p)) = folded {
            let _ = window.set_position(LogicalPosition::new(p.x, p.y));
            emit_fold(window, None);
        }
    }

    pub fn set_edge_snap(&self, window: &WebviewWindow, on: bool) {
        self.inner.lock().unwrap().edge_snap = on;
        if on {
            if self.is_mini() {
                self.settle_mini(window);
            }
        } else {
            self.undock(window);
        }
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
        {
            let mut inner = self.inner.lock().unwrap();
            inner.quick_mode = true;
        }
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
        self.settle_mini(window);
        self.emit_mode(window);
    }

    /// Remembers the pin; the mini window is on top anyway, so it only changes the full window now.
    pub fn set_pinned(&self, window: &WebviewWindow, pinned: bool) {
        let mini = {
            let mut inner = self.inner.lock().unwrap();
            inner.pinned = pinned;
            inner.quick_mode
        };
        if !mini {
            let _ = window.set_always_on_top(stays_on_top(false, pinned));
        }
    }

    pub fn enter_full(&self, window: &WebviewWindow) {
        if !self.is_mini() {
            self.emit_mode(window);
            return;
        }
        self.save_now(window);
        self.undock(window);
        let normal = self.inner.lock().unwrap().normal;
        {
            let mut inner = self.inner.lock().unwrap();
            inner.quick_mode = false;
        }
        let pinned = self.inner.lock().unwrap().pinned;
        let _ = window.set_always_on_top(stays_on_top(false, pinned));
        // macOS (D-079): the full window keeps its size limit and its zoom button stays off, so no full screen.
        let _ = window.set_max_size(full_max_size());
        let _ = window.set_maximizable(ws::full_max_size().is_none());
        let _ = window.set_min_size(Some(LogicalSize::new(ws::MIN_WIDTH, ws::MIN_HEIGHT)));
        if let Some(b) = normal {
            let _ = window.set_size(LogicalSize::new(b.width, b.height));
            let _ = window.set_position(LogicalPosition::new(b.x, b.y));
        }
        self.emit_mode(window);
    }
}

/// Tells the page which edge the mini window is folded against ("" when it is out), so it can draw the notch-like tab.
fn emit_fold(window: &WebviewWindow, edge: Option<Edge>) {
    let _ = window.emit("clipbox:mini-fold", match edge { Some(Edge::Left) => "left", Some(Edge::Right) => "right", None => "" });
}

/// Glides the mini window between its stuck and its folded place in about 150 ms (owner: 「弹出做动效」).
fn slide(window: &WebviewWindow, from: f64, to: f64, y: f64) {
    const STEPS: u32 = 10;
    for step in 1..=STEPS {
        let _ = window.set_position(LogicalPosition::new(ws::slide_x(from, to, step, STEPS), y));
        std::thread::sleep(Duration::from_millis(15));
    }
}

fn mouse_over(app: &AppHandle, window: &WebviewWindow) -> bool {
    let (Ok(c), Ok(p), Ok(s)) = (app.cursor_position(), window.outer_position(), window.outer_size()) else { return false };
    c.x >= p.x as f64 && c.x < (p.x + s.width as i32) as f64 && c.y >= p.y as f64 && c.y < (p.y + s.height as i32) as f64
}

/// Windows 贴边 (D-079): a docked mini window folds away half a second after the mouse leaves it and slides out
/// as soon as the mouse touches the strip or the window gets the focus (the tray's 快速搜索).
pub fn watch_mouse(app: AppHandle, mode: WindowMode) {
    if !cfg!(target_os = "windows") {
        return;
    }
    std::thread::spawn(move || {
        let mut away = 0u8;
        loop {
            std::thread::sleep(Duration::from_millis(100));
            let (dock, folded) = {
                let inner = mode.inner.lock().unwrap();
                (inner.dock.filter(|_| inner.quick_mode && inner.edge_snap), inner.folded)
            };
            let Some((edge, docked)) = dock else { away = 0; continue };
            let Some(window) = app.get_webview_window("main") else { continue };
            if !window.is_visible().unwrap_or(false) {
                continue;
            }
            let near = window.is_focused().unwrap_or(false) || mouse_over(&app, &window);
            if folded && near {
                emit_fold(&window, None);
                slide(&window, ws::mini_folded_x(edge, &docked), docked.x, docked.y);
                mode.inner.lock().unwrap().folded = false;
                away = 0;
            } else if !folded && !near {
                away += 1;
                if away >= 5 {
                    emit_fold(&window, Some(edge));
                    slide(&window, docked.x, ws::mini_folded_x(edge, &docked), docked.y);
                    mode.inner.lock().unwrap().folded = true;
                    away = 0;
                }
            } else {
                away = 0;
            }
        }
    });
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
pub fn set_pinned(app: AppHandle, state: tauri::State<WindowMode>, pinned: bool) -> Result<(), String> {
    state.set_pinned(&main_window(&app)?, pinned);
    Ok(())
}

#[tauri::command]
pub fn set_mini_edge_snap(app: AppHandle, state: tauri::State<WindowMode>, on: bool) -> Result<(), String> {
    state.set_edge_snap(&main_window(&app)?, on);
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
    // Started quietly at login (--hidden): stay in the tray until someone opens it.
    if std::env::args().any(|a| a == "--hidden") {
        return Ok(());
    }
    main_window(&app)?.show().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::stays_on_top;

    #[test]
    fn mini_is_always_on_top_and_full_only_when_pinned() {
        assert!(stays_on_top(true, false));
        assert!(stays_on_top(true, true));
        assert!(stays_on_top(false, true));
        assert!(!stays_on_top(false, false));
    }
}
