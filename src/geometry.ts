export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageMapping {
  scaleX: number;
  scaleY: number;
  /**
   * Physical screenshot pixel that sits under the top-left corner of the CSS
   * viewport. It is 0 when the overlay covers the captured monitor exactly and
   * non-zero when the native window ended up smaller or offset (mixed-DPI
   * desktops), in which case the crop has to be shifted by the same amount.
   */
  offsetX?: number;
  offsetY?: number;
}

/**
 * Physical desktop geometry of the capture overlay window.
 *
 * `monitor_*` is the rectangle of the captured monitor and the origin of the
 * screenshot image; `window_*` is the client area of the overlay window as
 * Windows really reports it. Both are physical desktop pixels, so comparing
 * them tells exactly which part of the screenshot the overlay displays.
 */
export interface CaptureWindowGeometry {
  monitor_x: number;
  monitor_y: number;
  monitor_width: number;
  monitor_height: number;
  window_x: number;
  window_y: number;
  window_width: number;
  window_height: number;
  scale_factor: number;
}

export interface ViewportSize {
  width: number;
  height: number;
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
 * Reads the live CSS viewport of the overlay.
 *
 * The value must be re-read for every mapping instead of being cached during a
 * render: moving the overlay to another monitor (or a late WM_DPICHANGED /
 * WebView2 rasterization change) resizes the WebView while React state is
 * still a frame behind, which is what shifted region captures on mixed-DPI
 * desktops.
 */
export function measureViewport(target?: { innerWidth: number; innerHeight: number }): ViewportSize {
  const source = target ?? window;
  return { width: source.innerWidth, height: source.innerHeight };
}

/**
 * Builds the CSS-viewport to screenshot-pixel mapping from the geometry the
 * native window really has, instead of assuming the overlay covers the whole
 * monitor:
 *
 * - scale: monitor DPI, i.e. physical window pixels per CSS pixel.
 * - offset: distance between the window and the monitor origins.
 *
 * When the window does cover the monitor this is identical to
 * `calculateImageMapping(imageWidth, imageHeight, viewportWidth, viewportHeight)`,
 * but it stays correct if the window is a few pixels off or DPI-rescaled.
 */
export function calculateFrameMapping(
  geometry: CaptureWindowGeometry,
  viewportWidth: number,
  viewportHeight: number,
): ImageMapping {
  return {
    scaleX: viewportWidth > 0 ? geometry.window_width / viewportWidth : 1,
    scaleY: viewportHeight > 0 ? geometry.window_height / viewportHeight : 1,
    offsetX: geometry.window_x - geometry.monitor_x,
    offsetY: geometry.window_y - geometry.monitor_y,
  };
}

/**
 * True when the overlay really covers the captured monitor and the WebView has
 * already adopted the new monitor scale. False means the window should be
 * re-fitted (or, at the very least, the mapping must use the reported window
 * rectangle so selections still crop from what the user pointed at).
 */
export function isCaptureGeometryReady(
  geometry: CaptureWindowGeometry,
  viewportWidth: number,
  viewportHeight: number,
  pixelRatio: number,
): boolean {
  const coversMonitor =
    geometry.window_x === geometry.monitor_x &&
    geometry.window_y === geometry.monitor_y &&
    geometry.window_width === geometry.monitor_width &&
    geometry.window_height === geometry.monitor_height;

  const scale = pixelRatio > 0 ? pixelRatio : 1;
  const renderedWidth = Math.round(viewportWidth * scale);
  const renderedHeight = Math.round(viewportHeight * scale);
  const scaleSettled =
    Math.abs(renderedWidth - geometry.window_width) <= 2 &&
    Math.abs(renderedHeight - geometry.window_height) <= 2;

  return coversMonitor && scaleSettled;
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
  // A mapping built from `calculateImageMapping` (image strictly on top of the
  // viewport) has no offset; a mapping built from `calculateFrameMapping` may
  // carry one when the overlay window does not start exactly at the captured
  // monitor origin.
  const offsetX = mapping.offsetX ?? 0;
  const offsetY = mapping.offsetY ?? 0;
  return {
    x: offsetX + rect.x * mapping.scaleX,
    y: offsetY + rect.y * mapping.scaleY,
    width: rect.width * mapping.scaleX,
    height: rect.height * mapping.scaleY,
  };
}
