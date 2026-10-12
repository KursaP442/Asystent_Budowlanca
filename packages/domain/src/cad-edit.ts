import { CadDocumentSchema, CadEntitySchema, type CadDocument, type CadEntity, type CadPoint } from "@asystent/schemas";
import { calibrationScale } from "@asystent/geometry";

function samePoint(a: CadPoint, b: CadPoint) { return Math.hypot(a.x - b.x, a.y - b.y) < 0.001; }
export function hasCadJunctions(entity: CadEntity): boolean {
  return entity.kind === "wall" || entity.kind === "footing" || entity.kind === "construction-line"
    && ["foundation-wall", "beam", "lintel", "ring-beam"].includes(entity.attributes.role);
}

export function snapCadEndpoint(document: CadDocument, point: CadPoint, toleranceMm: number): CadPoint {
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) throw new Error("Nieprawidłowa tolerancja połączenia.");
  const candidates = document.entities.filter(hasCadJunctions).flatMap(entityPoints);
  const closest = candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
  return closest && Math.hypot(closest.x - point.x, closest.y - point.y) <= toleranceMm ? { ...closest } : point;
}

export function moveCadJunction(document: CadDocument, from: CadPoint, to: CadPoint): CadDocument {
  return moveCadJunctions(document, [{ from, to }]);
}

export function translateConnectedCadEntity(document: CadDocument, id: string, delta: CadPoint): CadDocument {
  const entity = document.entities.find((item) => item.id === id);
  if (!entity) throw new Error("Nie znaleziono elementu do przesunięcia.");
  if (!hasCadJunctions(entity)) throw new Error("Ten element nie ma wspólnych węzłów konstrukcyjnych.");
  return moveCadJunctions(document, entityPoints(entity).map((from) => ({
    from, to: { x: from.x + delta.x, y: from.y + delta.y },
  })));
}

function moveCadJunctions(document: CadDocument, moves: { from: CadPoint; to: CadPoint }[]): CadDocument {
  const parsed = CadDocumentSchema.parse(document);
  const move = (point: CadPoint) => moves.find(({ from }) => samePoint(point, from))?.to ?? point;
  const entities = parsed.entities.map((entity) => {
    if (!hasCadJunctions(entity) || !("start" in entity.geometry)) return entity;
    const { start, end } = entity.geometry;
    const geometry = { start: move(start), end: move(end) };
    return CadEntitySchema.parse({ ...entity, geometry, reviewStatus: "draft" });
  });
  const adjusted = entities.map((entity) => {
    if (entity.kind !== "opening") return entity;
    const oldWall = parsed.entities.find((item) => item.id === entity.attributes.wallId);
    const newWall = entities.find((item) => item.id === entity.attributes.wallId);
    if (oldWall?.kind !== "wall" || newWall?.kind !== "wall") return entity;
    const a = oldWall.geometry.start, b = oldWall.geometry.end;
    const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const transform = (point: CadPoint) => {
      const t = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2;
      return { x: newWall.geometry.start.x + t * (newWall.geometry.end.x - newWall.geometry.start.x),
        y: newWall.geometry.start.y + t * (newWall.geometry.end.y - newWall.geometry.start.y) };
    };
    return CadEntitySchema.parse({ ...entity, reviewStatus: "draft",
      geometry: { start: transform(entity.geometry.start), end: transform(entity.geometry.end) } });
  });
  return CadDocumentSchema.parse({ ...parsed, status: "draft", entities: adjusted });
}

export function projectPointOnSegment(point: CadPoint, start: CadPoint, end: CadPoint): CadPoint {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length2 = dx * dx + dy * dy;
  if (!length2) throw new Error("Ściana ma zerową długość.");
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length2));
  return { x: start.x + t * dx, y: start.y + t * dy };
}

