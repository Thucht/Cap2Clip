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
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
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

#[derive(serde::Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub release_notes: Option<String>,
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = current.clone();
    Ok(UpdateInfo {
        current_version: current,
        latest_version: latest,
        update_available: false,
        download_url: None,
        release_notes: None,
    })
}

#[tauri::command]
pub fn set_ignore_cursor_events(window: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_window_to_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let pos = monitor.position();
        let size = monitor.size();
        window.set_position(LogicalPosition::new(pos.x as f64, pos.y as f64)).map_err(|e| e.to_string())?;
        window.set_size(LogicalSize::new(size.width as f64, size.height as f64)).map_err(|e| e.to_string())?;
    }
    Ok(())
}