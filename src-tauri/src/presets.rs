use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DimensionPreset {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PresetsConfig {
    pub presets: Vec<DimensionPreset>,
    pub save_path: String,
}

impl Default for PresetsConfig {
    fn default() -> Self {
        let default_save_path = dirs::picture_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Screenshots")
            .to_string_lossy()
            .to_string();
            
        Self {
            presets: vec![
                DimensionPreset {
                    id: "preset_1080p".to_string(),
                    name: "1920×1080 (Full HD)".to_string(),
                    width: 1920,
                    height: 1080,
                },
                DimensionPreset {
                    id: "preset_720p".to_string(),
                    name: "1280×720 (HD)".to_string(),
                    width: 1280,
                    height: 720,
                },
                DimensionPreset {
                    id: "preset_4k".to_string(),
                    name: "3840×2160 (4K)".to_string(),
                    width: 3840,
                    height: 2160,
                },
                DimensionPreset {
                    id: "preset_square".to_string(),
                    name: "1080×1080 (Square)".to_string(),
                    width: 1080,
                    height: 1080,
                },
            ],
            save_path: default_save_path,
        }
    }
}

fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("lightshot-clone");
    
    fs::create_dir_all(&config_dir).ok();
    config_dir.join("presets.json")
}

#[tauri::command]
pub fn load_presets() -> Result<PresetsConfig, String> {
    let path = get_config_path();
    
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        // Return defaults
        Ok(PresetsConfig::default())
    }
}

#[tauri::command]
pub fn save_presets(config: PresetsConfig) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}
