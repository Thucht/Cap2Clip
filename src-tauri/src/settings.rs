use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Directory the settings file lives in, under the OS config directory.
const SETTINGS_DIR: &str = "cap2clip";

/// Directory the pre-rename builds wrote. Kept only so existing installs can be
/// migrated; nothing reads it once the current file exists.
const LEGACY_SETTINGS_DIR: &str = "screenshot-app";

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

/// File format a screenshot is written in.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImageFormat {
    Png,
    Jpeg,
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
    // Lightshot parity: "Show notifications about copying and saving".
    pub show_notifications: bool,
    // Lightshot parity: "Capture a cursor on a screenshot".
    pub capture_cursor: bool,
    // Lightshot parity: "Keep the selected area position".
    pub keep_selection: bool,
    // Lightshot parity: "Upload using the format" and "JPEG quality".
    pub image_format: ImageFormat,
    pub jpeg_quality: u8,
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
            show_notifications: true,
            capture_cursor: false,
            keep_selection: true,
            image_format: ImageFormat::Png,
            jpeg_quality: 90,
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
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let path = settings_path_in(&config_dir);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    path
}

/// Layout of the current settings file inside an OS config directory. Kept
/// separate from `get_settings_path` so the documented location can be checked
/// without touching the real profile.
fn settings_path_in(config_dir: &Path) -> PathBuf {
    config_dir.join(SETTINGS_DIR).join("settings.json")
}

/// Where the pre-rename builds kept the same file.
fn get_legacy_settings_path() -> Option<PathBuf> {
    dirs::config_dir().map(|config_dir| legacy_settings_path_in(&config_dir))
}

fn legacy_settings_path_in(config_dir: &Path) -> PathBuf {
    config_dir.join(LEGACY_SETTINGS_DIR).join("settings.json")
}

/// Copy the pre-rename settings file into the current location once, so an
/// install that already has one keeps its presets, shortcuts and last save
/// directory after the directory was renamed. The legacy file is left where it
/// is: an older build can still be launched, and deleting the only copy the user
/// may have hand-edited is worse than leaving a duplicate behind.
///
/// Returns whether a copy was made.
fn migrate_legacy_settings(current: &Path, legacy: Option<&Path>) -> bool {
    if current.exists() {
        return false;
    }
    let legacy = match legacy {
        Some(path) if path.is_file() => path,
        _ => return false,
    };
    if let Some(parent) = current.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::copy(legacy, current).is_ok()
}

#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    let path = get_settings_path();
    migrate_legacy_settings(&path, get_legacy_settings_path().as_deref());

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    settings_from_value(value)
}

/// Turns whatever was on disk into settings: fills in the keys the file predates,
/// restores the built-in presets when none of them survived, and rejects values
/// the encoders would refuse.
fn settings_from_value(value: serde_json::Value) -> Result<AppSettings, String> {
    let defaults = serde_json::to_value(AppSettings::default()).map_err(|e| e.to_string())?;
    let mut value = value;

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
    // A hand-edited or older settings file must not be able to ask for a JPEG
    // quality the encoder would reject.
    settings.jpeg_quality = settings.jpeg_quality.clamp(1, 100);
    Ok(settings)
}

