#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod automation;
mod backup;
mod flush;
mod power;
mod shared_library;
mod site_icon;
mod tinify;
mod shell;
mod update;
mod window_mode;
mod window_state;

use shell::Shell;
use update::Updates;
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
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

/// Launch at login starts Clipbox quietly in the tray.
fn start_hidden() -> bool {
    std::env::args().any(|a| a == "--hidden")
}

fn main() {
    let app = tauri::Builder::default()
        // A second launch brings the first window back instead of opening another.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| shell::show_window(app, false)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(WindowMode::default())
        .manage(Shell::default())
        .manage(flush::Flush::default())
        .manage(Updates::default())
        .manage(automation::Bridge::default())
        .invoke_handler(tauri::generate_handler![
            window_mode::set_window_mode,
            window_mode::get_window_mode,
            window_mode::set_theme,
            window_mode::page_ready,
            shell::set_close_behavior,
            shell::set_mini_hide_policy,
            shell::did_copy,
            shell::get_launch_at_login,
            shell::set_launch_at_login,
            shell::open_data_folder,
            shell::relaunch,
            flush::flush_done,
            backup::backup_save,
            backup::backup_list,
            backup::backup_read,
            backup::backup_image_save,
            backup::backup_image_list,
            backup::backup_image_read,
            backup::backup_image_prune,
            ai::ai_status,
            ai::ai_save,
            ai::ai_clear,
            ai::ai_request,
            shared_library::fetch_shared_library,
            site_icon::fetch_site_icon,
            tinify::compress_image,
            site_icon::get_build_time,
            update::check_update,
            update::open_update,
            automation::automation_ready,
            automation::automation_response,
        ])
        .setup(|app| {
            let bridge = include_str!("../bridge.js").replace("__PLATFORM__", page_platform());
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Clipboxx")
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
            #[cfg(all(feature = "test-hooks", target_os = "windows"))]
            let builder = match std::env::var("CLIPBOX_TEST_DEBUG_PORT") {
                Ok(port) if port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty() => builder.additional_browser_args(&format!(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port} --remote-allow-origins=*"
                )),
                _ => builder,
            };
            let window = builder.build()?;
            shell::build_tray(app.handle())?;
            power::watch_window(app.handle(), &window);
            automation::start(app.handle());

            // If the page never reports in, show the window anyway (unless Clipbox was started quietly).
            if !start_hidden() {
                let fallback = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(4));
                    let _ = fallback.show();
                });
            }

            let mode = app.state::<WindowMode>().inner().clone();
            let shell = app.state::<Shell>().inner().clone();
            let watched = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => mode.schedule_save(&watched),
                WindowEvent::CloseRequested { api, .. } => {
                    if !shell.on_close_requested(&watched, &mode) {
                        api.prevent_close();
                    }
                }
                WindowEvent::Destroyed => mode.save_now(&watched),
                _ => {}
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Clipbox failed to start");

    app.run(|app, event| match event {
        // Clicking the Dock icon brings the window back.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => shell::show_window(app, false),
        RunEvent::ExitRequested { api, .. } => {
            // First ask the page to save what it is still holding back, then exit for real.
            if !app.state::<flush::Flush>().done_before_exit.load(std::sync::atomic::Ordering::SeqCst) {
                api.prevent_exit();
                flush::then_after_flush(app, |app| app.exit(0));
                return;
            }
            automation::cleanup(app);
            if let Some(window) = app.get_webview_window("main") {
                app.state::<WindowMode>().save_now(&window);
            }
        }
        _ => {
            let _ = app;
        }
    });
}
