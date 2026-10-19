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
/// macOS (D-079): the full window never grows past this, so it cannot fill or tile the screen.
pub const MAC_MAX_WIDTH: f64 = 1000.0;
pub const MAC_MAX_HEIGHT: f64 = 800.0;
/// Windows 贴边 (D-079): a mini window let go this close to a screen's left or right edge sticks to it...
pub const SNAP_DISTANCE: f64 = 24.0;
/// ...and, once the mouse leaves, folds away until only this much of it shows.
pub const STRIP_WIDTH: f64 = 16.0;
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

/// The largest the full window may be, or None where it may grow freely.
pub fn full_max_size() -> Option<(f64, f64)> {
    cfg!(target_os = "macos").then_some((MAC_MAX_WIDTH, MAC_MAX_HEIGHT))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Edge {
    Left,
    Right,
}

/// Where a mini window near a screen's outer left or right edge sticks: the edge and the exact spot.
/// An edge shared with another screen does not count, because the folded window would show up there.
pub fn mini_dock(p: Point, areas: &[Bounds]) -> Option<(Edge, Point)> {
    let b = Bounds { x: p.x, y: p.y, width: MINI_WIDTH, height: MINI_HEIGHT };
    let a = areas.iter().find(|a| visible_in(&b, a))?;
    let (edge, x) = if (p.x - a.x).abs() <= SNAP_DISTANCE {
        (Edge::Left, a.x)
    } else if (p.x + MINI_WIDTH - a.x - a.width).abs() <= SNAP_DISTANCE {
        (Edge::Right, a.x + a.width - MINI_WIDTH)
    } else {
        return None;
    };
    let docked = Point { x, y: p.y.clamp(a.y, (a.y + a.height - MINI_HEIGHT).max(a.y)) };
    let folded = Bounds { x: mini_folded_x(edge, &docked), y: docked.y, width: MINI_WIDTH, height: MINI_HEIGHT };
    (!areas.iter().any(|o| visible_in(&folded, o))).then_some((edge, docked))
}

/// The x of a docked mini window folded away so that only a thin strip stays on screen.
/// Where a sliding window is after `step` of `steps` (ease-out), so folding and unfolding glide instead of jumping.
pub fn slide_x(from: f64, to: f64, step: u32, steps: u32) -> f64 {
    let t = step as f64 / steps as f64;
    from + (to - from) * (1.0 - (1.0 - t) * (1.0 - t))
}

pub fn mini_folded_x(edge: Edge, docked: &Point) -> f64 {
    match edge {
        Edge::Left => docked.x - MINI_WIDTH + STRIP_WIDTH,
        Edge::Right => docked.x + MINI_WIDTH - STRIP_WIDTH,
    }
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
    fn mini_sticks_to_an_outer_edge_only() {
        // Near the left edge: x snaps to it, y stays.
        assert_eq!(mini_dock(Point { x: 18.0, y: 300.0 }, &screen()), Some((Edge::Left, Point { x: 0.0, y: 300.0 })));
        // A little past the right edge: pulled back onto it, y kept inside the screen.
        assert_eq!(mini_dock(Point { x: 1575.0, y: 700.0 }, &screen()), Some((Edge::Right, Point { x: 1560.0, y: 600.0 })));
        assert_eq!(mini_dock(Point { x: 500.0, y: 300.0 }, &screen()), None);
        // Two screens side by side: the edge between them is no place to fold away.
        let two = vec![screen()[0], Bounds { x: 1920.0, y: 0.0, width: 1920.0, height: 1040.0 }];
        assert_eq!(mini_dock(Point { x: 1570.0, y: 300.0 }, &two), None);
        assert_eq!(mini_dock(Point { x: 1930.0, y: 300.0 }, &two), None);
        assert_eq!(mini_dock(Point { x: 3470.0, y: 300.0 }, &two), Some((Edge::Right, Point { x: 3480.0, y: 300.0 })));
    }

    #[test]
    fn folded_mini_leaves_a_strip_on_screen() {
        assert_eq!(mini_folded_x(Edge::Left, &Point { x: 0.0, y: 10.0 }), -344.0);
        assert_eq!(mini_folded_x(Edge::Right, &Point { x: 1560.0, y: 10.0 }), 1904.0);
    }

    #[test]
    fn slide_eases_out_and_lands_exactly() {
        assert_eq!(slide_x(0.0, 100.0, 5, 10), 75.0);
        assert_eq!(slide_x(0.0, 100.0, 10, 10), 100.0);
        assert_eq!(slide_x(1904.0, 1560.0, 10, 10), 1560.0);
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
