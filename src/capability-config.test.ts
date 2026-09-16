import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const config = readJson("../src-tauri/tauri.conf.json");
const capability = readJson("../src-tauri/capabilities/main.json");

describe("capability configuration", () => {
  const configuredLabels: string[] = config.app.windows.map(
    (window: { label?: string }) => window.label ?? "main",
  );

  it("declares each configured window label explicitly", () => {
    expect(configuredLabels).toEqual(["main", "settings"]);
    expect(config.app.windows[0].label).toBe("main");
  });

  it("covers every configured window", () => {
    for (const label of configuredLabels) {
      expect(capability.windows).toContain(label);
    }
  });

  it("grants the window commands the frontend invokes", () => {
    const required = [
      "core:window:allow-show",
      "core:window:allow-hide",
      "core:window:allow-set-focus",
      "core:window:allow-close",
      "core:event:allow-listen",
      "core:event:allow-unlisten",
    ];
    for (const permission of required) {
      expect(capability.permissions).toContain(permission);
    }
  });
});
