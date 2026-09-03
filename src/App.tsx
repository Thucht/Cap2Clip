import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Overlay } from "./components/Overlay";
import { Editor } from "./components/Editor";
import { PresetPanel } from "./components/PresetPanel";
import { useAppStore } from "./stores/appStore";
import "./styles/global.css";

function App() {
  const [mode, setMode] = useState<"overlay" | "editor">("overlay");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const { loadPresets, showPresetPanel, setShowPresetPanel } = useAppStore();

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Close app or go back to overlay
      if (e.key === "Escape") {
        if (mode === "editor") {
          setMode("overlay");
          setScreenshot(null);
        } else {
          getCurrentWindow().close();
        }
      }
      
      // Ctrl+Shift+P: Toggle presets panel
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setShowPresetPanel(!showPresetPanel);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, showPresetPanel, setShowPresetPanel]);

  const handleCaptureComplete = useCallback((imageData: string) => {
    setScreenshot(imageData);
    setMode("editor");
  }, []);

  const handleSave = useCallback(() => {
    // Reset to overlay mode after save
    setMode("overlay");
    setScreenshot(null);
    // Close the window after save
    getCurrentWindow().close();
  }, []);

  const handleCancel = useCallback(() => {
    setMode("overlay");
    setScreenshot(null);
  }, []);

  if (mode === "editor" && screenshot) {
    return (
      <Editor
        screenshot={screenshot}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <>
      <Overlay onCaptureComplete={handleCaptureComplete} />
      {showPresetPanel && <PresetPanel />}
    </>
  );
}

export default App;
