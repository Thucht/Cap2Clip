import { useState } from "react";
import type { AppSettings } from "../App";

interface SettingsPanelProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const [local, setLocal] = useState<AppSettings>({ ...settings });

  const handleSave = () => {
    onSave(local);
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <h2>Settings</h2>

        <div className="settings-section">
          <h3>Keyboard Shortcuts</h3>

          <div className="setting-row">
            <label>Region Capture</label>
            <input
              type="text"
              value={local.shortcut_region}
              onChange={(e) => setLocal({ ...local, shortcut_region: e.target.value })}
              className="shortcut-input"
              readOnly
              placeholder="Press keys..."
            />
          </div>

          <div className="setting-row">
            <label>Full Screen → Clipboard</label>
            <input
              type="text"
              value={local.shortcut_fullscreen}
              onChange={(e) => setLocal({ ...local, shortcut_fullscreen: e.target.value })}
              className="shortcut-input"
              readOnly
              placeholder="Press keys..."
            />
          </div>

          <div className="setting-row">
            <label>Enable Global Shortcuts</label>
            <button
              className={`toggle-btn ${local.shortcuts_enabled ? "on" : "off"}`}
              onClick={() => setLocal({ ...local, shortcuts_enabled: !local.shortcuts_enabled })}
            >
              {local.shortcuts_enabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Save Location</h3>
          <div className="setting-row">
            <label>Last Save Directory</label>
            <span className="save-path">{local.last_save_dir || "Not set"}</span>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn-primary" onClick={handleSave}>Save</button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;