fn merge_json_defaults(value: &mut serde_json::Value, defaults: &serde_json::Value) {
    if let (Some(value_object), Some(default_object)) =
        (value.as_object_mut(), defaults.as_object())
    {
        for (key, default_value) in default_object {
            match value_object.get_mut(key) {
                Some(value) => merge_json_defaults(value, default_value),
                None => {
                    value_object.insert(key.clone(), default_value.clone());
                }
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
    // A settings window can be saved before anything has ever been loaded, so
    // the legacy file is migrated here too; the guard inside makes the call a
    // no-op once the current file exists.
    migrate_legacy_settings(&path, get_legacy_settings_path().as_deref());
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
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
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

/// Fit the editor window so its *client area* covers the captured region.
///
/// The editor reuses the main window, and Windows keeps an invisible frame
/// around a frameless one: a position of (x, y) puts the *client* area that much
/// further down and right, so a capture asked to start at (x, y) would start a
/// few pixels late. Sizes are applied as logical values, which Tauri's window
/// builder uses for the client area, and only the position needs the frame
/// correction.
///
/// `x`/`y`/`width`/`height` are logical pixels of the region the user selected.
#[tauri::command]
pub async fn fit_editor_window(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<FitReport, String> {
    use tauri::{LogicalPosition, LogicalSize};

    let scale = window.scale_factor().unwrap_or(1.0).max(0.1);
    let target_width = ((f64::from(width)) * scale).round().max(1.0) as i32;
    let target_height = ((f64::from(height)) * scale).round().max(1.0) as i32;
    let target_x = ((f64::from(x)) * scale).round() as i32;
    let target_y = ((f64::from(y)) * scale).round() as i32;
    let mut report = FitReport {
        requested: (i64::from(x), i64::from(y), i64::from(width), i64::from(height)),
        target: (target_x, target_y, target_width, target_height),
        scale,
        offset: (0, 0),
        inner: (0, 0),
        outer: (0, 0),
        iterations: 0,
    };

    for attempt in 0..4 {
        report.iterations = attempt + 1;
        window
            .set_size(LogicalSize::new(f64::from(width), f64::from(height)))
            .map_err(|error| error.to_string())?;
        window
            .set_position(LogicalPosition::new(f64::from(x), f64::from(y)))
            .map_err(|error| error.to_string())?;

        // Windows applies the write on the main thread, which keeps running
        // while this async command yields, so the rectangle is read back after
        // a moment rather than describing the window as it was before.
        std::thread::sleep(std::time::Duration::from_millis(30));

        let (outer, inner) = match (window.outer_size(), window.inner_size()) {
            (Ok(outer), Ok(inner)) => (outer, inner),
            _ => break,
        };
        report.outer = (outer.width as i32, outer.height as i32);
        report.inner = (inner.width as i32, inner.height as i32);
        let (offset_x, offset_y) = match (window.inner_position(), window.outer_position()) {
            (Ok(inner), Ok(outer)) => (inner.x - outer.x, inner.y - outer.y),
            _ => (0, 0),
        };
        report.offset = (offset_x, offset_y);

        if inner.width as i32 == target_width
            && inner.height as i32 == target_height
            && offset_x == 0
            && offset_y == 0
        {
            break;
        }

        // Put the frame back where it belongs: the outer rectangle starts that
        // much before the client area does.
        window
            .set_position(LogicalPosition::new(
                f64::from(target_x - offset_x) / scale,
                f64::from(target_y - offset_y) / scale,
            ))
            .map_err(|error| error.to_string())?;
        std::thread::sleep(std::time::Duration::from_millis(30));

        let inner = match window.inner_size() {
            Ok(size) => size,
            Err(_) => break,
        };
        report.inner = (inner.width as i32, inner.height as i32);
    }

    // Moving or resizing a transparent window can recreate its WebView2 child,
    // and a recreated child comes back with an opaque white background - which
    // is what the editor looked like when only the startup-time call was used.
    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    Ok(report)
}

/// What `fit_editor_window` actually achieved, so the editor can report a fit
/// that did not converge instead of silently showing a cropped capture.
#[derive(Debug, Clone, Serialize)]
pub struct FitReport {
    pub requested: (i64, i64, i64, i64),
    pub target: (i32, i32, i32, i32),
    pub scale: f64,
    pub offset: (i32, i32),
    pub inner: (i32, i32),
    pub outer: (i32, i32),
    pub iterations: i32,
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

#[cfg(test)]
mod tests {
    use super::{
        default_presets, legacy_settings_path_in, migrate_legacy_settings, settings_from_value,
        settings_path_in, ImageFormat, LEGACY_SETTINGS_DIR, SETTINGS_DIR,
    };
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;

    /// A settings file written before the Lightshot parity fields existed, which
    /// is what the installs that upgraded from an older build look like.
    fn pre_parity_file() -> serde_json::Value {
        json!({
            "shortcut_region": "PrintScreen",
            "shortcut_fullscreen": "Shift+PrintScreen",
            "shortcut_copy": "Ctrl+C",
            "shortcut_save": "Ctrl+S",
            "shortcut_cancel": "Escape",
            "shortcuts_enabled": true,
            "last_save_dir": "C:\\Users\\someone\\Pictures\\Screenshots",
            "previous_selection": null,
            "presets": [],
            "auto_start": false,
            "shortcuts": {}
        })
    }

    #[test]
    fn settings_live_in_the_directory_the_docs_advertise() {
        let root = PathBuf::from("C:\\Users\\someone\\AppData\\Roaming");
        assert_eq!(
            settings_path_in(&root),
            PathBuf::from("C:\\Users\\someone\\AppData\\Roaming\\cap2clip\\settings.json")
        );
        assert_eq!(
            legacy_settings_path_in(&root),
            PathBuf::from("C:\\Users\\someone\\AppData\\Roaming\\screenshot-app\\settings.json")
        );
        assert_eq!(SETTINGS_DIR, "cap2clip");
        assert_eq!(LEGACY_SETTINGS_DIR, "screenshot-app");
    }

    #[test]
    fn a_pre_parity_settings_file_gets_the_parity_defaults() {
        let settings = settings_from_value(pre_parity_file()).expect("pre-parity file must load");
        assert!(settings.show_notifications);
        assert!(!settings.capture_cursor);
        assert!(settings.keep_selection);
        assert_eq!(settings.image_format, ImageFormat::Png);
        assert_eq!(settings.jpeg_quality, 90);
    }

    #[test]
    fn a_pre_parity_settings_file_gets_the_built_in_presets_back() {
        let settings = settings_from_value(pre_parity_file()).expect("pre-parity file must load");
        assert_eq!(settings.presets.len(), default_presets().len());
        let orders: Vec<u32> = settings.presets.iter().map(|preset| preset.order).collect();
        assert_eq!(orders, (0..orders.len() as u32).collect::<Vec<u32>>());
    }

    #[test]
    fn parity_values_that_were_saved_are_read_back() {
        let settings = settings_from_value(json!({
            "show_notifications": false,
            "capture_cursor": true,
            "keep_selection": false,
            "image_format": "jpeg",
            "jpeg_quality": 60
        }))
        .expect("settings file with parity keys must load");

        assert!(!settings.show_notifications);
        assert!(settings.capture_cursor);
        assert!(!settings.keep_selection);
        assert_eq!(settings.image_format, ImageFormat::Jpeg);
        assert_eq!(settings.jpeg_quality, 60);
    }

    #[test]
    fn jpeg_quality_outside_the_encoder_range_is_clamped() {
        let low = settings_from_value(json!({ "jpeg_quality": 0 })).expect("loads");
        assert_eq!(low.jpeg_quality, 1);

        let high = settings_from_value(json!({ "jpeg_quality": 255 })).expect("loads");
        assert_eq!(high.jpeg_quality, 100);
    }

    /// Scratch directory per test so the suite never reads the real profile.
    fn scratch_dir(tag: &str) -> PathBuf {
        let unique = format!(
            "cap2clip-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.subsec_nanos())
                .unwrap_or(0)
        );
        let path = std::env::temp_dir().join(unique).join(tag);
        fs::create_dir_all(&path).expect("scratch directory");
        path
    }

    #[test]
    fn legacy_settings_are_copied_once_and_left_in_place() {
        let dir = scratch_dir("migrate");
        let root = dir.join("Roaming");
        let legacy = legacy_settings_path_in(&root);
        let current = settings_path_in(&root);
        fs::create_dir_all(legacy.parent().expect("legacy directory")).expect("legacy directory");
        fs::write(&legacy, r#"{"shortcut_region":"Ctrl+P"}"#).expect("legacy settings file");

        assert!(migrate_legacy_settings(&current, Some(&legacy)));
        assert_eq!(
            fs::read_to_string(&current).expect("migrated settings file"),
            r#"{"shortcut_region":"Ctrl+P"}"#
        );
        // An older build can still be launched, so its own file has to survive.
        assert!(legacy.is_file());

        // The next start must not copy over anything again.
        assert!(!migrate_legacy_settings(&current, Some(&legacy)));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migration_never_overwrites_a_file_that_already_exists() {
        let dir = scratch_dir("no-clobber");
        let root = dir.join("Roaming");
        let legacy = legacy_settings_path_in(&root);
        let current = settings_path_in(&root);
        fs::create_dir_all(legacy.parent().expect("legacy directory")).expect("legacy directory");
        fs::create_dir_all(current.parent().expect("settings directory")).expect("settings directory");
        fs::write(&legacy, r#"{"shortcut_region":"Ctrl+P"}"#).expect("legacy settings file");
        fs::write(&current, r#"{"shortcut_region":"PrintScreen"}"#).expect("settings file");

        assert!(!migrate_legacy_settings(&current, Some(&legacy)));
        assert_eq!(
            fs::read_to_string(&current).expect("settings file"),
            r#"{"shortcut_region":"PrintScreen"}"#
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn migration_is_a_no_op_without_a_legacy_file() {
        let dir = scratch_dir("no-legacy");
        let root = dir.join("Roaming");
        let legacy = legacy_settings_path_in(&root);
        let current = settings_path_in(&root);

        assert!(!migrate_legacy_settings(&current, Some(&legacy)));
        assert!(!migrate_legacy_settings(&current, None));
        assert!(!current.exists());
        fs::remove_dir_all(&dir).ok();
    }
}
