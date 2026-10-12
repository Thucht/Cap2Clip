import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Monitor id this overlay window was created for, or `null` in the main window.
 *
 * Kept in its own module so `App.tsx` and `CaptureOverlay.tsx` agree on which
 * window they are running in without importing each other.
 */
export const overlayMonitorId: number | null = (() => {
  const match = getCurrentWindow().label.match(/^capture-(\d+)$/);
  return match ? Number(match[1]) : null;
})();