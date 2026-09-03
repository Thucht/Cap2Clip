import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { SettingsPanel } from "./components/SettingsPanel";

export interface AppSettings {
  shortcut_region: string;
  shortcut_fullscreen: string;
  shortcuts_enabled: boolean;
  last_save_dir: string;
}

type SessionPhase = "idle" | "selecting" | "annotating" | "settings";

function App() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    shortcut_region: "PrintScreen",
    shortcut_fullscreen: "Shift+PrintScreen",
    shortcuts_enabled: true,
    last_save_dir: "",
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

    listen("region-capture", () => {
      setPhase("selecting");
      setScreenshot(null);
      setSelectionRect(null);
    }).then((fn) => unlisteners.push(fn));

    listen("fullscreen-capture", async () => {
      try {
        const result = await invoke<{ image_data: string; width: number; height: number }>("capture_full_screen");
        await invoke("copy_image_to_clipboard", { dataUrl: result.image_data });
      } catch (e) {
        console.error("Full screen capture failed:", e);
      }
    }).then((fn) => unlisteners.push(fn));

    listen("toggle-shortcuts", () => {
      setSettings((prev) => {
        const updated = { ...prev, shortcuts_enabled: !prev.shortcuts_enabled };
        invoke("save_settings", { settings: updated });
        return updated;
      });
    }).then((fn) => unlisteners.push(fn));

    listen("show-settings", () => {
      setPhase("settings");
    }).then((fn) => unlisteners.push(fn));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "settings") {
          setPhase("idle");
          getCurrentWindow().hide();
        } else if (phase === "selecting" || phase === "annotating") {
          endSession();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  const endSession = useCallback(() => {
    setPhase("idle");
    setScreenshot(null);
    setSelectionRect(null);
    getCurrentWindow().hide();
  }, []);

  const handleSelectionComplete = useCallback(async (rect: { x: number; y: number; w: number; h: number }) => {
    try {
      const result = await invoke<{ image_data: string; width: number; height: number }>(
        "capture_region",
        { x: rect.x, y: rect.y, width: rect.w, height: rect.h }
      );
      setScreenshot(result.image_data);
      setSelectionRect(rect);
      setPhase("annotating");
    } catch (e) {
      console.error("Capture failed:", e);
      endSession();
    }
  }, [endSession]);

  const handleCopy = useCallback(async (finalImage: string) => {
    try {
      await invoke("copy_image_to_clipboard", { dataUrl: finalImage });
    } catch (e) {
      console.error("Copy failed:", e);
    }
    endSession();
  }, [endSession]);

  const handleSave = useCallback(async (finalImage: string) => {
    try {
      const savedPath = await invoke<string>("save_screenshot", {
        imageData: finalImage,
        lastSaveDir: settings.last_save_dir,
      });

      // Remember last save directory
      const lastSep = Math.max(savedPath.lastIndexOf("\\"), savedPath.lastIndexOf("/"));
      const dir = lastSep > 0 ? savedPath.substring(0, lastSep) : savedPath;
      const updatedSettings = { ...settings, last_save_dir: dir };
      setSettings(updatedSettings);
      await invoke("save_settings", { settings: updatedSettings });
    } catch (e) {
      if (e !== "Save cancelled") {
        console.error("Save failed:", e);
      }
    }
    endSession();
  }, [settings, endSession]);

  const handleCancel = useCallback(() => {
    endSession();
  }, [endSession]);

  const handleSaveSettings = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    await invoke("save_settings", { settings: newSettings });
    setPhase("idle");
    getCurrentWindow().hide();
  }, []);

  if (phase === "settings") {
    return (
      <SettingsPanel
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => {
          setPhase("idle");
          getCurrentWindow().hide();
        }}
      />
    );
  }

  if (phase === "selecting" || phase === "annotating") {
    return (
      <CaptureOverlay
        phase={phase}
        screenshot={screenshot}
        selectionRect={selectionRect}
        onSelectionComplete={handleSelectionComplete}
        onCopy={handleCopy}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  // Idle: transparent, nothing visible
  return <div className="idle-state" />;
}

export default App;