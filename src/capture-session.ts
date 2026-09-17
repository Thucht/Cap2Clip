export interface Point {
  x: number;
  y: number;
}

export interface SelectionGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopBounds extends SelectionGeometry {}

export interface MonitorCapture {
  monitor_id: number;
  physical_x: number;
  physical_y: number;
  logical_x: number;
  logical_y: number;
  logical_width: number;
  logical_height: number;
  physical_width: number;
  physical_height: number;
  scale_factor: number;
  image_data: string;
}

export interface CaptureSession {
  session_id: number;
  virtual_x: number;
  virtual_y: number;
  virtual_width: number;
  virtual_height: number;
  monitors: MonitorCapture[];
}

export function normalizeSelection(start: Point, end: Point): SelectionGeometry {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function globalPointFromLocal(point: Point, monitor: MonitorCapture): Point {
  return {
    x: monitor.logical_x + point.x,
    y: monitor.logical_y + point.y,
  };
}

export function logicalPointFromPhysicalCursor(
  point: Point,
  monitors: readonly MonitorCapture[],
): Point | null {
  const containingMonitor = monitors.find((candidate) => {
    const physicalX = candidate.physical_x;
    const physicalY = candidate.physical_y;
    return (
      point.x >= physicalX &&
      point.x < physicalX + candidate.physical_width &&
      point.y >= physicalY &&
      point.y < physicalY + candidate.physical_height
    );
  });
  const monitor = containingMonitor ?? monitors.reduce<MonitorCapture | null>((nearest, candidate) => {
    const clampedX = Math.max(candidate.physical_x, Math.min(point.x, candidate.physical_x + candidate.physical_width));
    const clampedY = Math.max(candidate.physical_y, Math.min(point.y, candidate.physical_y + candidate.physical_height));
    const distance = (point.x - clampedX) ** 2 + (point.y - clampedY) ** 2;
    if (!nearest) return candidate;
    const nearestX = Math.max(nearest.physical_x, Math.min(point.x, nearest.physical_x + nearest.physical_width));
    const nearestY = Math.max(nearest.physical_y, Math.min(point.y, nearest.physical_y + nearest.physical_height));
    const nearestDistance = (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
    return distance < nearestDistance ? candidate : nearest;
  }, null);
  if (!monitor) return null;

  return {
    x: monitor.logical_x + Math.max(0, Math.min(point.x - monitor.physical_x, monitor.physical_width)) / monitor.scale_factor,
    y: monitor.logical_y + Math.max(0, Math.min(point.y - monitor.physical_y, monitor.physical_height)) / monitor.scale_factor,
  };
}

export function globalSelectionFromPhysicalCursor(
  start: Point,
  end: Point,
  monitors: readonly MonitorCapture[],
): SelectionGeometry | null {
  const logicalStart = logicalPointFromPhysicalCursor(start, monitors);
  const logicalEnd = logicalPointFromPhysicalCursor(end, monitors);
  return logicalStart && logicalEnd ? normalizeSelection(logicalStart, logicalEnd) : null;
}

export function monitorPhysicalRectToLogical(
  monitor: Pick<MonitorCapture, "physical_x" | "physical_y" | "physical_width" | "physical_height" | "scale_factor">,
): SelectionGeometry {
  return {
    x: monitor.physical_x / monitor.scale_factor,
    y: monitor.physical_y / monitor.scale_factor,
    width: monitor.physical_width / monitor.scale_factor,
    height: monitor.physical_height / monitor.scale_factor,
  };
}

export function intersectGlobalSelection(
  selection: SelectionGeometry,
  monitor: MonitorCapture,
): SelectionGeometry | null {
  const left = Math.max(selection.x, monitor.logical_x);
  const top = Math.max(selection.y, monitor.logical_y);
  const right = Math.min(selection.x + selection.width, monitor.logical_x + monitor.logical_width);
  const bottom = Math.min(selection.y + selection.height, monitor.logical_y + monitor.logical_height);

  if (right <= left || bottom <= top) return null;

  return {
    x: left - monitor.logical_x,
    y: top - monitor.logical_y,
    width: right - left,
    height: bottom - top,
  };
}

export function clampGlobalSelection(
  selection: SelectionGeometry,
  bounds: DesktopBounds,
): SelectionGeometry {
  const left = Math.max(selection.x, bounds.x);
  const top = Math.max(selection.y, bounds.y);
  const right = Math.min(selection.x + selection.width, bounds.x + bounds.width);
  const bottom = Math.min(selection.y + selection.height, bounds.y + bounds.height);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
