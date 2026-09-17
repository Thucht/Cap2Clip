import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import type { Tool } from "./components/AnnotationToolbar";
import type { CaptureWindowGeometry } from "./geometry";
import { monitorPhysicalRectToLogical } from "./capture-session";
import type { CaptureSession, MonitorCapture } from "./capture-session";

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
const overlayMatch = getCurrentWindow().label.match(/^capture-(\d+)$/);
const overlayMonitorId = overlayMatch ? Number(overlayMatch[1]) : null;

async function ensureCaptureOverlay(monitor: MonitorCapture) {
  const label = `capture-${monitor.monitor_id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) return existing;

  const bounds = monitorPhysicalRectToLogical(monitor);
  const overlay = new WebviewWindow(`capture-${monitor.monitor_id}`, {
    url: `index.html?window=capture&monitor=${monitor.monitor_id}`,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    visible: false,
    focus: false,
  });
  await new Promise<void>((resolve, reject) => {
    overlay.once("tauri://created", () => resolve());
    overlay.once("tauri://error", ({ payload }) => reject(payload));
  });
  return overlay;
}

async function showCaptureOverlays(session: CaptureSession) {
  await Promise.all(session.monitors.map(async (monitor) => {
    const overlay = await ensureCaptureOverlay(monitor);
    await overlay.emit("capture-session-started", session);
    await overlay.show();
  }));
  await WebviewWindow.getByLabel(`capture-${session.monitors[0].monitor_id}`)
    .then((window) => window?.setFocus());
}

async function hideCaptureOverlays(session: CaptureSession | null) {
  if (!session) return;
  await Promise.all(session.monitors.map(async (monitor) => {
    await WebviewWindow.getByLabel(`capture-${monitor.monitor_id}`).then((window) => window?.hide());
  }));
}

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
  // Physical rectangle the native overlay window really has for this session.
  // It is the source of truth for mapping CSS coordinates onto the screenshot,
  // because the requested monitor rectangle is not always what Windows keeps
  // on a mixed-DPI desktop.
  const [captureGeometry, setCaptureGeometry] = useState<CaptureWindowGeometry | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionGeometry | null>(null);
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  const [overlayMonitor, setOverlayMonitor] = useState<MonitorCapture | null>(null);
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

  useEffect(() => {
    if (overlayMonitorId === null) return;
    let unlistenStart = () => {};
    let unlistenCancel = () => {};
    const applySession = (session: CaptureSession) => {
      const monitor = session.monitors.find((item) => item.monitor_id === overlayMonitorId);
      if (!monitor) return;
      setCaptureSession(session);
      setOverlayMonitor(monitor);
      setFullScreenshot(monitor.image_data);
      setCaptureSize({ width: monitor.physical_width, height: monitor.physical_height });
      invoke<CaptureWindowGeometry>("resize_window_to_capture", {
        x: monitor.physical_x,
        y: monitor.physical_y,
        width: monitor.physical_width,
        height: monitor.physical_height,
      }).then(setCaptureGeometry).catch(console.error);
      setSelectionRect(null);
      setPhase("selecting");
    };

    listen<CaptureSession>("capture-session-started", ({ payload }) => applySession(payload))
      .then((unlisten) => { unlistenStart = unlisten; });

    listen("capture-session-cancelled", () => {
      setCaptureSession(null);
      setPhase("idle");
      getCurrentWindow().hide();
    }).then((unlisten) => { unlistenCancel = unlisten; });
    invoke<CaptureSession | null>("active_capture_session")
      .then((session) => { if (session) applySession(session); })
      .catch(console.error);

    return () => {
      unlistenStart();
      unlistenCancel();
    };
  }, []);

  useEffect(() => {
    if (overlayMonitorId !== null) return;
    let unlistenComposite = () => {};
    let unlistenFinalize = () => {};
    listen<{ session_id: number; selection: SelectionGeometry }>(
      "capture-selection-finalized",
      async ({ payload }) => {
        try {
          const result = await invoke<CaptureResult>("finalize_capture_session", {
            sessionId: payload.session_id,
            selection: payload.selection,
          });
          const session = captureSessionRef.current;
          await hideCaptureOverlays(session);
          await emit("capture-composite-ready", { result, selection: payload.selection });
        } catch (error) {
          console.error("Capture session finalization failed:", error);
        }
      },
    ).then((unlisten) => { unlistenFinalize = unlisten; });
    listen<{ result: CaptureResult; selection: SelectionGeometry }>(
      "capture-composite-ready",
      ({ payload }) => {
        flushSync(() => {
          setFullScreenshot(payload.result.image_data);
          setCaptureSize({ width: payload.result.width, height: payload.result.height });
          setCaptureGeometry(null);
          setSelectionRect({ x: 0, y: 0, width: payload.result.width, height: payload.result.height });
          setPhase("annotating");
        });
        getCurrentWindow().show().then(() => getCurrentWindow().setFocus());
      },
    ).then((unlisten) => { unlistenComposite = unlisten; });
    return () => {
      unlistenComposite();
      unlistenFinalize();
    };
  }, []);

  // Listen for Tauri events from Rust backend - register ONCE
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const captureSessionRef = useRef(captureSession);
  captureSessionRef.current = captureSession;

  useEffect(() => {
    if (isSettingsWindow) return;
    const unlisteners: (() => void)[] = [];

    listen("region-capture", async () => {
      try {
        if (overlayMonitorId !== null) return;
        const session = await invoke<CaptureSession>("begin_capture_session");
        setCaptureSession(session);
        await showCaptureOverlays(session);
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
      setCaptureGeometry(null);
      setSelectionRect(null);
      getCurrentWindow().hide();
    },
    [selectionRect, settings, captureSession]
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
        setCaptureGeometry(null);
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
        setCaptureGeometry(null);
        setSelectionRect(null);
        getCurrentWindow().hide();
      } catch (e) {
        console.error("Quick save failed:", e);
      }
    },
    [selectionRect, settings]
  );

  const handleCancel = useCallback(async () => {
    if (captureSession) {
      await invoke("cancel_capture_session", { sessionId: captureSession.session_id }).catch(console.error);
      await hideCaptureOverlays(captureSession);
      await emit("capture-session-cancelled", { session_id: captureSession.session_id });
      setCaptureSession(null);
    }
    setPhase("idle");
    setFullScreenshot(null);
    setCaptureGeometry(null);
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
          captureGeometry={captureGeometry}
          captureSession={captureSession}
          monitorCapture={overlayMonitor}
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