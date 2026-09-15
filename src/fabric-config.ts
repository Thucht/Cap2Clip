import { FabricObject } from "fabric";

/**
 * Custom object metadata that has to be registered with Fabric explicitly.
 *
 * Every redaction stroke (blur, pixelate, solid mask) keeps its descriptor in
 * `object.data`, and the export pipeline finds those strokes through it
 * (see AnnotationCanvas.exportCanvasWithBlur). Fabric 6 serializes only its
 * built-in property list, so undo/redo - which rebuilds the scene from JSON -
 * used to restore redaction strokes without the descriptor: the export then
 * treated them as ordinary near-invisible lines and shipped the pixels they
 * were supposed to hide.
 */
export const SERIALIZED_CUSTOM_PROPERTIES: string[] = ["data"];

FabricObject.customProperties = SERIALIZED_CUSTOM_PROPERTIES;