import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { ToastPayload } from "../App";

/**
 * The notification bubble Lightshot shows after copying or saving.
 *
 * It runs in its own always-on-top window so it stays visible after the editor
 * hides itself, and it disappears on its own because a screenshot tool that
 * blocks the desktop until the bubble is clicked would be worse than useless.
 */
export function Toast() {
  const [payload, setPayload] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const hide = () => getCurrentWindow().hide();
    let stop: (() => void) | null = null;
    let cancelled = false;

    listen<ToastPayload>("show-toast", async ({ payload: next }) => {
      setPayload(next);
      await invoke("show_toast", { width: 420, height: 110 });
      window.setTimeout(hide, next.duration_ms ?? 3000);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      stop = unlisten;
    }).catch(console.error);

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (!payload) return <div className="toast-host" />;

  return (
    <div className="toast-host">
      <div className="toast-bubble">
        <span className="toast-icon" aria-hidden="true">{payload.icon ?? "✓"}</span>
        <span className="toast-message">{payload.message}</span>
        {payload.action && (
          <button
            className="toast-action"
            onClick={() => {
              if (payload.path) invoke("reveal_in_file_manager", { path: payload.path });
              else if (payload.url) invoke("plugin:shell|open", { path: payload.url });
              getCurrentWindow().hide();
            }}
          >
            {payload.action}
          </button>
        )}
      </div>
    </div>
  );
}

export default Toast;