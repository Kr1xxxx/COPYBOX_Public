#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

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
        .setup(|app| {
            let bridge = include_str!("../bridge.js").replace("__PLATFORM__", page_platform());
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Clipbox")
                .inner_size(680.0, 620.0)
                .min_inner_size(680.0, 620.0)
                .initialization_script(&bridge);
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::LogicalPosition::new(14.0, 19.0));
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Clipbox failed to start");
}
