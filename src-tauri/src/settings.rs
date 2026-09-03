use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub shortcut_region: String,
    pub shortcut_fullscreen: String,
    pub shortcuts_enabled: bool,
    pub last_save_dir: String,
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
            shortcuts_enabled: true,
            last_save_dir: default_save,
        }
    }
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

    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}