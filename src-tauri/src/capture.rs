use base64::Engine;
use screenshots::Screen;
use serde::Serialize;
use std::io::Cursor;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
pub struct CaptureResult {
    pub image_data: String, // base64 PNG
    // Physical pixel dimensions of image_data. The overlay is also resized
    // with these physical dimensions, then the frontend maps CSS coordinates
    // to this image using the actual WebView viewport size.
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

/// Capture the monitor containing the mouse cursor.
#[tauri::command]
pub fn capture_full_screen(app: AppHandle) -> Result<CaptureResult, String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let screen = Screen::from_point(cursor.x.round() as i32, cursor.y.round() as i32)
        .map_err(|e| e.to_string())?;

    let image = screen.capture().map_err(|e| e.to_string())?;

    let width = image.width();
    let height = image.height();

    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, screenshots::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    let base64_str = base64::engine::general_purpose::STANDARD.encode(buffer.into_inner());

    Ok(CaptureResult {
        image_data: format!("data:image/png;base64,{}", base64_str),
        width,
        height,
        x: screen.display_info.x,
        y: screen.display_info.y,
    })
}

/// Capture a specific region of the screen
#[tauri::command]
pub fn capture_region(
    app: AppHandle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<CaptureResult, String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let screen = Screen::from_point(cursor.x.round() as i32, cursor.y.round() as i32)
        .map_err(|e| e.to_string())?;

    let image = screen.capture().map_err(|e| e.to_string())?;

    // Inset by 1px on each side to avoid picking up the selection border
    let img_w = image.width();
    let img_h = image.height();

    // Coordinates are already physical pixels from the capture backend.
    let crop_x = x;
    let crop_y = y;
    let crop_w = width.max(1);
    let crop_h = height.max(1);

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

    let base64_str = base64::engine::general_purpose::STANDARD.encode(buffer.into_inner());

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

/// Save multiple screenshots. The dialog is opened once; additional images
/// are written beside the selected file with numbered names.
#[tauri::command]
pub fn save_screenshots(
    app: AppHandle,
    image_data: Vec<String>,
    last_save_dir: String,
) -> Result<String, String> {
    if image_data.is_empty() {
        return Err("No images to save".to_string());
    }

    let decoded: Result<Vec<Vec<u8>>, String> = image_data
        .iter()
        .map(|data| {
            let base64_data = data
                .strip_prefix("data:image/png;base64,")
                .ok_or("Invalid data URL".to_string())?;
            base64::engine::general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| e.to_string())
        })
        .collect();
    let decoded = decoded?;

    let filename = format!("Screenshot_{}.png", get_timestamp());
    let selected = app
        .dialog()
        .file()
        .add_filter("PNG Image", &["png"])
        .set_file_name(&filename)
        .set_directory(&last_save_dir)
        .blocking_save_file()
        .ok_or("Save cancelled".to_string())?;
    let selected_path = std::path::PathBuf::from(selected.to_string());
    let parent = selected_path
        .parent()
        .ok_or("Invalid save path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let stem = selected_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Screenshot");

    for (index, bytes) in decoded.iter().enumerate() {
        let path = if index == 0 {
            selected_path.clone()
        } else {
            parent.join(format!("{}_{}.png", stem, index + 1))
        };
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    }

    Ok(selected_path.to_string_lossy().to_string())
}

/// Save multiple screenshots without opening a dialog.
#[tauri::command]
pub fn save_screenshots_quick(
    image_data: Vec<String>,
    last_save_dir: String,
) -> Result<String, String> {
    if image_data.is_empty() {
        return Err("No images to save".to_string());
    }

    let directory = if last_save_dir.trim().is_empty() {
        dirs::picture_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("Screenshots")
    } else {
        std::path::PathBuf::from(last_save_dir)
    };
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    let stem = format!("Screenshot_{}", get_timestamp());
    let mut first_path = None;
    for (index, data) in image_data.iter().enumerate() {
        let base64_data = data
            .strip_prefix("data:image/png;base64,")
            .ok_or("Invalid data URL".to_string())?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| e.to_string())?;
        let suffix = if index == 0 {
            String::new()
        } else {
            format!("_{}", index + 1)
        };
        let path = directory.join(format!("{}{}.png", stem, suffix));
        if index == 0 {
            first_path = Some(path.clone());
        }
        std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    }

    first_path
        .map(|path| path.to_string_lossy().to_string())
        .ok_or("No images to save".to_string())
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