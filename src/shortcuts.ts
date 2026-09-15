/**
 * Accelerator parsing for the shortcuts shown in Settings.
 *
 * Global capture accelerators are registered by the Rust side; the in-app ones
 * (copy, save, cancel, annotation tools) are matched here so the configured
 * values are the only source of truth.
 */

export interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const MODIFIERS: Record<string, keyof Omit<ParsedShortcut, "key">> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  win: "meta",
};

/** Aliases for keys whose event name differs from the written shortcut. */
const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  spacebar: " ",
  plus: "+",
  del: "delete",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  arrowleft: "arrowleft",
  arrowright: "arrowright",
  prtsc: "printscreen",
  printscreen: "printscreen",
};

export function parseShortcut(spec: string): ParsedShortcut | null {
  const parts = spec.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const parsed: ParsedShortcut = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const [index, part] of parts.entries()) {
    const modifier = MODIFIERS[part.toLowerCase()];
    // Only the trailing part is a key; anything else must be a modifier.
    if (modifier && index < parts.length - 1) {
      parsed[modifier] = true;
      continue;
    }
    parsed.key = part.toLowerCase();
  }

  // A trailing modifier ("Ctrl", "Ctrl+Shift") is not a usable accelerator:
  // the loop above leaves it as the key, so reject it here.
  if (!parsed.key || MODIFIERS[parsed.key]) return null;
  parsed.key = KEY_ALIASES[parsed.key] ?? parsed.key;
  return parsed;
}

/** True when the event matches the written accelerator, modifiers included. */
export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">,
  spec: string,
): boolean {
  const parsed = parseShortcut(spec);
  if (!parsed) return false;

  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.metaKey !== parsed.meta) return false;

  // `key` is layout dependent (Shift turns "5" into "%"), so the physical code
  // is accepted as well.
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  return key === parsed.key || code === parsed.key;
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

/**
 * Builds an accelerator from a key press using the physical key name.
 *
 * `event.code` ("KeyC", "Digit5", "F12", "PrintScreen") is exactly the naming
 * the OS-level shortcut parser used by the Rust side expects, so recorded and
 * hand-written accelerators are interchangeable. Returns null while only
 * modifiers are held.
 */
export function shortcutFromEvent(
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">,
): string | null {
  if (!event.code || MODIFIER_CODES.has(event.code)) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  if (event.metaKey) parts.push("Super");
  parts.push(event.code);
  return parts.join("+");
}