import { describe, expect, it } from "vitest";
import { FabricObject, Path, util } from "fabric";
import { SERIALIZED_CUSTOM_PROPERTIES } from "./fabric-config";

/**
 * Regression guard for the redaction pipeline: a blur/pixelate/solid stroke
 * carries its descriptor in `object.data`, and AnnotationCanvas only processes
 * strokes that still have `data.kind === "blur"`. Undo/redo rebuilds the scene
 * from JSON, which used to drop that descriptor and silently export the pixels
 * the user had redacted.
 */
function createRedactionStroke(): any {
  const stroke = new Path(
    [
      ["M", 0, 0],
      ["L", 40, 20],
    ],
    { stroke: "rgba(255,255,255,0.01)", strokeWidth: 9 },
  );
  stroke.set({
    data: { kind: "blur", brush: "soft", bounds: { left: 0, top: 0, width: 40, height: 20 } },
  });
  return stroke;
}

describe("redaction stroke serialization", () => {
  it("registers the custom data property with Fabric", () => {
    expect(SERIALIZED_CUSTOM_PROPERTIES).toContain("data");
    expect(FabricObject.customProperties).toContain("data");
  });

  it("keeps the descriptor in a plain toObject() snapshot", () => {
    const stroke = createRedactionStroke();
    expect(stroke.toObject().data).toMatchObject({ kind: "blur", brush: "soft" });
  });

  it("keeps the descriptor through the undo/redo round trip", async () => {
    const snapshot = JSON.stringify([
      createRedactionStroke().toObject(SERIALIZED_CUSTOM_PROPERTIES),
    ]);

    const restored = (await util.enlivenObjects(JSON.parse(snapshot))) as any[];
    expect(restored).toHaveLength(1);

    // The predicate the export pipeline relies on.
    expect(restored[0].data?.kind).toBe("blur");
    expect(restored[0].data?.brush).toBe("soft");
    // Export recalculates the patch from live bounds, so they must be readable.
    expect(restored[0].getBoundingRect().width).toBeGreaterThan(0);
  });
});