import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { SettingsPanel } from "./components/SettingsPanel";

export interface Preset {
  id: string;
  name: string;
  type: "aspect_ratio" | "fixed_size" | "free";
  width: number;
  height: number;
  aspect_ratio: string | null;
  enabled: boolean;
  order: number;
  is_builtin: boolean;
}

export interface SelectionGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  shortcut_region: string;
  shortcut_fullscreen: string;
  shortcut_copy: string;
  shortcut_save: string;
  shortcut_cancel: string;
  shortcuts_enabled: boolean;
  last_save_dir: string;
  previous_selection: SelectionGeometry | null;
  presets: Preset[];
}

type SessionPhase = "idle" | "selecting" | "annotating" | "settings";

function App() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [fullScreenshot, setFullScreenshot] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionGeometry | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    shortcut_region: "PrintScreen",
    shortcut_fullscreen: "Shift+PrintScreen",
    shortcut_copy: "Ctrl+C",
    shortcut_save: "Ctrl+S",
    shortcut_cancel: "Escape",
    shortcuts_enabled: true,
    last_save_dir: "",
    previous_selection: null,
    presets: [],
  });

  // Load settings on mount
  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then(setSettings)
      .catch(console.error);
  }, []);

  // Listen for Tauri events from Rust backend
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen("region-capture", async () => {
      try {
        // Capture full screen immediately when PrtScn is pressed
        const result = await invoke<{ image_data: string; width: number; height: number }>("capture_full_screen");
        setFullScreenshot(result.image_data);
        setPhase("selecting");
        // Restore previous selection if available
        setSelectionRect(settings.previous_selection || null);
      } catch (e) {
        console.error("Full screen capture failed:", e);
      }
    }).then((fn) => unlisteners.push(fn));

    listen("fullscreen-capture", async () => {
      try {
        const result = await invoke<{ image_data: string; width: number; height: number }>("capture_full_screen");
        await invoke("copy_image_to_clipboard", { dataUrl: result.image_data });
      } catch (e) {
        console.error("Full screen capture failed:", e);
      }
    }).then((fn) => unlisteners.push(fn));

    listen("show-settings", () => {
      setPhase("settings");
    }).then((fn) => unlisteners.push(fn));

    return () => unlisteners.forEach((fn) => fn());
  }, [settings.previous_selection]);

  // Selection complete: just enter annotating phase, NO capture
  const handleEnterAnnotate = useCallback((rect: SelectionGeometry) => {
    setSelectionRect(rect);
    setPhase("annotating");
  }, []);

  // Copy: crop from full screenshot at current rect, apply annotations, copy
  const handleCopy = useCallback(
    async (finalImage: string) => {
      try {
        await invoke("copy_image_to_clipboard", { dataUrl: finalImage });
        // Save previous selection on successful copy
        if (selectionRect) {
          const updated = { ...settings, previous_selection: selectionRect };
          setSettings(updated);
          await invoke("save_settings", { settings: updated });
        }
      } catch (e) {
        console.error("Copy failed:", e);
      }
      setPhase("idle");
      setFullScreenshot(null);
      setSelectionRect(null);
      getCurrentWindow().hide();
    },
    [selectionRect, settings]
  );

  // Save: crop from full screenshot at current rect, apply annotations, save
  const handleSave = useCallback(
    async (finalImage: string) => {
      try {
        const result = await invoke<string>("save_screenshot", {
          dataUrl: finalImage,
          defaultPath: settings.last_save_dir,
        });
        if (selectionRect && result) {
          const dir = result.substring(0, result.lastIndexOf("\\") + 1) || result.substring(0, result.lastIndexOf("/") + 1);
          const updated = { ...settings, previous_selection: selectionRect, last_save_dir: dir };
          setSettings(updated);
          await invoke("save_settings", { settings: updated });
        }
      } catch (e) {
        console.error("Save failed:", e);
      }
      setPhase("idle");
      setFullScreenshot(null);
      setSelectionRect(null);
      getCurrentWindow().hide();
    },
    [selectionRect, settings]
  );

  const handleCancel = useCallback(() => {
    setPhase("idle");
    setFullScreenshot(null);
    setSelectionRect(null);
    getCurrentWindow().hide();
  }, []);

  const handleSettingsSave = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      await invoke("save_settings", { settings: newSettings });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
    setPhase("idle");
    getCurrentWindow().hide();
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {(phase === "selecting" || phase === "annotating") && fullScreenshot && (
        <CaptureOverlay
          phase={phase}
          fullScreenshot={fullScreenshot}
          selectionRect={selectionRect}
          presets={settings.presets.filter((p) => p.enabled)}
          onEnterAnnotate={handleEnterAnnotate}
          onCopy={handleCopy}
          onSave={handleSave}
          onCancel={handleCancel}
          shortcutCopy={settings.shortcut_copy}
          shortcutSave={settings.shortcut_save}
        />
      )}

      {phase === "settings" && (
        <SettingsPanel
          settings={settings}
          onSave={handleSettingsSave}
          onClose={() => { setPhase("idle"); getCurrentWindow().hide(); }}
        />
      )}

      {phase === "idle" && <div className="idle-state" />}
    </div>
  );
}

export default App;