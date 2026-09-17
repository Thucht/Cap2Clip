use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PresetType {
    AspectRatio,
    FixedSize,
    Free,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub preset_type: PresetType,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: Option<String>, // e.g. "16:9"
    pub enabled: bool,
    pub order: u32,
    pub is_builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionGeometry {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub shortcut_region: String,
    pub shortcut_fullscreen: String,
    pub shortcut_copy: String,
    pub shortcut_save: String,
    pub shortcut_cancel: String,
    pub shortcuts_enabled: bool,
    pub last_save_dir: String,
    pub previous_selection: Option<SelectionGeometry>,
    pub presets: Vec<Preset>,
    pub auto_start: bool,
    pub shortcuts: std::collections::HashMap<String, String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let default_save = dirs::picture_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Screenshots")
            .to_string_lossy()
            .to_string();

        Self {
            shortcut_region: "PrintScreen".to_string(),
            shortcut_fullscreen: "Shift+PrintScreen".to_string(),
            shortcut_copy: "Ctrl+C".to_string(),
            shortcut_save: "Ctrl+S".to_string(),
            shortcut_cancel: "Escape".to_string(),
            shortcuts_enabled: true,
            last_save_dir: default_save,
            previous_selection: None,
            presets: default_presets(),
            auto_start: false,
            shortcuts: std::collections::HashMap::new(),
        }
    }
}

fn default_presets() -> Vec<Preset> {
    vec![
        // Free
        Preset {
            id: "free".to_string(),
            name: "Free / Custom".to_string(),
            preset_type: PresetType::Free,
            width: 0,
            height: 0,
            aspect_ratio: None,
            enabled: true,
            order: 0,
            is_builtin: true,
        },
        // Aspect ratios
        Preset {
            id: "ar_1_1".to_string(),
            name: "1:1".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 1,
            height: 1,
            aspect_ratio: Some("1:1".to_string()),
            enabled: true,
            order: 1,
            is_builtin: true,
        },
        Preset {
            id: "ar_4_3".to_string(),
            name: "4:3".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 4,
            height: 3,
            aspect_ratio: Some("4:3".to_string()),
            enabled: true,
            order: 2,
            is_builtin: true,
        },
        Preset {
            id: "ar_3_4".to_string(),
            name: "3:4".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 3,
            height: 4,
            aspect_ratio: Some("3:4".to_string()),
            enabled: true,
            order: 3,
            is_builtin: true,
        },
        Preset {
            id: "ar_16_9".to_string(),
            name: "16:9".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 16,
            height: 9,
            aspect_ratio: Some("16:9".to_string()),
            enabled: true,
            order: 4,
            is_builtin: true,
        },
        Preset {
            id: "ar_9_16".to_string(),
            name: "9:16".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 9,
            height: 16,
            aspect_ratio: Some("9:16".to_string()),
            enabled: true,
            order: 5,
            is_builtin: true,
        },
        Preset {
            id: "ar_3_2".to_string(),
            name: "3:2".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 3,
            height: 2,
            aspect_ratio: Some("3:2".to_string()),
            enabled: true,
            order: 6,
            is_builtin: true,
        },
        Preset {
            id: "ar_2_3".to_string(),
            name: "2:3".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 2,
            height: 3,
            aspect_ratio: Some("2:3".to_string()),
            enabled: true,
            order: 7,
            is_builtin: true,
        },
        Preset {
            id: "ar_21_9".to_string(),
            name: "21:9".to_string(),
            preset_type: PresetType::AspectRatio,
            width: 21,
            height: 9,
            aspect_ratio: Some("21:9".to_string()),
            enabled: true,
            order: 8,
            is_builtin: true,
        },
        // Fixed sizes
        Preset {
            id: "fs_320".to_string(),
            name: "320 × 320".to_string(),
            preset_type: PresetType::FixedSize,
            width: 320,
            height: 320,
            aspect_ratio: None,
            enabled: true,
            order: 10,
            is_builtin: true,
        },
        Preset {
            id: "fs_512".to_string(),
            name: "512 × 512".to_string(),
            preset_type: PresetType::FixedSize,
            width: 512,
            height: 512,
            aspect_ratio: None,
            enabled: true,
            order: 11,
            is_builtin: true,
        },
        Preset {
            id: "fs_1024".to_string(),
            name: "1024 × 1024".to_string(),
            preset_type: PresetType::FixedSize,
            width: 1024,
            height: 1024,
            aspect_ratio: None,
            enabled: true,
            order: 12,
            is_builtin: true,
        },
        Preset {
            id: "fs_1280x720".to_string(),
            name: "1280 × 720".to_string(),
            preset_type: PresetType::FixedSize,
            width: 1280,
            height: 720,
            aspect_ratio: None,
            enabled: true,
            order: 13,
            is_builtin: true,
        },
        Preset {
            id: "fs_1920x1080".to_string(),
            name: "1920 × 1080".to_string(),
            preset_type: PresetType::FixedSize,
            width: 1920,
            height: 1080,
            aspect_ratio: None,
            enabled: true,
            order: 14,
            is_builtin: true,
        },
        Preset {
            id: "fs_1080x1920".to_string(),
            name: "1080 × 1920".to_string(),
            preset_type: PresetType::FixedSize,
            width: 1080,
            height: 1920,
            aspect_ratio: None,
            enabled: true,
            order: 15,
            is_builtin: true,
        },
        Preset {
            id: "fs_1280x960".to_string(),
            name: "1280 × 960".to_string(),
            preset_type: PresetType::FixedSize,
            width: 1280,
            height: 960,
            aspect_ratio: None,
            enabled: true,
            order: 16,
            is_builtin: true,
        },
    ]
}

