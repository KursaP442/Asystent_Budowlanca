import { CadEntitySchema, cadDrawingTools, type CadDrawingTool, type CadEntity, type CadPoint } from "@asystent/schemas";

const pending = "Do uzupełnienia z projektu";
export function createCadElement(tool: CadDrawingTool, points: CadPoint[], options: {
  id: string; text?: string; wall?: Extract<CadEntity, { kind: "wall" }>;
  pipeSystem?: Extract<CadEntity, { kind: "pipe" }>["attributes"]["system"];
  trace?: Extract<CadEntity, { kind: "trace-line" | "trace-area" }>;
}): CadEntity {
  const common = options.trace ? { ...options.trace, layerId: tool, reviewStatus: "draft" } : {
    id: options.id, layerId: tool, units: "mm", reviewStatus: "draft",
    source: { origin: "manual", documentId: null, page: null, confidence: null },
  };
  const start = points[0];
  if (!start) throw new Error("Element wymaga współrzędnych.");
  if (tool === "annotation") return CadEntitySchema.parse({ ...common, kind: tool, geometry: { point: start }, attributes: { text: options.text ?? pending } });
  const end = points[1];
  if (!end) throw new Error("Element wymaga co najmniej dwóch punktów.");
  const geometry = { start, end };
  if (tool === "wall") return CadEntitySchema.parse({ ...common, kind: tool, geometry, attributes: { thicknessMm: 240, heightMm: 2800, material: pending } });
  if (tool === "footing") return CadEntitySchema.parse({ ...common, kind: tool, geometry, attributes: { widthMm: 600, depthMm: 400, designReference: pending } });
  if (tool === "dimension") return CadEntitySchema.parse({ ...common, kind: tool, geometry,
    attributes: { measuredMm: Math.hypot(end.x - start.x, end.y - start.y), label: "" } });
  if (tool === "rebar-line") return CadEntitySchema.parse({ ...common, kind: tool, geometry,
    attributes: { diameterMm: 12, count: 1, steelGrade: pending, coverMm: 50, designReference: pending, specialistVerified: false } });
  if (tool === "opening") {
    if (!options.wall) throw new Error("Zaznacz ścianę na liście, a następnie wybierz otwór.");
    return CadEntitySchema.parse({ ...common, kind: tool, geometry,
      attributes: { wallId: options.wall.id, type: "window", heightMm: 1500, sillMm: 900 } });
  }
  if (tool === "pipe") return CadEntitySchema.parse({ ...common, kind: tool, geometry,
    attributes: { diameterMm: 100, material: pending, system: options.pipeSystem ?? "water" } });
  if (tool === "roof-plane") return CadEntitySchema.parse({ ...common, kind: tool, geometry: { vertices: points },
    attributes: { pitchDegrees: 0, material: pending } });
  if (tool === "slab") return CadEntitySchema.parse({ ...common, kind: tool, geometry: { vertices: points },
    attributes: { thicknessMm: 200, material: pending } });
  const area = ["column", "pad", "basement-area", "section", "elevation", "paving", "finish", "ceiling", "terrain", "equipment", "void"].includes(tool);
  return CadEntitySchema.parse({ ...common, kind: area ? "construction-area" : "construction-line",
    geometry: area ? { vertices: points } : geometry,
    attributes: { role: tool, ...(area ? { thicknessMm: 200 } : { widthMm: 240 }),
      heightMm: 2800, material: pending, designReference: pending } });
}

export function classifyCadTrace(entity: CadEntity, tool: CadDrawingTool): CadEntity {
  if (entity.kind !== "trace-line" && entity.kind !== "trace-area") throw new Error("Klasifikace jest dostępna tylko dla rozpoznanego obrysu.");
  const geometry = cadDrawingTools.find(({ id }) => id === tool)?.geometry;
  if (geometry !== (entity.kind === "trace-area" ? "area" : "line") || ["opening", "dimension", "axis", "section-cut"].includes(tool)) {
    throw new Error("Typ elementu musi odpowiadać rozpoznanemu odcinkowi lub obrysowi.");
  }
  const points = "vertices" in entity.geometry ? entity.geometry.vertices : [entity.geometry.start, entity.geometry.end];
  const result = createCadElement(tool, points, { id: entity.id, trace: entity });
  const area = "vertices" in result.geometry;
  if (area !== ("vertices" in entity.geometry)) throw new Error("Typ elementu musi odpowiadać rozpoznanemu odcinkowi lub obrysowi.");
  return result;
}
