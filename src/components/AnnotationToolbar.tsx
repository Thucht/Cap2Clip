import { useState, useCallback, useRef } from "react";
import { PencilBrush } from "fabric";
import type { Canvas } from "fabric";
import type { Preset } from "../App";

type Tool = "select" | "pen" | "line" | "arrow" | "rect" | "ellipse" | "highlight" | "blur" | "text";

interface AnnotationToolbarProps {
  onCopy: () => void;
  onSave: () => void;
  onCancel: () => void;
  canvasRef: React.MutableRefObject<any>;
  presets?: Preset[];
  activePreset?: Preset | null;
  onPresetSelect?: (preset: Preset) => void;
}

const COLORS = [
  "#ff0000", "#ff6600", "#ffcc00", "#33cc33",
  "#0099ff", "#9933ff", "#ffffff", "#000000",
];

const STROKE_WIDTHS = [2, 3, 5, 8];
const FONT_SIZES = [14, 18, 24, 32, 48];

export function AnnotationToolbar({ onCopy, onSave, onCancel, canvasRef, presets = [], activePreset, onPresetSelect }: AnnotationToolbarProps) {
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(24);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  const getCanvas = (): Canvas | null => {
    if (canvasRef.current?.getCanvas) {
      return canvasRef.current.getCanvas();
    }
    return null;
  };

  const saveState = useCallback(() => {
    const canvas = getCanvas();
    if (canvas) {
      undoStack.current.push(JSON.stringify(canvas.toJSON()));
      redoStack.current = [];
      if (undoStack.current.length > 50) undoStack.current.shift();
    }
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas || undoStack.current.length === 0) return;

    redoStack.current.push(JSON.stringify(canvas.toJSON()));
    const state = undoStack.current.pop()!;
    canvas.loadFromJSON(state).then(() => canvas.renderAll());
  }, []);

  const handleRedo = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas || redoStack.current.length === 0) return;

    undoStack.current.push(JSON.stringify(canvas.toJSON()));
    const state = redoStack.current.pop()!;
    canvas.loadFromJSON(state).then(() => canvas.renderAll());
  }, []);

  const setTool = useCallback((tool: Tool) => {
    const canvas = getCanvas();
    if (!canvas) return;

    setActiveTool(tool);

    canvas.isDrawingMode = false;
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "select" ? "default" : "crosshair";

    if (tool === "pen" || tool === "highlight") {
      canvas.isDrawingMode = true;
      const brush = new PencilBrush(canvas);
      brush.color = tool === "highlight" ? `${color}66` : color;
      brush.width = tool === "highlight" ? strokeWidth * 4 : strokeWidth;
      canvas.freeDrawingBrush = brush;
    }

    if (tool === "text") {
      canvas.defaultCursor = "text";
    }
  }, [color, strokeWidth]);

  const handleDelete = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length > 0) {
      saveState();
      active.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  }, [saveState]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const canvas = getCanvas();
      if (canvas) {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || !(activeObj as any).isEditing) {
          handleDelete();
        }
      }
    }
    if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      handleUndo();
    }
    if (e.ctrlKey && e.key === "y") {
      e.preventDefault();
      handleRedo();
    }
  }, [handleDelete, handleUndo, handleRedo]);

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: "select", icon: "☐", label: "Select" },
    { id: "pen", icon: "✏️", label: "Pen" },
    { id: "line", icon: "╱", label: "Line" },
    { id: "arrow", icon: "→", label: "Arrow" },
    { id: "rect", icon: "▭", label: "Rectangle" },
    { id: "ellipse", icon: "◯", label: "Ellipse" },
    { id: "highlight", icon: "🖍", label: "Highlight" },
    { id: "blur", icon: "▒", label: "Blur" },
    { id: "text", icon: "T", label: "Text" },
  ];

  return (
    <div className="annotation-toolbar" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Drawing tools */}
      <div className="toolbar-section tools">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-btn ${activeTool === tool.id ? "active" : ""}`}
            onClick={() => setTool(tool.id)}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Color picker */}
      <div className="toolbar-section">
        <button
          className="color-swatch-btn"
          style={{ backgroundColor: color }}
          onClick={() => setShowColorPicker(!showColorPicker)}
          title="Color"
        />
        {showColorPicker && (
          <div className="color-picker-popup">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-option ${color === c ? "active" : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => { setColor(c); setShowColorPicker(false); setTool(activeTool); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stroke width */}
      <div className="toolbar-section">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            className={`stroke-btn ${strokeWidth === w ? "active" : ""}`}
            onClick={() => { setStrokeWidth(w); setTool(activeTool); }}
            title={`${w}px`}
          >
            <span className="stroke-dot" style={{ width: w, height: w }} />
          </button>
        ))}
      </div>

      {/* Font size (for text tool) */}
      {activeTool === "text" && (
        <div className="toolbar-section">
          <select
            className="font-size-select"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
        </div>
      )}

      <div className="toolbar-divider" />

      {/* Undo / Redo / Delete */}
      <div className="toolbar-section">
        <button className="tool-btn" onClick={handleUndo} title="Undo (Ctrl+Z)">↩</button>
        <button className="tool-btn" onClick={handleRedo} title="Redo (Ctrl+Y)">↪</button>
        <button className="tool-btn" onClick={handleDelete} title="Delete">🗑</button>
      </div>

      <div className="toolbar-divider" />

      {/* Preset selector for quick resize */}
      {presets.length > 0 && (
        <>
          <div className="toolbar-section">
            <select
              className="preset-select-toolbar"
              value={activePreset?.id || ""}
              onChange={(e) => {
                const p = presets.find((pp) => pp.id === e.target.value);
                if (p && onPresetSelect) {
                  onPresetSelect(p);
                }
              }}
              title="Quick resize preset"
            >
              <option value="">📐 Resize</option>
              {presets.sort((a, b) => a.order - b.order).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="toolbar-divider" />
        </>
      )}

      {/* Action buttons */}
      <div className="toolbar-section actions">
        <button className="action-btn copy" onClick={onCopy} title="Copy to clipboard (Ctrl+C)">
          📋 Copy
        </button>
        <button className="action-btn save" onClick={onSave} title="Save as PNG (Ctrl+S)">
          💾 Save
        </button>
        <button className="action-btn cancel" onClick={onCancel} title="Cancel (Esc)">
          ✕ Cancel
        </button>
      </div>
    </div>
  );
}

export default AnnotationToolbar;