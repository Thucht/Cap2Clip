// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod settings;
mod clipboard;

use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::ShortcutState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let shortcut_str = shortcut.to_string();
                        if shortcut_str.contains("PrintScreen") && shortcut_str.contains("Shift") {
                            // Shift+PrtScn: Full screen → clipboard
                            let _ = app.emit("fullscreen-capture", ());
                        } else if shortcut_str.contains("PrintScreen") {
                            // PrtScn: Region capture
                            if let Some(window) = app.get_webview_window("capture") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            let _ = app.emit("region-capture", ());
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            capture::capture_full_screen,
            capture::capture_region,
            capture::save_screenshot,
            settings::load_settings,
            settings::save_settings,
            clipboard::copy_image_to_clipboard,
        ])
        .setup(|app| {
            // Create the capture window (hidden initially)
            // Use maximized (not fullscreen) to avoid Windows freeze on taskbar click
            let window = WebviewWindowBuilder::new(
                app,
                "capture",
                WebviewUrl::App("index.html".into()),
            )
            .title("Screenshot")
            .maximized(true)
            .transparent(true)
            .decorations(false)
            .skip_taskbar(true)
            .visible(false)
            .resizable(false)
            .build()?;

            // Setup system tray
            setup_tray(app)?;

            // Register default shortcuts
            register_shortcuts(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn register_shortcuts(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let shortcut_manager = app.global_shortcut();

    // Register PrtScn for region capture
    shortcut_manager.register("PrintScreen")?;

    // Register Shift+PrtScn for full screen capture
    shortcut_manager.register("Shift+PrintScreen")?;

    Ok(())
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let capture_region = MenuItem::with_id(app, "capture_region", "Capture Region", true, None::<&str>)?;
    let full_screen = MenuItem::with_id(app, "full_screen", "Full Screen", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let enable_shortcuts = MenuItem::with_id(app, "toggle_shortcuts", "Enable Shortcuts  ✓", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &capture_region,
            &full_screen,
            &separator1,
            &enable_shortcuts,
            &settings_item,
            &separator2,
            &quit,
        ],
    )?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Screenshot App")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "capture_region" => {
                    if let Some(window) = app.get_webview_window("capture") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("region-capture", ());
                }
                "full_screen" => {
                    let _ = app.emit("fullscreen-capture", ());
                }
                "toggle_shortcuts" => {
                    let _ = app.emit("toggle-shortcuts", ());
                }
                "settings" => {
                    if let Some(window) = app.get_webview_window("capture") {
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
                if let Some(window) = app.get_webview_window("capture") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}