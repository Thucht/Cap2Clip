import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CaptureOverlay } from "./components/CaptureOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toast } from "./components/Toast";
import type { Tool } from "./components/AnnotationToolbar";
import type { CaptureWindowGeometry } from "./geometry";
import { monitorPhysicalRectToLogical } from "./capture-session";
import { overlayMonitorId } from "./app-context";
import type { CaptureSession, MonitorCapture } from "./capture-session";
import { preselectedRegion, rememberedSelection, savedFile, shouldNotify } from "./parity-rules";

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

export type ImageFormat = "png" | "jpeg";

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
  /** Lightshot parity: "Show notifications about copying and saving". */
  show_notifications: boolean;
  /** Lightshot parity: "Capture a cursor on a screenshot". */
  capture_cursor: boolean;
  /** Lightshot parity: "Keep the selected area position". */
  keep_selection: boolean;
  /** Lightshot parity: "Upload using the format" / "JPEG quality". */
  image_format: ImageFormat;
  jpeg_quality: number;
}

/** One entry for the notification bubble rendered in the `toast` window. */
export interface ToastPayload {
  message: string;
  icon?: string;
  action?: string;
  path?: string;
  url?: string;
  duration_ms?: number;
}

const DEFAULT_SETTINGS: AppSettings = {
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
  show_notifications: true,
  capture_cursor: false,
  keep_selection: true,
  image_format: "png",
  jpeg_quality: 90,
};

type SessionPhase = "idle" | "selecting" | "annotating" | "settings";

const windowQuery = new URLSearchParams(window.location.search);
const isSettingsWindow = windowQuery.get("window") === "settings";
const isToastWindow = windowQuery.get("window") === "toast";
/**
 * The window that drives a capture session.
 *
 * Only this window may finalize a selection, resize itself into the editor and
 * register the capture hotkeys. The per-monitor overlays and the auxiliary
 * windows load the same `App`, so every listener below is gated on this: without
 * it the settings window answered `capture-composite-ready` too, which resized
 * and un-hid it on top of the editor after every capture.
 */
const isCoordinatorWindow = !isSettingsWindow && !isToastWindow && overlayMonitorId === null;
;


/** In-flight overlay creations, so a warm-up and a capture cannot both build one. */
const pendingOverlays = new Map<string, Promise<WebviewWindow>>();

