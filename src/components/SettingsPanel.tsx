import { useEffect, useState } from "react";

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
  const [activeTab, setActiveTab] = useState<"general" | "shortcuts" | "presets">("general");

  useEffect(() => {
    setLocal(JSON.parse(JSON.stringify(settings)));
  }, [settings]);

  const updateShortcuts = (updates: { [key: string]: string }) => {
    setLocal((current) => ({ ...current, shortcuts: { ...current.shortcuts, ...updates } }));
  };

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    const entries = [
      [local.shortcut_region, "Region Capture"],
      [local.shortcut_fullscreen, "Full Screen"],
      [local.shortcut_copy, "Copy"],
      [local.shortcut_save, "Save"],
      [local.shortcut_cancel, "Cancel"],
      ...Object.entries(local.shortcuts || {}).map(([key, value]) => [value, key]),
    ].map(([key, label]) => [String(key).trim().toLowerCase(), String(label)] as const)
      .filter(([key]) => key.length > 0);
    const seen = new Map<string, string>();
    for (const [key, label] of entries) {
      if (seen.has(key)) {
        setConflictError(`Conflict: "${key}" is assigned to both "${seen.get(key)}" and "${label}"`);
        return;
      }
      seen.set(key, label);
    }
    const presets = local.presets.map((preset, index) => ({ ...preset, order: index }));
    setConflictError("");
    onSave({ ...local, presets, shortcuts: { ...local.shortcuts } });
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

  const shortcutRows: Array<[string, string]> = [
    ["shortcut_region", "Region Capture"],
    ["shortcut_fullscreen", "Full Screen → Clipboard"],
    ["shortcut_copy", "Copy"],
    ["shortcut_save", "Save"],
    ["shortcut_cancel", "Cancel"],
  ];
  const toolRows: Array<[string, string]> = [
    ["pen", "Pen"], ["line", "Line"], ["arrow", "Arrow"], ["rect", "Rectangle"],
    ["ellipse", "Ellipse"], ["highlight", "Highlight"], ["blur", "Blur"], ["text", "Text"],
  ];
  const renderShortcutInput = (key: string, label: string) => {
    const isGlobal = key.startsWith("shortcut_");
    const value = isGlobal ? String(local[key as keyof AppSettings] ?? "") : local.shortcuts?.[key] ?? "";
    return (
      <div className="setting-row" key={key}>
        <label>{label}</label>
        <input type="text" value={value}
          readOnly={key === "shortcut_region" || key === "shortcut_fullscreen" || key === "shortcut_cancel"}
          onChange={(e) => isGlobal ? updateField(key as keyof AppSettings, e.target.value as never) : updateShortcuts({ [key]: e.target.value })}
          className="shortcut-input" placeholder="Not assigned" />
      </div>
    );
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <div><h2>Settings</h2><p>Configure Cap2Clip</p></div>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <nav className="settings-tabs" aria-label="Settings sections">
          {([['general', 'General'], ['shortcuts', 'Shortcuts'], ['presets', 'Presets']] as const).map(([id, label]) => (
            <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="settings-content">
          {activeTab === "general" && <div className="settings-section">
            <h3>Application</h3>
            <div className="setting-row"><div><label>Start with Windows</label><small>Launch Cap2Clip when you sign in</small></div><button className={`toggle-btn ${local.auto_start ? "on" : "off"}`} onClick={() => updateField("auto_start", !local.auto_start)}>{local.auto_start ? "ON" : "OFF"}</button></div>
            <div className="setting-row"><div><label>Global shortcuts</label><small>Allow capture shortcuts outside the app</small></div><button className={`toggle-btn ${local.shortcuts_enabled ? "on" : "off"}`} onClick={() => updateField("shortcuts_enabled", !local.shortcuts_enabled)}>{local.shortcuts_enabled ? "ON" : "OFF"}</button></div>
          </div>}
          {activeTab === "shortcuts" && <div className="settings-section">
            <h3>Global shortcuts</h3>{shortcutRows.map(([key, label]) => renderShortcutInput(key, label))}
            <h3 className="settings-subheading">Annotation tools</h3><p className="settings-help">Press a key to switch tools. Leave empty to disable.</p>
            {toolRows.map(([key, label]) => renderShortcutInput(key, label))}
            <div className="setting-row"><div><label>Delete annotation</label><small>Delete or Backspace</small></div><span className="shortcut-badge">Delete</span></div>
            <div className="setting-row"><div><label>Brush size</label><small>Mouse wheel or bracket keys</small></div><span className="shortcut-badge">Wheel / [ ]</span></div>
            {conflictError && <div className="conflict-error">{conflictError}</div>}
          </div>}
          {activeTab === "presets" && <div className="settings-section">
            <h3>Capture presets</h3><p className="settings-help">Enable, reorder, or remove capture sizes.</p>
            <div className="preset-list-settings">{local.presets.slice().sort((a, b) => a.order - b.order).map((preset, idx) => (
              <div key={preset.id} className={`preset-row ${!preset.enabled ? "disabled" : ""}`}>
                <span className="preset-name">{preset.name}</span><span className="preset-dims">{preset.type === "aspect_ratio" ? `Ratio ${preset.width}:${preset.height}` : `${preset.width}×${preset.height}`}</span>
                <div className="preset-actions"><button onClick={() => movePreset(idx, -1)} title="Move up" disabled={idx === 0}>↑</button><button onClick={() => movePreset(idx, 1)} title="Move down" disabled={idx === local.presets.length - 1}>↓</button><button onClick={() => togglePreset(preset.id)} title={preset.enabled ? "Disable" : "Enable"}>{preset.enabled ? "✓" : "○"}</button>{!preset.is_builtin && <button onClick={() => deletePreset(preset.id)} title="Delete">×</button>}</div>
              </div>))}</div>
            <h4>Add custom preset</h4><div className="preset-form"><input placeholder="Name" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} /><select value={newPresetType} onChange={(e) => setNewPresetType(e.target.value as "fixed_size" | "aspect_ratio")}><option value="fixed_size">Fixed size</option><option value="aspect_ratio">Aspect ratio</option></select><input type="number" min="1" placeholder="Width" value={newPresetW} onChange={(e) => setNewPresetW(e.target.value)} /><input type="number" min="1" placeholder="Height" value={newPresetH} onChange={(e) => setNewPresetH(e.target.value)} /><button className="settings-secondary-btn" onClick={addPreset}>Add preset</button></div>
          </div>}
        </div>
        <div className="settings-actions"><button className="cancel-btn" onClick={onClose}>Cancel</button><button className="save-btn" onClick={handleSave}>Save changes</button></div>
      </div>
    </div>
  );
}

export default SettingsPanel;