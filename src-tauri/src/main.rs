#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod automation;
// Only the command line door (macOS and Linux) uses it; its tests run everywhere.
#[cfg_attr(not(unix), allow(dead_code))]
mod caller;
mod backup;
mod cloud;
mod device_key;
mod flush;
mod mcp;
mod mcp_images;
// Windows only; elsewhere just the pure decision logic and its tests (D-046).
#[cfg_attr(not(windows), allow(dead_code))]
mod old_autostart;
mod power;
mod secret_store;
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

/// The command an AI tool runs to reach this app (`<this program> --mcp`); shown in 设置 → AI.
#[tauri::command]
fn mcp_program_path() -> Option<String> {
    std::env::current_exe().ok().map(|path| path.to_string_lossy().into_owned())
}

fn main() {
    // `Copyboxx --mcp`: a tool such as Codex started us as its MCP server. No window; talk to the running app (D-060).
    if mcp::is_mcp_launch(&std::env::args().collect::<Vec<_>>()) {
        mcp::run();
        return;
    }
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
            window_mode::set_pinned,
            window_mode::set_mini_edge_snap,
            window_mode::set_theme,
            window_mode::page_ready,
            shell::set_close_behavior,
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
            device_key::device_key_get,
            device_key::device_key_set,
            secret_store::secret_get,
            secret_store::secret_set,
            secret_store::secret_delete,
            ai::ai_status,
            ai::ai_save,
            ai::ai_clear,
            ai::ai_request,
            shared_library::fetch_shared_library,
            cloud::cloud_request,
            site_icon::fetch_site_icon,
            tinify::compress_image,
            site_icon::get_build_time,
            update::check_update,
            update::open_update,
            update::install_update,
            automation::automation_ready,
            automation::automation_response,
            mcp_program_path,
        ])
        .setup(|app| {
            // An older product name's launch-at-login entry would start the old copy at login (D-046).
            #[cfg(windows)]
            old_autostart::migrate(app.handle());
            // Something else (a cleaner, a security tool) may have switched launch at login off: put it back (D-079).
            shell::guard_launch_at_login(app.handle());
            shell::watch_launch_at_login(app.handle().clone());
            let bridge = include_str!("../bridge.js").replace("__PLATFORM__", page_platform());
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Copyboxx")
                .min_inner_size(window_state::MIN_WIDTH, window_state::MIN_HEIGHT)
                .visible(false)
                .initialization_script(&bridge);
            builder = match window_mode::saved_full_bounds(app.handle()) {
                Some(b) => builder.inner_size(b.width, b.height).position(b.x, b.y),
                None => builder.inner_size(window_state::DEFAULT_WIDTH, window_state::DEFAULT_HEIGHT).center(),
            };
            // macOS (D-079): never bigger than MAC_MAX, no zoom and no full screen; staff park it at the screen edge.
            #[cfg(target_os = "macos")]
            let builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::LogicalPosition::new(14.0, 19.0))
                .max_inner_size(window_state::MAC_MAX_WIDTH, window_state::MAC_MAX_HEIGHT)
                .maximizable(false);
            #[cfg(all(feature = "test-hooks", target_os = "windows"))]
            let builder = match std::env::var("CLIPBOX_TEST_DEBUG_PORT") {
                Ok(port) if port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty() => builder.additional_browser_args(&format!(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port} --remote-allow-origins=*"
                )),
                _ => builder,
            };
            let window = builder.build()?;
            // Without a View menu there is no 进入全屏 (⌃⌘F) either (D-079).
            #[cfg(target_os = "macos")]
            {
                let menu = tauri::menu::Menu::default(app.handle())?;
                for item in menu.items()? {
                    if let Some(sub) = item.as_submenu() {
                        if sub.text()? == "View" {
                            menu.remove(sub)?;
                        }
                    }
                }
                app.set_menu(menu)?;
            }
            shell::build_tray(app.handle())?;
            power::watch_window(app.handle(), &window);
            window_mode::watch_mouse(app.handle().clone(), app.state::<WindowMode>().inner().clone());
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
