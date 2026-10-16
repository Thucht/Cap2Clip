import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { buildExportOptions, canvasEncoding } from "./export-format";
import {
  preselectedRegion,
  rememberedSelection,
  savedFile,
  shouldNotify,
} from "./parity-rules";

const readText = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");
const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

describe("output format", () => {
  it("defaults to lossless PNG and ignores quality", () => {
    expect(buildExportOptions("png", 55, 2)).toEqual({ format: "png", multiplier: 2 });
    expect(canvasEncoding("png", 55)).toEqual(["image/png", undefined]);
      });

  it("converts the 1-100 quality scale into the 0-1 encoders expect", () => {
    expect(buildExportOptions("jpeg", 90, 1)).toEqual({ format: "jpeg", multiplier: 1, quality: 0.9 });
    expect(canvasEncoding("jpeg", 90)).toEqual(["image/jpeg", 0.9]);
      });

  it("clamps a hand-edited quality into the encodable range", () => {
    expect(buildExportOptions("jpeg", 0, 1).quality).toBe(0.01);
    expect(buildExportOptions("jpeg", 250, 1).quality).toBe(1);
    expect(canvasEncoding("jpeg", -20)[1]).toBe(0.01);
  });
});

describe("Lightshot parity", () => {
  const config = readJson("../src-tauri/tauri.conf.json");
  const capability = readJson("../src-tauri/capabilities/main.json");
  const overlay = readText("./components/CaptureOverlay.tsx");
  const toolbar = readText("./components/AnnotationToolbar.tsx");
  const panel = readText("./components/SettingsPanel.tsx");
  const app = readText("./App.tsx");

  it("keeps the notification bubble in its own always-on-top window", () => {
    const toast = config.app.windows.find((window: { label?: string }) => window.label === "toast");
    expect(toast).toMatchObject({
      transparent: true,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
    });
    expect(capability.windows).toContain("toast");
  });

  it("confirms a copy only when the copy worked and the option is on", () => {
    expect(shouldNotify({ show_notifications: true }, true)).toBe(true);
    expect(shouldNotify({ show_notifications: true }, false)).toBe(false);
    expect(shouldNotify({ show_notifications: false }, true)).toBe(false);
  });

  it("names the saved file, not its path, in the bubble", () => {
    expect(savedFile("C:\\Users\\me\\Pictures\\shot.png")).toEqual({
      dir: "C:\\Users\\me\\Pictures\\",
      name: "shot",
    });
    // The same code runs on macOS, where paths use forward slashes.
    expect(savedFile("/Users/me/Pictures/shot.png")).toEqual({
      dir: "/Users/me/Pictures/",
      name: "shot",
    });
    expect(savedFile("shot.png")).toEqual({ dir: "", name: "shot" });
    // A path with no extension still splits at the last separator.
    expect(savedFile("C:\\Users\\me\\Pictures")).toEqual({
      dir: "C:\\Users\\me\\",
      name: "Pictures",
    });
  });

  it("remembers the region only when the option is on", () => {
    const used = { x: 10, y: 20, width: 30, height: 40 };
    const stored = { x: 1, y: 2, width: 3, height: 4 };
    expect(rememberedSelection({ keep_selection: true, previous_selection: stored }, used)).toEqual(used);
    expect(rememberedSelection({ keep_selection: false, previous_selection: stored }, used)).toEqual(stored);
    // Nothing was selected, so whatever is already stored survives.
    expect(rememberedSelection({ keep_selection: true, previous_selection: stored }, null)).toEqual(stored);
  });

  it("replays the previous region only when the option is on", () => {
    const stored = { x: 100, y: 100, width: 400, height: 300 };
    expect(preselectedRegion({ keep_selection: true, previous_selection: stored })).toEqual(stored);
    expect(preselectedRegion({ keep_selection: false, previous_selection: stored })).toBeNull();
    expect(preselectedRegion({ keep_selection: true, previous_selection: null })).toBeNull();
  });

  // The checks below are string assertions rather than behavioural ones: this
  // repository has no DOM test harness, so a component cannot be rendered and
  // inspected. They are kept as an explicit contract with Lightshot's own
  // shipped English string table (5.5.0.7 locales/en.txt), so a label drift has
  // to be a deliberate edit. See docs/LIGHTSHOT-PARITY.md.
  it("uses Lightshot's own wording for the options it shares with Lightshot", () => {
    expect(panel).toContain("Capture a cursor on a screenshot"); // en.txt:76, identical
    expect(panel).toContain("Keep the selected area position"); // en.txt:86, identical
    expect(panel).toContain("JPEG quality"); // en.txt:85, identical
  });

  it("names the format option after what Cap2Clip actually does", () => {
    // Lightshot says "Upload using the format" (en.txt:84) because that option
    // also drives its prntscr.com upload. Cap2Clip has no upload path, so the
    // label describes saving instead.
    expect(panel).toContain("Save using the format");
    expect(panel).not.toContain("Upload using the format");
  });

  it("offers full screen selection and clearing the selection", () => {
    expect(overlay).toContain("Select full screen");
    expect(overlay).toContain("Clear selection"); // en.txt:5, identical
  });

  it("prints a screenshot from the annotation toolbar", () => {
    expect(toolbar).toContain("onPrint");
    expect(app).toContain('invoke("print_image"');
  });

  it("gates the cursor composite on the backend option", () => {
    // The geometry of that decision is covered by the Rust test
    // `capture::tests::the_cursor_is_drawn_once_on_the_monitor_that_physically_owns_it`;
    // this only pins that the option is the one being read.
    const capture = readText("../src-tauri/src/capture.rs");
    expect(capture).toContain("settings.capture_cursor");
    expect(capture).toContain("crate::cursor::draw_cursor");
  });
});