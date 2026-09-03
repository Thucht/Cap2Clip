import { useState } from "react";
import type { AppSettings, Preset } from "../App";

interface SettingsPanelProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const [local, setLocal] = useState<AppSettings>(JSON.parse(JSON.stringify(settings)));
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetW, setNewPresetW] = useState("");
  const [newPresetH, setNewPresetH] = useState("");
  const [newPresetType, setNewPresetType] = useState<"fixed_size" | "aspect_ratio">("fixed_size");
  const [conflictError, setConflictError] = useState("");

  const handleSave = () => {
    // Validate shortcut conflicts
    const shortcuts = [
      { key: local.shortcut_region, label: "Region Capture" },
      { key: local.shortcut_fullscreen, label: "Full Screen" },
      { key: local.shortcut_copy, label: "Copy" },
      { key: local.shortcut_save, label: "Save" },
      { key: local.shortcut_cancel, label: "Cancel" },
    ];
    const seen = new Map<string, string>();
    for (const s of shortcuts) {
      if (seen.has(s.key)) {
        setConflictError(`Conflict: "${s.key}" is assigned to both "${seen.get(s.key)}" and "${s.label}"`);
        return;
      }
      seen.set(s.key, s.label);
    }
    setConflictError("");
    onSave(local);
  };

  const addPreset = () => {
    if (!newPresetName || !newPresetW || !newPresetH) return;
    const w = parseInt(newPresetW);
    const h = parseInt(newPresetH);
    if (isNaN(w) || isNaN(h) || w < 1 || h < 1) return;

    const newPreset: Preset = {
      id: `custom_${Date.now()}`,
      name: newPresetName,
      type: newPresetType,
      width: w,
      height: h,
      aspect_ratio: newPresetType === "aspect_ratio" ? `${w}:${h}` : null,
      enabled: true,
      order: local.presets.length,
      is_builtin: false,
    };

    setLocal({ ...local, presets: [...local.presets, newPreset] });
    setNewPresetName("");
    setNewPresetW("");
    setNewPresetH("");
  };

  const deletePreset = (id: string) => {
    setLocal({ ...local, presets: local.presets.filter((p) => p.id !== id) });
  };

  const togglePreset = (id: string) => {
    setLocal({
      ...local,
      presets: local.presets.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    });
  };

  const movePreset = (index: number, direction: -1 | 1) => {
    const arr = [...local.presets];
    const target = index + direction;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    // Update order values
    const updated = arr.map((p, i) => ({ ...p, order: i }));
    setLocal({ ...local, presets: updated });
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <h2>Settings</h2>

        {/* Shortcuts Section */}
        <div className="settings-section">
          <h3>Keyboard Shortcuts</h3>

          <div className="setting-row">
            <label>Region Capture</label>
            <input type="text" value={local.shortcut_region} readOnly className="shortcut-input" />
          </div>

          <div className="setting-row">
            <label>Full Screen → Clipboard</label>
            <input type="text" value={local.shortcut_fullscreen} readOnly className="shortcut-input" />
          </div>

          <div className="setting-row">
            <label>Copy</label>
            <input
              type="text"
              value={local.shortcut_copy}
              onChange={(e) => setLocal({ ...local, shortcut_copy: e.target.value })}
              className="shortcut-input"
            />
          </div>

          <div className="setting-row">
            <label>Save</label>
            <input
              type="text"
              value={local.shortcut_save}
              onChange={(e) => setLocal({ ...local, shortcut_save: e.target.value })}
              className="shortcut-input"
            />
          </div>

          <div className="setting-row">
            <label>Cancel</label>
            <input type="text" value={local.shortcut_cancel} readOnly className="shortcut-input" />
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

          {conflictError && <div className="conflict-error">{conflictError}</div>}
        </div>

        {/* Presets Section */}
        <div className="settings-section">
          <h3>Capture Presets</h3>

          <div className="preset-list-settings">
            {local.presets
              .sort((a, b) => a.order - b.order)
              .map((preset, idx) => (
                <div key={preset.id} className={`preset-row ${!preset.enabled ? "disabled" : ""}`}>
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-dims">
                    {preset.type === "aspect_ratio" ? `Ratio ${preset.width}:${preset.height}` : `${preset.width}×${preset.height}`}
                  </span>
                  <div className="preset-actions">
                    <button onClick={() => movePreset(idx, -1)} title="Move up" disabled={idx === 0}>↑</button>
                    <button onClick={() => movePreset(idx, 1)} title="Move down" disabled={idx === local.presets.length - 1}>↓</button>
                    <button onClick={() => togglePreset(preset.id)} title={preset.enabled ? "Disable" : "Enable"}>
                      {preset.enabled ? "👁" : "🚫"}
                    </button>
                    {!preset.is_builtin && (
                      <button onClick={() => deletePreset(preset.id)} title="Delete" className="danger">✕</button>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {/* Add new preset */}
          <div className="add-preset-form">
            <h4>Add Custom Preset</h4>
            <div className="preset-form-row">
              <input
                type="text"
                placeholder="Name"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="preset-input"
              />
              <select
                value={newPresetType}
                onChange={(e) => setNewPresetType(e.target.value as "fixed_size" | "aspect_ratio")}
                className="preset-select"
              >
                <option value="fixed_size">Fixed Size</option>
                <option value="aspect_ratio">Aspect Ratio</option>
              </select>
            </div>
            <div className="preset-form-row">
              <input
                type="number"
                placeholder="Width"
                value={newPresetW}
                onChange={(e) => setNewPresetW(e.target.value)}
                className="preset-input"
                min="1"
              />
              <span className="preset-x">×</span>
              <input
                type="number"
                placeholder="Height"
                value={newPresetH}
                onChange={(e) => setNewPresetH(e.target.value)}
                className="preset-input"
                min="1"
              />
              <button
                onClick={addPreset}
                disabled={!newPresetName || !newPresetW || !newPresetH}
                className="add-preset-btn"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        {/* Save Location */}
        <div className="settings-section">
          <h3>Save Location</h3>
          <div className="setting-row">
            <label>Last Save Directory</label>
            <span className="save-path">{local.last_save_dir || "Not set"}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="btn-primary" onClick={handleSave}>Save</button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;