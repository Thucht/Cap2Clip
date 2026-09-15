// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod settings;
mod clipboard;
mod shortcuts;

use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

fn main() {
    #[cfg(target_os = "windows")]
    if !ensure_single_instance() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            capture::capture_full_screen,
            capture::capture_region,
            capture::save_screenshot,
            capture::save_screenshots,
            capture::save_screenshots_quick,
            settings::load_settings,
            settings::save_settings,
            settings::set_auto_start,
            settings::set_ignore_cursor_events,
            settings::resize_window_to_monitor,
            clipboard::copy_image_to_clipboard,
        ])
        .setup(|app| {
            setup_tray(app)?;
            // Global shortcuts are OS-level registrations, so they follow the
            // persisted settings instead of being hard-coded.
            let app_settings = match settings::load_settings() {
                Ok(loaded) => loaded,
                Err(error) => {
                    eprintln!("Could not read settings, falling back to defaults: {error}");
                    settings::AppSettings::default()
                }
            };
            if let Err(error) = shortcuts::apply(app.app_handle(), &app_settings) {
                eprintln!("Could not register global shortcuts: {error}");
            }
            // Make window click-through when idle so it doesn't block mouse events
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
                // The capture window is an overlay, not a second taskbar application.
                let _ = window.set_skip_taskbar(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let capture_region = MenuItem::with_id(app, "capture_region", "Capture Region", true, None::<&str>)?;
    let capture_fullscreen = MenuItem::with_id(app, "capture_fullscreen", "Capture Full Screen", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let show_settings = MenuItem::with_id(app, "show_settings", "Settings", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &capture_region,
        &capture_fullscreen,
        &separator1,
        &show_settings,
        &separator2,
        &quit,
    ])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .tooltip("Cap2Clip - Screenshot Tool")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "capture_region" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("region-capture", ());
                }
                "capture_fullscreen" => {
                    let _ = app.emit("fullscreen-capture", ());
                }
                "show_settings" => {
                    // The window starts hidden, so the settings UI has to be
                    // brought up explicitly before the phase event is sent.
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("show-settings", ());
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("region-capture", ());
            }
        })
        .build(app)?;

    Ok(())
}

/// Keep Cap2Clip to one process even when started from a second shortcut,
/// installer, or copied executable.
#[cfg(target_os = "windows")]
fn ensure_single_instance() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(
            attributes: *mut std::ffi::c_void,
            initially_owned: i32,
            name: *const u16,
        ) -> *mut std::ffi::c_void;
        fn GetLastError() -> u32;
    }

    const ERROR_ALREADY_EXISTS: u32 = 183;
    let name: Vec<u16> = OsStr::new("Local\\Cap2Clip.SingleInstance")
        .encode_wide()
        .chain(Some(0))
        .collect();

    // Keep the handle open for the process lifetime. Windows releases it
    // automatically when Cap2Clip exits.
    let handle = unsafe { CreateMutexW(null_mut(), 0, name.as_ptr()) };
    !handle.is_null() && unsafe { GetLastError() } != ERROR_ALREADY_EXISTS
}
