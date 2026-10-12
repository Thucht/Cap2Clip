import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("./components/CaptureOverlay.tsx", import.meta.url), "utf8");
const rustCapture = readFileSync(new URL("../src-tauri/src/capture.rs", import.meta.url), "utf8");
const rustDxgi = readFileSync(new URL("../src-tauri/src/dxgi_capture.rs", import.meta.url), "utf8");
const rustMain = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const rustSettings = readFileSync(new URL("../src-tauri/src/settings.rs", import.meta.url), "utf8");

/**
 * `handleCancel` is registered once through `useCallback(..., [])`, so closing
 * over `captureSession` froze it at the initial `null`. Escape then skipped
 * `cancel_capture_session` and `hideCaptureOverlays` entirely and left the
 * per-monitor overlay windows sitting on top of the desktop.
 */
describe("cancelling a capture session", () => {
  it("reads the live session instead of a frozen state value", () => {
    const cancel = app.slice(
      app.indexOf("const handleCancel"),
      app.indexOf("const handleSettingsSave"),
    );

    expect(cancel).toContain("captureSessionRef.current");
    expect(cancel).not.toMatch(/\bif \(captureSession\)/);

    // The Rust session has to be released and the overlays taken down, or the
    // user is left looking at a full-screen screenshot they cannot dismiss.
    expect(cancel).toContain('invoke("cancel_capture_session"');
    expect(cancel).toContain("destroyCaptureOverlays(session)");
    expect(cancel).toContain('emit("capture-session-cancelled"');
  });

  it("drops the coordinator session once it has been finalized", () => {
    const finalize = app.slice(
      app.indexOf('listen<{ session_id: number; selection: SelectionGeometry }>'),
      app.indexOf('listen<{ result: CaptureResult; selection: SelectionGeometry }>'),
    );

    // finalize_capture_session consumes the Rust session; keeping the
    // coordinator copy would make a later Cancel release a stale id.
    expect(finalize).toContain("captureSessionRef.current = null");
    expect(finalize).toContain("setCaptureSession(null)");
    expect(finalize).toContain("void destroyCaptureOverlays(session)");
  });
});

/**
 * Hiding an overlay leaves its WebView - and the full-desktop base64 frame it
 * holds in React state - alive. One leaked window per monitor per capture.
 */
describe("capture overlay lifetime", () => {
  it("destroys the per-monitor windows instead of only hiding them", () => {
    expect(app).toContain("async function destroyCaptureOverlays");
    expect(app).toContain("window?.destroy()");
  });
});

/**
 * Each overlay only covers its own monitor, so dragging towards a second screen
 * fires `mouseleave` mid-gesture. Treating that as a mouseup sealed a region
 * the user was still resizing, and raced the global cursor poll that owns
 * cross-monitor drags.
 */
describe("drag gesture ownership", () => {
  it("does not seal a selection when the pointer leaves the overlay", () => {
    expect(overlay).not.toContain("onMouseLeave={handleMouseUp}");
    expect(overlay).toContain("onMouseLeave={handleMouseLeave}");
    expect(overlay).toContain("const handleMouseLeave = useCallback");
  });

  it("leaves the finalization to the cross-monitor poll while it runs", () => {
    const mouseUp = overlay.slice(
      overlay.indexOf("const handleMouseUp"),
      overlay.indexOf("const handleMouseLeave"),
    );

    expect(mouseUp).toContain("if (globalDragStart.current)");
    expect(mouseUp).toContain("return;");
  });
});

/**
 * `BitBlt` on the desktop device context - the `screenshots` crate - only sees
 * what GDI composites, so hardware accelerated content arrives black. Lightshot
 * avoids this by capturing through DXGI Desktop Duplication
 * (`DXGIODScreenshot.dll` imports `d3d11!D3D11CreateDevice` and
 * `dxgi!CreateDXGIFactory1` next to its own `BitBlt` fallback).
 */
/**
 * Only the overlay the gesture started in ever receives a `mousedown`, so on the
 * monitor the pointer crosses into `isDragging` stays false for the whole drag.
 * Gating the draft rectangle on `isDragging` alone meant a selection spanning
 * two screens was invisible until the button came back up - it looked like the
 * cross-monitor drag simply did not work.
 */