export function copyCadGeometry(source: CadDocument, target: CadDocument, createId: () => string): CadDocument {
  const from = CadDocumentSchema.parse(source), to = CadDocumentSchema.parse(target);
  if (from.projectId !== to.projectId || from.id === to.id) throw new Error("Wybierz inny rysunek tego samego projektu.");
  if (from.sourceImage && !from.calibration) throw new Error("Najpierw skalibruj źródłowy skan.");
  if (!from.entities.length) throw new Error("Rysunek źródłowy jest pusty.");
  const ids = new Map(from.entities.map((entity) => [entity.id, createId()]));
  const entities = from.entities.map((entity) => CadEntitySchema.parse({
    ...entity, id: ids.get(entity.id), reviewStatus: "draft",
    derivedFrom: { documentId: from.id, entityId: entity.id, revision: from.revision },
    ...(entity.kind === "opening" ? { attributes: { ...entity.attributes, wallId: ids.get(entity.attributes.wallId) } } : {}),
  }));
  return CadDocumentSchema.parse({ ...to, status: "draft", entities: [...to.entities, ...entities] });
}

export function projectCadWallElevations(source: CadDocument, target: CadDocument, createId: () => string): CadDocument {
  const from = CadDocumentSchema.parse(source), to = CadDocumentSchema.parse(target);
  if (from.projectId !== to.projectId || from.id === to.id) throw new Error("Wybierz inny rysunek tego samego projektu.");
  if (from.sourceImage && !from.calibration) throw new Error("Najpierw skalibruj źródłowy skan.");
  const walls = from.entities.filter((entity) => entity.kind === "wall");
  if (!walls.length) throw new Error("Źródło nie zawiera ścian z wysokościami.");
  let offset = 0;
  const entities: CadEntity[] = [];
  for (const wall of walls) {
    const { start, end } = wall.geometry;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const common = { ...wall, id: createId(), reviewStatus: "draft",
      derivedFrom: { documentId: from.id, entityId: wall.id, revision: from.revision } };
    entities.push(CadEntitySchema.parse({ ...common, kind: "construction-area", layerId: "elevation",
      geometry: { vertices: [{ x: offset, y: 0 }, { x: offset + length, y: 0 },
        { x: offset + length, y: wall.attributes.heightMm }, { x: offset, y: wall.attributes.heightMm }] },
      attributes: { role: "elevation", thicknessMm: wall.attributes.thicknessMm, heightMm: wall.attributes.heightMm,
        material: wall.attributes.material, designReference: "Rozwinięcie ze ściany; sprawdź wysokości i położenie otworów" },
    }));
    for (const opening of from.entities) {
      if (opening.kind !== "opening" || opening.attributes.wallId !== wall.id) continue;
      const position = (point: CadPoint) => ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / length;
      const x1 = offset + position(opening.geometry.start), x2 = offset + position(opening.geometry.end);
      const bottom = opening.attributes.sillMm, top = bottom + opening.attributes.heightMm;
      if (Math.min(x1, x2) < offset - .001 || Math.max(x1, x2) > offset + length + .001 || top > wall.attributes.heightMm) {
        throw new Error("Otwór wykracza poza wymiary ściany. Popraw rzut przed wygenerowaniem rozwinięcia.");
      }
      entities.push(CadEntitySchema.parse({ ...opening, id: createId(), kind: "construction-area", layerId: "void",
        reviewStatus: "draft", derivedFrom: { documentId: from.id, entityId: opening.id, revision: from.revision },
        geometry: { vertices: [{ x: x1, y: bottom }, { x: x2, y: bottom }, { x: x2, y: top }, { x: x1, y: top }] },
        attributes: { role: "void", thicknessMm: wall.attributes.thicknessMm, heightMm: opening.attributes.heightMm,
          material: "Otwór", designReference: "Otwór przeniesiony ze ściany źródłowej" },
      }));
    }
    offset += length + 1000;
  }
  return CadDocumentSchema.parse({ ...to, status: "draft", entities: [...to.entities, ...entities] });
}

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
