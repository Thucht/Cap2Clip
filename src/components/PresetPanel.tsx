import { useState } from "react";
import { X, Plus, Trash2, Ruler } from "lucide-react";
import { useAppStore } from "../stores/appStore";

export function PresetPanel() {
  const { showPresetPanel, setShowPresetPanel, presets, deletePreset, addPreset } = useAppStore();
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState("");
  const [newHeight, setNewHeight] = useState("");

  const handleAddPreset = async () => {
    if (!newName || !newWidth || !newHeight) return;

    await addPreset({
      name: newName,
      width: parseInt(newWidth),
      height: parseInt(newHeight),
    });

    setNewName("");
    setNewWidth("");
    setNewHeight("");
  };

  if (!showPresetPanel) return null;

  return (
    <div className="preset-panel-overlay" onClick={() => setShowPresetPanel(false)}>
      <div className="preset-panel" onClick={(e) => e.stopPropagation()}>
        <div className="preset-header">
          <div className="preset-title">
            <Ruler size={20} />
            <h3>Dimension Presets</h3>
          </div>
          <button className="close-btn" onClick={() => setShowPresetPanel(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="preset-list">
          {presets.map((preset) => (
            <div key={preset.id} className="preset-item">
              <div className="preset-info">
                <span className="preset-name">{preset.name}</span>
                <span className="preset-dimensions">
                  {preset.width} × {preset.height}
                </span>
              </div>
              <button
                className="preset-delete"
                onClick={() => deletePreset(preset.id)}
                title="Delete preset"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {presets.length === 0 && (
            <div className="preset-empty">
              No presets yet. Add one below!
            </div>
          )}
        </div>

        <div className="preset-add">
          <h4>Add New Preset</h4>
          <input
            type="text"
            placeholder="Name (e.g., Twitter Post)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="preset-dimensions-input">
            <input
              type="number"
              placeholder="Width"
              value={newWidth}
              onChange={(e) => setNewWidth(e.target.value)}
            />
            <span>×</span>
            <input
              type="number"
              placeholder="Height"
              value={newHeight}
              onChange={(e) => setNewHeight(e.target.value)}
            />
          </div>
          <button
            onClick={handleAddPreset}
            disabled={!newName || !newWidth || !newHeight}
            className="add-preset-btn"
          >
            <Plus size={16} />
            Add Preset
          </button>
        </div>
      </div>
    </div>
  );
}

export default PresetPanel;
