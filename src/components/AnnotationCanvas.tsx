import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Canvas, FabricImage } from "fabric";

interface AnnotationCanvasProps {
  screenshot: string;
  width: number;
  height: number;
}

export const AnnotationCanvas = forwardRef<any, AnnotationCanvasProps>(
  ({ screenshot, width, height }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<Canvas | null>(null);

    useImperativeHandle(ref, () => ({
      toDataURL: (opts?: any) => {
        if (fabricRef.current) {
          return fabricRef.current.toDataURL(opts || { format: "png", multiplier: 1 });
        }
        return screenshot;
      },
      getCanvas: () => fabricRef.current,
    }));

    useEffect(() => {
      if (!canvasElRef.current) return;

      const canvas = new Canvas(canvasElRef.current, {
        width,
        height,
        selection: true,
        preserveObjectStacking: true,
      });

      fabricRef.current = canvas;

      // Load screenshot as background
      FabricImage.fromURL(screenshot).then((img) => {
        canvas.backgroundImage = img;
        canvas.renderAll();
      });

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
    }, [screenshot, width, height]);

    return (
      <div className="annotation-canvas-wrapper">
        <canvas ref={canvasElRef} />
      </div>
    );
  }
);

AnnotationCanvas.displayName = "AnnotationCanvas";
export default AnnotationCanvas;