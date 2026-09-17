use base64::Engine;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

#[derive(Debug, Serialize)]
pub struct CaptureResult {
    pub image_data: String, // base64 PNG
    // Physical pixel dimensions of image_data. `resize_window_to_capture`
    // reports the rectangle the overlay window really got, and the frontend
    // maps CSS coordinates onto this image through that rectangle (monitor
    // scale plus window offset), so mixed-DPI desktops stay aligned.
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct MonitorCapture {
    pub monitor_id: u32,
    pub physical_x: i32,
    pub physical_y: i32,
    pub logical_x: f64,
    pub logical_y: f64,
    pub logical_width: f64,
    pub logical_height: f64,
    pub physical_width: u32,
    pub physical_height: u32,
    pub scale_factor: f64,
    pub image_data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureSessionResult {
    pub session_id: u64,
    pub virtual_x: f64,
    pub virtual_y: f64,
    pub virtual_width: f64,
    pub virtual_height: f64,
    pub monitors: Vec<MonitorCapture>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct SelectionGeometry {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

struct CapturedMonitor {
    metadata: MonitorCapture,
    image: screenshots::image::RgbaImage,
}

struct CaptureSessionState {
    session_id: u64,
    metadata: CaptureSessionResult,
    monitors: Vec<CapturedMonitor>,
}

pub struct CaptureSessions {
    next_id: AtomicU64,
    current: Mutex<Option<CaptureSessionState>>,
}

impl Default for CaptureSessions {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            current: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct LogicalRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct MonitorGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
    physical_width: u32,
    physical_height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PhysicalCrop {
    monitor_index: usize,
    src_x: u32,
    src_y: u32,
    src_width: u32,
    src_height: u32,
    dst_x: u32,
    dst_y: u32,
    dst_width: u32,
    dst_height: u32,
}

#[derive(Debug, PartialEq)]
struct CompositePlan {
    output_width: u32,
    output_height: u32,
    output_scale: f64,
    crops: Vec<PhysicalCrop>,
}

fn intersection(selection: LogicalRect, monitor: MonitorGeometry) -> Option<LogicalRect> {
    let left = selection.x.max(monitor.x);
    let top = selection.y.max(monitor.y);
    let right = (selection.x + selection.width).min(monitor.x + monitor.width);
    let bottom = (selection.y + selection.height).min(monitor.y + monitor.height);

    (right > left && bottom > top).then_some(LogicalRect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

fn build_composite_plan(
    selection: LogicalRect,
    monitors: &[MonitorGeometry],
) -> Result<CompositePlan, String> {
    if selection.width < 1.0 || selection.height < 1.0 {
        return Err("Selection must be at least one logical pixel".into());
    }

    let intersections: Vec<_> = monitors
        .iter()
        .copied()
        .enumerate()
        .filter_map(|(monitor_index, monitor)| {
            intersection(selection, monitor).map(|rect| (monitor_index, monitor, rect))
        })
        .collect();
    let output_scale = intersections
        .iter()
        .map(|(_, monitor, _)| monitor.scale)
        .reduce(f64::max)
        .ok_or_else(|| "Selection does not intersect any monitor".to_string())?;

    let crops = intersections
        .into_iter()
        .map(|(monitor_index, monitor, rect)| {
            let src_x = ((rect.x - monitor.x) * monitor.scale).floor().max(0.0) as u32;
            let src_y = ((rect.y - monitor.y) * monitor.scale).floor().max(0.0) as u32;
            let src_right = (((rect.x + rect.width - monitor.x) * monitor.scale).ceil() as u32)
                .min(monitor.physical_width);
            let src_bottom = (((rect.y + rect.height - monitor.y) * monitor.scale).ceil() as u32)
                .min(monitor.physical_height);

            PhysicalCrop {
                monitor_index,
                src_x,
                src_y,
                src_width: src_right.saturating_sub(src_x),
                src_height: src_bottom.saturating_sub(src_y),
                dst_x: ((rect.x - selection.x) * output_scale).round() as u32,
                dst_y: ((rect.y - selection.y) * output_scale).round() as u32,
                dst_width: (rect.width * output_scale).round() as u32,
                dst_height: (rect.height * output_scale).round() as u32,
            }
        })
        .collect();

    Ok(CompositePlan {
        output_width: (selection.width * output_scale).round() as u32,
        output_height: (selection.height * output_scale).round() as u32,
        output_scale,
        crops,
    })
}

fn encode_png(image: &screenshots::image::RgbaImage) -> Result<String, String> {
    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, screenshots::image::ImageFormat::Png)
        .map_err(|error| error.to_string())?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(buffer.into_inner())
    ))
}

fn render_composite(
    selection: LogicalRect,
    monitors: &[CapturedMonitor],
) -> Result<screenshots::image::RgbaImage, String> {
    let geometries: Vec<_> = monitors
        .iter()
        .map(|monitor| MonitorGeometry {
            x: monitor.metadata.logical_x,
            y: monitor.metadata.logical_y,
            width: monitor.metadata.logical_width,
            height: monitor.metadata.logical_height,
            scale: monitor.metadata.scale_factor,
            physical_width: monitor.metadata.physical_width,
            physical_height: monitor.metadata.physical_height,
        })
        .collect();
    let plan = build_composite_plan(selection, &geometries)?;
    let mut output = screenshots::image::RgbaImage::new(plan.output_width, plan.output_height);

    for crop in plan.crops {
        let source = monitors
            .get(crop.monitor_index)
            .ok_or_else(|| "Composite plan referenced an unavailable monitor".to_string())?;
        let cropped = screenshots::image::imageops::crop_imm(
            &source.image,
            crop.src_x,
            crop.src_y,
            crop.src_width,
            crop.src_height,
        )
        .to_image();
        let resized = screenshots::image::imageops::resize(
            &cropped,
            crop.dst_width,
            crop.dst_height,
            screenshots::image::imageops::FilterType::Lanczos3,
        );
        screenshots::image::imageops::overlay(
            &mut output,
            &resized,
            i64::from(crop.dst_x),
            i64::from(crop.dst_y),
        );
    }

    Ok(output)
}

#[tauri::command]
pub fn begin_capture_session(
    sessions: tauri::State<'_, CaptureSessions>,
) -> Result<CaptureSessionResult, String> {
    let mut screens = Screen::all().map_err(|error| error.to_string())?;
    if screens.is_empty() {
        return Err("No monitors are available for capture".into());
    }
    screens.sort_by_key(|screen| {
        (
            screen.display_info.x,
            screen.display_info.y,
            screen.display_info.id,
        )
    });

    let mut captured = Vec::with_capacity(screens.len());
    for screen in screens {
        let info = screen.display_info;
        let image = screen.capture().map_err(|error| error.to_string())?;
        let scale = f64::from(info.scale_factor);
        if !scale.is_finite() || scale <= 0.0 {
            return Err(format!(
                "Monitor {} reported an invalid scale factor",
                info.id
            ));
        }
        let metadata = MonitorCapture {
            monitor_id: info.id,
            physical_x: info.x,
            physical_y: info.y,
            logical_x: f64::from(info.x),
            logical_y: f64::from(info.y),
            logical_width: f64::from(info.width),
            logical_height: f64::from(info.height),
            physical_width: image.width(),
            physical_height: image.height(),
            scale_factor: scale,
            image_data: encode_png(&image)?,
        };
        captured.push(CapturedMonitor { metadata, image });
    }

    let virtual_x = captured
        .iter()
        .map(|monitor| monitor.metadata.logical_x)
        .reduce(f64::min)
        .unwrap();
    let virtual_y = captured
        .iter()
        .map(|monitor| monitor.metadata.logical_y)
        .reduce(f64::min)
        .unwrap();
    let virtual_right = captured
        .iter()
        .map(|monitor| monitor.metadata.logical_x + monitor.metadata.logical_width)
        .reduce(f64::max)
        .unwrap();
    let virtual_bottom = captured
        .iter()
        .map(|monitor| monitor.metadata.logical_y + monitor.metadata.logical_height)
        .reduce(f64::max)
        .unwrap();
    let session_id = sessions.next_id.fetch_add(1, Ordering::Relaxed);
    let result = CaptureSessionResult {
        session_id,
        virtual_x,
        virtual_y,
        virtual_width: virtual_right - virtual_x,
        virtual_height: virtual_bottom - virtual_y,
        monitors: captured
            .iter()
            .map(|monitor| monitor.metadata.clone())
            .collect(),
    };

    let mut current = sessions
        .current
        .lock()
        .map_err(|_| "Capture session state is unavailable".to_string())?;
    *current = Some(CaptureSessionState {
        session_id,
        metadata: result.clone(),
        monitors: captured,
    });
    Ok(result)
}

#[tauri::command]
pub fn active_capture_session(
    sessions: tauri::State<'_, CaptureSessions>,
) -> Result<Option<CaptureSessionResult>, String> {
    let current = sessions
        .current
        .lock()
        .map_err(|_| "Capture session state is unavailable".to_string())?;
    Ok(current.as_ref().map(|session| session.metadata.clone()))
}

#[tauri::command]
pub fn is_primary_button_pressed() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        return (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0;
    }

    #[cfg(not(target_os = "windows"))]
    false
}

#[tauri::command]
pub fn finalize_capture_session(
    sessions: tauri::State<'_, CaptureSessions>,
    session_id: u64,
    selection: SelectionGeometry,
) -> Result<CaptureResult, String> {
    let mut current = sessions
        .current
        .lock()
        .map_err(|_| "Capture session state is unavailable".to_string())?;
    let session = current
        .as_ref()
        .ok_or_else(|| "No capture session is active".to_string())?;
    if session.session_id != session_id {
        return Err("The capture session is stale".into());
    }

    let selection = LogicalRect {
        x: selection.x,
        y: selection.y,
        width: selection.width,
        height: selection.height,
    };
    let output = render_composite(selection, &session.monitors)?;

    let result = CaptureResult {
        image_data: encode_png(&output)?,
        width: output.width(),
        height: output.height(),
        x: selection.x.round() as i32,
        y: selection.y.round() as i32,
    };
    *current = None;
    Ok(result)
}

#[tauri::command]
pub fn cancel_capture_session(
    sessions: tauri::State<'_, CaptureSessions>,
    session_id: u64,
) -> Result<(), String> {
    let mut current = sessions
        .current
        .lock()
        .map_err(|_| "Capture session state is unavailable".to_string())?;
    if current
        .as_ref()
        .is_some_and(|session| session.session_id == session_id)
    {
        *current = None;
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::{
        build_composite_plan, render_composite, CapturedMonitor, LogicalRect, MonitorCapture,
        MonitorGeometry,
    };

    fn monitor(x: f64, y: f64, width: f64, height: f64, scale: f64) -> MonitorGeometry {
        MonitorGeometry {
            x,
            y,
            width,
            height,
            scale,
            physical_width: (width * scale).round() as u32,
            physical_height: (height * scale).round() as u32,
        }
    }

    #[test]
    fn cross_monitor_plan_resamples_to_the_highest_scale() {
        let monitors = [
            monitor(-2560.0, 160.0, 2560.0, 1440.0, 1.5),
            monitor(0.0, 0.0, 1920.0, 1080.0, 2.0),
        ];
        let selection = LogicalRect {
            x: -100.0,
            y: 200.0,
            width: 300.0,
            height: 400.0,
        };

        let plan = build_composite_plan(selection, &monitors).unwrap();

        assert_eq!(
            (plan.output_width, plan.output_height, plan.output_scale),
            (600, 800, 2.0)
        );
        assert_eq!(plan.crops.len(), 2);
        assert_eq!(
            (
                plan.crops[0].src_x,
                plan.crops[0].src_y,
                plan.crops[0].src_width,
                plan.crops[0].src_height
            ),
            (3690, 60, 150, 600),
        );
        assert_eq!(
            (
                plan.crops[0].dst_x,
                plan.crops[0].dst_y,
                plan.crops[0].dst_width,
                plan.crops[0].dst_height
            ),
            (0, 0, 200, 800),
        );
        assert_eq!(
            (
                plan.crops[1].src_x,
                plan.crops[1].src_y,
                plan.crops[1].src_width,
                plan.crops[1].src_height
            ),
            (0, 400, 400, 800),
        );
        assert_eq!(
            (
                plan.crops[1].dst_x,
                plan.crops[1].dst_y,
                plan.crops[1].dst_width,
                plan.crops[1].dst_height
            ),
            (200, 0, 400, 800),
        );
    }

    #[test]
    fn crop_edges_cover_fractional_pixels_and_clamp_to_the_frame() {
        let monitors = [MonitorGeometry {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
            scale: 1.25,
            physical_width: 125,
            physical_height: 125,
        }];
        let selection = LogicalRect {
            x: 99.4,
            y: 99.4,
            width: 1.0,
            height: 1.0,
        };

        let plan = build_composite_plan(selection, &monitors).unwrap();

        assert_eq!(
            (
                plan.crops[0].src_x,
                plan.crops[0].src_y,
                plan.crops[0].src_width,
                plan.crops[0].src_height
            ),
            (124, 124, 1, 1),
        );
    }

    #[test]
    fn rejects_empty_or_off_desktop_selections() {
        let monitors = [monitor(0.0, 0.0, 1920.0, 1080.0, 1.0)];

        assert!(build_composite_plan(
            LogicalRect {
                x: 20.0,
                y: 20.0,
                width: 0.0,
                height: 10.0
            },
            &monitors,
        )
        .is_err());
        assert!(build_composite_plan(
            LogicalRect {
                x: -50.0,
                y: -50.0,
                width: 10.0,
                height: 10.0
            },
            &monitors,
        )
        .is_err());
    }

    #[test]
    fn renders_a_composite_with_resampled_monitor_crops() {
        use screenshots::image::{Rgba, RgbaImage};

        let first = CapturedMonitor {
            metadata: MonitorCapture {
                monitor_id: 1,
                physical_x: 0,
                physical_y: 0,
                logical_x: 0.0,
                logical_y: 0.0,
                logical_width: 2.0,
                logical_height: 2.0,
                physical_width: 2,
                physical_height: 2,
                scale_factor: 1.0,
                image_data: String::new(),
            },
            image: RgbaImage::from_pixel(2, 2, Rgba([255, 0, 0, 255])),
        };
        let second = CapturedMonitor {
            metadata: MonitorCapture {
                monitor_id: 2,
                physical_x: 2,
                physical_y: 0,
                logical_x: 2.0,
                logical_y: 0.0,
                logical_width: 2.0,
                logical_height: 2.0,
                physical_width: 4,
                physical_height: 4,
                scale_factor: 2.0,
                image_data: String::new(),
            },
            image: RgbaImage::from_pixel(4, 4, Rgba([0, 0, 255, 255])),
        };

        let composite = render_composite(
            LogicalRect {
                x: 1.0,
                y: 0.0,
                width: 2.0,
                height: 2.0,
            },
            &[first, second],
        )
        .unwrap();

        assert_eq!(composite.dimensions(), (4, 4));
        assert_eq!(composite.get_pixel(0, 0).0, [255, 0, 0, 255]);
        assert_eq!(composite.get_pixel(3, 0).0, [0, 0, 255, 255]);
    }
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
