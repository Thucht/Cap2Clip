import { calculateImageMapping, clampSelection, toImageRect } from "./geometry";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nexpected: ${JSON.stringify(expected)}\nactual:   ${JSON.stringify(actual)}`);
  }
}

// 100% scale: CSS viewport and captured pixels match 1:1.
assertEqual(
  calculateImageMapping(1920, 1080, 1920, 1080),
  { scaleX: 1, scaleY: 1 },
  "100% display scale must preserve coordinates",
);

// 150% Windows scale: WebView coordinates are logical but screenshot pixels are physical.
assertEqual(
  calculateImageMapping(2560, 1440, 1707, 960),
  { scaleX: 2560 / 1707, scaleY: 1.5 },
  "mixed-DPI mapping must scale CSS coordinates to screenshot pixels",
);

assertEqual(
  toImageRect({ x: 100, y: 80, width: 640, height: 360 }, { scaleX: 1.5, scaleY: 1.5 }),
  { x: 150, y: 120, width: 960, height: 540 },
  "selection crop must use physical screenshot pixels",
);

// A remembered selection from a larger monitor must be constrained on a smaller monitor.
assertEqual(
  clampSelection({ x: 1800, y: 1000, width: 800, height: 600 }, 1366, 768),
  { x: 566, y: 168, width: 800, height: 600 },
  "remembered selections must stay visible after switching monitors",
);

// Oversized fixed presets must fit without producing negative coordinates.
assertEqual(
  clampSelection({ x: -50, y: -50, width: 3840, height: 2160 }, 1920, 1080),
  { x: 0, y: 0, width: 1920, height: 1080 },
  "oversized selection must be clamped to viewport",
);

console.log("geometry tests passed");
