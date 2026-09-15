//! Global shortcut registration driven by the persisted settings.
//!
//! The settings values are the single source of truth: every change releases the
//! previous registrations and binds the configured accelerators again, and
//! `shortcuts_enabled` really disables them.

use std::str::FromStr;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::settings::AppSettings;

/// Accelerators to register, paired with the action they trigger.
fn desired_shortcuts(settings: &AppSettings) -> Result<Vec<(&'static str, Shortcut)>, String> {
    if !settings.shortcuts_enabled {
        return Ok(Vec::new());
    }

    let mut shortcuts: Vec<(&'static str, Shortcut)> = Vec::new();
    for (action, spec) in [
        ("region", settings.shortcut_region.as_str()),
        ("fullscreen", settings.shortcut_fullscreen.as_str()),
    ] {
        let spec = spec.trim();
        if spec.is_empty() {
            continue;
        }

        // Parse before touching the live registrations so a typo cannot leave
        // the application without a working shortcut.
        let shortcut = Shortcut::from_str(spec)
            .map_err(|error| format!("Invalid shortcut \"{spec}\": {error}"))?;

        // The same accelerator cannot be bound twice.
        if shortcuts
            .iter()
            .any(|(_, existing)| existing.id() == shortcut.id())
        {
            continue;
        }

        shortcuts.push((action, shortcut));
    }

    Ok(shortcuts)
}

/// Registers exactly the shortcuts described by `settings`.
pub fn apply(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let shortcuts = desired_shortcuts(settings)?;
    let manager = app.global_shortcut();

    // Release the previous set first so a changed shortcut cannot stay bound to
    // its old action. Nothing is registered on the very first call.
    if let Err(error) = manager.unregister_all() {
        eprintln!("Could not release the previous global shortcuts: {error}");
    }

    for (action, shortcut) in shortcuts {
        manager
            .on_shortcut(
                shortcut,
                move |app: &AppHandle, _shortcut: &Shortcut, event: ShortcutEvent| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    // The overlay stays hidden until the screenshot is taken;
                    // the frontend shows it after the capture completes.
                    let event_name = if action == "fullscreen" {
                        "fullscreen-capture"
                    } else {
                        "region-capture"
                    };
                    let _ = app.emit(event_name, ());
                },
            )
            .map_err(|error| format!("Could not register shortcut {action}: {error}"))?;
    }

    Ok(())
}