import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rustMain = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const rustShortcuts = readFileSync(new URL("../src-tauri/src/shortcuts.rs", import.meta.url), "utf8");
const rustSettings = readFileSync(new URL("../src-tauri/src/settings.rs", import.meta.url), "utf8");
const rustCapture = readFileSync(new URL("../src-tauri/src/capture.rs", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("./components/CaptureOverlay.tsx", import.meta.url), "utf8");
const captureSession = readFileSync(new URL("./capture-session.ts", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("./components/AnnotationToolbar.tsx", import.meta.url), "utf8");

/**
 * The overlay window is transparent and click-through while idle. Showing it
 * before the desktop screenshot is taken - or before it can receive pointer
 * input - produces an opaque white surface and a frozen selection UI.
 */
describe("capture flow ordering", () => {
  it("registers native all-monitor capture sessions", () => {
    expect(rustMain).toContain("capture::CaptureSessions::default()");
    expect(rustMain).toContain("capture::begin_capture_session");
    expect(rustMain).toContain("capture::active_capture_session");
    expect(rustMain).toContain("capture::finalize_capture_session");
    expect(rustMain).toContain("capture::cancel_capture_session");
    expect(rustCapture).toContain("Screen::all()");
    expect(rustCapture).toContain("screens.sort_by_key");
    expect(rustCapture).toContain("The capture session is stale");
  });

  it("orchestrates one overlay window per monitor", () => {
    expect(app).toContain('new WebviewWindow(`capture-${monitor.monitor_id}`');
    expect(app).toContain('invoke<CaptureSession>("begin_capture_session")');
    expect(app).toContain('invoke<CaptureSession | null>("active_capture_session")');
    expect(app).toContain('"capture-session-started"');
    expect(app).toContain("resize_window_to_capture");
    expect(app).toContain('"capture-selection-finalized"');
    expect(app).toContain('"capture-composite-ready"');
    expect(overlay).toContain("globalSelectionFromPhysicalCursor");
    expect(overlay).toContain('invoke<boolean>("is_primary_button_pressed")');
    expect(overlay).toContain('emit("capture-selection-updated"');
    expect(captureSession).toContain("monitor.physical_x");
    expect(captureSession).toContain("monitor.physical_y");
  });

  it("finalizes the shared selection once in the main coordinator", () => {
    expect(app).toContain("if (overlayMonitorId !== null) return;");
    expect(app).toContain('"capture-selection-finalized"');
  });
  it("keeps the hotkey handler from showing the window", () => {
    // The native capture hotkeys live in shortcuts.rs now.
    expect(rustShortcuts).not.toContain("window.show()");
    expect(rustShortcuts).not.toContain("get_webview_window");
    expect(rustShortcuts).toContain('"region-capture"');
    expect(rustShortcuts).toContain('"fullscreen-capture"');
    // The shortcuts are only bound from the persisted settings.

    // main.rs no longer registers hard-coded accelerators; it applies the
    // loaded settings exactly once at startup.
    expect(rustMain).not.toContain("PrintScreen");
    expect(rustMain).toContain("shortcuts::apply(app.app_handle(), &app_settings)");
    expect(rustShortcuts).not.toContain("PrintScreen\"");
  });

  it("shows monitor overlays only after capture completed", () => {
    const regionCaptureHandler = app.slice(
      app.indexOf('listen("region-capture"'),
      app.indexOf('listen("fullscreen-capture"'),
    );

    const captureIndex = regionCaptureHandler.indexOf('invoke<CaptureSession>("begin_capture_session")');
    const showIndex = regionCaptureHandler.indexOf("showCaptureOverlays(session)");
    expect(captureIndex).toBeGreaterThanOrEqual(0);
    expect(showIndex).toBeGreaterThan(captureIndex);

    expect(regionCaptureHandler).toContain("setCaptureSession(session)");
  });

  it("seals each multi-region capture before moving to the next one", () => {
    // The active region is composited and cleared before the next rect is
    // selected, so annotations cannot leak between regions.
    const commitIndex = overlay.indexOf("commitActiveRegion();");
    const pushIndex = overlay.indexOf("setRegionRects((current) => [...current, draftRect]);");
    expect(commitIndex).toBeGreaterThan(0);
    expect(commitIndex).toBeLessThan(pushIndex);

    // Export prefers the sealed snapshot and falls back to a plain crop.
    expect(overlay).toContain("capturedImages[index] ?? await cropRegion(regionRects[index])");
    // The duplicated region list is gone.
    expect(overlay).not.toContain("captureRects");

    // Undo history cannot carry annotations from one region to the next.
    expect(toolbar).toMatch(/undoStack\.current = \[\];\s*redoStack\.current = \[\];/);
  });
});

/**
 * On a mixed-DPI desktop Windows answers a cross-monitor move with
 * WM_DPICHANGED, and the OS-suggested rectangle used to replace the
 * monitor-sized overlay. The frontend then mapped selections against a window
 * size the screenshot never had, so every cropped region of the second monitor
 * was shifted/scaled.
 */
describe("overlay is fitted to the captured monitor", () => {
  it("re-applies and verifies the monitor rectangle in the native window", () => {
    const fit = rustSettings.slice(rustSettings.indexOf("pub async fn resize_window_to_capture"));

    // The fit is repeated because the DPI notification is asynchronous, and the
    // command has to be async so the main thread keeps pumping window messages.
    expect(fit).toContain("apply_capture_rect(&window, x, y, width, height)");
    expect(fit).toContain("client.covers(x, y, width, height)");
    expect(fit).toContain("std::thread::sleep");

    // The client area - not the frame - is what the WebView renders and what
    // pointer coordinates are measured against.
    expect(rustSettings).toContain("inner.x - outer.x");
    expect(rustSettings).toContain("window.inner_position()");
    expect(rustSettings).toContain("window.inner_size()");

    // The geometry Windows really applied is reported back instead of being
    // assumed by the caller.
    expect(fit).toContain("window_width: client.width");
    expect(fit).toContain("window_height: client.height");
  });

  it("maps each screenshot through its monitor-local viewport", () => {
    expect(app).toContain("setCaptureGeometry(null)");
    expect(app).toContain("setCaptureSize({ width: monitor.physical_width, height: monitor.physical_height })");
    expect(app).toContain("captureGeometry={captureGeometry}");
    expect(overlay).toContain("calculateFrameMapping(captureGeometry");

    // The viewport is measured into state and refreshed on resize/DPI changes
    // instead of being frozen for the whole render.
    expect(overlay).not.toContain("const screenW = window.innerWidth");
    expect(overlay).toContain("const screenW = viewport.width");
    expect(overlay).toContain('window.addEventListener("resize", refreshViewport)');
    expect(overlay).toContain("new ResizeObserver(refreshViewport)");
    // The old event was dispatched but nobody listened to it.
    expect(overlay).not.toContain('dispatchEvent(new Event("capture-viewport-resized"))');

    // Export re-measures the rendered rectangle so a late resize cannot shift
    // the saved crop, and the canvas background goes through the same mapping.
    expect(overlay).toContain("const bounds = overlayRef.current?.getBoundingClientRect()");
    expect(overlay).toContain("toImageRect(region, liveImageMapping())");
    expect(overlay).toContain("liveImageMapping().scaleX");
  });
});
