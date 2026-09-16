import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readText = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const readJson = (relativePath: string) => JSON.parse(readText(relativePath));

describe("settings window configuration", () => {
  const appSource = readText("./App.tsx");
  const config = readJson("../src-tauri/tauri.conf.json");
  const capability = readJson("../src-tauri/capabilities/main.json");

  it("identifies and closes the dedicated settings window", () => {
    expect(appSource).toContain("new URLSearchParams(window.location.search)");
    expect(appSource).toContain("getCurrentWindow().close()");
  });

  it("declares a small decorated settings window", () => {
    const settings = config.app.windows.find((window: { label?: string }) => window.label === "settings");
    expect(settings).toMatchObject({
      width: 640,
      height: 720,
      decorations: true,
      transparent: false,
    });
  });

  it("grants settings the same window permissions", () => {
    expect(capability.windows).toContain("settings");
    expect(capability.permissions).toContain("core:window:allow-close");
  });
});
