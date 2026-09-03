import { useState, useCallback, useRef } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";

interface CaptureOverlayProps {
  phase: "selecting" | "annotating";
  screenshot: string | null;
  selectionRect: { x: number; y: number; w: number; h: number } | null;
  onSelectionComplete: (rect: { x: number; y: number; w: number; h: number }) => void;
  onCopy: (finalImage: string) => void;
  onSave: (finalImage: string) => void;
  onCancel: () => void;
}

export function CaptureOverlay({
  phase,
  screenshot,
  selectionRect,
  onSelectionComplete,
  onCopy,
  onSave,
  onCancel,
}: CaptureOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, rect: { x: 0, y: 0, w: 0, h: 0 } });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<any>(null);

  // Selection handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (phase !== "selecting") return;
      setIsDragging(true);
      setStartPoint({ x: e.clientX, y: e.clientY });
      setCurrentRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    },
    [phase]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (phase !== "selecting") return;

      if (isResizing && currentRect) {
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        const r = resizeStart.rect;

        let newRect = { ...r };

        switch (isResizing) {
          case "nw":
            newRect.x = r.x + dx;
            newRect.y = r.y + dy;
            newRect.w = r.w - dx;
            newRect.h = r.h - dy;
            break;
          case "ne":
            newRect.y = r.y + dy;
            newRect.w = r.w + dx;
            newRect.h = r.h - dy;
            break;
          case "sw":
            newRect.x = r.x + dx;
            newRect.w = r.w - dx;
            newRect.h = r.h + dy;
            break;
          case "se":
            newRect.w = r.w + dx;
            newRect.h = r.h + dy;
            break;
          case "n":
            newRect.y = r.y + dy;
            newRect.h = r.h - dy;
            break;
          case "s":
            newRect.h = r.h + dy;
            break;
          case "w":
            newRect.x = r.x + dx;
            newRect.w = r.w - dx;
            break;
          case "e":
            newRect.w = r.w + dx;
            break;
        }

        // Ensure minimum size
        if (newRect.w < 10) newRect.w = 10;
        if (newRect.h < 10) newRect.h = 10;

        setCurrentRect(newRect);
        return;
      }

      if (!isDragging) return;

      const x = Math.min(startPoint.x, e.clientX);
      const y = Math.min(startPoint.y, e.clientY);
      const w = Math.abs(e.clientX - startPoint.x);
      const h = Math.abs(e.clientY - startPoint.y);

      setCurrentRect({ x, y, w, h });
    },
    [phase, isDragging, startPoint, isResizing, resizeStart, currentRect]
  );

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(null);
      return;
    }

    if (!isDragging || !currentRect) return;
    setIsDragging(false);

    if (currentRect.w > 10 && currentRect.h > 10) {
      onSelectionComplete(currentRect);
    } else {
      setCurrentRect(null);
    }
  }, [isDragging, isResizing, currentRect, onSelectionComplete]);

  const handleResizeStart = useCallback(
    (handle: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(handle);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        rect: currentRect || { x: 0, y: 0, w: 0, h: 0 },
      });
    },
    [currentRect]
  );

  // Get final image from annotation canvas
  const getFinalImage = useCallback((): string => {
    if (canvasRef.current) {
      return canvasRef.current.toDataURL({ format: "png", multiplier: 1 });
    }
    return screenshot || "";
  }, [screenshot]);

  const handleCopyClick = useCallback(() => {
    const img = getFinalImage();
    onCopy(img);
  }, [getFinalImage, onCopy]);

  const handleSaveClick = useCallback(() => {
    const img = getFinalImage();
    onSave(img);
  }, [getFinalImage, onSave]);

  return (
    <div
      ref={containerRef}
      className="capture-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Dark backdrop */}
      {phase === "selecting" && (
        <>
          {/* Top */}
          <div
            className="backdrop"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: currentRect ? currentRect.y : 0,
            }}
          />
          {/* Bottom */}
          <div
            className="backdrop"
            style={{
              top: currentRect ? currentRect.y + currentRect.h : 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          {/* Left */}
          <div
            className="backdrop"
            style={{
              top: currentRect ? currentRect.y : 0,
              left: 0,
              width: currentRect ? currentRect.x : 0,
              height: currentRect ? currentRect.h : 0,
            }}
          />
          {/* Right */}
          <div
            className="backdrop"
            style={{
              top: currentRect ? currentRect.y : 0,
              left: currentRect ? currentRect.x + currentRect.w : 0,
              right: 0,
              height: currentRect ? currentRect.h : 0,
            }}
          />
        </>
      )}

      {/* Hint text */}
      {phase === "selecting" && !currentRect && (
        <div className="capture-hint">
          Click and drag to select a region • Esc to cancel
        </div>
      )}

      {/* Selection rectangle */}
      {phase === "selecting" && currentRect && currentRect.w > 0 && (
        <div
          className="selection-rect"
          style={{
            left: currentRect.x,
            top: currentRect.y,
            width: currentRect.w,
            height: currentRect.h,
          }}
        >
          <div className="selection-size">
            {Math.round(currentRect.w)} × {Math.round(currentRect.h)}
          </div>
          {/* Resize handles */}
          {!isDragging && (
            <>
              <div className="handle handle-nw" onMouseDown={(e) => handleResizeStart("nw", e)} />
              <div className="handle handle-ne" onMouseDown={(e) => handleResizeStart("ne", e)} />
              <div className="handle handle-sw" onMouseDown={(e) => handleResizeStart("sw", e)} />
              <div className="handle handle-se" onMouseDown={(e) => handleResizeStart("se", e)} />
              <div className="handle handle-n" onMouseDown={(e) => handleResizeStart("n", e)} />
              <div className="handle handle-s" onMouseDown={(e) => handleResizeStart("s", e)} />
              <div className="handle handle-w" onMouseDown={(e) => handleResizeStart("w", e)} />
              <div className="handle handle-e" onMouseDown={(e) => handleResizeStart("e", e)} />
            </>
          )}
        </div>
      )}

      {/* Annotation phase */}
      {phase === "annotating" && screenshot && (
        <div
          className="annotation-area"
          style={{
            left: selectionRect?.x,
            top: selectionRect?.y,
            width: selectionRect?.w,
            height: selectionRect?.h,
          }}
        >
          <AnnotationCanvas
            ref={canvasRef}
            screenshot={screenshot}
            width={selectionRect?.w || 0}
            height={selectionRect?.h || 0}
          />

          {/* Toolbar positioned below the selection */}
          <AnnotationToolbar
            onCopy={handleCopyClick}
            onSave={handleSaveClick}
            onCancel={onCancel}
            canvasRef={canvasRef}
          />
        </div>
      )}
    </div>
  );
}

export default CaptureOverlay;