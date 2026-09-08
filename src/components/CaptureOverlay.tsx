import { useState, useCallback, useRef, useEffect } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";
import type { Tool } from "./AnnotationToolbar";
import type { Preset, SelectionGeometry } from "../App";
import { calculateImageMapping, clampSelection, toImageRect } from "../geometry";

interface CaptureOverlayProps {
  phase: "selecting" | "annotating";
  fullScreenshot: string | null;
  captureSize: { width: number; height: number };
  selectionRect: SelectionGeometry | null;
  presets: Preset[];
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onEnterAnnotate: (rect: SelectionGeometry) => void;
  onCopy: (finalImage: string) => void;
  onSaveDialog: (images: string[]) => void;
  onQuickSave: (images: string[]) => void;
  onCancel: () => void;
  shortcutCopy: string;
  shortcutSave: string;
  toolShortcuts?: { [key: string]: string };
}

export function CaptureOverlay({
  phase,
  fullScreenshot,
  captureSize,
  selectionRect,
  presets,
  activeTool,
  onToolChange,
  onEnterAnnotate,
  onCopy,
  onSaveDialog,
  onQuickSave,
  onCancel,
  toolShortcuts,
}: CaptureOverlayProps) {
  const [rect, setRect] = useState<SelectionGeometry | null>(selectionRect);
  const [isDragging, setIsDragging] = useState(false);
  const [draftRect, setDraftRect] = useState<SelectionGeometry | null>(null);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, rx: 0, ry: 0, rw: 0, rh: 0 });
  const [moveStart, setMoveStart] = useState({ x: 0, y: 0, rx: 0, ry: 0 });
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [multiRegion, setMultiRegion] = useState(false);
  const [regionRects, setRegionRects] = useState<SelectionGeometry[]>(selectionRect ? [selectionRect] : []);
  // All multi-capture regions are cropped from this immutable frame.
  const [captureFrame, setCaptureFrame] = useState<string | null>(fullScreenshot);
  const [captureRects, setCaptureRects] = useState<SelectionGeometry[]>([]);
  const canvasRef = useRef<any>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const imageMapping = calculateImageMapping(captureSize.width, captureSize.height, screenW, screenH);

  // Initialize rect when entering selecting phase
  useEffect(() => {
    if (fullScreenshot && fullScreenshot !== captureFrame && phase === "selecting") {
      setCaptureFrame(fullScreenshot);
    }
  }, [fullScreenshot, captureFrame, phase]);

  useEffect(() => {
    if (phase === "selecting") {
      if (selectionRect) {
        const visibleRect = clampSelection(selectionRect, screenW, screenH);
        setRect(visibleRect);
        setRegionRects([visibleRect]);
      } else {
        setCaptureFrame(fullScreenshot);
        setRect(null);
        setRegionRects([]);
      }
      setIsDragging(false);
      setDraftRect(null);
      setIsResizing(null);
      setIsMoving(false);
      setShowPresetDropdown(false);
    }
  }, [phase, selectionRect]);

  // Sync rect when entering annotating phase
  useEffect(() => {
    if (phase === "annotating" && selectionRect) {
      const visibleRect = clampSelection(selectionRect, screenW, screenH);
      setRect(visibleRect);
      setRegionRects((current) => current.length > 0 ? current : [visibleRect]);
    }
  }, [phase, selectionRect]);

  const clamp = useCallback((x: number, y: number, w: number, h: number): SelectionGeometry => {
    w = Math.max(10, Math.min(w, screenW));
    h = Math.max(10, Math.min(h, screenH));
    x = Math.max(0, Math.min(x, screenW - w));
    y = Math.max(0, Math.min(y, screenH - h));
    return { x, y, width: w, height: h };
  }, [screenW, screenH]);

  const getAspectRatio = useCallback((): number | null => {
    if (!activePreset || activePreset.type === "free") return null;
    if (activePreset.width > 0 && activePreset.height > 0) {
      return activePreset.width / activePreset.height;
    }
    return null;
  }, [activePreset]);

  const constrainRatio = useCallback((w: number, h: number): { w: number; h: number } => {
    const ratio = getAspectRatio();
    if (!ratio) return { w, h };
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    return { w: Math.round(w), h: Math.round(h) };
  }, [getAspectRatio]);

  const setActiveRect = useCallback((next: SelectionGeometry) => {
    setRect(next);
    if (phase === "annotating" && multiRegion) {
      setRegionRects((current) => current.map((item, index) =>
        index === current.length - 1 ? next : item
      ));
    }
  }, [phase, multiRegion]);

  // Background drag creates a new selection. In multi-region mode this also
  // preserves earlier regions in regionRects.
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (phase !== "selecting" && phase !== "annotating") return;

    if (rect) {
      const inX = e.clientX >= rect.x && e.clientX <= rect.x + rect.width;
      const inY = e.clientY >= rect.y && e.clientY <= rect.y + rect.height;
      if (inX && inY) return;
    }

    e.preventDefault();
    setIsDragging(true);
    setStartPoint({ x: e.clientX, y: e.clientY });
    setDraftRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
  }, [phase, rect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!rect) return;

    // Resize
    if (isResizing) {
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      let { rx, ry, rw, rh } = resizeStart;
      let nx = rx, ny = ry, nw = rw, nh = rh;

      switch (isResizing) {
        case "nw": nx = rx + dx; ny = ry + dy; nw = rw - dx; nh = rh - dy; break;
        case "n":  ny = ry + dy; nh = rh - dy; break;
        case "ne": ny = ry + dy; nw = rw + dx; nh = rh - dy; break;
        case "w":  nx = rx + dx; nw = rw - dx; break;
        case "e":  nw = rw + dx; break;
        case "sw": nx = rx + dx; nw = rw - dx; nh = rh + dy; break;
        case "s":  nh = rh + dy; break;
        case "se": nw = rw + dx; nh = rh + dy; break;
      }

      const constrained = constrainRatio(nw, nh);
      nw = constrained.w;
      nh = constrained.h;

      if (isResizing === "nw" || isResizing === "w" || isResizing === "sw") nx = rx + rw - nw;
      if (isResizing === "nw" || isResizing === "n" || isResizing === "ne") ny = ry + rh - nh;

      if (nw >= 10 && nh >= 10) setActiveRect(clamp(nx, ny, nw, nh));
    }
    // Move
    else if (isMoving) {
      const dx = e.clientX - moveStart.x;
      const dy = e.clientY - moveStart.y;
      setActiveRect(clamp(moveStart.rx + dx, moveStart.ry + dy, rect.width, rect.height));
    }
    // Drag new selection
    else if (isDragging) {
      const x = Math.min(startPoint.x, e.clientX);
      const y = Math.min(startPoint.y, e.clientY);
      const w = Math.abs(e.clientX - startPoint.x);
      const h = Math.abs(e.clientY - startPoint.y);
      setDraftRect(clamp(x, y, w, h));
    }
  }, [rect, isResizing, isMoving, isDragging, startPoint, resizeStart, moveStart, clamp, constrainRatio, setActiveRect]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && draftRect && draftRect.width > 5 && draftRect.height > 5) {
      if (phase === "annotating" && multiRegion) {
        setRegionRects((current) => [...current, draftRect]);
        setCaptureRects((current) => [...current, draftRect]);
      } else {
        setRegionRects([draftRect]);
        setCaptureRects([draftRect]);
      }
      setRect(draftRect);
      onEnterAnnotate(draftRect);
    } else if (isResizing || isMoving) {
      onEnterAnnotate(rect!);
    }
    setDraftRect(null);
    setIsDragging(false);
    setIsResizing(null);
    setIsMoving(false);
  }, [isDragging, draftRect, isResizing, isMoving, rect, phase, multiRegion, onEnterAnnotate]);

  // Resize handle mouse down - works in BOTH phases
  const handleResizeStart = useCallback((handle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!rect) return;
    setIsResizing(handle);
    setResizeStart({ x: e.clientX, y: e.clientY, rx: rect.x, ry: rect.y, rw: rect.width, rh: rect.height });
  }, [rect]);

  // Move handle mouse down - works in BOTH phases
  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    if (!rect) return;
    e.stopPropagation();
    setIsMoving(true);
    setMoveStart({ x: e.clientX, y: e.clientY, rx: rect.x, ry: rect.y });
  }, [rect]);

  // Preset selection
  const handlePresetSelect = useCallback((preset: Preset) => {
    setActivePreset(preset);
    setShowPresetDropdown(false);

    if (preset.type === "free") return;

    let newRect: SelectionGeometry;
    if (preset.type === "fixed_size") {
      const x = Math.max(0, Math.round((screenW - preset.width) / 2));
      const y = Math.max(0, Math.round((screenH - preset.height) / 2));
      newRect = clamp(x, y, preset.width, preset.height);
    } else {
      const maxW = screenW * 0.8;
      const maxH = screenH * 0.8;
      const ratio = preset.width / preset.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      const x = Math.max(0, Math.round((screenW - w) / 2));
      const y = Math.max(0, Math.round((screenH - h) / 2));
      newRect = clamp(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }

    setRect(newRect);

    if (phase === "annotating") {
      onEnterAnnotate(newRect);
    }
  }, [screenW, screenH, clamp, phase, onEnterAnnotate]);

  const cropRegion = useCallback((region: SelectionGeometry): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!fullScreenshot) {
        reject(new Error("No screenshot available"));
        return;
      }
      const image = new Image();
      image.onload = () => {
        const imageRect = toImageRect(region, imageMapping);
        const crop = document.createElement("canvas");
        crop.width = Math.max(1, Math.round(imageRect.width));
        crop.height = Math.max(1, Math.round(imageRect.height));
        const context = crop.getContext("2d");
        if (!context) {
          reject(new Error("Could not create crop canvas"));
          return;
        }
        context.drawImage(
          image,
          imageRect.x, imageRect.y, imageRect.width, imageRect.height,
          0, 0, crop.width, crop.height
        );
        resolve(crop.toDataURL("image/png"));
      };
      image.onerror = () => reject(new Error("Could not load screenshot"));
      image.src = captureFrame || fullScreenshot;
    });
  }, [captureFrame, fullScreenshot, imageMapping.scaleX, imageMapping.scaleY]);

  const getExportImages = useCallback(async (): Promise<string[]> => {
    if (!multiRegion || regionRects.length <= 1) {
      if (!canvasRef.current?.toDataURL) return [];
      return [canvasRef.current.toDataURL({ format: "png", multiplier: imageMapping.scaleX })];
    }

    const images: string[] = [];
    for (let index = 0; index < regionRects.length; index += 1) {
      const isActiveRegion = index === regionRects.length - 1;
      if (isActiveRegion && canvasRef.current?.toDataURL) {
        images.push(canvasRef.current.toDataURL({ format: "png", multiplier: imageMapping.scaleX }));
      } else {
        images.push(await cropRegion(regionRects[index]));
      }
    }
    return images;
  }, [multiRegion, regionRects, cropRegion, imageMapping.scaleX]);

  const handleCopyClick = useCallback(() => {
    if (canvasRef.current?.toDataURL) {
      const dataUrl = canvasRef.current.toDataURL({ format: "png", multiplier: imageMapping.scaleX });
      onCopy(dataUrl);
    }
  }, [imageMapping.scaleX, onCopy]);

  const handleSaveClick = useCallback(async () => {
    try {
      onSaveDialog(await getExportImages());
    } catch (error) {
      console.error("Preparing save failed:", error);
    }
  }, [getExportImages, onSaveDialog]);

  const handleQuickSaveClick = useCallback(async () => {
    try {
      onQuickSave(await getExportImages());
    } catch (error) {
      console.error("Preparing quick save failed:", error);
    }
  }, [getExportImages, onQuickSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase === "annotating") {
        if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); handleCopyClick(); }
        if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleQuickSaveClick(); }
      }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, handleCopyClick, handleQuickSaveClick, onCancel]);

  // Render backdrops (darkened areas outside selection)
  const renderBackdrops = () => {
    if (!rect) return null;
    const { x, y, width: w, height: h } = rect;
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

  const cursorStyle = isResizing
    ? (isResizing === "n" || isResizing === "s" ? "ns-resize" :
       isResizing === "e" || isResizing === "w" ? "ew-resize" :
       isResizing === "nw" || isResizing === "se" ? "nwse-resize" : "nesw-resize")
    : isMoving ? "move" : "crosshair";

  // Render resize handles
  const renderHandles = () => (
    <>
      {handles.map((h) => (
        <div
          key={h}
          className={`handle handle-${h}`}
          onMouseDown={(e) => handleResizeStart(h, e)}
        />
      ))}
    </>
  );

  const renderSelectionDraft = () => {
    if (!isDragging || !draftRect || draftRect.width < 1 || draftRect.height < 1) return null;
    return (
      <div
        className="selection-draft"
        style={{ left: draftRect.x, top: draftRect.y, width: draftRect.width, height: draftRect.height }}
      >
        <span>{Math.round(draftRect.width)} × {Math.round(draftRect.height)}</span>
      </div>
    );
  };

  // Edges are resize targets, never pan targets. The eight handles below
  // provide enlarged hit areas; the interior is the only move surface.
  const renderMoveZones = () => null;

  // Interior overlay for "move" tool — covers the inside of the rect so any click drags the selection
  const renderInteriorMove = () => {
    if (!rect) return null;
    const { x, y, width: w, height: h } = rect;
    return (
      <div
        className="interior-move"
        style={{ left: x, top: y, width: w, height: h }}
        onMouseDown={handleMoveStart}
      />
    );
  };

  return (
    <div
      ref={overlayRef}
      className="capture-overlay"
      style={{ cursor: phase === "selecting" ? cursorStyle : isMoving ? "move" : "default" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* ======== SELECTION DRAFT ======== */}
      {renderSelectionDraft()}

      {/* ======== SELECTING PHASE ======== */}
      {phase === "selecting" && (
        <>
          {renderBackdrops()}

          {/* Hint text */}
          <div className="capture-hint">
            {!rect || rect.width < 5 ? (
              "Click and drag to select region"
            ) : (
              `${rect.width} × ${rect.height} — Drag edges to resize • Drag inside to move`
            )}
          </div>

          {/* Preset bar */}
          <div className="preset-bar" onMouseDown={(e) => e.stopPropagation()}>
            <div className="preset-dropdown-wrapper">
              <button
                className="preset-dropdown-trigger"
                onClick={(e) => { e.stopPropagation(); setShowPresetDropdown(!showPresetDropdown); }}
              >
                📐 {activePreset?.name || "Select Preset"} ▾
              </button>
              {showPresetDropdown && (
                <div className="preset-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                  {presets.filter(p => p.enabled).sort((a, b) => a.order - b.order).map((p) => (
                    <button
                      key={p.id}
                      className={`preset-dropdown-item ${activePreset?.id === p.id ? "active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePresetSelect(p); }}
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

          {/* Selection rectangle with handles */}
          {rect && rect.width > 0 && rect.height > 0 && (
            <div
              className="selection-rect"
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              onMouseDown={handleMoveStart}
            >
              <div className="selection-size">{rect.width} × {rect.height}</div>
              {renderHandles()}
            </div>
          )}
        </>
      )}

      {/* ======== ANNOTATING PHASE ======== */}
      {phase === "annotating" && fullScreenshot && rect && (
        <>
          {renderBackdrops()}

          {multiRegion && captureRects.slice(0, -1).map((region, index) => (
            <div
              key={`region-${index}`}
              className={`multi-region-outline region-${index % 5}`}
              style={{ left: region.x, top: region.y, width: region.width, height: region.height }}
            >
              <span>{index + 1}</span>
            </div>
          ))}

          {/* Annotation canvas - crops from fullScreenshot based on rect */}
          <div
            className="annotation-area"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          >
            <AnnotationCanvas
              ref={canvasRef}
              fullScreenshot={captureFrame || fullScreenshot}
              rect={rect}
              imageMapping={imageMapping}
            />
          </div>

          {/* Selection border visual (pointer-events: none in CSS) */}
          <div
            className="selection-rect selection-active"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          >
            <div className="selection-size">{rect.width} × {rect.height}</div>
            {renderHandles()}
          </div>

          {/* Interior drag layer (when move tool is active) */}
          {activeTool === "move" && renderInteriorMove()}

          {/* Move zones: edge grab areas for dragging the selection */}
          {renderMoveZones()}

          {/* Split toolbars: horizontal (actions) + vertical (drawing tools) */}
          <AnnotationToolbar
            onCopy={handleCopyClick}
            onSaveDialog={handleSaveClick}
            onCancel={onCancel}
            multiRegion={multiRegion}
            onMultiRegionChange={setMultiRegion}
            canvasRef={canvasRef}
            rect={rect}
            visible={true}
            activeTool={activeTool}
            onToolChange={onToolChange}
            presets={presets}
            activePreset={activePreset}
            onPresetSelect={handlePresetSelect}
            toolShortcuts={toolShortcuts}
          />
        </>
      )}
    </div>
  );
}

export default CaptureOverlay;