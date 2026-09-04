import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Canvas, FabricImage } from "fabric";
import type { SelectionGeometry } from "../App";

interface AnnotationCanvasProps {
  fullScreenshot: string;
  rect: SelectionGeometry;
}

/**
 * Displays the cropped region of the full screenshot as background.
 * When rect changes, we crop and display the new region.
 * On export (toDataURL), we output only the cropped region with annotations.
 */
export const AnnotationCanvas = forwardRef<any, AnnotationCanvasProps>(
  ({ fullScreenshot, rect }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    useImperativeHandle(ref, () => ({
      toDataURL: (opts?: any) => {
        if (fabricRef.current) {
          return fabricRef.current.toDataURL(opts || { format: "png", multiplier: 1 });
        }
        return fullScreenshot;
      },
      getCanvas: () => fabricRef.current,
    }));

    useEffect(() => {
      if (!canvasElRef.current) return;

      const canvas = new Canvas(canvasElRef.current, {
        width: rect.width,
        height: rect.height,
        selection: true,
        preserveObjectStacking: true,
      });

      fabricRef.current = canvas;

      // Load full screenshot, crop to rect region, use as background
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        updateBackground(canvas, img, rect);
      };
      img.src = fullScreenshot;

      return () => {
        canvas.dispose();
        fabricRef.current = null;
        imgRef.current = null;
      };
    }, [fullScreenshot, rect]);

    // Update background when rect changes (crop region)
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || !imgRef.current) return;

      // Resize canvas
      canvas.setDimensions({ width: rect.width, height: rect.height });

      updateBackground(canvas, imgRef.current, rect);
    }, [rect]);

    return (
      <div className="annotation-canvas-wrapper">
        <canvas ref={canvasElRef} />
      </div>
    );
  }
);

function updateBackground(canvas: Canvas, img: HTMLImageElement, rect: SelectionGeometry) {
  // Create a temporary canvas to crop the region
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = rect.width;
  tempCanvas.height = rect.height;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(
    img,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, rect.width, rect.height
  );

  const croppedDataUrl = tempCanvas.toDataURL("image/png");

  FabricImage.fromURL(croppedDataUrl).then((fabricImg) => {
    canvas.backgroundImage = fabricImg;
    canvas.renderAll();
  });
}

AnnotationCanvas.displayName = "AnnotationCanvas";
export default AnnotationCanvas;