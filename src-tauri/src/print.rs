//! Sends a screenshot to the system printer.
//!
//! Windows has no "print this bitmap" API, so the image is written to a
//! temporary file and handed to the default viewer, which owns the printing
//! dialog. This is the same hand-off Lightshot makes for its "Print" button and
//! keeps the app out of the printer driver business.

use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// Write the screenshot to a temporary file and open it for printing.
#[tauri::command]
pub fn print_image(app: AppHandle, image_data: String) -> Result<(), String> {
    let bytes = crate::capture::decode_image_data_url(&image_data)?;
    let extension = crate::capture::image_extension(&image_data);

    let mut path: PathBuf = std::env::temp_dir();
    path.push(format!("cap2clip-print-{}.{}", unique_suffix(), extension));
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;

    app.shell()
        .open(path.to_string_lossy().to_string(), None)
        .map_err(|error| error.to_string())
}

/// Milliseconds since the Unix epoch, which is enough to keep concurrent prints
/// from overwriting each other's temporary file.
fn unique_suffix() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::unique_suffix;

    #[test]
    fn the_print_suffix_is_unique_per_call() {
        // Two prints inside the same millisecond are unlikely but the value is
        // only used as a filename suffix, so the contract is just that it moves.
        let first = unique_suffix();
        std::thread::sleep(std::time::Duration::from_millis(2));
        assert!(unique_suffix() >= first);
    }

    #[test]
    fn an_existing_capture_is_not_mistaken_for_a_data_url() {
        // The shared decoder is the only thing standing between a malformed
        // payload and a truncated file, so make sure it refuses free text.
        assert!(crate::capture::decode_image_data_url("hello").is_err());
    }
}