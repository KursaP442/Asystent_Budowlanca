import { CadDocumentSchema, CadEntitySchema, type CadDocument, type CadEntity, type CadPoint } from "@asystent/schemas";
import { calibrationScale, rectangleSize } from "@asystent/geometry";

export function resizeCadRectangle(entity: CadEntity, lengthMm: number, widthMm: number): CadEntity {
  if (!("vertices" in entity.geometry) || entity.geometry.vertices.length !== 4
    || ![lengthMm, widthMm].every((value) => Number.isFinite(value) && value > 0 && value <= 1000000)) {
    throw new Error("Podaj dodatnie wymiary prostokąta, maksymalnie 1 000 000 mm.");
  }

  const size = rectangleSize(entity.geometry.vertices);
  if (!size) throw new Error("Element nie jest prostokątem.");
  const a = entity.geometry.vertices[0]!, b = entity.geometry.vertices[1]!, d = entity.geometry.vertices[3]!;
  const u = { x: (b.x - a.x) / size.length * lengthMm, y: (b.y - a.y) / size.length * lengthMm };
  const v = { x: (d.x - a.x) / size.width * widthMm, y: (d.y - a.y) / size.width * widthMm };
  return CadEntitySchema.parse({ ...entity, reviewStatus: "draft",
    geometry: { vertices: [a, { x: a.x + u.x, y: a.y + u.y }, { x: a.x + u.x + v.x, y: a.y + u.y + v.y },
      { x: a.x + v.x, y: a.y + v.y }] } });
}

export function resizeCadStrip(entity: CadEntity, exteriorLengthMm: number): CadEntity {
  if (entity.kind !== "wall" && entity.kind !== "footing" && entity.kind !== "construction-line") throw new Error("Element nie ma prostokątnego przekroju w rzucie.");
  const width = entity.kind === "wall" ? entity.attributes.thicknessMm : entity.attributes.widthMm;
  const { start, end } = entity.geometry;
  const centerLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (!width || !centerLength || !Number.isFinite(exteriorLengthMm) || exteriorLengthMm <= width || exteriorLengthMm > 1000000) {
    throw new Error("Długość zewnętrzna musi być większa od szerokości elementu i nie większa niż 1 000 000 mm.");
  }
  const scale = (exteriorLengthMm - width) / centerLength;
  return CadEntitySchema.parse({ ...entity, reviewStatus: "draft",
    geometry: { start, end: { x: start.x + (end.x - start.x) * scale, y: start.y + (end.y - start.y) * scale } } });
}

function samePoint(a: CadPoint, b: CadPoint) { return Math.hypot(a.x - b.x, a.y - b.y) < 0.001; }
export function hasCadJunctions(entity: CadEntity): boolean {
  return entity.kind === "wall" || entity.kind === "footing" || entity.kind === "construction-line"
    && ["foundation-wall", "excavation", "beam", "lintel", "ring-beam"].includes(entity.attributes.role);
}

export function snapCadEndpoint(document: CadDocument, point: CadPoint, toleranceMm: number): CadPoint {
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) throw new Error("Nieprawidłowa tolerancja połączenia.");
  const candidates = document.entities.filter(hasCadJunctions).flatMap(entityPoints);
  const closest = candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
  return closest && Math.hypot(closest.x - point.x, closest.y - point.y) <= toleranceMm ? { ...closest } : point;
}

export function snapCadConnection(document: CadDocument, point: CadPoint, toleranceMm: number,
  excludedIds: string[] = []): CadPoint | null {
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) throw new Error("Nieprawidłowa tolerancja połączenia.");
  const candidates = document.entities.filter((entity) => hasCadJunctions(entity)
    && (!entity.supportFor || entity.kind === "construction-line") && !excludedIds.includes(entity.id));
  const endpoints = candidates.flatMap(entityPoints).sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
  if (endpoints[0] && Math.hypot(endpoints[0].x - point.x, endpoints[0].y - point.y) <= toleranceMm) return { ...endpoints[0] };
  const projections = candidates.flatMap((entity) => (entity.kind === "wall" || entity.kind === "construction-line"
    && ["foundation-wall", "excavation"].includes(entity.attributes.role))
    ? [projectPointOnSegment(point, entity.geometry.start, entity.geometry.end)] : [])
    .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
  return projections[0] && Math.hypot(projections[0].x - point.x, projections[0].y - point.y) <= toleranceMm ? projections[0] : null;
}

