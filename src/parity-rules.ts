import type { AppSettings, SelectionGeometry } from "./App";

/**
 * The Lightshot-parity decisions that do not need a window or a canvas.
 *
 * Lightshot exposes these as the options "Show notifications about copying and
 * saving" and "Keep the selected area position"; the settings keys carry the
 * same meaning here, so the rules live in one place and can be exercised
 * without a browser.
 */

type NotificationSettings = Pick<AppSettings, "show_notifications">;
type SelectionSettings = Pick<AppSettings, "keep_selection" | "previous_selection">;

/**
 * Whether a finished copy or save raises the bubble.
 *
 * A failed copy never announces itself, whatever the option says.
 */
export function shouldNotify(settings: NotificationSettings, succeeded = true): boolean {
  return succeeded && settings.show_notifications;
}

/**
 * The region to store for the next capture after the current one ends.
 *
 * Lightshot only remembers the region when the user asked for it, so an
 * un-checked option keeps whatever was already stored instead of the region that
 * was just used.
 */
export function rememberedSelection(
  settings: SelectionSettings,
  current: SelectionGeometry | null,
): SelectionGeometry | null {
  return settings.keep_selection && current ? current : settings.previous_selection;
}

/**
 * The region the overlay pre-selects when a capture starts.
 *
 * With the option off there is nothing to replay, even when a previous region is
 * still sitting in the settings file.
 */
export function preselectedRegion(settings: SelectionSettings): SelectionGeometry | null {
  return settings.keep_selection ? settings.previous_selection : null;
}

/** Where a saved screenshot lives, split for the bubble text and "Open folder". */
export interface SavedFile {
  dir: string;
  name: string;
}

/**
 * Split a saved path for the "Screenshot is saved to ..." bubble.
 *
 * Both separators are accepted because the same code runs on Windows and macOS.
 * Slicing the name at the last separator rather than only the last backslash is
 * what keeps the bubble showing a file name instead of the whole path when the
 * path uses forward slashes.
 */
export function savedFile(path: string): SavedFile {
  const separator = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  const dot = path.lastIndexOf(".");
  const nameEnd = dot > separator ? dot : path.length;
  return {
    dir: separator < 0 ? "" : path.slice(0, separator + 1),
    name: path.slice(separator + 1, nameEnd),
  };
}
