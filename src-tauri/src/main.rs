#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod window_mode;
mod window_state;

use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use window_mode::WindowMode;

// Same names Electron reports, because the page checks for "darwin".
fn page_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(WindowMode::default())
        .invoke_handler(tauri::generate_handler![
            window_mode::set_window_mode,
            window_mode::get_window_mode,
            window_mode::set_theme,
            window_mode::page_ready,
        ])
        .setup(|app| {
            let bridge = include_str!("../bridge.js").replace("__PLATFORM__", page_platform());
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Clipbox")
                .min_inner_size(window_state::MIN_WIDTH, window_state::MIN_HEIGHT)
                .visible(false)
                .initialization_script(&bridge);
            builder = match window_mode::saved_full_bounds(app.handle()) {
                Some(b) => builder.inner_size(b.width, b.height).position(b.x, b.y),
                None => builder.inner_size(window_state::DEFAULT_WIDTH, window_state::DEFAULT_HEIGHT).center(),
            };
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::LogicalPosition::new(14.0, 19.0));
            let window = builder.build()?;

            // If the page never reports in, show the window anyway.
            let fallback = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                let _ = fallback.show();
            });

            let state = app.state::<WindowMode>().inner().clone();
            let watched = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => state.schedule_save(&watched),
                WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => state.save_now(&watched),
                _ => {}
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Clipbox failed to start");
}