export function connectCadWallJunctions(document: CadDocument, createId: () => string): CadDocument {
  let entities = [...document.entities];
  const groups = [
    document.entities.filter((entity) => entity.kind === "wall" || entity.kind === "footing" && !entity.supportFor
      || entity.kind === "construction-line" && entity.attributes.role === "foundation-wall"),
    document.entities.filter((entity) => entity.kind === "construction-line" && entity.attributes.role === "excavation"),
  ];
  for (const walls of groups) {
    const junctions = walls.flatMap(entityPoints);
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]!, b = walls[j]!;
      if (!("start" in a.geometry) || !("start" in b.geometry)) continue;
      const r = { x: a.geometry.end.x - a.geometry.start.x, y: a.geometry.end.y - a.geometry.start.y };
      const s = { x: b.geometry.end.x - b.geometry.start.x, y: b.geometry.end.y - b.geometry.start.y };
      const cross = r.x * s.y - r.y * s.x;
      if (Math.abs(cross) < 1e-8) continue;
      const q = { x: b.geometry.start.x - a.geometry.start.x, y: b.geometry.start.y - a.geometry.start.y };
      const t = (q.x * s.y - q.y * s.x) / cross, u = (q.x * r.y - q.y * r.x) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) junctions.push({
        x: a.geometry.start.x + t * r.x, y: a.geometry.start.y + t * r.y,
      });
    }
    for (const wall of walls) {
      if (!("start" in wall.geometry)) continue;
      const { start, end } = wall.geometry;
      const splits = junctions.filter((p) => !samePoint(p, start) && !samePoint(p, end)
        && samePoint(p, projectPointOnSegment(p, start, end)));
      if (!splits.length) continue;
      const points = [start, ...splits, end].sort((a, b) =>
        ((a.x - start.x) * (end.x - start.x) + (a.y - start.y) * (end.y - start.y))
        - ((b.x - start.x) * (end.x - start.x) + (b.y - start.y) * (end.y - start.y)))
        .filter((p, i, all) => i === 0 || !samePoint(p, all[i - 1]!));
      if (entities.some((e) => e.placement?.hostId === wall.id)) throw new Error("Ściana ma przypisane zbrojenie. Usuń układ przed dodaniem nowego węzła w środku ściany.");
      const parts = points.slice(0, -1).map((p, i) => CadEntitySchema.parse({ ...wall,
        id: i === 0 ? wall.id : createId(), mark: i === 0 ? wall.mark : undefined,
        geometry: { start: p, end: points[i + 1] }, reviewStatus: "draft" }));
      entities = entities.map((entity) => {
        if (entity.relatedTo?.includes(wall.id)) entity = { ...entity,
          relatedTo: entity.relatedTo.flatMap((id) => id === wall.id ? parts.map((part) => part.id) : [id]) };
        if (entity.infillFor?.includes(wall.id)) entity = { ...entity,
          infillFor: entity.infillFor.flatMap((id) => id === wall.id ? parts.map((p) => p.id) : [id]) };
        if (entity.attachment?.hostId === wall.id) {
          const center = "vertices" in entity.geometry ? {
            x: entity.geometry.vertices.reduce((s, p) => s + p.x, 0) / entity.geometry.vertices.length,
            y: entity.geometry.vertices.reduce((s, p) => s + p.y, 0) / entity.geometry.vertices.length,
          } : entity.kind === "annotation" ? entity.attributes.leader ?? entity.geometry.point : start;
          const projection = projectPointOnSegment(center, start, end);
          const part = parts.find((p) => "start" in p.geometry
            && samePoint(projection, projectPointOnSegment(projection, p.geometry.start, p.geometry.end)));
          if (part && "start" in part.geometry) entity = { ...entity,
            attachment: { hostId: part.id, start: part.geometry.start, end: part.geometry.end } };
        }
        if (entity.kind !== "opening" || entity.attributes.wallId !== wall.id) return entity;
        const part = parts.find((candidate) => "start" in candidate.geometry
          && samePoint(entity.geometry.start, projectPointOnSegment(entity.geometry.start, candidate.geometry.start, candidate.geometry.end))
          && samePoint(entity.geometry.end, projectPointOnSegment(entity.geometry.end, candidate.geometry.start, candidate.geometry.end)));
        if (!part) throw new Error("Nowe połączenie wypada w otworze ściany. Przesuń je poza otwór.");
        return CadEntitySchema.parse({ ...entity, attributes: { ...entity.attributes, wallId: part.id } });
      }).flatMap((entity) => entity.id === wall.id ? parts : [entity]);
    }
  }
  return CadDocumentSchema.parse({ ...document, entities });
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

