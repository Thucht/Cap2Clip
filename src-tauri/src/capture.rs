use base64::Engine;
use screenshots::Screen;
use serde::Serialize;
use std::io::Cursor;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
pub struct CaptureResult {
    pub image_data: String, // base64 PNG
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

/// Capture the entire screen (all monitors combined or primary)
#[tauri::command]
pub fn capture_full_screen() -> Result<CaptureResult, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;

    let screen = screens.first().ok_or("No screen found")?;

    let image = screen.capture().map_err(|e| e.to_string())?;

    let width = image.width();
    let height = image.height();

    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, screenshots::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let base64_str = base64::engine::general_purpose::STANDARD
        .encode(buffer.into_inner());

    Ok(CaptureResult {
        image_data: format!("data:image/png;base64,{}", base64_str),
        width,
        height,
        x: 0,
        y: 0,
    })
}

/// Capture a specific region of the screen
#[tauri::command]
pub fn capture_region(x: u32, y: u32, width: u32, height: u32) -> Result<CaptureResult, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;

    let screen = screens.first().ok_or("No screen found")?;

    let image = screen.capture().map_err(|e| e.to_string())?;

    // Inset by 1px on each side to avoid picking up the selection border
    let img_w = image.width();
    let img_h = image.height();

    // Apply inset: shift crop origin +1,1 and reduce dimensions by 2x2
    let crop_x = x.saturating_add(1);
    let crop_y = y.saturating_add(1);
    let crop_w = width.saturating_sub(2).max(1);
    let crop_h = height.saturating_sub(2).max(1);

    // Clamp to image bounds
    let max_w = img_w.saturating_sub(crop_x);
    let max_h = img_h.saturating_sub(crop_y);
    let crop_w = crop_w.min(max_w).max(1);
    let crop_h = crop_h.min(max_h).max(1);

    use screenshots::image::imageops::crop_imm;
    let cropped = crop_imm(&image, crop_x, crop_y, crop_w, crop_h);

    let mut buffer = Cursor::new(Vec::new());
    cropped
        .to_image()
        .write_to(&mut buffer, screenshots::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let base64_str = base64::engine::general_purpose::STANDARD
        .encode(buffer.into_inner());

    Ok(CaptureResult {
        image_data: format!("data:image/png;base64,{}", base64_str),
        width: crop_w,
        height: crop_h,
        x: crop_x as i32,
        y: crop_y as i32,
    })
}

/// Save screenshot to file via native dialog
#[tauri::command]
pub fn save_screenshot(
    app: AppHandle,
    image_data: String,
    last_save_dir: String,
) -> Result<String, String> {
    // Decode base64
    let base64_data = image_data
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid data URL")?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;

    // Generate default filename
    let timestamp = get_timestamp();
    let filename = format!("Screenshot_{}.png", timestamp);

    // Show save dialog
    let file_path = app
        .dialog()
        .file()
        .add_filter("PNG Image", &["png"])
        .set_file_name(&filename)
        .set_directory(&last_save_dir)
        .blocking_save_file();

    let file_path = match file_path {
        Some(p) => p,
        None => return Err("Save cancelled".to_string()),
    };

    let file_path_str = file_path.to_string();

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&file_path_str).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Write file
    std::fs::write(&file_path_str, &bytes).map_err(|e| e.to_string())?;

    Ok(file_path_str)
}

fn get_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();

    // Format: YYYYMMDD_HHMMSS
    let dt = time::OffsetDateTime::from_unix_timestamp(secs as i64)
        .unwrap_or_else(|_| time::OffsetDateTime::now_utc());

    format!(
        "{:04}{:02}{:02}_{:02}{:02}{:02}",
        dt.year(),
        dt.month() as u8,
        dt.day(),
        dt.hour(),
        dt.minute(),
        dt.second()
    )
}