import { describe, expect, it } from "vitest";
import { calculateImageMapping, clampSelection, toImageRect, viewportPoint } from "./geometry";

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
