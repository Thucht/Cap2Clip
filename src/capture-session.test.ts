import { describe, expect, it } from "vitest";
import {
  clampGlobalSelection,
  globalSelectionFromPhysicalCursor,
  globalPointFromLocal,
  intersectGlobalSelection,
  monitorPhysicalRectToLogical,
  normalizeSelection,
} from "./capture-session";

export const MIXED_DPI_TOPOLOGY = [
  {
    monitor_id: 10,
    physical_x: -3840,
    physical_y: 240,
    logical_x: -2560,
    logical_y: 160,
    logical_width: 2560,
    logical_height: 1440,
    physical_width: 3840,
    physical_height: 2160,
    scale_factor: 1.5,
    image_data: "data:image/png;base64,left",
  },
  {
    monitor_id: 20,
    physical_x: 0,
    physical_y: 0,
    logical_x: 0,
    logical_y: 0,
    logical_width: 1920,
    logical_height: 1080,
    physical_width: 3840,
    physical_height: 2160,
    scale_factor: 2,
    image_data: "data:image/png;base64,right",
  },
] as const;

describe("virtual desktop capture geometry", () => {
  it("converts a point on a negative-origin monitor to global logical coordinates", () => {
    expect(globalPointFromLocal({ x: 2500, y: 100 }, MIXED_DPI_TOPOLOGY[0])).toEqual({ x: -60, y: 260 });
  });

  it("splits a cross-boundary selection into monitor-local intersections", () => {
    const selection = { x: -100, y: 200, width: 300, height: 400 };
    expect(intersectGlobalSelection(selection, MIXED_DPI_TOPOLOGY[0])).toEqual({
      x: 2460,
      y: 40,
      width: 100,
      height: 400,
    });
    expect(intersectGlobalSelection(selection, MIXED_DPI_TOPOLOGY[1])).toEqual({
      x: 0,
      y: 200,
      width: 200,
      height: 400,
    });
  });

  it("returns null for a monitor outside the selection", () => {
    expect(intersectGlobalSelection({ x: 100, y: 100, width: 50, height: 50 }, MIXED_DPI_TOPOLOGY[0])).toBeNull();
  });

  it("normalizes reverse drags", () => {
    expect(normalizeSelection({ x: 200, y: 600 }, { x: -100, y: 200 })).toEqual({
      x: -100,
      y: 200,
      width: 300,
      height: 400,
    });
  });

  it("tracks a drag through physical desktop coordinates across mixed-DPI monitors", () => {
    expect(
      globalSelectionFromPhysicalCursor(
        { x: -150, y: 300 },
        { x: 400, y: 600 },
        MIXED_DPI_TOPOLOGY,
      ),
    ).toEqual({ x: -100, y: 200, width: 300, height: 100 });
  });

  it("uses monitor-relative physical origins instead of scaling desktop offsets", () => {
    const offsetTopology = [{
      ...MIXED_DPI_TOPOLOGY[0],
      physical_x: -3840,
      physical_y: 240,
      logical_x: -2560,
      logical_y: 160,
    }];
    expect(
      globalSelectionFromPhysicalCursor(
        { x: -3690, y: 390 },
        { x: -3540, y: 540 },
        offsetTopology,
      ),
    ).toEqual({ x: -2460, y: 260, width: 100, height: 100 });
  });

  it("converts native physical monitor bounds for WebviewWindow options", () => {
    expect(monitorPhysicalRectToLogical(MIXED_DPI_TOPOLOGY[0])).toEqual({
      x: -2560,
      y: 160,
      width: 2560,
      height: 1440,
    });
  });

  it("clamps a pointer in a physical desktop gap to the nearest monitor edge", () => {
    const selection = globalSelectionFromPhysicalCursor(
      { x: -100, y: 1000 },
      { x: 100, y: 2500 },
      MIXED_DPI_TOPOLOGY,
    );
    expect(selection?.x).toBeCloseTo(-66.6667);
    expect(selection?.y).toBeCloseTo(666.6667);
    expect(selection?.width).toBeCloseTo(66.6667);
    expect(selection?.height).toBeCloseTo(933.3333);
  });

  it("clips a selection to virtual bounds without shifting its anchor", () => {
    expect(
      clampGlobalSelection(
        { x: -3000, y: -100, width: 3500, height: 500 },
        { x: -2560, y: 0, width: 4480, height: 1600 },
      ),
    ).toEqual({ x: -2560, y: 0, width: 3060, height: 400 });
  });
});