export function updateConnectedCadEntity(document: CadDocument, updated: CadEntity): CadDocument {
  const previous = document.entities.find((e) => e.id === updated.id);
  if (!previous) throw new Error("Nie znaleziono elementu do aktualizacji.");
  let next = document;
  if (hasCadJunctions(previous) && hasCadJunctions(updated) && "start" in previous.geometry && "start" in updated.geometry) {
    next = moveCadJunctions(document, [
      { from: previous.geometry.start, to: updated.geometry.start },
      { from: previous.geometry.end, to: updated.geometry.end },
    ]);
  }
  return CadDocumentSchema.parse({ ...next, entities: next.entities.map((e) => e.id === updated.id ? updated : e) });
}

function moveCadJunctions(document: CadDocument, moves: { from: CadPoint; to: CadPoint }[]): CadDocument {
  const parsed = CadDocumentSchema.parse(document);
  const move = (point: CadPoint) => moves.find(({ from }) => samePoint(point, from))?.to ?? point;
  const entities = parsed.entities.map((entity) => {
    if (!(hasCadJunctions(entity) || entity.kind === "dimension") || !("start" in entity.geometry)) return entity;
    const { start, end } = entity.geometry;
    const geometry = { start: move(start), end: move(end) };
    const measured = entity.kind === "dimension" && Math.abs(entity.attributes.measuredMm - Math.hypot(end.x - start.x, end.y - start.y)) < .001;
    return CadEntitySchema.parse({ ...entity, geometry, reviewStatus: "draft",
      ...(entity.kind === "dimension" && measured ? { attributes: { ...entity.attributes,
        measuredMm: Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y) } } : {}) });
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
  const groups = new Map(from.entities.flatMap((entity) => entity.placement ? [[entity.placement.groupId, createId()] as const] : []));
  const entities = from.entities.map((entity) => CadEntitySchema.parse({
    ...entity, id: ids.get(entity.id), reviewStatus: "draft",
    derivedFrom: { documentId: from.id, entityId: entity.id, revision: from.revision },
    ...(entity.kind === "opening" ? { attributes: { ...entity.attributes, wallId: ids.get(entity.attributes.wallId) } } : {}),
    ...(entity.supportFor ? { supportFor: entity.supportFor.map((id) => ids.get(id)) } : {}),
    ...(entity.relatedTo ? { relatedTo: entity.relatedTo.map((id) => ids.get(id)) } : {}),
    ...(entity.placement ? { placement: { ...entity.placement, hostId: ids.get(entity.placement.hostId),
      groupId: groups.get(entity.placement.groupId) } } : {}),
    ...(entity.attachment ? { attachment: { ...entity.attachment, hostId: ids.get(entity.attachment.hostId) } } : {}),
    ...(entity.infillFor ? { infillFor: entity.infillFor.map((id) => ids.get(id)) } : {}),
    mark: undefined,
  }));
  return CadDocumentSchema.parse({ ...to, status: "draft", entities: [...to.entities, ...entities],
    ...((from.documentReferences || to.documentReferences) ? { documentReferences: { ...from.documentReferences, ...to.documentReferences } } : {}) });
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
    const common = { ...wall, id: createId(), mark: undefined, reviewStatus: "draft",
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
        mark: undefined, reviewStatus: "draft", derivedFrom: { documentId: from.id, entityId: opening.id, revision: from.revision },
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
    return CadEntitySchema.parse({ ...entity, geometry, reviewStatus: "draft",
      ...(entity.attachment ? { attachment: { ...entity.attachment, start: point(entity.attachment.start), end: point(entity.attachment.end) } } : {}),
      ...(entity.placement ? { placement: { ...entity.placement, start: point(entity.placement.start), end: point(entity.placement.end) } } : {}),
      ...(entity.kind === "annotation" && entity.attributes.leader ? {
        attributes: { ...entity.attributes, leader: point(entity.attributes.leader) },
      } : {}),
    });
  });
  return CadDocumentSchema.parse({
    ...document, status: "draft", entities, sourceImage: { ...source, mmPerPixel: source.mmPerPixel * factor },
    calibration: { originPx: { x: 0, y: 0 }, rotationDegrees: 0, references: [{
      startPx: { x: start.x / source.mmPerPixel, y: start.y / source.mmPerPixel },
      endPx: { x: end.x / source.mmPerPixel, y: end.y / source.mmPerPixel }, lengthMm, confirmedByUser: true,
    }] },
  });
}
