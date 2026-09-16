export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageMapping {
  scaleX: number;
  scaleY: number;
}

/** Maps CSS viewport coordinates to physical screenshot pixels. */
export function calculateImageMapping(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ImageMapping {
  return {
    scaleX: viewportWidth > 0 ? imageWidth / viewportWidth : 1,
    scaleY: viewportHeight > 0 ? imageHeight / viewportHeight : 1,
  };
}

/**
 * Convert a pointer position from the browser viewport into CSS coordinates
 * relative to the overlay. clientX/clientY are already viewport-relative;
 * do not apply devicePixelRatio to them.
 */
export function viewportPoint(clientX: number, clientY: number, bounds: Rect): { x: number; y: number } {
  return {
    x: clientX - bounds.x,
    y: clientY - bounds.y,
  };
}

/** Keeps selections and remembered presets inside the active monitor viewport. */
export function clampSelection(rect: Rect, viewportWidth: number, viewportHeight: number): Rect {
  const width = Math.max(1, Math.min(rect.width, viewportWidth));
  const height = Math.max(1, Math.min(rect.height, viewportHeight));
  return {
    x: Math.max(0, Math.min(rect.x, viewportWidth - width)),
    y: Math.max(0, Math.min(rect.y, viewportHeight - height)),
    width,
    height,
  };
}

export function toImageRect(rect: Rect, mapping: ImageMapping): Rect {
  return {
    x: rect.x * mapping.scaleX,
    y: rect.y * mapping.scaleY,
    width: rect.width * mapping.scaleX,
    height: rect.height * mapping.scaleY,
  };
}
