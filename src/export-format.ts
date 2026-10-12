import type { ImageFormat } from "./App";

export interface FabricExportOptions {
  format: "png" | "jpeg";
  multiplier: number;
  quality?: number;
}

/**
 * Fabric export options for the configured output format.
 *
 * Lightshot exposes "Upload using the format" and "JPEG quality"; the same pair
 * decides how a saved screenshot is encoded here. The quality is clamped because
 * a hand-edited settings file could otherwise ask for an encoder-rejected value.
 */
export function buildExportOptions(
  imageFormat: ImageFormat,
  jpegQuality: number,
  multiplier: number,
): FabricExportOptions {
  if (imageFormat !== "jpeg") return { format: "png", multiplier };
  const quality = Math.min(100, Math.max(1, Math.round(jpegQuality)));
  return { format: "jpeg", multiplier, quality: quality / 100 };
}

/** DOM canvas encoding arguments for the configured format. */
export function canvasEncoding(
  imageFormat: ImageFormat,
  jpegQuality: number,
): [string, number | undefined] {
  if (imageFormat !== "jpeg") return ["image/png", undefined];
  const quality = Math.min(100, Math.max(1, Math.round(jpegQuality)));
  return ["image/jpeg", quality / 100];
}