fn get_settings_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("screenshot-app");

    fs::create_dir_all(&config_dir).ok();
    config_dir.join("settings.json")
}

#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    let path = get_settings_path();

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| e.to_string())?;
    let defaults = serde_json::to_value(AppSettings::default()).map_err(|e| e.to_string())?;

    // Merge defaults recursively so settings files from older versions remain
    // loadable when new fields are added (notably the configurable shortcuts).
    merge_json_defaults(&mut value, &defaults);
    let mut settings: AppSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    if settings.presets.is_empty() {
        settings.presets = default_presets();
    }
    settings.presets.sort_by_key(|preset| preset.order);
    for (index, preset) in settings.presets.iter_mut().enumerate() {
        preset.order = index as u32;
    }
    Ok(settings)
}

fn merge_json_defaults(value: &mut serde_json::Value, defaults: &serde_json::Value) {
    if let (Some(value_object), Some(default_object)) = (value.as_object_mut(), defaults.as_object()) {
        for (key, default_value) in default_object {
            match value_object.get_mut(key) {
                Some(value) => merge_json_defaults(value, default_value),
                None => { value_object.insert(key.clone(), default_value.clone()); }
            }
        }
    }
}

#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    // Shortcuts are OS-level registrations, so bind the new values before the
    // file is written: a rejected accelerator must not be persisted as if it
    // had been applied. This runs as an async command because registering a
    // shortcut has to execute on the main thread.
    crate::shortcuts::apply(&app, &settings)?;

    let path = get_settings_path();
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_string_lossy().to_string();

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Microsoft\Windows\CurrentVersion\Run";

        if enabled {
            let (key, _) = hkcu.create_subkey(path).map_err(|e| e.to_string())?;
            key.set_value("ScreenshotApp", &exe_path_str)
                .map_err(|e| e.to_string())?;
        } else {
            if let Ok(key) = hkcu.open_subkey_with_flags(path, KEY_WRITE) {
                let _ = key.delete_value("ScreenshotApp");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_ignore_cursor_events(window: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

/// Physical desktop geometry of the overlay window once it was fitted onto a
/// capture. The frontend uses it to map CSS viewport coordinates to pixels of
/// the screenshot, so it must describe the window as Windows really reports it
/// instead of the rectangle we asked for.
#[derive(Debug, Clone, Serialize)]
pub struct CaptureWindowGeometry {
    pub monitor_x: i32,
    pub monitor_y: i32,
    pub monitor_width: u32,
    pub monitor_height: u32,
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: u32,
    pub window_height: u32,
    pub scale_factor: f64,
}

/// Client-area rectangle of a window in physical desktop pixels.
#[derive(Debug, Clone, Copy)]
struct ClientRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl ClientRect {
    fn covers(&self, x: i32, y: i32, width: u32, height: u32) -> bool {
        self.x == x && self.y == y && self.width == width && self.height == height
    }
}

/// Fit the overlay onto the captured monitor and report what the window really is.
#[tauri::command]
pub async fn resize_window_to_capture(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<CaptureWindowGeometry, String> {
    // `x/y/width/height` already come from the screenshot backend as physical
    // desktop pixels of the target monitor. `window.scale_factor()` returns the
    // scale of whichever monitor the window currently sits on, which is wrong
    // on mixed-DPI desktops and shifts the overlay by (scale-1)*coordinate.
    // Use Physical* everywhere so no DPI math is involved.
    let mut client = apply_capture_rect(&window, x, y, width, height)?;

    // Moving the overlay onto a monitor with a different scale factor makes
    // Windows send WM_DPICHANGED, and tao answers that notification by applying
    // the OS-suggested rectangle - which replaces the size that was requested
    // here a moment earlier. That is what left the overlay covering only part of
    // the second monitor. Because that notification is posted (and therefore
    // handled after the write), the fit is re-applied and re-read until the
    // reported client rectangle matches the monitor. This command is async on
    // purpose: the main thread keeps running its message loop (and therefore
    // processes WM_DPICHANGED) while the retry waits.
    for _ in 0..4 {
        if client.covers(x, y, width, height) {
            break;
        }
        client = apply_capture_rect(&window, x, y, width, height)?;
    }

    Ok(CaptureWindowGeometry {
        monitor_x: x,
        monitor_y: y,
        monitor_width: width,
        monitor_height: height,
        window_x: client.x,
        window_y: client.y,
        window_width: client.width,
        window_height: client.height,
        scale_factor: window.scale_factor().unwrap_or(1.0),
    })
}

/// Move the window so its *client area* starts at the monitor origin and covers
/// the whole monitor, then report the rectangle Windows actually applied.
fn apply_capture_rect(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<ClientRect, String> {
    use tauri::{PhysicalPosition, PhysicalSize};

    // Anything the frame adds around the window (DWM frame, decorations, DPI
    // rounding) shifts the client area, and the client area is what the WebView
    // renders and what pointer coordinates are measured against. Compensate so
    // the screenshot always starts exactly at the monitor origin.
    let (offset_x, offset_y) = match (window.outer_position(), window.inner_position()) {
        (Ok(outer), Ok(inner)) => (inner.x - outer.x, inner.y - outer.y),
        _ => (0, 0),
    };

    window
        .set_position(PhysicalPosition::new(x - offset_x, y - offset_y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(width.max(1), height.max(1)))
        .map_err(|e| e.to_string())?;

    // The cross-monitor DPI notification is posted to the window's message
    // queue, so it is processed after `set_position` returned. Give the main
    // thread that moment before reading the rectangle back, otherwise the read
    // describes the window as it was before Windows rescaled it.
    std::thread::sleep(std::time::Duration::from_millis(40));

    let position = window.inner_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    Ok(ClientRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}