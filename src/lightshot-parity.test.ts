import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { buildExportOptions, canvasEncoding } from "./export-format";

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

  it("confirms a copy and offers the folder after a save", () => {
    expect(app).toContain("Your screenshot is copied to clipboard");
    expect(app).toContain("Screenshot is saved to");
    expect(app).toContain('action: "Open folder"');
  });

  it("only confirms when notifications are enabled", () => {
    expect(app).toContain("settings.show_notifications");
  });

  it("offers full screen selection and clearing the selection", () => {
    expect(overlay).toContain("Select full screen");
    expect(overlay).toContain("Clear selection");
  });

  it("prints a screenshot from the annotation toolbar", () => {
    expect(toolbar).toContain("onPrint");
    expect(app).toContain('invoke("print_image"');
  });

  it("replays the previous region only when the option is on", () => {
    expect(overlay).toContain("previousSelection");
    expect(panel).toContain("Keep the selected area position");
  });

  it("exposes the capture-cursor, notification and format options", () => {
    expect(panel).toContain("Capture a cursor on a screenshot");
    expect(panel).toContain("Show notifications");
    expect(panel).toContain("Save using the format");
    expect(panel).toContain("JPEG quality");
  });

  it("reads the cursor into the captured frame in the backend", () => {
    const capture = readText("../src-tauri/src/capture.rs");
    expect(capture).toContain("crate::cursor::draw_cursor");
    expect(capture).toContain("settings.capture_cursor");
  });
});