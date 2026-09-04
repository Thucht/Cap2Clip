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
          return exportCanvasWithBlur(fabricRef.current, opts || { format: "png", multiplier: 1 });
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
    }, [fullScreenshot]);

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

function exportCanvasWithBlur(canvas: Canvas, opts: any): string {
  const blurObjects = canvas.getObjects().filter((object: any) => object.data?.kind === "blur");
  if (blurObjects.length === 0) return canvas.toDataURL(opts);

  const multiplier = opts.multiplier || 1;
  const output = document.createElement("canvas");
  output.width = canvas.getWidth() * multiplier;
  output.height = canvas.getHeight() * multiplier;
  const ctx = output.getContext("2d");
  if (!ctx) return canvas.toDataURL(opts);

  // Keep the background image as the immutable source for processing. Fabric's
  // lower canvas also contains controls/objects and is not reliable as source.
  const backgroundImage = (canvas as any).backgroundImage as any;
  const previousVisibility = blurObjects.map((object: any) => object.visible);
  blurObjects.forEach((object: any) => { object.visible = false; });
  canvas.renderAll();

  // Build the source from the clean screenshot background, not from Fabric's
  // lower canvas: Fabric may have had the transparent blur path removed by
  // the previous render and therefore has nothing useful to process here.
  const source = document.createElement("canvas");
  source.width = output.width;
  source.height = output.height;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) return canvas.toDataURL(opts);
  if (backgroundImage) {
    const bg = backgroundImage.getElement?.() || backgroundImage._element;
    const scaleX = backgroundImage.scaleX || 1;
    const scaleY = backgroundImage.scaleY || 1;
    sourceCtx.drawImage(bg, backgroundImage.left || 0, backgroundImage.top || 0,
      (backgroundImage.width || output.width) * scaleX,
      (backgroundImage.height || output.height) * scaleY);
  } else {
    sourceCtx.drawImage(canvas.lowerCanvasEl, 0, 0, output.width, output.height);
  }
  ctx.drawImage(source, 0, 0);
  for (const object of blurObjects as any[]) {
    const bounds = object.data.bounds || object.getBoundingRect();
    const pad = object.strokeWidth * 2;
    const x = Math.max(0, (bounds.left - pad) * multiplier);
    const y = Math.max(0, (bounds.top - pad) * multiplier);
    const width = Math.min(output.width - x, (bounds.width + pad * 2) * multiplier);
    const height = Math.min(output.height - y, (bounds.height + pad * 2) * multiplier);
    if (width <= 0 || height <= 0) continue;

    const patch = document.createElement("canvas");
    patch.width = Math.ceil(width);
    patch.height = Math.ceil(height);
    const patchCtx = patch.getContext("2d");
    if (!patchCtx) continue;
    patchCtx.drawImage(output, x, y, width, height, 0, 0, width, height);
    const mode = object.data.brush;
    if (mode === "solid") {
      patchCtx.fillStyle = "#202024";
      patchCtx.fillRect(0, 0, width, height);
    } else if (mode === "pixelate") {
      const block = Math.max(6, 10 * multiplier);
      patchCtx.imageSmoothingEnabled = false;
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.ceil(width / block));
      small.height = Math.max(1, Math.ceil(height / block));
      const smallCtx = small.getContext("2d");
      if (smallCtx) {
        smallCtx.imageSmoothingEnabled = true;
        smallCtx.drawImage(patch, 0, 0, small.width, small.height);
        patchCtx.clearRect(0, 0, width, height);
        patchCtx.imageSmoothingEnabled = false;
        patchCtx.drawImage(small, 0, 0, small.width, small.height, 0, 0, width, height);
      }
    } else {
      patchCtx.filter = `blur(${Math.max(4, 8 * multiplier)}px)`;
      patchCtx.drawImage(patch, 0, 0);
      patchCtx.filter = "none";
    }
    ctx.drawImage(patch, x, y);
  }

  // Restore the transparent blur paths after their pixels have been processed.
  blurObjects.forEach((object: any, index: number) => { object.visible = previousVisibility[index]; });
  canvas.renderAll();
  return output.toDataURL("image/png");
}

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