describe("cross-monitor selection feedback", () => {
  it("renders the draft the cursor poll published, without a local mousedown", () => {
    expect(overlay).toContain("draftFromCursorPoll");
    expect(overlay).toContain("setDraftFromCursorPoll(true)");
    expect(overlay).toContain("const visible = isDragging || draftFromCursorPoll");

    // The draft must not depend on the overlay owning the gesture.
    const draft = overlay.slice(
      overlay.indexOf("const renderSelectionDraft"),
      overlay.indexOf("const renderMoveZones"),
    );
    expect(draft).not.toContain("if (!isDragging");
  });

  it("clears the poll draft when the gesture ends or leaves", () => {
    expect(overlay).toContain("onMouseLeave={handleMouseLeave}");
    const leave = overlay.slice(
      overlay.indexOf("const handleMouseLeave"),
      overlay.indexOf("// Resize handle mouse down"),
    );
    expect(leave).toContain("setDraftFromCursorPoll(false)");
  });
});

/**
 * The editor reuses the main window, which used to keep the 1200x800 size from
 * `tauri.conf.json` and whatever position Windows first gave it. The capture
 * therefore appeared to jump elsewhere on the desktop, and any region larger
 * than the window was clamped away by the overlay.
 */
describe("editor window follows the capture", () => {
  it("sizes and positions the editor on the captured region", () => {
    expect(app).toContain("async function fitEditorWindow");
    expect(app).toContain('invoke("fit_editor_window"');
    expect(app).toContain("await fitEditorWindow(payload.selection, payload.bounds)");

    // The virtual desktop travels with the composite so the window can be kept
    // on screen without querying the monitors again.
    expect(app).toContain("session.virtual_width");
    expect(rustSettings).toContain("pub async fn fit_editor_window");

    // The size is applied as a logical value (which is the client area) and only
// the position is corrected for the invisible frame - adding the frame to the
// size as well is what left the editor 16px wider than the capture.
expect(rustSettings).toContain("set_size(LogicalSize::new(f64::from(width), f64::from(height)))");
expect(rustSettings).toContain("f64::from(target_x - offset_x) / scale");
expect(rustSettings).toContain("inner.x - outer.x");
expect(rustSettings).toContain("inner.width as i32 == target_width");
// ...and a recreated WebView2 child comes back opaque.
expect(rustSettings).toContain("window.set_background_color");
  });

  it("only lets the coordinator window drive a capture", () => {
    // The settings and toast windows load the same App, so without this guard
    // the settings window answered `capture-composite-ready` too and un-hid
    // itself on top of the editor after every capture.
    expect(app).toContain("const isCoordinatorWindow = !isSettingsWindow && !isToastWindow && overlayMonitorId === null");
    const finalize = app.slice(
      app.indexOf("if (!isCoordinatorWindow) return;"),
      app.indexOf('listen("capture-composite-ready"'),
    );
    expect(finalize).toContain('listen<{ session_id: number; selection: SelectionGeometry }>(');

    // The hotkeys and the click-through toggle belong to the coordinator too.
    const hotkeys = app.slice(app.indexOf('listen("region-capture"'));
    expect(hotkeys).not.toContain("overlayMonitorId !== null");
    expect(app).not.toContain("if (isSettingsWindow) return;");
  });

  it("creates each overlay window once even when a warm-up races the capture", () => {
    expect(app).toContain("const pendingOverlays = new Map<string, Promise<WebviewWindow>>()");
    expect(app).toContain("pendingOverlays.get(label)");
    expect(app).toContain("pendingOverlays.delete(label)");
  });

  it("keeps the capture-mode hint on every monitor", () => {
    // The hint follows the pointer, but a monitor it never visited would leave
    // it at the origin, clipped against the screen edge.
    expect(overlay).toContain("const [cursorInside, setCursorInside] = useState(false)");
    expect(overlay).toContain("!rect && cursorInside ? \"capture-hint-cursor\" : \"\"");
    // The desktop-wide cursor poll marks the crossed monitor as visited too.
    const pollUpdate = overlay.slice(
      overlay.indexOf('listen<SelectionGeometry | null>("capture-selection-updated"'),
      overlay.indexOf("const poll = async"),
    );
    expect(pollUpdate).toContain("setCursorInside(true)");
  });

  it("lays the selection out in logical pixels and maps it to the image", () => {
    const rect = app.slice(
      app.indexOf("setSelectionRect({"),
      app.indexOf("setPhase(\"annotating\")"),
    );
    expect(rect).toContain("width: Math.max(1, Math.round(payload.selection.width))");
    expect(rect).toContain("height: Math.max(1, Math.round(payload.selection.height))");
    // The physical composite dimensions must not become CSS pixels, or a HiDPI
    // monitor would draw the capture at 1.5x its size.
    expect(rect).not.toContain("payload.result.width");
    expect(rect).not.toContain("payload.result.height");

    // The composite itself is still tracked in physical pixels, which is what
    // `calculateImageMapping` divides by the viewport to find the export scale.
    expect(app).toContain("setCaptureSize({ width: payload.result.width, height: payload.result.height })");
  });
});

