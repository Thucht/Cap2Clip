//! The notification bubble shown after a capture is copied or saved.
//!
//! Lightshot confirms every action with a short-lived bubble ("Your screenshot
//! is copied to clipboard", "Screenshot is saved to ... Click here to open in
//! the folder."). The bubble lives in its own always-on-top window pinned to the
//! bottom-right of the primary monitor, so it is visible even though the editor
//! window hides itself as soon as the screenshot is handed over.

use tauri::{PhysicalPosition, PhysicalSize};

/// Park the bubble in the bottom-right corner of the primary monitor and show
/// it. `width`/`height` are CSS pixels; the monitor scale factor converts them.
#[tauri::command]
pub async fn show_toast(
    window: tauri::WebviewWindow,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let screens = screenshots::Screen::all().map_err(|error| error.to_string())?;
    let screen = screens
        .iter()
        .find(|screen| screen.display_info.is_primary)
        .or_else(|| screens.first())
        .ok_or("No monitor is available for the notification")?;
    let info = screen.display_info;
    let scale = f64::from(info.scale_factor).max(1.0);

    // Stay clear of the taskbar: the bubble is anchored to the monitor, not to
    // the work area, but the margin is what keeps it off the icon strip.
    let margin = (16.0 * scale) as i32;
    let physical_width = (width as f64 * scale) as u32;
    let physical_height = (height as f64 * scale) as u32;

    window
        .set_size(PhysicalSize::new(physical_width.max(1), physical_height.max(1)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            info.x + info.width as i32 - physical_width as i32 - margin,
            info.y + info.height as i32 - physical_height as i32 - margin,
        ))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    Ok(())
}