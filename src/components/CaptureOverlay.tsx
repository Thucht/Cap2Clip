import { useState, useCallback, useRef, useEffect } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";
import type { Preset, SelectionGeometry } from "../App";

interface CaptureOverlayProps {
  phase: "selecting" | "annotating";
  screenshot: string | null;
  selectionRect: SelectionGeometry | null;
  presets: Preset[];
  onSelectionComplete: (rect: SelectionGeometry) => void;
  onCopy: (finalImage: string) => void;
  onSave: (finalImage: string) => void;
  onCancel: () => void;
  shortcutCopy: string;
  shortcutSave: string;
}

export function CaptureOverlay({
  phase,
  screenshot,
  selectionRect: initialRect,
  presets,
  onSelectionComplete,
  onCopy,
  onSave,
  onCancel,
}: CaptureOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<SelectionGeometry | null>(initialRect);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, rect: { x: 0, y: 0, w: 0, h: 0 } });
  const [moveStart, setMoveStart] = useState({ x: 0, y: 0, rectX: 0, rectY: 0 });
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<any>(null);

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  // Clamp rect to screen bounds
  const clampRect = useCallback((rect: { x: number; y: number; w: number; h: number }): SelectionGeometry => {
    let { x, y, w, h } = rect;
    w = Math.max(10, Math.min(w, screenW));
    h = Math.max(10, Math.min(h, screenH));
    x = Math.max(0, Math.min(x, screenW - w));
    y = Math.max(0, Math.min(y, screenH - h));
    return { x, y, width: w, height: h };
  }, [screenW, screenH]);

  // Get aspect ratio from active preset
  const getAspectRatio = useCallback((): number | null => {
    if (!activePreset || activePreset.type === "free") return null;
    if (activePreset.width > 0 && activePreset.height > 0) {
      return activePreset.width / activePreset.height;
    }
    return null;
  }, [activePreset]);

  // Apply aspect ratio constraint
  const applyAspectRatio = useCallback((w: number, h: number, ratio: number | null): { w: number; h: number } => {
    if (!ratio) return { w, h };
    if (w / h > ratio) {
      w = h * ratio;
    } else {
      h = w / ratio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, []);

  // Handle drag for new selection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (phase !== "selecting") return;
      // Only start a new drag if clicking outside the current selection
      if (currentRect) {
        const inX = e.clientX >= currentRect.x && e.clientX <= currentRect.x + currentRect.width;
        const inY = e.clientY >= currentRect.y && e.clientY <= currentRect.y + currentRect.height;
        if (inX && inY) return; // let move handle it
      }
      setIsDragging(true);
      setStartPoint({ x: e.clientX, y: e.clientY });
      setCurrentRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
    },
    [phase, currentRect]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (phase !== "selecting") return;

      if (isResizing && currentRect) {
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        const r = resizeStart.rect;
        const ratio = getAspectRatio();

        let newRect = { ...r };

        switch (isResizing) {
          case "nw":
            newRect.x = r.x + dx;
            newRect.y = r.y + dy;
            newRect.w = r.w - dx;
            newRect.h = r.h - dy;
            break;
          case "n":
            newRect.y = r.y + dy;
            newRect.h = r.h - dy;
            break;
          case "ne":
            newRect.y = r.y + dy;
            newRect.w = r.w + dx;
            newRect.h = r.h - dy;
            break;
          case "w":
            newRect.x = r.x + dx;
            newRect.w = r.w - dx;
            break;
          case "e":
            newRect.w = r.w + dx;
            break;
          case "sw":
            newRect.x = r.x + dx;
            newRect.w = r.w - dx;
            newRect.h = r.h + dy;
            break;
          case "s":
            newRect.h = r.h + dy;
            break;
          case "se":
            newRect.w = r.w + dx;
            newRect.h = r.h + dy;
            break;
        }

        if (ratio) {
          const constrained = applyAspectRatio(newRect.w, newRect.h, ratio);
          newRect.w = constrained.w;
          newRect.h = constrained.h;
        }
        if (newRect.w < 10) newRect.w = 10;
        if (newRect.h < 10) newRect.h = 10;
        setCurrentRect(clampRect(newRect));
      } else if (isMoving && currentRect) {
        const dx = e.clientX - moveStart.x;
        const dy = e.clientY - moveStart.y;
        const newX = moveStart.rectX + dx;
        const newY = moveStart.rectY + dy;
        setCurrentRect(clampRect({ x: newX, y: newY, w: currentRect.width, h: currentRect.height }));
      } else if (isDragging) {
        const x = Math.min(startPoint.x, e.clientX);
        const y = Math.min(startPoint.y, e.clientY);
        let w = Math.abs(e.clientX - startPoint.x);
        let h = Math.abs(e.clientY - startPoint.y);

        const ratio = getAspectRatio();
        if (ratio) {
          const constrained = applyAspectRatio(w, h, ratio);
          w = constrained.w;
          h = constrained.h;
        }

        setCurrentRect(clampRect({ x, y, w, h }));
      }
    },
    [phase, isDragging, isResizing, isMoving, startPoint, resizeStart, moveStart, currentRect, getAspectRatio, applyAspectRatio, clampRect]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && currentRect && currentRect.width > 5 && currentRect.height > 5) {
      // Auto-apply: immediately proceed to capture
      onSelectionComplete(currentRect);
    }
    setIsDragging(false);
    setIsResizing(null);
    setIsMoving(false);
  }, [isDragging, currentRect, onSelectionComplete]);

  // Handle resize start
  const handleResizeStart = useCallback(
    (handle: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!currentRect) return;
      setIsResizing(handle);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        rect: { x: currentRect.x, y: currentRect.y, w: currentRect.width, h: currentRect.height },
      });
    },
    [currentRect]
  );

  // Handle move start
  const handleMoveStart = useCallback(
    (e: React.MouseEvent) => {
      if (phase !== "selecting" || !currentRect) return;
      e.stopPropagation();
      setIsMoving(true);
      setMoveStart({
        x: e.clientX,
        y: e.clientY,
        rectX: currentRect.x,
        rectY: currentRect.y,
      });
    },
    [phase, currentRect]
  );

  // Preset selection - apply immediately during selecting phase
  const handlePresetSelect = useCallback((preset: Preset) => {
    setActivePreset(preset);

    if (preset.type === "free") {
      // Keep current rect, just remove ratio constraint
      return;
    }

    if (preset.type === "fixed_size") {
      const x = Math.max(0, Math.round((screenW - preset.width) / 2));
      const y = Math.max(0, Math.round((screenH - preset.height) / 2));
      setCurrentRect(clampRect({ x, y, w: preset.width, h: preset.height }));
    } else if (preset.type === "aspect_ratio") {
      const initialW = Math.min(800, screenW - 100);
      const initialH = initialW * (preset.height / preset.width);
      const x = Math.max(0, Math.round((screenW - initialW) / 2));
      const y = Math.max(0, Math.round((screenH - initialH) / 2));
      setCurrentRect(clampRect({ x, y, w: Math.round(initialW), h: Math.round(initialH) }));
    }
  }, [screenW, screenH, clampRect]);

  // Handle capture/annotate after selecting via preset
  const handleConfirmFromPreset = useCallback(() => {
    if (currentRect && currentRect.width > 5 && currentRect.height > 5) {
      onSelectionComplete(currentRect);
    }
  }, [currentRect, onSelectionComplete]);

  const handleCopyClick = useCallback(() => {
    if (canvasRef.current?.toDataURL) {
      const dataUrl = canvasRef.current.toDataURL({ format: "png", multiplier: 1 });
      onCopy(dataUrl);
    }
  }, [onCopy]);

  const handleSaveClick = useCallback(() => {
    if (canvasRef.current?.toDataURL) {
      const dataUrl = canvasRef.current.toDataURL({ format: "png", multiplier: 1 });
      onSave(dataUrl);
    }
  }, [onSave]);

  // Keyboard shortcuts during capture/annotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase === "annotating") {
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
          e.preventDefault();
          handleCopyClick();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          handleSaveClick();
        }
      }
      // Enter: confirm preset selection
      if (phase === "selecting" && e.key === "Enter" && currentRect && currentRect.width > 5) {
        e.preventDefault();
        handleConfirmFromPreset();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, currentRect, handleCopyClick, handleSaveClick, handleConfirmFromPreset, onCancel]);

  const renderBackdrops = () => {
    if (!currentRect) return null;
    const { x, y, width: w, height: h } = currentRect;
    return (
      <>
        <div className="backdrop" style={{ top: 0, left: 0, right: 0, height: y }} />
        <div className="backdrop" style={{ top: y + h, left: 0, right: 0, bottom: 0 }} />
        <div className="backdrop" style={{ top: y, left: 0, width: x, height: h }} />
        <div className="backdrop" style={{ top: y, left: x + w, right: 0, height: h }} />
      </>
    );
  };

  const handles = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

  return (
    <div
      className="capture-overlay"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {phase === "selecting" && (
        <>
          {renderBackdrops()}

          {/* Hint */}
          <div className="capture-hint">
            {currentRect
              ? `${currentRect.width} × ${currentRect.height} • Drag inside to move • Drag edges to resize • Enter to confirm`
              : "Click and drag to select region • Or choose a preset below"}
          </div>

          {/* Preset selector */}
          <div className="preset-selector">
            <select
              className="preset-select-input"
              value={activePreset?.id || ""}
              onChange={(e) => {
                const p = presets.find((pp) => pp.id === e.target.value);
                if (p) handlePresetSelect(p);
              }}
            >
              <option value="">Choose preset...</option>
              {presets.sort((a, b) => a.order - b.order).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {activePreset && currentRect && (
              <button
                className="preset-confirm-btn"
                onClick={handleConfirmFromPreset}
                title="Confirm selection (Enter)"
              >
                ✓ Capture
              </button>
            )}
          </div>

          {/* Selection rectangle */}
          {currentRect && currentRect.width > 0 && currentRect.height > 0 && (
            <div
              className="selection-rect"
              style={{
                left: currentRect.x,
                top: currentRect.y,
                width: currentRect.width,
                height: currentRect.height,
              }}
              onMouseDown={handleMoveStart}
            >
              <div className="selection-size">
                {currentRect.width} × {currentRect.height}
              </div>

              {/* Resize handles */}
              {handles.map((h) => (
                <div
                  key={h}
                  className={`handle handle-${h}`}
                  onMouseDown={(e) => handleResizeStart(h, e)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {phase === "annotating" && screenshot && initialRect && (
        <>
          {renderBackdrops()}

          <div
            className="annotation-area"
            style={{
              left: initialRect.x,
              top: initialRect.y,
              width: initialRect.width,
              height: initialRect.height,
            }}
          >
            <AnnotationCanvas
              ref={canvasRef}
              screenshot={screenshot}
              width={initialRect.width}
              height={initialRect.height}
            />
          </div>

          <AnnotationToolbar
            onCopy={handleCopyClick}
            onSave={handleSaveClick}
            onCancel={onCancel}
            canvasRef={canvasRef}
          />
        </>
      )}
    </div>
  );
}

export default CaptureOverlay;