/**
 * The per-monitor frames were PNG-encoded and pushed to every overlay window as
 * base64, but the selection overlay is transparent and never draws them. Two
 * 3840x2160 frames meant ~90 MB of IPC before the hotkey appeared to do anything.
 */
describe("capture latency", () => {
  it("keeps the per-monitor frames on the Rust side", () => {
    expect(rustCapture).not.toContain("image_data: encode_png(&image)?");
    expect(app).not.toContain("monitor.image_data");

    // Only the finished selection is encoded, and only once.
    expect(rustCapture).toContain("image_data: encode_png(&output)?");
  });

  it("reads the pixels when the selection is confirmed, not on the hotkey", () => {
    // Capturing up front cost about a quarter of a second per 4K monitor before
    // the overlay could appear, for frames the selection overlay never shows.
    const begin = rustCapture.slice(
      rustCapture.indexOf("pub fn begin_capture_session"),
      rustCapture.indexOf("pub fn active_capture_session"),
    );
    expect(begin).not.toContain("screen.capture()");
    expect(begin).not.toContain("capture_outputs()");
    expect(begin).toContain("image: None");

    // Only the monitors the selection actually covers are read.
    expect(rustCapture).toContain("capture_planned_monitors(&mut session.monitors, &plan)?");
    expect(rustCapture).toContain("wanted.sort_unstable()");
    expect(rustCapture).toContain("wanted.dedup()");
  });

  it("rebuilds the overlay windows in the background for the next capture", () => {
    expect(app).toContain("void ensureCaptureOverlay(monitor).catch(console.error)");
    // The rebuild must not race the window that was just destroyed.
    const destroy = app.slice(
      app.indexOf("async function destroyCaptureOverlays"),
      app.indexOf("async function hideCaptureOverlays"),
    );
    expect(destroy.indexOf("window?.destroy()")).toBeLessThan(destroy.indexOf("ensureCaptureOverlay"));
  });

  it("still shows the selection overlay without a captured frame", () => {
    expect(app).toContain('(phase === "selecting" || (phase === "annotating" && fullScreenshot))');
  });
});

describe("desktop capture backend", () => {
  it("prefers DXGI Desktop Duplication and keeps GDI as the fallback", () => {
    expect(rustMain).toContain("mod dxgi_capture;");
    expect(rustCapture).toContain("crate::dxgi_capture::capture_outputs()");
    expect(rustCapture).toContain("output.x == info.x && output.y == info.y");
    expect(rustCapture).toContain("screen.capture()");

    // Duplication is created per adapter because DuplicateOutput rejects a
    // device that was not created on the adapter owning the output.
    expect(rustDxgi).toContain("DuplicateOutput");
    expect(rustDxgi).toContain("D3D_DRIVER_TYPE_UNKNOWN");
    expect(rustDxgi).toContain("EnumAdapters1");
    expect(rustDxgi).toContain("EnumOutputs");
  });

  it("maps the staged frame row by row instead of assuming a tight pitch", () => {
    expect(rustDxgi).toContain(".Map(&destination, 0, D3D11_MAP_READ");
    expect(rustDxgi).toContain("RowPitch");
    expect(rustDxgi).toContain("context.Unmap(&destination, 0)");
    // BGRA from DXGI becomes RGBA for the image encoder.
    expect(rustDxgi).toContain("self.buffer[pixel + 2]");
  });

  it("releases every acquired frame and drops the object on access loss", () => {
    expect(rustDxgi).toContain("AcquireNextFrame");
    expect(rustDxgi).toContain("ReleaseFrame");
    // DXGI_ERROR_ACCESS_LOST must not be followed by ReleaseFrame.
    expect(rustDxgi).toContain("DXGI_ERROR_ACCESS_LOST");
  });

  it("skips a frame that does not line up with the monitor rectangle", () => {
    // A mis-sized composite would shift every crop the planner makes.
    expect(rustDxgi).toContain("if image.width() != desktop_width || image.height() != desktop_height");
  });
});
