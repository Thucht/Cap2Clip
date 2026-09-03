use base64::Engine;
use screenshots::Screen;
use serde::Serialize;
use std::io::Cursor;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
pub struct CaptureResult {
    pub image_data: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn capture_screen() -> Result<CaptureResult, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    
    let screen = screens.first()
        .ok_or_else(|| "No screen found".to_string())?;
    
    let image = screen.capture().map_err(|e| e.to_string())?;
    
    let width = image.width();
    let height = image.height();
    
    let mut buffer = Cursor::new(Vec::new());
    image.write_to(&mut buffer, screenshots::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    
    let base64_str = base64::engine::general_purpose::STANDARD
        .encode(buffer.into_inner());
    
    Ok(CaptureResult {
        image_data: format!("data:image/png;base64,{}", base64_str),
        width,
        height,
    })
}

#[tauri::command]
pub fn save_screenshot(
    app: AppHandle,
    data_url: String,
    suggested_name: Option<String>,
) -> Result<String, String> {
    // Parse base64 data URL
    let base64_data = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid data URL format")?;
    
    let image_data = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;
    
    // Get default save location
    let default_path = dirs::picture_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Screenshots");
    
    // Generate filename
    let timestamp = get_timestamp();
    let filename = suggested_name.unwrap_or_else(|| format!("screenshot_{}.png", timestamp));
    
    // Show save dialog
    let file_path = app
        .dialog()
        .file()
        .add_filter("PNG Image", &["png"])
        .set_file_name(&filename)
        .set_directory(&default_path)
        .blocking_save_file();
    
    let file_path = file_path.ok_or("Save cancelled")?;
    
    // Get path as string
    let file_path_str = file_path.to_string();
    
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&file_path_str).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // Write file
    std::fs::write(&file_path_str, &image_data).map_err(|e| e.to_string())?;
    
    Ok(file_path_str)
}

fn get_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();
    let secs = duration.as_secs();
    
    // Format: YYYY-MM-DD_HHMMSS
    let dt = time::OffsetDateTime::from_unix_timestamp(secs as i64)
        .unwrap_or_else(|_| time::OffsetDateTime::now_utc());
    dt.format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| format!("{}", secs))
        .replace(":", "")
        .replace("-", "_")
        .split('.')
        .next()
        .unwrap_or(&format!("{}", secs))
        .to_string()
}
