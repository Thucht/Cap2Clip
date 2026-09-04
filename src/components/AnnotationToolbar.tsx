import { useState, useCallback, useRef, useLayoutEffect, useEffect } from "react";
import { PencilBrush, Line, Rect, Ellipse, IText, Triangle } from "fabric";
import type { Canvas } from "fabric";
import type { Preset, SelectionGeometry } from "../App";
import {
  IconCopy, IconSave, IconCancel, IconUndo, IconRedo, IconTrash,
  IconPen, IconLine, IconArrow, IconRect, IconEllipse, IconHighlight, IconBlur, IconText,
  IconMove, IconEdit, IconResizePreset,
} from "./icons";

export type Tool = "move" | "edit" | "select" | "pen" | "line" | "arrow" | "rect" | "ellipse" | "highlight" | "blur" | "text";

interface AnnotationToolbarProps {
  onCopy: () => void;
  onSaveDialog: () => void;
  onCancel: () => void;
  multiRegion: boolean;
  onMultiRegionChange: (enabled: boolean) => void;
  canvasRef: React.MutableRefObject<any>;
  rect: SelectionGeometry;
  visible: boolean;
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  presets?: Preset[];
  activePreset?: Preset | null;
  onPresetSelect?: (preset: Preset) => void;
  toolShortcuts?: { [key: string]: string };
}

const COLORS = [
  "#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
  "#00c7be", "#007aff", "#5856d6", "#af52de", "#ff2d92", "#8e8e93",
];


