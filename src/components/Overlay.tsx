import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureResult {
  image_data: string;
  width: number;
  height: number;
}

interface OverlayProps {
  onCaptureComplete: (imageData: string) => void;
}

export function Overlay({ onCaptureComplete }: OverlayProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<SelectionRect | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle mouse down - start selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCapturing) return;
    
    setIsSelecting(true);
    setStartPoint({ x: e.clientX, y: e.clientY });
    setCurrentRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
  }, [isCapturing]);

  // Handle mouse move - update selection rectangle
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting) return;
    
    const newRect = {
      x: Math.min(startPoint.x, e.clientX),
      y: Math.min(startPoint.y, e.clientY),
      width: Math.abs(e.clientX - startPoint.x),
      height: Math.abs(e.clientY - startPoint.y),
    };
    setCurrentRect(newRect);
  }, [isSelecting, startPoint]);

  // Handle mouse up - complete selection and capture
  const handleMouseUp = useCallback(async () => {
    if (!isSelecting || !currentRect) return;
    
    setIsSelecting(false);
    
    // Minimum selection size check
    if (currentRect.width < 10 || currentRect.height < 10) {
      setCurrentRect(null);
      return;
    }
    
    // Capture the screen
    setIsCapturing(true);
    try {
      const result = await invoke<CaptureResult>("capture_screen");
      
      // Create a canvas to crop the screenshot to the selection
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");
      
      const img = new Image();
      img.src = result.image_data;
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Scale coordinates to match the image dimensions
          const scaleX = img.width / window.innerWidth;
          const scaleY = img.height / window.innerHeight;
          
          const cropX = currentRect.x * scaleX;
          const cropY = currentRect.y * scaleY;
          const cropWidth = currentRect.width * scaleX;
          const cropHeight = currentRect.height * scaleY;
          
          canvas.width = currentRect.width;
          canvas.height = currentRect.height;
          
          ctx.drawImage(
            img,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, currentRect.width, currentRect.height
          );
          resolve();
        };
        img.onerror = reject;
      });
      
      const croppedImage = canvas.toDataURL("image/png");
      onCaptureComplete(croppedImage);
    } catch (error) {
      console.error("Capture failed:", error);
    } finally {
      setIsCapturing(false);
    }
  }, [isSelecting, currentRect, onCaptureComplete]);

  // Reset selection on right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentRect(null);
    setIsSelecting(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="overlay-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      {/* Instructions */}
      <div className="overlay-instructions">
        {isCapturing ? (
          <span>Capturing...</span>
        ) : currentRect ? (
          <span>
            {currentRect.width} × {currentRect.height} — Release to capture
          </span>
        ) : (
          <span>
            Click and drag to select an area • Right-click to reset • Press Esc to close
          </span>
        )}
      </div>
      
      {/* Selection rectangle */}
      {currentRect && currentRect.width > 0 && currentRect.height > 0 && (
        <div
          className="selection-box"
          style={{
            left: currentRect.x,
            top: currentRect.y,
            width: currentRect.width,
            height: currentRect.height,
          }}
        >
          <div className="selection-info">
            {currentRect.width} × {currentRect.height}
          </div>
          <div className="selection-handle nw" />
          <div className="selection-handle ne" />
          <div className="selection-handle sw" />
          <div className="selection-handle se" />
        </div>
      )}
    </div>
  );
}

export default Overlay;
