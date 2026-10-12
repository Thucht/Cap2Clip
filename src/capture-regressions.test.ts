import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("./components/CaptureOverlay.tsx", import.meta.url), "utf8");
const rustCapture = readFileSync(new URL("../src-tauri/src/capture.rs", import.meta.url), "utf8");
const rustDxgi = readFileSync(new URL("../src-tauri/src/dxgi_capture.rs", import.meta.url), "utf8");
const rustMain = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");

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