export function AnnotationToolbar({
  onCopy,
  onSaveDialog,
  onCancel,
  multiRegion,
  onMultiRegionChange,
  canvasRef,
  rect,
  visible,
  activeTool,
  onToolChange,
  presets = [],
  activePreset,
  onPresetSelect,
  toolShortcuts = {},
}: AnnotationToolbarProps) {
  const [color, setColor] = useState(() => localStorage.getItem("cap2clip.color") || "#ff3b30");
  const [strokeWidth, setStrokeWidth] = useState(() => Number(localStorage.getItem("cap2clip.strokeWidth")) || 3);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [showBlurPicker, setShowBlurPicker] = useState(false);
  const [blurBrush, setBlurBrush] = useState(() => localStorage.getItem("cap2clip.blurBrush") || "soft");
  const blurBrushRef = useRef(blurBrush);
  blurBrushRef.current = blurBrush;
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const toolHandlersRef = useRef<{
    down: (opt: any) => void;
    move: (opt: any) => void;
    up: () => void;
    pathCreated?: (event: any) => void;
  } | null>(null);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  colorRef.current = color;
  strokeWidthRef.current = strokeWidth;
  const hToolbarRef = useRef<HTMLDivElement>(null);
  const vToolbarRef = useRef<HTMLDivElement>(null);
  const [hSize, setHSize] = useState({ width: 360, height: 38 });
  const [vSize, setVSize] = useState({ width: 38, height: 280 });
  // getBoundingClientRect already returns the post-scale visual dimensions.
  // Do not scale these values a second time when placing the toolbars.

  useLayoutEffect(() => {
    const measure = () => {
      if (hToolbarRef.current) {
        const r = hToolbarRef.current.getBoundingClientRect();
        setHSize({ width: r.width, height: r.height });
      }
      if (vToolbarRef.current) {
        const r = vToolbarRef.current.getBoundingClientRect();
        setVSize({ width: r.width, height: r.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (hToolbarRef.current) observer.observe(hToolbarRef.current);
    if (vToolbarRef.current) observer.observe(vToolbarRef.current);
    return () => observer.disconnect();
  }, [activeTool, color, strokeWidth, blurBrush, showColorPicker, showPresetDropdown, showBlurPicker, presets, visible]);

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Both toolbars share the same compact sizing and use corner-aware placement.
  // This avoids overlap on tiny selections: horizontal is placed below/above,
  // vertical is placed to the side, and only their corners may meet.
  const hGap = 8;
  const vGap = 8;
  const hFitsBelow = rect.y + rect.height + hGap + hSize.height <= screenH;
  const hFitsAbove = rect.y - hGap - hSize.height >= 0;
  const horizontalTop = hFitsBelow
    ? rect.y + rect.height + hGap
    : hFitsAbove
      ? rect.y - hGap - hSize.height
      : Math.max(8, Math.min(screenH - hSize.height - 8, rect.y + rect.height + hGap));
  const horizontalLeft = Math.max(
    8,
    Math.min(screenW - hSize.width - 8, rect.x + rect.width / 2 - hSize.width / 2)
  );

  const vFitsRight = rect.x + rect.width + vGap + vSize.width <= screenW;
  const vFitsLeft = rect.x - vGap - vSize.width >= 0;
  const preferredVerticalLeft = vFitsRight
    ? rect.x + rect.width + vGap
    : vFitsLeft
      ? rect.x - vGap - vSize.width
      : Math.max(8, Math.min(screenW - vSize.width - 8, rect.x + rect.width + vGap));
  const verticalLeft = preferredVerticalLeft;
  const verticalTop = Math.max(
    8,
    Math.min(screenH - vSize.height - 8, rect.y + rect.height / 2 - vSize.height / 2)
  );

  // On very small selections, keep the vertical toolbar out of the horizontal
  // toolbar's rectangle. If both cannot fit around the selection, anchor the
  // vertical toolbar to the horizontal toolbar's lower corner.
  const verticalOverlapsHorizontal =
    verticalLeft < horizontalLeft + hSize.width &&
    verticalLeft + vSize.width > horizontalLeft &&
    verticalTop < horizontalTop + hSize.height &&
    verticalTop + vSize.height > horizontalTop;
  const safeVerticalTop = verticalOverlapsHorizontal
    ? Math.max(8, Math.min(screenH - vSize.height - 8, horizontalTop + hSize.height))
    : verticalTop;
  const safeVerticalLeft = verticalOverlapsHorizontal
    ? Math.max(8, Math.min(screenW - vSize.width - 8, horizontalLeft + hSize.width - vSize.width))
    : verticalLeft;

  const getCanvas = (): Canvas | null => {
    if (canvasRef.current?.getCanvas) return canvasRef.current.getCanvas();
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

  const selectBlurBrush = useCallback((next: string) => {
    blurBrushRef.current = next;
    setBlurBrush(next);
    localStorage.setItem("cap2clip.blurBrush", next);
    setShowBlurPicker(false);
  }, []);

  useEffect(() => {
    if (activeTool !== "blur") {
      setShowBlurPicker(false);
      return;
    }
    const canvas = getCanvas();
    if (canvas?.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = strokeWidthRef.current * (blurBrush === "soft" ? 3 : 2);
      canvas.freeDrawingBrush.color = blurBrush === "solid" ? "rgba(32,32,36,0.94)" : "rgba(120,120,120,0.45)";
    }
  }, [activeTool, blurBrush]);

  // Blur is intentionally a brush: every drag creates one independent redaction stroke.
  // The selected mode is persisted and updates the active Fabric brush immediately.

  useEffect(() => {
    if (!showBlurPicker) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".blur-picker-popup") && !target.closest(".blur-tool-button")) {
        setShowBlurPicker(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [showBlurPicker]);

  const setTool = useCallback((tool: Tool) => {
    const canvas = getCanvas();
    if (!canvas) return;

    const previous = toolHandlersRef.current;
    if (previous) {
      canvas.off("mouse:down", previous.down);
      canvas.off("mouse:move", previous.move);
      canvas.off("mouse:up", previous.up);
      if (previous.pathCreated) canvas.off("path:created", previous.pathCreated);
      toolHandlersRef.current = null;
    }

    onToolChange(tool);
    canvas.isDrawingMode = false;
    canvas.selection = tool === "edit";
    canvas.defaultCursor = tool === "move" ? "move" : tool === "edit" ? "default" : tool === "select" ? "crosshair" : tool === "text" ? "text" : "crosshair";
    canvas.hoverCursor = tool === "edit" ? "move" : tool === "move" ? "move" : "default";

    if (tool === "edit") {
      canvas.forEachObject((object: any) => {
        object.set({ selectable: true, evented: true });
      });
      canvas.discardActiveObject();
      canvas.renderAll();
      return;
    }

    if (tool === "move") {
      canvas.discardActiveObject();
      canvas.forEachObject((object: any) => {
        object.set({ selectable: false, evented: false });
      });
      canvas.renderAll();
      return;
    }

    canvas.forEachObject((object: any) => {
      object.set({ selectable: false, evented: false });
    });
    canvas.discardActiveObject();
    canvas.renderAll();

    if (tool === "select") {
      return;
    }

    if (tool === "pen" || tool === "highlight") {
      canvas.isDrawingMode = true;
      const brush = new PencilBrush(canvas);
      brush.color = tool === "highlight" ? `${colorRef.current}66` : colorRef.current;
      brush.width = tool === "highlight" ? strokeWidthRef.current * 4 : strokeWidthRef.current;
      canvas.freeDrawingBrush = brush;
      return;
    }

    if (tool === "blur") {
      canvas.isDrawingMode = true;
      const brush = new PencilBrush(canvas);
      brush.width = strokeWidthRef.current * (blurBrushRef.current === "soft" ? 3 : 2);
      brush.color = "rgba(255,255,255,0.01)";
      const pathCreated = ({ path }: any) => {
        const bounds = path.getBoundingRect();
        path.set({
          selectable: false,
          evented: false,
          fill: "transparent",
          stroke: "rgba(255,255,255,0.01)",
          opacity: 1,
          data: { kind: "blur", brush: blurBrushRef.current, bounds },
        });
        path.setCoords();
        canvas.renderAll();
      };
      canvas.freeDrawingBrush = brush;
      canvas.on("path:created", pathCreated);
      toolHandlersRef.current = { down: () => undefined, move: () => undefined, up: () => undefined, pathCreated };
      return;
    }

    if (tool === "line" || tool === "arrow" || tool === "rect" || tool === "ellipse") {
      canvas.selection = false;
      let drawing: { shape: any; startX: number; startY: number } | null = null;

      const down = (opt: any) => {
        if (drawing) return;
        const pointer = canvas.getScenePoint(opt.e);
        const startX = pointer.x;
        const startY = pointer.y;
        saveState();

        const commonProps = {
          stroke: colorRef.current,
          strokeWidth: strokeWidthRef.current,
          fill: "transparent",
          selectable: false,
          evented: false,
          strokeUniform: true,
        };
        let shape: any;
        if (tool === "line" || tool === "arrow") {
          shape = new Line([startX, startY, startX, startY], commonProps);
        } else if (tool === "rect") {
          shape = new Rect({ ...commonProps, left: startX, top: startY, width: 1, height: 1, rx: 2, ry: 2 });
        } else {
          shape = new Ellipse({ ...commonProps, left: startX, top: startY, rx: 0.5, ry: 0.5 });
        }
        drawing = { shape, startX, startY };
        canvas.add(shape);
      };

      const move = (opt: any) => {
        if (!drawing) return;
        const { shape, startX, startY } = drawing;
        const pointer = canvas.getScenePoint(opt.e);
        const dx = pointer.x - startX;
        const dy = pointer.y - startY;

        if (tool === "line" || tool === "arrow") {
          shape.set({ x2: pointer.x, y2: pointer.y });
        } else if (tool === "rect") {
          shape.set({
            width: Math.max(1, Math.abs(dx)),
            height: Math.max(1, Math.abs(dy)),
            left: dx < 0 ? pointer.x : startX,
            top: dy < 0 ? pointer.y : startY,
          });
        } else {
          shape.set({
            rx: Math.max(0.5, Math.abs(dx) / 2),
            ry: Math.max(0.5, Math.abs(dy) / 2),
            left: startX + dx / 2,
            top: startY + dy / 2,
          });
        }
        shape.setCoords();
        canvas.renderAll();
      };

      const up = () => {
        if (!drawing) return;
        const { shape, startX, startY } = drawing;
        drawing = null;
        const x1 = Number((shape as any).x1 ?? startX);
        const y1 = Number((shape as any).y1 ?? startY);
        const x2 = Number((shape as any).x2 ?? startX);
        const y2 = Number((shape as any).y2 ?? startY);

        if (tool === "arrow" && Math.hypot(x2 - x1, y2 - y1) >= 3) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = new Triangle({
            width: Math.max(10, strokeWidthRef.current * 3),
            height: Math.max(8, strokeWidthRef.current * 2.4),
            left: x2,
            top: y2,
            originX: "center",
            originY: "center",
            angle: (angle * 180) / Math.PI + 90,
            fill: colorRef.current,
            stroke: colorRef.current,
            strokeWidth: 1,
            selectable: false,
            evented: false,
          });
          canvas.add(head);
        }

        shape.set({ selectable: false, evented: false });
        shape.setCoords();
        canvas.discardActiveObject();
        canvas.renderAll();
      };

      toolHandlersRef.current = { down, move, up };
      canvas.on("mouse:down", down);
      canvas.on("mouse:move", move);
      canvas.on("mouse:up", up);
      return;
    }

    if (tool === "text") {
      const down = (opt: any) => {
        const pointer = canvas.getScenePoint(opt.e);
        saveState();
        const text = new IText("Text", {
          left: pointer.x,
          top: pointer.y,
          fontSize: Math.max(12, strokeWidthRef.current * 4),
          fill: colorRef.current,
          fontFamily: "Segoe UI, sans-serif",
          selectable: true,
          evented: true,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        // Keep the text editable for this gesture, but hide its transform frame
        // once editing is complete; Edit is the only selection tool.
        text.set({ selectable: false, evented: false });
        canvas.renderAll();
      };
      const noop = () => undefined;
      toolHandlersRef.current = { down, move: noop, up: noop };
      canvas.on("mouse:down", down);
    }
  }, [onToolChange, saveState]);

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

  const changeSize = useCallback((nextSize: number) => {
    const width = Math.max(1, Math.min(20, Math.round(nextSize)));
    strokeWidthRef.current = width;
    setStrokeWidth(width);
    localStorage.setItem("cap2clip.strokeWidth", String(width));
    const canvas = getCanvas();
    if (!canvas) return;

    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = activeTool === "highlight" ? width * 4 : activeTool === "blur" ? width * (blurBrushRef.current === "soft" ? 3 : 2) : width;
    }
    const activeObject = canvas.getActiveObject() as any;
    if (activeObject?.type === "i-text" || activeObject?.type === "text") {
      activeObject.set({ fontSize: Math.max(12, width * 4) });
      activeObject.setCoords();
      canvas.renderAll();
    }
  }, [activeTool]);

  const applyColor = useCallback((nextColor: string) => {
    colorRef.current = nextColor;
    setColor(nextColor);
    localStorage.setItem("cap2clip.color", nextColor);
    const canvas = getCanvas();
    if (canvas?.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeTool === "highlight" ? `${nextColor}66` : nextColor;
    }
  }, [activeTool]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const canvas = getCanvas();
      const activeObj = canvas?.getActiveObject();
      if (activeObj && !(activeObj as any).isEditing) { e.preventDefault(); handleDelete(); }
    }
    if (e.ctrlKey && e.key === "z") { e.preventDefault(); handleUndo(); }
    if (e.ctrlKey && e.key === "y") { e.preventDefault(); handleRedo(); }
  }, [handleDelete, handleUndo, handleRedo]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    changeSize(strokeWidthRef.current + (e.deltaY < 0 ? 1 : -1));
  }, [changeSize]);

  // Bracket shortcuts must work even when the toolbar is not focused.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const canvas = getCanvas();
      if ((canvas?.getActiveObject() as any)?.isEditing) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (canvas?.getActiveObject()) { e.preventDefault(); handleDelete(); }
        return;
      }
      if (e.code === "BracketLeft" || e.code === "BracketRight") {
        e.preventDefault();
        changeSize(strokeWidthRef.current + (e.code === "BracketLeft" ? -1 : 1));
        return;
      }
      const shortcut = Object.entries(toolShortcuts).find(([, value]) => value && value.toLowerCase() === e.key.toLowerCase())?.[0] as Tool | undefined;
      if (shortcut) { e.preventDefault(); setTool(shortcut); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [changeSize, handleDelete, toolShortcuts]);

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".color-swatch-btn") && !target.closest(".color-picker-popup")) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColorPicker]);

  // Tools list — move on top as requested
  const tools: { id: Tool; icon: () => JSX.Element; label: string }[] = [
    { id: "move", icon: IconMove, label: "Drag selection" },
    { id: "edit", icon: IconEdit, label: "Edit annotations" },
    { id: "pen", icon: IconPen, label: "Pen" },
    { id: "line", icon: IconLine, label: "Line" },
    { id: "arrow", icon: IconArrow, label: "Arrow" },
    { id: "rect", icon: IconRect, label: "Rectangle" },
    { id: "ellipse", icon: IconEllipse, label: "Ellipse" },
    { id: "highlight", icon: IconHighlight, label: "Highlight" },
    { id: "blur", icon: IconBlur, label: "Blur — click to choose brush" },
    { id: "text", icon: IconText, label: "Text" },
  ];

  const displayStyle = visible ? {} : { opacity: 0, pointerEvents: "none" as const };

  return (
    <>
      {/* HORIZONTAL TOOLBAR: Copy, Save, Cancel, Undo, Redo, Delete, Resize Preset */}
      <div
        ref={hToolbarRef}
        className="annotation-toolbar annotation-toolbar-horizontal"
        style={{ left: horizontalLeft, top: horizontalTop, ...displayStyle }}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        tabIndex={0}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="toolbar-section toolbar-actions-row">
          <button className="action-btn-icon" onClick={onCopy} title="Copy (Ctrl+C)"><IconCopy /></button>
          <button className="action-btn-icon" onClick={onSaveDialog} title="Save as… (choose path)"><IconSave /></button>
          <label className="multi-region-toggle" title="Create and save each selected region as a separate PNG">
            <input
              type="checkbox"
              checked={multiRegion}
              onChange={(e) => onMultiRegionChange(e.target.checked)}
            />
            <span>Multi</span>
          </label>
          <button className="action-btn-icon" onClick={onCancel} title="Cancel (Esc)"><IconCancel /></button>
        </div>

        <div className="toolbar-divider" />

        {/* Undo / Redo / Delete on horizontal row */}
        <div className="toolbar-section toolbar-history-row">
          <button className="action-btn-icon" onClick={handleUndo} title="Undo (Ctrl+Z)"><IconUndo /></button>
          <button className="action-btn-icon" onClick={handleRedo} title="Redo (Ctrl+Y)"><IconRedo /></button>
          <button className="action-btn-icon" onClick={handleDelete} title="Delete"><IconTrash /></button>
        </div>

        {presets.length > 0 && (
          <>
            <div className="toolbar-divider" />
            <div className="toolbar-section">
              <div className="preset-dropdown-wrapper">
                <button
                  className="action-btn-icon preset-btn"
                  onClick={(e) => { e.stopPropagation(); setShowPresetDropdown(!showPresetDropdown); }}
                  title="Resize preset"
                >
                  <IconResizePreset />
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
          </>
        )}
      </div>

      {/* VERTICAL TOOLBAR: Drawing tools (move at top), color, stroke, font size */}
      <div
        ref={vToolbarRef}
        className="annotation-toolbar annotation-toolbar-vertical"
        style={{ left: safeVerticalLeft, top: safeVerticalTop, ...displayStyle }}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <div className="toolbar-section vertical">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                className={`tool-btn ${tool.id === "blur" ? "blur-tool-button" : ""} ${activeTool === tool.id ? "active" : ""}`}
                onClick={() => {
                  setTool(tool.id);
                  if (tool.id === "blur") setShowBlurPicker((open) => !open);
                }}
                title={tool.label}
              >
                <Icon />
              </button>
            );
          })}
          {showBlurPicker && activeTool === "blur" && (
            <div className="blur-picker-popup" onMouseDown={(e) => e.stopPropagation()}>
              <div className="blur-picker-title">Blur brush</div>
              {[
                ["soft", "Soft blur", "Smooth Gaussian-style blur"],
                ["pixelate", "Pixelate", "Mosaic blocks for strong redaction"],
                ["solid", "Solid mask", "Opaque cover for sensitive data"],
              ].map(([id, label, description]) => (
                <button
                  key={id}
                  className={`blur-option ${blurBrush === id ? "active" : ""}`}
                  onClick={() => selectBlurBrush(id)}
                  title={description}
                >
                  <span className={`blur-option-preview blur-${id}`} />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar-divider toolbar-divider-h" />

        <div className="toolbar-section vertical color-control">
          <button
            className="color-swatch-btn"
            style={{ backgroundColor: color }}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Color"
          />
          {showColorPicker && (
            <div className="color-picker-popup color-picker-popup-right" onMouseDown={(e) => e.stopPropagation()}>
              <div className="color-grid">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`color-option ${color === c ? "active" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => { applyColor(c); setShowColorPicker(false); }}
                    title={c}
                  />
                ))}
              </div>
              <div className="color-custom-row">
                <input
                  type="color"
                  className="color-custom-input"
                  value={color}
                  onChange={(e) => { applyColor(e.target.value); setShowColorPicker(false); }}
                />
                <span className="color-custom-label">Custom</span>
              </div>
            </div>
          )}
        </div>

        <div className="toolbar-divider toolbar-divider-h" />

        <div className="toolbar-section vertical stroke-section">
          <input
            type="range"
            className="stroke-slider"
            min="1"
            max="20"
            value={strokeWidth}
            onChange={(e) => changeSize(Number(e.target.value))}
            title={`${strokeWidth}px`}
          />
          <span className="stroke-value">{strokeWidth}</span>
        </div>
      </div>
    </>
  );
}

export default AnnotationToolbar;