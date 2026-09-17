import { describe, expect, it } from "vitest";
import {
  calculateFrameMapping,
  calculateImageMapping,
  clampSelection,
  isCaptureGeometryReady,
  measureViewport,
  toImageRect,
  viewportPoint,
} from "./geometry";
import type { CaptureWindowGeometry } from "./geometry";

describe("capture coordinate mapping", () => {
  it("preserves coordinates at 100% display scale", () => {
    // CSS viewport and captured pixels match 1:1.
    expect(calculateImageMapping(1920, 1080, 1920, 1080)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it("maps logical WebView coordinates to physical screenshot pixels", () => {
    // 150% Windows scale: WebView coordinates are logical, screenshot pixels are physical.
    expect(calculateImageMapping(2560, 1440, 1707, 960)).toEqual({ scaleX: 2560 / 1707, scaleY: 1.5 });
  });

  it("falls back to 1:1 when the viewport is not measurable yet", () => {
    expect(calculateImageMapping(1920, 1080, 0, 0)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it("keeps pointer coordinates relative to a monitor-local overlay", () => {
    expect(viewportPoint(3840, 400, { x: 1920, y: 0, width: 3840, height: 2160 })).toEqual({
      x: 1920,
      y: 400,
    });
  });

  it("crops selections using physical screenshot pixels", () => {
    expect(toImageRect({ x: 100, y: 80, width: 640, height: 360 }, { scaleX: 1.5, scaleY: 1.5 })).toEqual({
      x: 150,
      y: 120,
      width: 960,
      height: 540,
    });
  });

  it("keeps remembered selections visible after switching monitors", () => {
    expect(clampSelection({ x: 1800, y: 1000, width: 800, height: 600 }, 1366, 768)).toEqual({
      x: 566,
      y: 168,
      width: 800,
      height: 600,
    });
  });

  it("clamps oversized selections to the viewport", () => {
    expect(clampSelection({ x: -50, y: -50, width: 3840, height: 2160 }, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });
});

/**
 * Second monitor of a mixed-DPI desktop: a 4K display at 200% that sits to the
 * right of the primary monitor, so its client area is 1920x1080 CSS pixels.
 */
const overlayGeometry = (overrides: Partial<CaptureWindowGeometry> = {}): CaptureWindowGeometry => ({
  monitor_x: 1920,
  monitor_y: 0,
  monitor_width: 3840,
  monitor_height: 2160,
  window_x: 1920,
  window_y: 0,
  window_width: 3840,
  window_height: 2160,
  scale_factor: 2,
  ...overrides,
});

describe("capture window geometry", () => {
  it("matches the monitor mapping when the overlay covers the whole monitor", () => {
    expect(calculateFrameMapping(overlayGeometry(), 1920, 1080)).toEqual({
      scaleX: 2,
      scaleY: 2,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("crops monitor pixels 1:1 when the WebView has not adopted the monitor scale", () => {
    // The overlay window is still 1920x1080 physical (the DPI-suggested
    // rectangle) while the WebView renders 1920x1080 CSS pixels: one physical
    // pixel per CSS pixel, so a selection must not be stretched over the
    // screenshot of the whole 3840x2160 monitor.
    const mapping = calculateFrameMapping(
      overlayGeometry({ window_width: 1920, window_height: 1080 }),
      1920,
      1080,
    );
    expect(mapping).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
    expect(toImageRect({ x: 100, y: 50, width: 200, height: 100 }, mapping)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 100,
    });
  });

  it("shifts the crop by the window offset of a mispositioned overlay", () => {
    const mapping = calculateFrameMapping(overlayGeometry({ window_x: 2020, window_y: 120 }), 1920, 1080);
    expect(toImageRect({ x: 10, y: 20, width: 100, height: 50 }, mapping)).toEqual({
      x: 120,
      y: 160,
      width: 200,
      height: 100,
    });
  });

  it("measures the live viewport so a resize cannot be missed", () => {
    expect(measureViewport({ innerWidth: 1707, innerHeight: 960 })).toEqual({ width: 1707, height: 960 });
  });

  it("accepts an overlay that covers the monitor at the monitor scale", () => {
    expect(isCaptureGeometryReady(overlayGeometry(), 1920, 1080, 2)).toBe(true);
  });

  it("rejects an overlay that does not cover the monitor", () => {
    expect(isCaptureGeometryReady(overlayGeometry({ window_height: 1080 }), 1920, 540, 2)).toBe(false);
    expect(isCaptureGeometryReady(overlayGeometry({ window_y: 120 }), 1920, 1080, 2)).toBe(false);
  });

  it("rejects an overlay whose WebView has not caught up with the window size", () => {
    // Half of the monitor is not represented by the reported viewport yet.
    expect(isCaptureGeometryReady(overlayGeometry(), 1920, 1080, 1)).toBe(false);
  });
});
