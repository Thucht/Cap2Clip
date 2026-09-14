// @ts-nocheck -- standalone Node smoke test, outside the browser application.
import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const rustMain = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

const printScreenHandler = rustMain.slice(
  rustMain.indexOf("// PrtScn: Region capture"),
  rustMain.indexOf(".build(),"),
);

assert(
  !printScreenHandler.includes("window.show()"),
  "The native hotkey handler must not show the transparent WebView before the desktop screenshot is captured",
);

const regionCaptureHandler = app.slice(
  app.indexOf('listen("region-capture"'),
  app.indexOf('listen("fullscreen-capture"'),
);
const captureIndex = regionCaptureHandler.indexOf('invoke<CaptureResult>("capture_full_screen")');
const showIndex = regionCaptureHandler.indexOf("window.show()");
assert(captureIndex >= 0, "Region capture must invoke capture_full_screen");
assert(showIndex > captureIndex, "The overlay must only be shown after capture_full_screen completes");
assert(
  regionCaptureHandler.includes("flushSync"),
  "The selecting UI must be committed before the overlay window becomes visible",
);
const interactiveIndex = regionCaptureHandler.indexOf(
  'invoke("set_ignore_cursor_events", { ignore: false })',
);
assert(
  interactiveIndex >= 0 && interactiveIndex < showIndex,
  "The overlay must accept pointer input before it becomes visible",
);

console.log("capture flow tests passed");
