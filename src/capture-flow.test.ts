import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rustMain = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const rustShortcuts = readFileSync(new URL("../src-tauri/src/shortcuts.rs", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const overlay = readFileSync(new URL("./components/CaptureOverlay.tsx", import.meta.url), "utf8");
const toolbar = readFileSync(new URL("./components/AnnotationToolbar.tsx", import.meta.url), "utf8");

/**
 * The overlay window is transparent and click-through while idle. Showing it
 * before the desktop screenshot is taken - or before it can receive pointer
 * input - produces an opaque white surface and a frozen selection UI.
 */
describe("capture flow ordering", () => {
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

  it("shows the overlay only after capture completed and input was enabled", () => {
    const regionCaptureHandler = app.slice(
      app.indexOf('listen("region-capture"'),
      app.indexOf('listen("fullscreen-capture"'),
    );

    const captureIndex = regionCaptureHandler.indexOf('invoke<CaptureResult>("capture_full_screen")');
    const showIndex = regionCaptureHandler.indexOf("window.show()");
    expect(captureIndex).toBeGreaterThanOrEqual(0);
    expect(showIndex).toBeGreaterThan(captureIndex);

    // The selecting UI must be committed before the window becomes visible.
    expect(regionCaptureHandler).toContain("flushSync");

    const interactiveIndex = regionCaptureHandler.indexOf(
      'invoke("set_ignore_cursor_events", { ignore: false })',
    );
    expect(interactiveIndex).toBeGreaterThanOrEqual(0);
    expect(interactiveIndex).toBeLessThan(showIndex);
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
