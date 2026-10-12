import { CadDocumentSchema, CadEntitySchema, type CadDocument, type CadEntity, type CadPoint } from "@asystent/schemas";
import { calibrationScale } from "@asystent/geometry";

export function entityPoints(entity: CadEntity): CadPoint[] {
  if ("vertices" in entity.geometry) return entity.geometry.vertices;
  if ("start" in entity.geometry) return [entity.geometry.start, entity.geometry.end];
  return [entity.geometry.point];
}

export function translateCadEntity(entity: CadEntity, delta: CadPoint): CadEntity {
  const move = (point: CadPoint) => ({ x: point.x + delta.x, y: point.y + delta.y });
  const geometry = "vertices" in entity.geometry ? { vertices: entity.geometry.vertices.map(move) }
    : "start" in entity.geometry ? { start: move(entity.geometry.start), end: move(entity.geometry.end) }
      : { point: move(entity.geometry.point) };
  return CadEntitySchema.parse({ ...entity, geometry, reviewStatus: "draft" });
}

export function calibrateCadSource(value: CadDocument, start: CadPoint, end: CadPoint, lengthMm: number): CadDocument {
  const document = CadDocumentSchema.parse(value);
  const source = document.sourceImage;
  if (!source) throw new Error("Kalibracja wymaga skanu źródłowego.");
  const factor = calibrationScale(start, end, lengthMm);
  const point = (p: CadPoint) => ({ x: p.x * factor, y: p.y * factor });
  const entities = document.entities.map((entity) => {
    const geometry = "vertices" in entity.geometry ? { vertices: entity.geometry.vertices.map(point) }
      : "start" in entity.geometry ? { start: point(entity.geometry.start), end: point(entity.geometry.end) }
        : { point: point(entity.geometry.point) };
    return CadEntitySchema.parse({ ...entity, geometry, reviewStatus: "draft" });
  });
  return CadDocumentSchema.parse({
    ...document, status: "draft", entities, sourceImage: { ...source, mmPerPixel: source.mmPerPixel * factor },
    calibration: { originPx: { x: 0, y: 0 }, rotationDegrees: 0, references: [{
      startPx: { x: start.x / source.mmPerPixel, y: start.y / source.mmPerPixel },
      endPx: { x: end.x / source.mmPerPixel, y: end.y / source.mmPerPixel }, lengthMm, confirmedByUser: true,
    }] },
  });
}
