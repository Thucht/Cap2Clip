import { useState, useCallback, useRef, useLayoutEffect } from "react";
import { PencilBrush } from "fabric";
import type { Canvas } from "fabric";
import type { Preset, SelectionGeometry } from "../App";

type Tool = "select" | "pen" | "line" | "arrow" | "rect" | "ellipse" | "highlight" | "blur" | "text";

interface AnnotationToolbarProps {
  onCopy: () => void;
  onSave: () => void;
  onCancel: () => void;
  canvasRef: React.MutableRefObject<any>;
  rect: SelectionGeometry;
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

// Toolbar estimated dimensions
const HORIZONTAL_TOOLBAR_ESTIMATE = { width: 720, height: 56 };
const VERTICAL_TOOLBAR_ESTIMATE = { width: 60, height: 200 };
const TOOLBAR_GAP = 12; // gap between toolbar and selection rect

export function AnnotationToolbar({
  onCopy,
  onSave,
  onCancel,
  canvasRef,
  rect,
  presets = [],
  activePreset,
  onPresetSelect,
}: AnnotationToolbarProps) {
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fontSize, setFontSize] = useState(24);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const hToolbarRef = useRef<HTMLDivElement>(null);
  const vToolbarRef = useRef<HTMLDivElement>(null);
  const [hSize, setHSize] = useState(HORIZONTAL_TOOLBAR_ESTIMATE);
  const [vSize, setVSize] = useState(VERTICAL_TOOLBAR_ESTIMATE);

  // Measure toolbar sizes after render
  useLayoutEffect(() => {
    if (hToolbarRef.current) {
      const r = hToolbarRef.current.getBoundingClientRect();
      setHSize({ width: r.width, height: r.height });
    }
    if (vToolbarRef.current) {
      const r = vToolbarRef.current.getBoundingClientRect();
      setVSize({ width: r.width, height: r.height });
    }
  }, [activeTool, color, strokeWidth, fontSize, showColorPicker, showPresetDropdown, presets]);

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Determine horizontal toolbar position (above or below the rect)
  const hFitsBelow = rect.y + rect.height + TOOLBAR_GAP + hSize.height <= screenH;
  const hFitsAbove = rect.y - TOOLBAR_GAP - hSize.height >= 0;
  const horizontalPosition = hFitsBelow ? "below" : hFitsAbove ? "above" : "below";
  const horizontalLeft = Math.max(
    8,
    Math.min(
      screenW - hSize.width - 8,
      rect.x + rect.width / 2 - hSize.width / 2
    )
  );
  const horizontalTop =
    horizontalPosition === "below"
      ? rect.y + rect.height + TOOLBAR_GAP
      : rect.y - TOOLBAR_GAP - hSize.height;

  // Determine vertical toolbar position (right or left of the rect)
  const vFitsRight = rect.x + rect.width + TOOLBAR_GAP + vSize.width <= screenW;
  const vFitsLeft = rect.x - TOOLBAR_GAP - vSize.width >= 0;
  const verticalSide = vFitsRight ? "right" : vFitsLeft ? "left" : "right";
  const verticalLeft =
    verticalSide === "right"
      ? rect.x + rect.width + TOOLBAR_GAP
      : rect.x - TOOLBAR_GAP - vSize.width;
  const verticalTop = Math.max(
    8,
    Math.min(
      screenH - vSize.height - 8,
      rect.y + rect.height / 2 - vSize.height / 2
    )
  );

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const canvas = getCanvas();
      if (canvas) {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || !(activeObj as any).isEditing) handleDelete();
      }
    }
    if (e.ctrlKey && e.key === "z") { e.preventDefault(); handleUndo(); }
    if (e.ctrlKey && e.key === "y") { e.preventDefault(); handleRedo(); }
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
    <>
      {/* HORIZONTAL TOOLBAR: drawing tools, color, stroke, undo, preset */}
      <div
        ref={hToolbarRef}
        className="annotation-toolbar annotation-toolbar-horizontal"
        style={{ left: horizontalLeft, top: horizontalTop }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        onMouseDown={(e) => e.stopPropagation()}
      >
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

        <div className="toolbar-section">
          <button
            className="color-swatch-btn"
            style={{ backgroundColor: color }}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Color"
          />
          {showColorPicker && (
            <div className="color-picker-popup" onMouseDown={(e) => e.stopPropagation()}>
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

        <div className="toolbar-section">
          <button className="tool-btn" onClick={handleUndo} title="Undo (Ctrl+Z)">↩</button>
          <button className="tool-btn" onClick={handleRedo} title="Redo (Ctrl+Y)">↪</button>
          <button className="tool-btn" onClick={handleDelete} title="Delete">🗑</button>
        </div>

        <div className="toolbar-divider" />

        {presets.length > 0 && (
          <>
            <div className="toolbar-section">
              <div className="preset-dropdown-wrapper">
                <button
                  className="preset-dropdown-trigger"
                  onClick={(e) => { e.stopPropagation(); setShowPresetDropdown(!showPresetDropdown); }}
                >
                  📐 {activePreset?.name || "Resize"} ▾
                </button>
                {showPresetDropdown && (
                  <div className="preset-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                    {presets.sort((a, b) => a.order - b.order).map((p) => (
                      <button
                        key={p.id}
                        className={`preset-dropdown-item ${activePreset?.id === p.id ? "active" : ""}`}
                        onClick={() => { if (onPresetSelect) onPresetSelect(p); setShowPresetDropdown(false); }}
                      >
                        {p.name}
                        {p.type !== "free" && p.width > 0 && (
                          <span className="preset-size-hint">{p.width}×{p.height}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="toolbar-divider" />
          </>
        )}
      </div>

      {/* VERTICAL TOOLBAR: action buttons (Copy / Save / Cancel) */}
      <div
        ref={vToolbarRef}
        className="annotation-toolbar annotation-toolbar-vertical"
        style={{ left: verticalLeft, top: verticalTop }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="toolbar-section vertical">
          <button
            className="action-btn copy"
            onClick={onCopy}
            title="Copy (Ctrl+C)"
          >
            📋
          </button>
          <button
            className="action-btn save"
            onClick={onSave}
            title="Save (Ctrl+S)"
          >
            💾
          </button>
          <button
            className="action-btn cancel"
            onClick={onCancel}
            title="Cancel (Esc)"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}

export default AnnotationToolbar;