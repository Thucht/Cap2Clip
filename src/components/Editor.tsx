import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Canvas, Rect, Circle, IText, Line, PencilBrush } from "fabric";
import {
  MousePointer2,
  Square,
  Circle as CircleIcon,
  Type,
  ArrowRight,
  Pencil,
  Undo2,
  Save,
  X,
  Copy,
  Trash2,
  Palette,
} from "lucide-react";

type Tool = "select" | "rect" | "circle" | "arrow" | "pencil" | "text";

interface EditorProps {
  screenshot: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export function Editor({ screenshot, onSave, onCancel }: EditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [color, setColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      selection: true,
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;

    // Load screenshot as background
    const img = new Image();
    img.onload = () => {
      // @ts-expect-error - Fabric.js types are incomplete
      canvas.backgroundImage = screenshot;
      canvas.renderAll();
      canvas.setDimensions({ width: img.width, height: img.height });
      
      // Save initial state
      saveToHistory();
    };
    img.src = screenshot;

    // Object modified handler for history
    canvas.on("object:modified", () => {
      saveToHistory();
    });

    return () => {
      canvas.dispose();
    };
  }, [screenshot]);

  // Save canvas state to history
  const saveToHistory = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const json = JSON.stringify(canvas.toJSON());
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(json);
    
    // Limit history to 50 items
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Set up drawing tool
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    canvas.selection = activeTool === "select";

    if (activeTool === "pencil") {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
  }, [activeTool, color, strokeWidth]);

  // Handle tool selection
  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool);
    
    if (tool === "rect") {
      addRect();
    } else if (tool === "circle") {
      addCircle();
    } else if (tool === "arrow") {
      addArrow();
    } else if (tool === "text") {
      addText();
    }
  };

  // Add rectangle
  const addRect = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const rect = new Rect({
      left: 100,
      top: 100,
      width: 150,
      height: 100,
      fill: "transparent",
      stroke: color,
      strokeWidth: strokeWidth,
      strokeUniform: true,
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    saveToHistory();
  };

  // Add circle
  const addCircle = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const circle = new Circle({
      left: 100,
      top: 100,
      radius: 50,
      fill: "transparent",
      stroke: color,
      strokeWidth: strokeWidth,
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    saveToHistory();
  };

  // Add arrow (line with arrowhead)
  const addArrow = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const line = new Line([50, 50, 200, 50], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: "round",
    });
    canvas.add(line);
    canvas.setActiveObject(line);
    saveToHistory();
  };

  // Add text
  const addText = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const text = new IText("Click to edit", {
      left: 100,
      top: 100,
      fontSize: 24,
      fill: color,
      fontFamily: "Arial",
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    saveToHistory();
  };

  // Undo
  const handleUndo = () => {
    if (historyIndex <= 0) return;

    const canvas = fabricRef.current;
    if (!canvas) return;

    const newIndex = historyIndex - 1;
    canvas.loadFromJSON(JSON.parse(history[newIndex]), () => {
      canvas.renderAll();
      setHistoryIndex(newIndex);
    });
  };

  // Delete selected object
  const handleDelete = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
      saveToHistory();
    }
  };

  // Save screenshot
  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });

    try {
      await invoke("save_screenshot", {
        dataUrl,
        suggestedName: null,
      });
      onSave(dataUrl);
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });

    try {
      await invoke("copy_image_to_clipboard", {
        dataUrl,
      });
      alert("Copied to clipboard!");
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            className={activeTool === "select" ? "active" : ""}
            onClick={() => setActiveTool("select")}
            title="Select (V)"
          >
            <MousePointer2 size={20} />
          </button>
          <button
            className={activeTool === "rect" ? "active" : ""}
            onClick={() => handleToolSelect("rect")}
            title="Rectangle (R)"
          >
            <Square size={20} />
          </button>
          <button
            className={activeTool === "circle" ? "active" : ""}
            onClick={() => handleToolSelect("circle")}
            title="Circle (C)"
          >
            <CircleIcon size={20} />
          </button>
          <button
            className={activeTool === "arrow" ? "active" : ""}
            onClick={() => handleToolSelect("arrow")}
            title="Arrow (A)"
          >
            <ArrowRight size={20} />
          </button>
          <button
            className={activeTool === "pencil" ? "active" : ""}
            onClick={() => setActiveTool("pencil")}
            title="Pencil (P)"
          >
            <Pencil size={20} />
          </button>
          <button
            className={activeTool === "text" ? "active" : ""}
            onClick={() => handleToolSelect("text")}
            title="Text (T)"
          >
            <Type size={20} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <div className="color-picker-wrapper">
            <Palette size={16} />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Color"
            />
          </div>
          <div className="stroke-width-wrapper">
            <input
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              title={`Stroke: ${strokeWidth}px`}
            />
            <span className="stroke-value">{strokeWidth}</span>
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button onClick={handleUndo} title="Undo (Ctrl+Z)" disabled={historyIndex <= 0}>
            <Undo2 size={20} />
          </button>
          <button onClick={handleDelete} title="Delete (Del)">
            <Trash2 size={20} />
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <button onClick={handleCopy} title="Copy to Clipboard">
            <Copy size={20} />
          </button>
          <button onClick={handleSave} className="btn-primary" title="Save (Ctrl+S)">
            <Save size={20} />
            <span>Save</span>
          </button>
          <button onClick={onCancel} className="btn-secondary" title="Cancel (Esc)">
            <X size={20} />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      <div className="editor-canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

export default Editor;
