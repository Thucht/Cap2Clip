import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import type { Tool } from "./components/AnnotationToolbar";

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
  auto_start: boolean;
  shortcuts: { [key: string]: string };
}

type SessionPhase = "idle" | "selecting" | "annotating" | "settings";

function App() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [fullScreenshot, setFullScreenshot] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionGeometry | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("move");
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
    auto_start: false,
    shortcuts: {},
  });

  // Load settings on mount
  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((loaded) => {
        // Migrate: ensure new fields exist
        setSettings({
          ...loaded,
          auto_start: loaded.auto_start ?? false,
          shortcuts: loaded.shortcuts ?? {},
        });
      })
      .catch(console.error);
  }, []);

  // Listen for Tauri events from Rust backend - register ONCE
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen("region-capture", async () => {
      try {
        const result = await invoke<{ image_data: string; width: number; height: number }>("capture_full_screen");
        const previous = settingsRef.current.previous_selection;
        setFullScreenshot(result.image_data);
        setSelectionRect(previous);
        setActiveTool("move");
        // A remembered frame is already a valid selection: enter annotate
        // immediately so the menu is never missing on the first capture.
        setPhase(previous ? "annotating" : "selecting");
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
  }, []); // Empty deps - register only once on mount

  const handleEnterAnnotate = useCallback((rect: SelectionGeometry) => {
    setSelectionRect(rect);
    setPhase("annotating");
  }, []);

  const handleCopy = useCallback(
    async (finalImage: string) => {
      try {
        await invoke("copy_image_to_clipboard", { dataUrl: finalImage });
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

  const handleSaveDialog = useCallback(
    async (images: string[]) => {
      if (images.length === 0) return;
      try {
        const result = await invoke<string>("save_screenshots", {
          imageData: images,
          lastSaveDir: settings.last_save_dir,
        });
        const dir = result.substring(0, Math.max(result.lastIndexOf("\\"), result.lastIndexOf("/")) + 1);
        const updated = {
          ...settings,
          previous_selection: selectionRect,
          last_save_dir: dir || settings.last_save_dir,
        };
        setSettings(updated);
        await invoke("save_settings", { settings: updated });
        setPhase("idle");
        setFullScreenshot(null);
        setSelectionRect(null);
        getCurrentWindow().hide();
      } catch (e) {
        // A cancelled dialog must leave the annotation session open.
        console.error("Save dialog failed or was cancelled:", e);
      }
    },
    [selectionRect, settings]
  );

  const handleQuickSave = useCallback(
    async (images: string[]) => {
      if (images.length === 0) return;
      try {
        const result = await invoke<string>("save_screenshots_quick", {
          imageData: images,
          lastSaveDir: settings.last_save_dir,
        });
        const dir = result.substring(0, Math.max(result.lastIndexOf("\\"), result.lastIndexOf("/")) + 1);
        const updated = {
          ...settings,
          previous_selection: selectionRect,
          last_save_dir: dir || settings.last_save_dir,
        };
        setSettings(updated);
        await invoke("save_settings", { settings: updated });
        setPhase("idle");
        setFullScreenshot(null);
        setSelectionRect(null);
        getCurrentWindow().hide();
      } catch (e) {
        console.error("Quick save failed:", e);
      }
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
      // Apply auto-start setting
      try {
        await invoke("set_auto_start", { enabled: newSettings.auto_start });
      } catch (e) {
        console.warn("set_auto_start not implemented yet:", e);
      }
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
    setPhase("idle");
    getCurrentWindow().hide();
  }, []);

  useEffect(() => {
    // Toggle click-through and resize: when not capturing, window ignores cursor so other apps work
    const ignore = phase === "idle";
    invoke("set_ignore_cursor_events", { ignore }).catch(console.error);
    if (phase === "selecting" || phase === "annotating") {
      invoke("resize_window_to_fullscreen").catch(console.error);
    }
  }, [phase]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {(phase === "selecting" || phase === "annotating") && fullScreenshot && (
        <CaptureOverlay
          phase={phase}
          fullScreenshot={fullScreenshot}
          selectionRect={selectionRect}
          presets={settings.presets.filter((p) => p.enabled)}
          activeTool={activeTool}
          onToolChange={setActiveTool as (tool: Tool) => void}
          onEnterAnnotate={handleEnterAnnotate}
          onCopy={handleCopy}
          onSaveDialog={handleSaveDialog}
          onQuickSave={handleQuickSave}
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