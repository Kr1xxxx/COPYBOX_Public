// Remembers where the window was, the same rules as desktop/window-state.cjs.
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub const MIN_WIDTH: f64 = 680.0;
pub const MIN_HEIGHT: f64 = 620.0;
pub const DEFAULT_WIDTH: f64 = 680.0;
pub const DEFAULT_HEIGHT: f64 = 620.0;
pub const MINI_WIDTH: f64 = 360.0;
pub const MINI_HEIGHT: f64 = 440.0;
const MAX_SIZE: f64 = 10000.0;
const MIN_VISIBLE_EDGE: f64 = 80.0;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

fn finite(value: f64) -> bool {
    value.is_finite()
}

fn valid_size(b: &Bounds) -> bool {
    finite(b.width)
        && finite(b.height)
        && b.width >= MIN_WIDTH
        && b.height >= MIN_HEIGHT
        && b.width <= MAX_SIZE
        && b.height <= MAX_SIZE
}

fn visible_in(b: &Bounds, area: &Bounds) -> bool {
    let w = ((b.x + b.width).min(area.x + area.width) - b.x.max(area.x)).max(0.0);
    let h = ((b.y + b.height).min(area.y + area.height) - b.y.max(area.y)).max(0.0);
    w >= MIN_VISIBLE_EDGE && h >= MIN_VISIBLE_EDGE
}

/// A saved window that is too small, too big or off every screen is dropped (None = use the default size).
pub fn normalize_bounds(saved: Option<Bounds>, areas: &[Bounds]) -> Option<Bounds> {
    let b = saved?;
    if !valid_size(&b) || !finite(b.x) || !finite(b.y) {
        return None;
    }
    let rounded = Bounds { x: b.x.round(), y: b.y.round(), width: b.width.round(), height: b.height.round() };
    areas.iter().any(|a| visible_in(&rounded, a)).then_some(rounded)
}

/// The mini window has a fixed size, so only its position is remembered.
pub fn normalize_mini_position(saved: Option<Point>, areas: &[Bounds]) -> Option<Point> {
    let p = saved?;
    if !finite(p.x) || !finite(p.y) {
        return None;
    }
    let b = Bounds { x: p.x.round(), y: p.y.round(), width: MINI_WIDTH, height: MINI_HEIGHT };
    areas.iter().any(|a| visible_in(&b, a)).then_some(Point { x: b.x, y: b.y })
}

pub fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> bool {
    let Ok(text) = serde_json::to_string(value) else { return false };
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, format!("{text}\n")).is_ok() && fs::rename(&tmp, path).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn screen() -> Vec<Bounds> {
        vec![Bounds { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 }]
    }

    #[test]
    fn keeps_a_normal_window() {
        let b = Bounds { x: 100.0, y: 80.0, width: 900.0, height: 700.0 };
        assert_eq!(normalize_bounds(Some(b), &screen()), Some(b));
    }

    #[test]
    fn drops_too_small_huge_or_missing() {
        let small = Bounds { x: 0.0, y: 0.0, width: 500.0, height: 600.0 };
        let huge = Bounds { x: 0.0, y: 0.0, width: 20000.0, height: 700.0 };
        let nan = Bounds { x: f64::NAN, y: 0.0, width: 800.0, height: 700.0 };
        assert_eq!(normalize_bounds(Some(small), &screen()), None);
        assert_eq!(normalize_bounds(Some(huge), &screen()), None);
        assert_eq!(normalize_bounds(Some(nan), &screen()), None);
        assert_eq!(normalize_bounds(None, &screen()), None);
    }

    #[test]
    fn drops_a_window_left_on_an_unplugged_screen() {
        let away = Bounds { x: 3000.0, y: 100.0, width: 800.0, height: 700.0 };
        assert_eq!(normalize_bounds(Some(away), &screen()), None);
        let edge = Bounds { x: 1900.0, y: 100.0, width: 800.0, height: 700.0 };
        assert_eq!(normalize_bounds(Some(edge), &screen()), None);
    }

    #[test]
    fn mini_position_must_be_on_screen() {
        assert_eq!(normalize_mini_position(Some(Point { x: 1500.0, y: 40.0 }), &screen()), Some(Point { x: 1500.0, y: 40.0 }));
        assert_eq!(normalize_mini_position(Some(Point { x: 5000.0, y: 40.0 }), &screen()), None);
    }

    #[test]
    fn round_trips_through_a_file() {
        let path = std::env::temp_dir().join(format!("clipbox-ws-{}.json", std::process::id()));
        let b = Bounds { x: 10.0, y: 20.0, width: 800.0, height: 700.0 };
        assert!(write_json(&path, &b));
        assert_eq!(read_json::<Bounds>(&path), Some(b));
        let _ = fs::remove_file(&path);
    }
}