async function ensureCaptureOverlay(monitor: MonitorCapture) {
  const label = `capture-${monitor.monitor_id}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) return existing;

  // The overlays are rebuilt in the background after a capture, so a second
  // caller (the next capture) can arrive while the first is still creating the
  // window. Two `WebviewWindow` objects with the same label is an error, and the
  // loser would be left orphaned on screen.
  const pending = pendingOverlays.get(label);
  if (pending) return pending;

  const creation = (async () => {
    const bounds = monitorPhysicalRectToLogical(monitor);
    const overlay = new WebviewWindow(label, {
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
    try {
      await new Promise<void>((resolve, reject) => {
        overlay.once("tauri://created", () => resolve());
        overlay.once("tauri://error", ({ payload }) => reject(payload));
      });
    } finally {
      pendingOverlays.delete(label);
    }
    return overlay;
  })();

  pendingOverlays.set(label, creation);
  return creation;
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

/**
 * Tear the per-monitor overlays down instead of only hiding them, then build
 * the next set straight away.
 *
 * Hiding leaves the WebView alive with the previous session's React state, so
 * every capture round would flash a stale selection before the new one is
 * committed. Destroying is safe, but creating a WebView2 window costs about half
 * a second per monitor and the user was paying for it between pressing
 * PrintScreen and seeing the overlay. Rebuilding in the background - while the
 * editor is on screen - moves that cost off the hotkey.
 */
async function destroyCaptureOverlays(session: CaptureSession | null) {
  if (!session) return;
  await Promise.all(session.monitors.map(async (monitor) => {
    try {
      await WebviewWindow.getByLabel(`capture-${monitor.monitor_id}`).then((window) => window?.destroy());
    } catch (error) {
      console.error("Could not destroy capture overlay:", error);
    }
  }));
  for (const monitor of session.monitors) {
    void ensureCaptureOverlay(monitor).catch(console.error);
  }
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

/**
 * Show the notification bubble in its own window.
 *
 * Lightshot confirms every copy and save with a short message; the bubble is
 * separate from the editor so it survives the editor hiding itself.
 */
async function showToast(payload: ToastPayload) {
  try {
    const toast = await WebviewWindow.getByLabel("toast");
    await toast?.emit("show-toast", payload);
  } catch (error) {
    console.error("Could not show the notification:", error);
  }
}

/** Smallest editor window; below this the toolbars cover the whole capture. */
const MIN_EDITOR_WIDTH = 360;
const MIN_EDITOR_HEIGHT = 260;

/**
 * Place the editor window on the region the user just captured.
 *
 * The window used to keep the size from `tauri.conf.json` and whatever position
 * Windows gave it, so the capture appeared to jump to another part of the
 * desktop, and any region larger than that fixed size was clamped away by the
 * overlay. The window is kept on the virtual desktop instead: a region that
 * runs off an edge is nudged back into view, and one larger than the desktop is
 * centred.
 */
async function fitEditorWindow(
  selection: SelectionGeometry,
  bounds: { x: number; y: number; width: number; height: number } | null,
) {
  const width = Math.max(MIN_EDITOR_WIDTH, Math.round(selection.width));
  const height = Math.max(MIN_EDITOR_HEIGHT, Math.round(selection.height));

  const desktop = bounds && bounds.width > 0 && bounds.height > 0
    ? bounds
    : { x: selection.x, y: selection.y, width, height };
  const place = (offset: number, size: number, origin: number, extent: number) =>
    size <= extent
      ? Math.min(Math.max(origin, offset), origin + extent - size)
      : origin + (extent - size) / 2;

await invoke("fit_editor_window", {
    x: Math.round(place(selection.x, width, desktop.x, desktop.width)),
    y: Math.round(place(selection.y, height, desktop.y, desktop.height)),
    width,
    height,
  });
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
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });

  // Load settings on mount. This also runs in the dedicated settings window
  // so the form never starts from defaults and overwrites saved preferences.
  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((loaded) => {
        // Migrate: ensure new fields exist
        setSettings({
          ...DEFAULT_SETTINGS,
          ...loaded,
          auto_start: loaded.auto_start ?? false,
          shortcuts: loaded.shortcuts ?? {},
          show_notifications: loaded.show_notifications ?? true,
          capture_cursor: loaded.capture_cursor ?? false,
          keep_selection: loaded.keep_selection ?? true,
          image_format: loaded.image_format ?? "png",
          jpeg_quality: Math.min(100, Math.max(1, loaded.jpeg_quality ?? 90)),
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
    if (!isCoordinatorWindow) return;
    let unlistenComposite = () => {};
    let unlistenFinalize = () => {};
    listen<{ session_id: number; selection: SelectionGeometry }>(
      "capture-selection-finalized",
      async ({ payload }) => {
        const session = captureSessionRef.current;
        try {
          const result = await invoke<CaptureResult>("finalize_capture_session", {
            sessionId: payload.session_id,
            selection: payload.selection,
          });
          await hideCaptureOverlays(session);
          // The Rust session is consumed by finalize_capture_session, so the
          // coordinator must drop it too - otherwise a later Cancel would try
          // to release a session that no longer exists.
          captureSessionRef.current = null;
          setCaptureSession(null);
          await emit("capture-composite-ready", {
            result,
            selection: payload.selection,
            bounds: session
              ? {
                  x: session.virtual_x,
                  y: session.virtual_y,
                  width: session.virtual_width,
                  height: session.virtual_height,
                }
              : null,
          });
          // Tear the overlays down only after the editor is on screen, so
          // closing the WebViews never delays the transition the user sees.
          void destroyCaptureOverlays(session);
        } catch (error) {
          console.error("Capture session finalization failed:", error);
        }
      },
    ).then((unlisten) => { unlistenFinalize = unlisten; });
    listen<{
      result: CaptureResult;
      selection: SelectionGeometry;
      bounds: { x: number; y: number; width: number; height: number } | null;
    }>(
      "capture-composite-ready",
      async ({ payload }) => {
        const window = getCurrentWindow();
        // The editor takes over the main window, so it is fitted to the captured
        // region before it is shown. Without this the window keeps its default
        // position and size: the image jumps somewhere else on the desktop and a
        // region bigger than 1200x800 is silently cropped by the overlay clamp.
        await fitEditorWindow(payload.selection, payload.bounds).catch(console.error);
        flushSync(() => {
          setFullScreenshot(payload.result.image_data);
          setCaptureSize({ width: payload.result.width, height: payload.result.height });
          setCaptureGeometry(null);
          // The selection is in logical pixels, which is what the overlay lays
          // out in. The composite is in physical pixels, and `imageMapping` is
          // what converts one into the other when the canvas is exported.
          setSelectionRect({
            x: 0,
            y: 0,
            width: Math.max(1, Math.round(payload.selection.width)),
            height: Math.max(1, Math.round(payload.selection.height)),
          });
          setPhase("annotating");
        });
        await window.show();
        await window.setFocus();
      },
    ).then((unlisten) => { unlistenComposite = unlisten; });
    return () => {
      unlistenComposite();
      unlistenFinalize();
    };
  }, []);

  // Listen for Tauri events from Rust backend - register ONCE
  const captureSessionRef = useRef(captureSession);
  captureSessionRef.current = captureSession;

  useEffect(() => {
    if (!isCoordinatorWindow) return;
    const unlisteners: (() => void)[] = [];

    listen("region-capture", async () => {
      try {
        const session = await invoke<CaptureSession>("begin_capture_session");
        captureSessionRef.current = session;
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
      let copied = true;
      try {
        await invoke("copy_image_to_clipboard", { dataUrl: finalImage });
      } catch (e) {
        copied = false;
        console.error("Copy failed:", e);
      }
      // Lightshot only remembers the region when the user asked for it.
      const remembered = rememberedSelection(settings, selectionRect);
      const updated = remembered !== settings.previous_selection
        ? { ...settings, previous_selection: remembered }
        : settings;
      if (updated !== settings) {
        setSettings(updated);
        await invoke("save_settings", { settings: updated }).catch(console.error);
      }
      setPhase("idle");
      setFullScreenshot(null);
      setCaptureGeometry(null);
      setSelectionRect(null);
      getCurrentWindow().hide();
      if (shouldNotify(settings, copied)) {
        void showToast({ message: "Your screenshot is copied to clipboard", icon: "⧉" });
      }
    },
    [selectionRect, settings]
  );

  const handlePrint = useCallback(async (finalImage: string) => {
    try {
      await invoke("print_image", { imageData: finalImage });
    } catch (e) {
      console.error("Print failed:", e);
    }
  }, []);

  const handleSaveDialog = useCallback(
    async (images: string[]) => {
      if (images.length === 0) return;
      let savedPath: string | null = null;
      try {
        savedPath = await invoke<string>("save_screenshots", {
          imageData: images,
          lastSaveDir: settings.last_save_dir,
        });
      } catch (e) {
        // A cancelled dialog must leave the annotation session open.
        console.error("Save dialog failed or was cancelled:", e);
        return;
      }
      const { dir, name: fileName } = savedFile(savedPath);
      const updated = {
        ...settings,
        previous_selection: rememberedSelection(settings, selectionRect),
        last_save_dir: dir || settings.last_save_dir,
      };
      setSettings(updated);
      await invoke("save_settings", { settings: updated });
      setPhase("idle");
      setFullScreenshot(null);
      setCaptureGeometry(null);
      setSelectionRect(null);
      getCurrentWindow().hide();
      if (shouldNotify(settings)) {
        void showToast({
          message: `Screenshot is saved to ${fileName}`,
          icon: "💾",
          action: "Open folder",
          path: savedPath,
          duration_ms: 6000,
        });
      }
    },
    [selectionRect, settings]
  );

  const handleQuickSave = useCallback(
    async (images: string[]) => {
      if (images.length === 0) return;
      let result: string | null = null;
      try {
        result = await invoke<string>("save_screenshots_quick", {
          imageData: images,
          lastSaveDir: settings.last_save_dir,
        });
      } catch (e) {
        console.error("Quick save failed:", e);
        return;
      }
      const { dir, name: fileName } = savedFile(result);
      const updated = {
        ...settings,
        previous_selection: rememberedSelection(settings, selectionRect),
        last_save_dir: dir || settings.last_save_dir,
      };
      setSettings(updated);
      await invoke("save_settings", { settings: updated });
      setPhase("idle");
      setFullScreenshot(null);
      setCaptureGeometry(null);
      setSelectionRect(null);
      getCurrentWindow().hide();
      if (shouldNotify(settings)) {
        void showToast({
          message: `Screenshot is saved to ${fileName}`,
          icon: "💾",
          action: "Open folder",
          path: result,
          duration_ms: 6000,
        });
      }
    },
    [selectionRect, settings]
  );

  const handleCancel = useCallback(async () => {
    // Read the live session through the ref instead of the state value: this
    // callback is registered once, so closing over `captureSession` would keep
    // the initial `null` forever and Escape would neither release the Rust
    // session nor take the per-monitor overlays off the screen.
    const session = captureSessionRef.current;
    if (session) {
      await invoke("cancel_capture_session", { sessionId: session.session_id }).catch(console.error);
      await destroyCaptureOverlays(session);
      await emit("capture-session-cancelled", { session_id: session.session_id });
      captureSessionRef.current = null;
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
    if (!isCoordinatorWindow) return;
    // Toggle click-through and resize: when not capturing, window ignores cursor so other apps work
    const ignore = phase === "idle";
    invoke("set_ignore_cursor_events", { ignore }).catch(console.error);
  }, [phase]);

  if (isToastWindow) {
    return <Toast />;
  }

  if (isSettingsWindow) {
    return <SettingsPanel settings={settings} onSave={handleSettingsSave} onClose={() => getCurrentWindow().close()} />;
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {/* The selection overlay is transparent and never draws the captured
          frame, so it only needs the composite once it turns into the editor. */}
      {(phase === "selecting" || (phase === "annotating" && fullScreenshot)) && (
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
          onPrint={handlePrint}
          onSaveDialog={handleSaveDialog}
          onQuickSave={handleQuickSave}
          onCancel={handleCancel}
          previousSelection={preselectedRegion(settings)}
          imageFormat={settings.image_format}
          jpegQuality={settings.jpeg_quality}
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