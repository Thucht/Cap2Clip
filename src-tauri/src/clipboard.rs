use arboard::Clipboard;

#[tauri::command]
pub fn copy_image_to_clipboard(data_url: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    // The frontend may hand over PNG or JPEG depending on the configured output
    // format, so the payload is read from any `data:image/...` URL.
    let bytes = crate::capture::decode_image_data_url(&data_url)?;

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
