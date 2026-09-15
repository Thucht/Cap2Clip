import { describe, expect, it } from "vitest";
import { matchesShortcut, parseShortcut, shortcutFromEvent } from "./shortcuts";

const keyEvent = (init: {
  key: string;
  code: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}) => ({
  key: init.key,
  code: init.code,
  ctrlKey: init.ctrlKey ?? false,
  shiftKey: init.shiftKey ?? false,
  altKey: init.altKey ?? false,
  metaKey: init.metaKey ?? false,
});

describe("shortcut parsing", () => {
  it("reads modifiers and the trailing key", () => {
    expect(parseShortcut("Ctrl+Shift+C")).toEqual({
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
      key: "c",
    });
  });

  it("treats a lone key as a plain shortcut", () => {
    expect(parseShortcut("Escape")).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: "escape",
    });
  });

  it("normalizes aliases and physical key names", () => {
    expect(parseShortcut("Esc")?.key).toBe("escape");
    expect(parseShortcut("Ctrl+Digit5")?.key).toBe("digit5");
    expect(parseShortcut("Super+KeyP")?.meta).toBe(true);
  });

  it("rejects empty and modifier-only values", () => {
    expect(parseShortcut("")).toBeNull();
    expect(parseShortcut("Ctrl")).toBeNull();
  });
});

describe("shortcut matching", () => {
  it("matches the configured accelerator", () => {
    expect(matchesShortcut(keyEvent({ key: "c", code: "KeyC", ctrlKey: true }), "Ctrl+C")).toBe(true);
  });

  it("requires the exact modifier set", () => {
    const event = keyEvent({ key: "C", code: "KeyC", ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(event, "Ctrl+C")).toBe(false);
    expect(matchesShortcut(event, "Ctrl+Shift+C")).toBe(true);
  });

  it("matches recorded accelerators that use physical key names", () => {
    expect(matchesShortcut(keyEvent({ key: "C", code: "KeyC", ctrlKey: true }), "Ctrl+KeyC")).toBe(true);
    // Shift turns "5" into "%", so the physical code has to match.
    expect(matchesShortcut(keyEvent({ key: "%", code: "Digit5", shiftKey: true }), "Shift+Digit5")).toBe(true);
  });

  it("matches Escape by name", () => {
    expect(matchesShortcut(keyEvent({ key: "Escape", code: "Escape" }), "Escape")).toBe(true);
  });

  it("ignores unassigned values", () => {
    expect(matchesShortcut(keyEvent({ key: "c", code: "KeyC", ctrlKey: true }), "")).toBe(false);
  });
});

describe("shortcut recording", () => {
  it("builds an accelerator from a key press", () => {
    expect(shortcutFromEvent(keyEvent({ key: "C", code: "KeyC", ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl+Shift+KeyC",
    );
  });

  it("uses the physical key name for digits and function keys", () => {
    expect(shortcutFromEvent(keyEvent({ key: "%", code: "Digit5", shiftKey: true }))).toBe("Shift+Digit5");
    expect(shortcutFromEvent(keyEvent({ key: "PrintScreen", code: "PrintScreen" }))).toBe("PrintScreen");
  });

  it("waits for a non-modifier key", () => {
    expect(shortcutFromEvent(keyEvent({ key: "Shift", code: "ShiftLeft", shiftKey: true }))).toBeNull();
    expect(shortcutFromEvent(keyEvent({ key: "Control", code: "ControlLeft", ctrlKey: true }))).toBeNull();
  });

  it("produces values the matcher accepts", () => {
    const recorded = shortcutFromEvent(keyEvent({ key: "P", code: "KeyP", altKey: true }));
    expect(recorded).toBe("Alt+KeyP");
    expect(matchesShortcut(keyEvent({ key: "p", code: "KeyP", altKey: true }), recorded!)).toBe(true);
  });
});