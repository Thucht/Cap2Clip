use arboard::Clipboard;
use base64::Engine;

#[tauri::command]
pub fn copy_image_to_clipboard(data_url: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    
    // Parse base64 data URL
    let base64_data = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid data URL format")?;
    
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;
    
    // Load image using screenshots crate's image
    let img = screenshots::image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    
    // Create clipboard image data
    let img_data = arboard::ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        bytes: rgba.into_raw().into(),
    };
    
    clipboard.set_image(img_data).map_err(|e| e.to_string())?;
    Ok(())
}
