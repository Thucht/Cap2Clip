import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
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

export interface CaptureResult {
  image_data: string;
  width: number;
  height: number;
  x: number;
  y: number;
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

const isSettingsWindow = new URLSearchParams(window.location.search).get("window") === "settings";

async function openSettingsWindow() {
  const existing = await WebviewWindow.getByLabel("settings");
  if (!existing) return;
  await existing.show();
  await existing.setFocus();
}

function App() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [fullScreenshot, setFullScreenshot] = useState<string | null>(null);
  const [captureSize, setCaptureSize] = useState({ width: 1, height: 1 });
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

  // Load settings on mount. This also runs in the dedicated settings window
  // so the form never starts from defaults and overwrites saved preferences.
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
    if (isSettingsWindow) return;
    const unlisteners: (() => void)[] = [];

    listen("region-capture", async () => {
      try {
        const result = await invoke<CaptureResult>("capture_full_screen");
        const previous = settingsRef.current.previous_selection;
        await invoke("resize_window_to_capture", {
          x: result.x,
          y: result.y,
          width: result.width,
          height: result.height,
        });
        // Let WebView2 apply the new monitor/DPI layout before React measures
        // the overlay. Otherwise the first pointer event can use the previous
        // monitor's viewport dimensions.
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Commit the interactive UI while the transparent window is still
        // hidden. Showing an empty transparent WebView can produce an opaque
        // white surface on Windows, especially with multiple 4K displays.
        flushSync(() => {
          setFullScreenshot(result.image_data);
          setCaptureSize({ width: result.width, height: result.height });
          setSelectionRect(previous);
          setActiveTool("move");
          // A remembered frame is already a valid selection: enter annotate
          // immediately so the menu is never missing on the first capture.
          setPhase(previous ? "annotating" : "selecting");
        });
        const window = getCurrentWindow();
        // The capture overlay must sit above every other window while the
        // session is open; the settings dialog below must not.
        await window.setAlwaysOnTop(true);
        // The hidden idle window is click-through. Disable that explicitly
        // before showing it instead of waiting for the phase effect.
        await invoke("set_ignore_cursor_events", { ignore: false });
        await window.show();
        await window.setFocus();
      } catch (e) {
        console.error("Full screen capture failed:", e);
        await getCurrentWindow().hide();
      }
    }).then((fn) => unlisteners.push(fn));

    listen("fullscreen-capture", async () => {
      try {
        const result = await invoke<CaptureResult>("capture_full_screen");
        await invoke("copy_image_to_clipboard", { dataUrl: result.image_data });
      } catch (e) {
        console.error("Full screen capture failed:", e);
      }
    }).then((fn) => unlisteners.push(fn));

    listen("show-settings", async () => {
      await openSettingsWindow();
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

  const handleSettingsSave = useCallback(async (newSettings: AppSettings): Promise<string | null> => {
    try {
      await invoke("save_settings", { settings: newSettings });
      await invoke("set_auto_start", { enabled: newSettings.auto_start });
      setSettings(newSettings);
      if (isSettingsWindow) {
        await getCurrentWindow().close();
      } else {
        setPhase("idle");
        await getCurrentWindow().hide();
      }
      return null;
    } catch (e) {
      console.error("Failed to save settings:", e);
      return e instanceof Error ? e.message : String(e);
    }
  }, []);

  useEffect(() => {
    if (isSettingsWindow) return;
    // Toggle click-through and resize: when not capturing, window ignores cursor so other apps work
    const ignore = phase === "idle";
    invoke("set_ignore_cursor_events", { ignore }).catch(console.error);
  }, [phase]);

  if (isSettingsWindow) {
    return <SettingsPanel settings={settings} onSave={handleSettingsSave} onClose={() => getCurrentWindow().close()} />;
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {(phase === "selecting" || phase === "annotating") && fullScreenshot && (
        <CaptureOverlay
          phase={phase}
          fullScreenshot={fullScreenshot}
          captureSize={captureSize}
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
          shortcutCancel={settings.shortcut_cancel}
          toolShortcuts={settings.shortcuts}
        />
      )}



      {phase === "idle" && <div className="idle-state" />}
    </div>
  );
}

export default App;