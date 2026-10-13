import { CadDocumentSchema, CadEntitySchema, FoundationBaseSchema, type CadDocument, type CadEntity,
  type CadPoint, type FoundationSettings } from "@asystent/schemas";
import { insetPolygon, isSimplePolygon, offsetPolygon, polygonAreaMm2, segmentRectangle, segmentsIntersect } from "@asystent/geometry";
import { projectPointOnSegment } from "./cad-edit.js";
import type { FoundationWallSetup } from "./cad-foundation.js";
export class CadPlanError extends Error {}

export function cadEntityColor(entity: CadEntity): string {
  if (entity.kind === "construction-line") return entity.attributes.role === "foundation-wall" ? "#2563eb"
    : entity.attributes.role === "excavation" ? "#4d7c0f" : "#475569";
  if (entity.kind === "construction-area") return ({
    pad: "#7c3aed", column: "#be185d", excavation: "#4d7c0f", "basement-area": "#16a34a",
    section: "#64748b", elevation: "#475569", paving: "#0d9488", finish: "#9333ea", terrain: "#4d7c0f",
  } as Partial<Record<typeof entity.attributes.role, string>>)[entity.attributes.role] ?? "#475569";
  return ({ wall: "#2563eb", footing: "#b45309", slab: "#0891b2", "roof-plane": "#22a06b",
    "rebar-line": "#0f172a", dimension: "#475569", "trace-line": "#2563eb", "trace-area": "#2563eb",
    annotation: "#7c3aed" } as Partial<Record<CadEntity["kind"], string>>)[entity.kind] ?? "#475569";
}

export function foundationSetupFromSettings(values: FoundationSettings,
  hints: { material: string; thermal: boolean; label: string }[]): FoundationWallSetup {
  const thermal = hints.find((h) => h.thermal);
  const waterproof = hints.find((h) => /Izolacja przeciwwilgociowa|Hydroizolacja/i.test(h.label));
  const required: (keyof FoundationSettings)[] = ["wallWidth", "wallHeight", "wallMaterial",
    ...(values.type === "strip" ? ["baseWidth", "baseDepth"] as const : values.type === "slab"
      ? ["slabThickness", "overhang", "slabMaterial"] as const : []),
    ...(thermal ? ["thermal"] as const : []), ...(waterproof ? ["waterproof"] as const : [])];
  if (!values.type || required.some((key) => !String(values[key]).trim())) {
    throw new Error("Uzupełnij parametry ściany i podparcia z projektu. Zmiany zapisują się automatycznie.");
  }
  const reference = values.reference.trim() || "Do uzupełnienia z projektu";
  const base = FoundationBaseSchema.parse(values.type === "strip" ? {
    type: "strip", widthMm: Number(values.baseWidth), depthMm: Number(values.baseDepth), designReference: reference,
  } : values.type === "slab" ? {
    type: "slab", thicknessMm: Number(values.slabThickness), overhangMm: Number(values.overhang),
    boundary: values.boundary, material: values.slabMaterial, designReference: reference,
  } : { type: "manual", designReference: reference });
  return { widthMm: Number(values.wallWidth), heightMm: Number(values.wallHeight), material: values.wallMaterial, base,
    buildUp: [
      ...(waterproof ? [{ purpose: "waterproofing" as const, material: waterproof.material,
        thicknessMm: Number(values.waterproof), side: values.side }] : []),
      ...(thermal ? [{ purpose: "thermal" as const, material: thermal.material,
        thicknessMm: Number(values.thermal), side: "exterior" as const }] : []),
    ] };
}

export function assignCadMarks(document: CadDocument): CadDocument {
  const prefix = (e: CadEntity) => e.kind === "wall" ? "W" : e.kind === "footing" ? "L"
    : e.kind === "slab" ? "P" : e.kind === "construction-area"
      ? ({ column: "S", pad: "ST" } as Record<string, string>)[e.attributes.role]
      : e.kind === "construction-line" ? ({ "foundation-wall": "SF", beam: "B", "ring-beam": "WF", lintel: "N" } as Record<string, string>)[e.attributes.role] : null;
  const used = new Set(document.entities.flatMap((e) => e.mark ? [e.mark] : []));
  return { ...document, entities: document.entities.map((e) => {
    const p = prefix(e);
    if (!p || e.mark) return e;
    let n = 1;
    while (used.has(`${p}${n}`)) n++;
    const mark = `${p}${n}`; used.add(mark);
    return { ...e, mark };
  }) };
}

export interface CadPlanFace { ids: string[]; vertices: CadPoint[]; inner: CadPoint[]; areaMm2: number; center: CadPoint }
export function cadStripWidth(e: CadEntity): number {
  return e.kind === "wall" ? e.attributes.thicknessMm : e.kind === "footing"
    || e.kind === "construction-line" && !["axis", "section-cut"].includes(e.attributes.role) ? e.attributes.widthMm : 0;
}

export function getCadPlanFaces(document: CadDocument, kind: "walls" | "footings" = "walls"): CadPlanFace[] {
  const nodes: CadPoint[] = [], edges: { id: string; a: number; b: number; width: number }[] = [];
  const node = (p: CadPoint) => {
    const i = nodes.findIndex((n) => Math.hypot(n.x - p.x, n.y - p.y) < .001);
    if (i >= 0) return i;
    nodes.push(p); return nodes.length - 1;
  };
  for (const e of document.entities) {
    if (kind === "footings" ? e.kind !== "footing" : !(e.kind === "wall"
      || e.kind === "construction-line" && e.attributes.role === "foundation-wall")) continue;
    if ("start" in e.geometry) edges.push({ id: e.id, a: node(e.geometry.start), b: node(e.geometry.end), width: cadStripWidth(e) });
  }
  const halves = edges.flatMap((e) => [{ ...e, from: e.a, to: e.b }, { ...e, from: e.b, to: e.a }]);
  const outgoing = nodes.map((p, i) => halves.map((h, j) => ({ h, j })).filter(({ h }) => h.from === i)
    .sort((a, b) => Math.atan2(nodes[a.h.to]!.y - p.y, nodes[a.h.to]!.x - p.x)
      - Math.atan2(nodes[b.h.to]!.y - p.y, nodes[b.h.to]!.x - p.x)).map(({ j }) => j));
  const visited = new Set<number>(), result: CadPlanFace[] = [];
  for (let first = 0; first < halves.length; first++) {
    if (visited.has(first)) continue;
    const walk: number[] = []; let at = first;
    while (!visited.has(at)) {
      visited.add(at); walk.push(at);
      const h = halves[at]!, list = outgoing[h.to]!;
      const reverse = list.findIndex((i) => halves[i]!.to === h.from);
      at = list[(reverse + list.length - 1) % list.length]!;
    }
    if (at !== first || walk.length < 3) continue;
    const vertices = walk.map((i) => nodes[halves[i]!.from]!);
    const signed = vertices.reduce((s, p, i) => { const q = vertices[(i + 1) % vertices.length]!; return s + p.x * q.y - q.x * p.y; }, 0);
    if (signed <= .001) continue;
    const inner = insetPolygon(vertices, walk.map((i) => halves[i]!.width / 2));
    if (!isSimplePolygon(inner) || inner.some((p) => !pointInCadPolygon(p, vertices))) {
      throw new CadPlanError("Ściany są za grube dla zamkniętego pola. Sprawdź geometrię i grubości.");
    }
    const areaMm2 = polygonAreaMm2(inner);
    const center = interiorLabelPoint(inner);
    result.push({ ids: walk.map((i) => halves[i]!.id), vertices, inner, areaMm2, center });
  }
  return result;
}

export function setCadWallHeightForRoom(document: CadDocument, wallId: string, heightMm: number): CadDocument {
  if (!Number.isFinite(heightMm) || heightMm <= 0 || heightMm > 1_000_000) {
    throw new RangeError("Wysokość ściany musi być dodatnia i nie większa niż 1 000 000 mm.");
  }
  const wall = document.entities.find(({ id }) => id === wallId);
  if (wall?.kind !== "wall" && !(wall?.kind === "construction-line" && wall.attributes.role === "foundation-wall")) {
    throw new Error("Wybierz ścianę, której wysokość chcesz zmienić.");
  }
  const room = getCadPlanFaces(document).find(({ ids }) => ids.includes(wallId));
  const roomWallIds = new Set(room?.ids ?? [wallId]);
  return CadDocumentSchema.parse({
    ...document, status: "draft",
    entities: document.entities.map((entity) => {
      if (!roomWallIds.has(entity.id)) return entity;
      if (entity.kind === "wall" || entity.kind === "construction-line" && entity.attributes.role === "foundation-wall") {
        return CadEntitySchema.parse({ ...entity, attributes: { ...entity.attributes, heightMm }, reviewStatus: "draft" });
      }
      return entity;
    }),
  });
}

export function pointInCadPolygon(p: CadPoint, vertices: CadPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!, b = vertices[j]!;
    if (Math.hypot(p.x - projectPointOnSegment(p, a, b).x, p.y - projectPointOnSegment(p, a, b).y) < .001) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonCenter(vertices: CadPoint[]): CadPoint {
  let area = 0, x = 0, y = 0;
  vertices.forEach((p, i) => {
    const q = vertices[(i + 1) % vertices.length]!, cross = p.x * q.y - q.x * p.y;
    area += cross; x += (p.x + q.x) * cross; y += (p.y + q.y) * cross;
  });
  return { x: x / (3 * area), y: y / (3 * area) };
}

function interiorLabelPoint(vertices: CadPoint[]): CadPoint {
  const center = polygonCenter(vertices);
  if (pointInCadPolygon(center, vertices)) return center;
  const xs = vertices.map((p) => p.x), ys = vertices.map((p) => p.y);
  let best: CadPoint | null = null, bestDistance = -1;
  for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
    const p = { x: Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * i / 20,
      y: Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * j / 20 };
    if (!pointInCadPolygon(p, vertices)) continue;
    const distance = Math.min(...vertices.map((a, k) => {
      const q = projectPointOnSegment(p, a, vertices[(k + 1) % vertices.length]!);
      return Math.hypot(p.x - q.x, p.y - q.y);
    }));
    if (distance > bestDistance) { best = p; bestDistance = distance; }
  }
  if (!best) throw new CadPlanError("Pole jest zbyt wąskie na opis powierzchni. Sprawdź obrys.");
  return best;
}

export function cadLayerSides(entity: CadEntity, side: NonNullable<CadEntity["buildUp"]>[number]["side"],
  faces: CadPlanFace[]): ("left" | "right")[] {
  if (side === "both") return ["left", "right"];
  if (side === "left" || side === "right") return [side];
  if (!("start" in entity.geometry)) return [];
  const boundaries = faces.filter((f) => f.ids.includes(entity.id));
  if (boundaries.length !== 1 || boundaries[0]!.ids.filter((id) => id === entity.id).length !== 1) return [];
  const face = boundaries[0]!, index = face.ids.indexOf(entity.id);
  const forward = Math.hypot(face.vertices[index]!.x - entity.geometry.start.x, face.vertices[index]!.y - entity.geometry.start.y) < .001;
  return [side === "interior" ? forward ? "left" : "right" : forward ? "right" : "left"];
}

export function cadLayerOutline(entity: CadEntity, side: "left" | "right", from: number, to: number,
  faces: CadPlanFace[]): CadPoint[] {
  if (!("start" in entity.geometry)) throw new Error("Warstwa wymaga odcinka.");
  const { start, end } = entity.geometry;
  const boundary = faces.filter((f) => f.ids.includes(entity.id));
  if (boundary.length === 1 && boundary[0]!.ids.filter((id) => id === entity.id).length === 1) {
    const source = boundary[0]!;
    let edges = source.ids.map((id, i) => ({ id, start: source.vertices[i]!, end: source.vertices[(i + 1) % source.vertices.length]! }));
    let changed = true;
    while (changed && edges.length > 2) {
      changed = false;
      for (let i = 0; i < edges.length; i++) {
        const j = (i + 1) % edges.length;
        if (edges[i]!.id === edges[j]!.id) {
          edges = edges.filter((_, k) => k !== i && k !== j); changed = true; break;
        }
      }
    }
    const face = { ids: edges.map((e) => e.id), vertices: edges.map((e) => e.start) };
    const i = face.ids.indexOf(entity.id), forward = face.vertices[i];
    if (!forward) throw new CadPlanError("Ściana wewnętrzna wymaga ręcznego wyboru strony izolacji.");
    const interior = Math.hypot(forward.x - start.x, forward.y - start.y) < .001 ? "left" : "right";
    const offset = side === interior ? insetPolygon : offsetPolygon;
    const a = offset(face.vertices, face.ids.map(() => from)), b = offset(face.vertices, face.ids.map(() => to));
    return [a[i]!, a[(i + 1) % a.length]!, b[(i + 1) % b.length]!, b[i]!];
  }
  const length = Math.hypot(end.x - start.x, end.y - start.y), nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
  const sign = side === "left" ? 1 : -1, extend = cadStripWidth(entity) / 2;
  const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
  return [from, to].flatMap((d, i) => (i ? [end, start] : [start, end]).map((p) => ({
    x: p.x + nx * sign * d + ux * (p === start ? -extend : extend),
    y: p.y + ny * sign * d + uy * (p === start ? -extend : extend),
  })));
}

export function attachCadElement(entity: CadEntity, document: CadDocument, toleranceMm: number): CadEntity {
  const center = "vertices" in entity.geometry ? polygonCenter(entity.geometry.vertices)
    : entity.kind === "annotation" ? entity.attributes.leader ?? entity.geometry.point : null;
  if (!center) return entity;
  const radius = "vertices" in entity.geometry ? Math.max(...entity.geometry.vertices.map((p) => Math.hypot(p.x - center.x, p.y - center.y))) : 0;
  const hosts = document.entities.filter((e) => !e.supportFor && (e.kind === "wall" || e.kind === "footing"
    || e.kind === "construction-line" && e.attributes.role === "foundation-wall"));
  const host = hosts.map((e) => {
    if (!("start" in e.geometry)) throw new Error("Podparcie wymaga odcinka.");
    const projection = projectPointOnSegment(center, e.geometry.start, e.geometry.end);
    return { e, distance: Math.hypot(center.x - projection.x, center.y - projection.y) };
  }).sort((a, b) => a.distance - b.distance)[0];
  const insideRoom = entity.kind === "construction-area" && ["pad", "column"].includes(entity.attributes.role)
    && getCadPlanFaces(document).some((face) => pointInCadPolygon(center, face.inner));
  if (!host || !("start" in host.e.geometry)
    || !insideRoom && host.distance > cadStripWidth(host.e) / 2 + radius + toleranceMm) {
    const detached = { ...entity }; delete detached.attachment; return detached;
  }
  return CadEntitySchema.parse({ ...entity, attachment: { hostId: host.e.id, start: host.e.geometry.start, end: host.e.geometry.end } });
}

export function synchronizeCadAttachments(document: CadDocument): CadDocument {
  return { ...document, entities: document.entities.map((e) => {
    const anchor = e.attachment;
    if (!anchor) return e;
    const host = document.entities.find((h) => h.id === anchor.hostId);
    if (!host || !("start" in host.geometry)) throw new CadPlanError("Brakuje ściany przyczepionego elementu.");
    if (host.geometry.start.x === anchor.start.x && host.geometry.start.y === anchor.start.y
      && host.geometry.end.x === anchor.end.x && host.geometry.end.y === anchor.end.y) return e;
    const oldLength = Math.hypot(anchor.end.x - anchor.start.x, anchor.end.y - anchor.start.y);
    const { start, end } = host.geometry, length = Math.hypot(end.x - start.x, end.y - start.y);
    if (!oldLength || !length) throw new CadPlanError("Podparcie przyczepionego elementu ma zerową długość.");
    const ox = (anchor.end.x - anchor.start.x) / oldLength, oy = (anchor.end.y - anchor.start.y) / oldLength;
    const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
    const pivot = e.kind === "annotation" ? e.attributes.leader ?? e.geometry.point
      : "vertices" in e.geometry ? polygonCenter(e.geometry.vertices) : anchor.start;
    const along = ((pivot.x - anchor.start.x) * ox + (pivot.y - anchor.start.y) * oy) / oldLength;
    const newPivot = { x: start.x + along * length * ux, y: start.y + along * length * uy };
    const oldPivot = { x: anchor.start.x + along * oldLength * ox, y: anchor.start.y + along * oldLength * oy };
    const transform = (p: CadPoint) => {
      const dx = p.x - oldPivot.x, dy = p.y - oldPivot.y, a = dx * ox + dy * oy, b = -dx * oy + dy * ox;
      return { x: newPivot.x + ux * a - uy * b, y: newPivot.y + uy * a + ux * b };
    };
    return CadEntitySchema.parse({ ...e, attachment: { ...anchor, start, end }, reviewStatus: "draft",
      geometry: "vertices" in e.geometry ? { vertices: e.geometry.vertices.map(transform) }
        : "point" in e.geometry ? { point: transform(e.geometry.point) } : e.geometry,
      ...(e.kind === "annotation" && e.attributes.leader ? { attributes: { ...e.attributes, leader: transform(e.attributes.leader) } } : {}),
    });
  }) };
}

export function synchronizeCadInfill(document: CadDocument): CadDocument {
  if (!document.entities.some((e) => e.infillFor)) return document;
  const faces = getCadPlanFaces(document, "footings");
  return CadDocumentSchema.parse({ ...document, entities: document.entities.map((e) => {
    if (!e.infillFor) return e;
    const face = faces.find((f) => e.infillFor!.every((id) => f.ids.includes(id)));
    if (!face) throw new CadPlanError("Pole płyty lub piwnicy utraciło zamknięty obwód. Usuń zaznaczenie przed zmianą podziału pól.");
    return { ...e, infillFor: face.ids, geometry: { vertices: face.inner }, reviewStatus: "draft" };
  }) });
}

export interface CadDimensionRequest {
  start: CadPoint; end: CadPoint; color: string; group: string; side?: number; label?: string;
  entityId?: string; referenceId?: string; faceSide?: "left" | "right"; anchor?: CadPoint; description?: string;
  fontMm?: number; chainId?: string; chainSide?: number; chainStart?: CadPoint; chainEnd?: CadPoint;
  chainColor?: string; chainLane?: number; offsetMm?: number; measurementKind?: "strip-width";
  layoutPriority?: number;
}
export interface CadDimensionLayout extends CadDimensionRequest {
  a: CadPoint; b: CadPoint; text: CadPoint; box: { x: number; y: number; width: number; height: number }; label: string;
  labelAngle: number;
}
export function formatCadDimensionMm(value: number): string {
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(Math.round(value) / 10)} cm`;
}
export function cadDimensionLabelSize(label: string, fontMm: number) {
  return { width: (label.length * .62 + 1) * fontMm, height: fontMm * 1.5 };
}

// Labels follow the dimension line; ISO keeps them readable from the bottom or the right.
export function cadDimensionLabelAngle(start: CadPoint, end: CadPoint): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (Math.hypot(dx, dy) < .001) return 0;
  const degrees = Math.atan2(dy, dx) * 180 / Math.PI;
  return degrees >= 90 ? degrees - 180 : degrees < -90 ? degrees + 180 : degrees;
}

export function cadDimensionLabelRect(text: CadPoint, label: string, fontMm: number) {
  const { width, height } = cadDimensionLabelSize(label, fontMm);
  return { x: text.x - width / 2, y: text.y - fontMm, width, height };
}

export function cadDimensionLabelPlacement(center: CadPoint, angleDegrees: number, label: string, fontMm: number) {
  const { width, height } = cadDimensionLabelSize(label, fontMm);
  const radians = angleDegrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const text = { x: center.x + sin * fontMm * .35, y: center.y - cos * fontMm * .35 };
  const halfX = Math.abs(cos) * width / 2 + Math.abs(sin) * height / 2;
  const halfY = Math.abs(sin) * width / 2 + Math.abs(cos) * height / 2;
  const boxCenter = { x: text.x + sin * fontMm * .25, y: text.y - cos * fontMm * .25 };
  return { text, width, height,
    box: { x: boxCenter.x - halfX, y: boxCenter.y - halfY, width: halfX * 2, height: halfY * 2 } };
}
export function layoutCadDimensions(requests: CadDimensionRequest[], fontMm: number,
  reserved: { x: number; y: number; width: number; height: number }[] = [], solids: CadPoint[][] = []): CadDimensionLayout[] {
  const boxes = [...reserved], result: CadDimensionLayout[] = [];
  const overlaps = (a: typeof boxes[number], b: typeof boxes[number]) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  const ordered = requests.map((request, index) => ({ request, index }))
    .sort((a, b) => (a.request.layoutPriority ?? 3) - (b.request.layoutPriority ?? 3) || a.index - b.index);
  for (const { request } of ordered) {
    const { start, end } = request, length = Math.hypot(end.x - start.x, end.y - start.y), font = request.fontMm ?? fontMm;
    if (length < .001 && !request.anchor) continue;
    const label = request.label ?? formatCadDimensionMm(length),
      nx = -(end.y - start.y) / Math.max(.001, length), ny = (end.x - start.x) / Math.max(.001, length);
    const { width } = cadDimensionLabelSize(label, font), labelAngle = cadDimensionLabelAngle(start, end);
    let placed = false;
    if (request.measurementKind === "strip-width") {
      const a = start, b = end, ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
      const requestedSide = request.side ?? 1;
      let fallback: { text: CadPoint; box: typeof boxes[number] } | undefined, fallbackOverlap = Infinity;
      for (let lane = 0; lane < 24; lane++) {
        for (const side of [requestedSide, -requestedSide]) {
          const outwardX = ux * side, outwardY = uy * side;
          const distance = length / 2 + width / 2 + font * (.5 + lane * .75);
          const { text, box } = cadDimensionLabelPlacement({
            x: (a.x + b.x) / 2 + outwardX * distance,
            y: (a.y + b.y) / 2 + outwardY * distance,
          }, labelAngle, label, font);
          const overlapArea = boxes.reduce((total, other) => total
            + Math.max(0, Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x))
            * Math.max(0, Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y)), 0);
          if (overlapArea < fallbackOverlap) { fallback = { text, box }; fallbackOverlap = overlapArea; }
          if (overlapArea > 0) continue;
          boxes.push(box); result.push({ ...request, a, b, text, box, label, labelAngle }); placed = true; break;
        }
        if (placed) break;
      }
      if (!placed && fallback) {
        boxes.push(fallback.box); result.push({ ...request, a, b, ...fallback, label, labelAngle }); placed = true;
      }
      if (!placed) throw new CadPlanError("Nie można umieścić wymiaru grubości.");
      continue;
    }
    for (let lane = 0; lane < 300; lane++) {
      const offset = (request.side ?? 1) * ((request.offsetMm ?? font * 2.5) + font * lane * 2);
      const a = request.anchor ?? { x: start.x + nx * offset, y: start.y + ny * offset },
        b = request.anchor ?? { x: end.x + nx * offset, y: end.y + ny * offset };
      if (!request.anchor && solids.some((solid) => pointInCadPolygon(a, solid) || pointInCadPolygon(b, solid)
        || solid.some((p, i) => segmentsIntersect(a, b, p, solid[(i + 1) % solid.length]!)))) continue;
      const gap = font * (2.5 + Math.floor(lane / 4) * 2);
      const center = request.anchor
        ? lane % 4 < 2
          ? { x: request.anchor.x, y: request.anchor.y + (lane % 4 ? 1 : -1) * gap }
          : { x: request.anchor.x + (lane % 4 === 2 ? -1 : 1) * (width / 2 + gap), y: request.anchor.y }
        : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const { text, box } = cadDimensionLabelPlacement(center, labelAngle, label, font);
      if (boxes.some((other) => overlaps(box, other))) continue;
      const corners = [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }];
      if (solids.some((solid) => corners.some((p) => pointInCadPolygon(p, solid))
        || solid.some((p) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height)
        || solid.some((p, i) => corners.some((q, j) => segmentsIntersect(p, solid[(i + 1) % solid.length]!, q, corners[(j + 1) % 4]!))))) continue;
      boxes.push(box); result.push({ ...request, a, b, text, box, label, labelAngle }); placed = true; break;
    }
    if (!placed) throw new CadPlanError("Za dużo wymiarów w jednym miejscu. Zwiększ skalę arkusza lub rozdziel rysunek.");
  }
  return result;
}

export function cadElementBounds(e: CadEntity) {
  const points = "vertices" in e.geometry ? e.geometry.vertices : "start" in e.geometry
    ? cadStripWidth(e) ? segmentRectangle(e.geometry.start, e.geometry.end, cadStripWidth(e)) : [e.geometry.start, e.geometry.end]
      : [e.geometry.point];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function stripFamily(e: CadEntity): string | null {
  return e.kind === "wall" || e.kind === "construction-line" && e.attributes.role === "foundation-wall" ? "wall"
    : e.kind === "footing" ? "footing"
      : e.kind === "construction-line" && e.attributes.role === "excavation" ? "excavation" : null;
}

function stripFamilyDimensionPriority(family: string): number {
  return family === "wall" ? 0 : family === "footing" ? 1 : family === "excavation" ? 2 : 3;
}

function cadDimensionLayoutPriority(entity?: CadEntity): number {
  const family = entity ? stripFamily(entity) : null;
  return family ? stripFamilyDimensionPriority(family) : 3;
}

export function cadStripFaceSegment(document: CadDocument, entity: CadEntity, side: "left" | "right") {
  if (!("start" in entity.geometry) || !cadStripWidth(entity)) throw new CadPlanError("Lico wymaga elementu o szerokości.");
  const { start, end } = entity.geometry, width = cadStripWidth(entity);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const u = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const sign = side === "left" ? 1 : -1;
  const endpoint = (node: CadPoint, direction: number): CadPoint => {
    const dx = u.x * direction, dy = u.y * direction, localSide = sign * direction;
    const face = { x: node.x - u.y * sign * width / 2, y: node.y + u.x * sign * width / 2 };
    const family = stripFamily(entity);
    const neighbors = family ? document.entities.flatMap((other) => {
      if (other.id === entity.id || stripFamily(other) !== family || !("start" in other.geometry)) return [];
      const g = other.geometry;
      const otherEnd = Math.hypot(g.start.x - node.x, g.start.y - node.y) < .001 ? g.end
        : Math.hypot(g.end.x - node.x, g.end.y - node.y) < .001 ? g.start : null;
      if (!otherEnd) return [];
      const l = Math.hypot(otherEnd.x - node.x, otherEnd.y - node.y);
      const vx = (otherEnd.x - node.x) / l, vy = (otherEnd.y - node.y) / l;
      let angle = Math.atan2((dx * vy - dy * vx) * localSide, dx * vx + dy * vy);
      if (angle < 0) angle += Math.PI * 2;
      if (angle < 1e-8) return [];
      return [{ vx, vy, angle, width: cadStripWidth(other) }];
    }).sort((a, b) => a.angle - b.angle) : [];
    const neighbor = neighbors[0];
    if (!neighbor) return { x: face.x - dx * width / 2, y: face.y - dy * width / 2 };
    const cross = dx * neighbor.vy - dy * neighbor.vx;
    if (Math.abs(cross) < 1e-8) return face;
    const neighborFace = { x: node.x + neighbor.vy * localSide * neighbor.width / 2,
      y: node.y - neighbor.vx * localSide * neighbor.width / 2 };
    const t = ((neighborFace.x - face.x) * neighbor.vy - (neighborFace.y - face.y) * neighbor.vx) / cross;
    return { x: face.x + dx * t, y: face.y + dy * t };
  };
  const a = endpoint(start, 1), b = endpoint(end, -1);
  if ((b.x - a.x) * u.x + (b.y - a.y) * u.y <= .001) throw new CadPlanError("Element jest za krótki dla wymiarów lic połączenia. Sprawdź grubości i narożnik.");
  return { start: a, end: b };
}

export function getCadPlanDimensions(document: CadDocument, fontMm: number, hiddenLayers: readonly string[] = [],
  locationFontMm = fontMm, detailed = false): CadDimensionLayout[] {
  const requests: CadDimensionRequest[] = [];
  const visible = document.entities.filter((e) => !hiddenLayers.includes(e.layerId));
  const entities = visible.filter((e) => !["annotation", "rebar-annotation", "dimension", "trace-line", "trace-area", "rebar-line"].includes(e.kind));
  const boxes = entities.map(cadElementBounds);
  const solids = entities.flatMap((e) => "start" in e.geometry && cadStripWidth(e)
    ? [segmentRectangle(e.geometry.start, e.geometry.end, cadStripWidth(e))]
    : e.kind === "construction-area" && ["pad", "column"].includes(e.attributes.role) ? [e.geometry.vertices] : []);
  const minX = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0, minY = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const add = (start: CadPoint, end: CadPoint, group: string, side = 1, label?: string, entity?: CadEntity,
    extra: Partial<CadDimensionRequest> = {}) => requests.push({ start, end, group,
      color: entity ? cadEntityColor(entity) : "#334155", side, label, entityId: entity?.id,
      layoutPriority: cadDimensionLayoutPriority(entity), ...extra });
  const walls = document.entities.filter((e) => e.kind === "wall"
    || e.kind === "construction-line" && e.attributes.role === "foundation-wall");
  const references = walls.length ? walls : document.entities.filter((e) => e.kind === "footing");
  const visibleIds = new Set(visible.map((e) => e.id));
  const wallFaces = getCadPlanFaces(document), footingFaces = getCadPlanFaces(document, "footings");
  const supportChainEntities = new Set<string>();
  const stripChainEntities = new Set<string>();
  let hasStripChainOverall = false;
  const supportPoints = visible.flatMap((entity) => {
    if (entity.kind !== "construction-area" || !["pad", "column"].includes(entity.attributes.role)
      || !("vertices" in entity.geometry)) return [];
    return [{ entity, center: polygonCenter(entity.geometry.vertices) }];
  });
  const referencePoints = references.flatMap((entity) => "start" in entity.geometry
    ? [entity.geometry.start, entity.geometry.end] : []);
  if (supportPoints.length && referencePoints.length) {
    const minX = Math.min(...referencePoints.map((point) => point.x)), maxX = Math.max(...referencePoints.map((point) => point.x));
    const minY = Math.min(...referencePoints.map((point) => point.y)), maxY = Math.max(...referencePoints.map((point) => point.y));
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    for (const axis of ["horizontal", "vertical"] as const) {
      const coordinate = (point: CadPoint) => axis === "horizontal" ? point.y : point.x;
      const station = (point: CadPoint) => axis === "horizontal" ? point.x : point.y;
      const ordered = [...supportPoints].sort((a, b) => coordinate(a.center) - coordinate(b.center));
      const rows: typeof ordered[] = [];
      for (const item of ordered) {
        const row = rows.at(-1);
        if (!row || Math.abs(coordinate(item.center) - coordinate(row[0]!.center)) > 50) rows.push([item]);
        else row.push(item);
      }
      for (const row of rows) {
        if (row.length < 2) continue;
        const fixed = row.reduce((total, item) => total + coordinate(item.center), 0) / row.length;
        const positions: { point: CadPoint; entities: typeof row }[] = [];
        for (const item of [...row].sort((a, b) => station(a.center) - station(b.center))) {
          const previous = positions.at(-1);
          if (previous && Math.abs(station(previous.point) - station(item.center)) <= 1) previous.entities.push(item);
          else positions.push({ point: item.center, entities: [item] });
        }
        if (positions.length < 2) continue;
        for (const item of row) supportChainEntities.add(item.entity.id);
        const chainStart = axis === "horizontal" ? { x: minX, y: fixed } : { x: fixed, y: minY };
        const chainEnd = axis === "horizontal" ? { x: maxX, y: fixed } : { x: fixed, y: maxY };
        const length = Math.hypot(chainEnd.x - chainStart.x, chainEnd.y - chainStart.y);
        if (length < .001) continue;
        const outwardSide = axis === "horizontal" ? fixed < centerY ? -1 : 1 : fixed < centerX ? 1 : -1;
        const chainId = `supports:${axis}:${Math.round(fixed)}`;
        let previous = chainStart;
        for (const position of positions) {
          const entity = position.entities.find((item) => item.entity.attributes.role === "column")?.entity
            ?? position.entities[0]!.entity;
          const nearestHost = references.map((host) => {
            if (!("start" in host.geometry)) return { host, distance: Infinity };
            const projection = projectPointOnSegment(position.point, host.geometry.start, host.geometry.end);
            return { host, distance: Math.hypot(position.point.x - projection.x, position.point.y - projection.y) };
          }).sort((a, b) => (a.host.id === entity.attachment?.hostId ? -1 : b.host.id === entity.attachment?.hostId ? 1 : a.distance - b.distance))[0]?.host;
          add(previous, position.point, `${entity.id}:location`, outwardSide, undefined, entity, {
            referenceId: nearestHost?.id, anchor: position.point, fontMm: locationFontMm,
            chainId, chainSide: outwardSide, chainStart, chainEnd,
            chainColor: nearestHost ? cadEntityColor(nearestHost) : cadEntityColor(entity),
            description: `Położenie w łańcuchu wymiarowym ${formatCadDimensionMm(station(position.point) - station(previous))}.`,
          });
          previous = position.point;
        }
      }
    }
  }
  const stripFamilies = new Map<string, CadEntity[]>();
  for (const entity of visible) {
    if (!detailed && entity.kind !== "footing" && entity.supportFor?.some((id) => visibleIds.has(id))) continue;
    const family = stripFamily(entity);
    if (!family || !("start" in entity.geometry) || !cadStripWidth(entity)) continue;
    const familyEntities = stripFamilies.get(family) ?? [];
    familyEntities.push(entity);
    stripFamilies.set(family, familyEntities);
  }
  const allStripBounds = [...stripFamilies.values()].flatMap((familyEntities) =>
    familyEntities.map((entity) => cadElementBounds(entity)));
  const stripEnvelope = allStripBounds.length ? {
    minX: Math.min(...allStripBounds.map((bounds) => bounds.x)),
    maxX: Math.max(...allStripBounds.map((bounds) => bounds.x + bounds.width)),
    minY: Math.min(...allStripBounds.map((bounds) => bounds.y)),
    maxY: Math.max(...allStripBounds.map((bounds) => bounds.y + bounds.height)),
  } : null;
  const orderedStripFamilies = [...stripFamilies.entries()]
    .sort(([familyA], [familyB]) => stripFamilyDimensionPriority(familyA) - stripFamilyDimensionPriority(familyB));
  for (const [family, familyEntities] of orderedStripFamilies) {
    const familyPriority = stripFamilyDimensionPriority(family);
    const familyBounds = familyEntities.map((entity) => ({ entity, bounds: cadElementBounds(entity) }));
    const familyMinX = Math.min(...familyBounds.map(({ bounds }) => bounds.x));
    const familyMaxX = Math.max(...familyBounds.map(({ bounds }) => bounds.x + bounds.width));
    const familyMinY = Math.min(...familyBounds.map(({ bounds }) => bounds.y));
    const familyMaxY = Math.max(...familyBounds.map(({ bounds }) => bounds.y + bounds.height));
    const familyColor = cadEntityColor(familyEntities[0]!);
    const axesWithChains = new Set<"horizontal" | "vertical">();
    for (const axis of ["horizontal", "vertical"] as const) {
      const horizontal = axis === "horizontal";
      const minAlong = horizontal ? familyMinX : familyMinY;
      const maxAlong = horizontal ? familyMaxX : familyMaxY;
      const minAcross = horizontal ? familyMinY : familyMinX;
      const maxAcross = horizontal ? familyMaxY : familyMaxX;
      const candidates = familyBounds.filter(({ entity }) => {
        if (!("start" in entity.geometry)) return false;
        const dx = entity.geometry.end.x - entity.geometry.start.x;
        const dy = entity.geometry.end.y - entity.geometry.start.y;
        return horizontal ? Math.abs(dy) > Math.abs(dx) : Math.abs(dx) > Math.abs(dy);
      });
      let axisHasChain = false;
      for (const side of [-1, 1]) {
        const edge = side < 0 ? minAcross : maxAcross;
        const intervals = candidates.flatMap(({ entity, bounds }) => {
          const acrossStart = horizontal ? bounds.y : bounds.x;
          const acrossEnd = horizontal ? bounds.y + bounds.height : bounds.x + bounds.width;
          if (edge < acrossStart - 1 || edge > acrossEnd + 1) return [];
          const start = horizontal ? bounds.x : bounds.y;
          const end = horizontal ? bounds.x + bounds.width : bounds.y + bounds.height;
          return [{ start, end, entity }];
        }).sort((a, b) => a.start - b.start);
        const merged: { start: number; end: number; entities: CadEntity[] }[] = [];
        for (const interval of intervals) {
          const previous = merged.at(-1);
          if (previous && (interval.start < previous.end - 1
            || Math.abs(interval.start - previous.start) <= 1 && Math.abs(interval.end - previous.end) <= 1)) {
            previous.end = Math.max(previous.end, interval.end);
            previous.entities.push(interval.entity);
          } else merged.push({ start: interval.start, end: interval.end, entities: [interval.entity] });
        }
        if (merged.length < 2) continue;
        const chainStart = horizontal ? { x: minAlong, y: edge } : { x: edge, y: minAlong };
        const chainEnd = horizontal ? { x: maxAlong, y: edge } : { x: edge, y: maxAlong };
        if (Math.hypot(chainEnd.x - chainStart.x, chainEnd.y - chainStart.y) < 1) continue;
        const chainId = `strips:${family}:${axis}:${side < 0 ? "start" : "end"}`;
        axisHasChain = true;
        const chainSide = horizontal ? side : -side;
        const envelopeEdge = horizontal
          ? side < 0 ? stripEnvelope?.minY ?? edge : stripEnvelope?.maxY ?? edge
          : side < 0 ? stripEnvelope?.minX ?? edge : stripEnvelope?.maxX ?? edge;
        const distanceToEnvelope = Math.abs(edge - envelopeEdge);
        const chainLane = 4 + distanceToEnvelope / fontMm + familyPriority * 4;
        const stations = [...new Set([minAlong, maxAlong, ...merged.flatMap(({ start, end }) => [start, end])])]
          .filter((station) => station >= minAlong - 1 && station <= maxAlong + 1).sort((a, b) => a - b);
        for (const interval of merged) for (const entity of interval.entities) stripChainEntities.add(entity.id);
        for (let index = 1; index < stations.length; index++) {
          const start = stations[index - 1]!, end = stations[index]!;
          if (end - start < 1) continue;
          const midpoint = (start + end) / 2;
          const interval = intervals.find((item) => midpoint > item.start && midpoint < item.end);
          const width = interval && Math.abs((end - start) - cadStripWidth(interval.entity)) <= 1;
          const from = horizontal ? { x: start, y: edge } : { x: edge, y: start };
          const to = horizontal ? { x: end, y: edge } : { x: edge, y: end };
          add(from, to, `${chainId}:segments`, chainSide, formatCadDimensionMm(end - start),
            width ? interval.entity : undefined, {
              anchor: to, chainId, chainSide, chainStart, chainEnd, chainColor: familyColor, chainLane,
              color: familyColor, measurementKind: width ? "strip-width" : undefined,
              layoutPriority: familyPriority,
              description: width ? `Grubość ${interval.entity.mark ?? "elementu"}: ${formatCadDimensionMm(end - start)}.` : undefined,
            });
        }
      }
      if (axisHasChain) axesWithChains.add(axis);
    }
    for (const axis of axesWithChains) {
      const horizontal = axis === "horizontal";
      const start = horizontal ? { x: familyMinX, y: familyMaxY } : { x: familyMaxX, y: familyMinY };
      const end = horizontal ? { x: familyMaxX, y: familyMaxY } : { x: familyMaxX, y: familyMaxY };
      const side = horizontal ? 1 : -1;
      if (Math.hypot(end.x - start.x, end.y - start.y) >= 1) {
        const familyEdge = horizontal ? familyMaxY : familyMaxX;
        const envelopeEdge = horizontal ? stripEnvelope?.maxY ?? familyEdge : stripEnvelope?.maxX ?? familyEdge;
        add(start, end, "overall", side, formatCadDimensionMm(Math.hypot(end.x - start.x, end.y - start.y)),
            undefined, { color: familyColor,
              offsetMm: envelopeEdge - familyEdge + fontMm * (14 + familyPriority * 2),
              layoutPriority: 4 });
      }
      hasStripChainOverall = true;
    }
  }
  for (const e of visible) {
    if (!detailed && e.kind !== "footing" && e.supportFor?.some((id) => visibleIds.has(id))) continue;
    if ("start" in e.geometry) {
      const width = cadStripWidth(e);
      if (width > 0) {
        const left = cadStripFaceSegment(document, e, "left"), right = cadStripFaceSegment(document, e, "right");
        const l = Math.hypot(left.end.x - left.start.x, left.end.y - left.start.y);
        const r = Math.hypot(right.end.x - right.start.x, right.end.y - right.start.y);
        const both = detailed && Math.abs(l - r) > .001;
        if (stripChainEntities.has(e.id) && !both) continue;
        const exterior = cadLayerSides(e, "exterior", e.kind === "footing" ? footingFaces : wallFaces)[0];
        const side = exterior ?? (l >= r ? "left" : "right");
        if (both || side === "left") add(left.start, left.end, `${e.id}:exterior`, 1, undefined, e, { faceSide: "left" });
        if (both || side === "right") add(right.start, right.end, `${e.id}:exterior`, -1, undefined, e, { faceSide: "right" });
        const isWall = e.kind === "wall" || e.kind === "construction-line" && e.attributes.role === "foundation-wall";
        if ((isWall || e.kind === "footing" || detailed) && !stripChainEntities.has(e.id)) {
          const dx = e.geometry.end.x - e.geometry.start.x, dy = e.geometry.end.y - e.geometry.start.y;
          const length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length;
          const center = { x: (e.geometry.start.x + e.geometry.end.x) / 2, y: (e.geometry.start.y + e.geometry.end.y) / 2 };
          const thicknessStart = { x: center.x + nx * width / 2, y: center.y + ny * width / 2 };
          const thicknessEnd = { x: center.x - nx * width / 2, y: center.y - ny * width / 2 };
          add(thicknessStart, thicknessEnd, `${e.id}:thickness`, exterior === "left" ? -1 : 1, formatCadDimensionMm(width), e, {
            measurementKind: "strip-width",
            description: `Grubość ${isWall ? "ściany" : "elementu"} ${e.mark ?? ""}: ${formatCadDimensionMm(width)}.`,
          });
        }
      } else if (e.kind === "dimension") add(e.geometry.start, e.geometry.end, `${e.id}:manual`, 1,
        e.attributes.label || formatCadDimensionMm(e.attributes.measuredMm), e);
    } else if ("vertices" in e.geometry) {
      if (e.kind === "construction-area" && ["pad", "column"].includes(e.attributes.role)) {
        const center = polygonCenter(e.geometry.vertices), b = cadElementBounds(e);
        if (supportChainEntities.has(e.id)) {
          if (!b.width || !b.height) throw new Error("Stopa lub słup wymaga niezerowych wymiarów.");
          continue;
        }
        const ranked = references.map((host) => {
          if (!("start" in host.geometry)) throw new CadPlanError("Odniesienie wymiaru wymaga ściany.");
          const projection = projectPointOnSegment(center, host.geometry.start, host.geometry.end);
          return { host, projection, distance: Math.hypot(center.x - projection.x, center.y - projection.y) };
        }).sort((a, b) => (a.host.id === e.attachment?.hostId ? -1 : b.host.id === e.attachment?.hostId ? 1 : a.distance - b.distance));
        const nearest = ranked[0];
        if (nearest && "start" in nearest.host.geometry) {
          const { host } = nearest, g = nearest.host.geometry;
          if (!("start" in g)) throw new CadPlanError("Odniesienie wymiaru wymaga ściany.");
          const length = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
          const ux = (g.end.x - g.start.x) / length, uy = (g.end.y - g.start.y) / length;
          const along = (center.x - g.start.x) * ux + (center.y - g.start.y) * uy;
          const projection = { x: g.start.x + ux * along, y: g.start.y + uy * along };
          const sign = (center.x - projection.x) * -uy + (center.y - projection.y) * ux >= 0 ? 1 : -1;
          const hostFace = cadStripFaceSegment(document, host, sign === 1 ? "left" : "right");
          const originAlong = (hostFace.start.x - g.start.x) * ux + (hostFace.start.y - g.start.y) * uy;
          const origin = { x: g.start.x + ux * originAlong, y: g.start.y + uy * originAlong };
          const extra = { referenceId: host.id, anchor: center, fontMm: locationFontMm,
            chainStart: hostFace.start, chainEnd: hostFace.end, chainColor: cadEntityColor(host) };
          const face = { x: projection.x - uy * sign * cadStripWidth(host) / 2,
            y: projection.y + ux * sign * cadStripWidth(host) / 2 };
          const alongMm = Math.round(Math.hypot(projection.x - origin.x, projection.y - origin.y));
          const acrossMm = Math.round(Math.hypot(center.x - face.x, center.y - face.y));
          const prefix = `${e.mark ?? "Podpora"} → ${host.mark ?? "Ściana"}`;
          add(origin, projection, `${e.id}:location`, -1,
            `${prefix} : ${formatCadDimensionMm(alongMm)}${detailed ? "" : ` / ${formatCadDimensionMm(acrossMm)}`}`, e,
            { ...extra, chainId: `${host.id}:support-locations:${sign}`,
              chainSide: sign,
              description: `Położenie osi podpory: wzdłuż ściany od początku lica ${formatCadDimensionMm(alongMm)}; prostopadle od lica ${formatCadDimensionMm(acrossMm)}.` });
          if (detailed) add(face, center, `${e.id}:location`, 1, `${prefix} : ${formatCadDimensionMm(acrossMm)}`, e,
            { ...extra, description: "Prostopadłe odsunięcie osi podpory od lica ściany." });
        } else {
          const x = Math.round(center.x - minX), y = Math.round(center.y - minY);
          add({ x: minX, y: center.y }, center, `${e.id}:location`, 1,
            `${e.mark ?? "Podpora"} X: ${formatCadDimensionMm(x)}${detailed ? "" : ` / Y: ${formatCadDimensionMm(y)}`}`, e,
            { anchor: center, fontMm: locationFontMm, description: `Położenie od gabarytu rysunku: X ${formatCadDimensionMm(x)}; Y ${formatCadDimensionMm(y)}.` });
          if (detailed) add({ x: center.x, y: minY }, center, `${e.id}:location`, -1,
            `${e.mark ?? "Podpora"} Y: ${formatCadDimensionMm(y)}`, e, { anchor: center, fontMm: locationFontMm });
        }
        // Size is printed inside the symbol; only its position uses external dimension chains.
        if (!b.width || !b.height) throw new Error("Stopa lub słup wymaga niezerowych wymiarów.");
      } else if (!e.infillFor) {
        const vertices = e.geometry.vertices;
        for (let i = 0; i < vertices.length; i++) add(vertices[i]!, vertices[(i + 1) % vertices.length]!, `${e.id}:exterior`, -1, undefined, e);
      }
    }
  }
  if (detailed && boxes.length && !hasStripChainOverall) {
    const maxX = Math.max(...boxes.map((b) => b.x + b.width)), maxY = Math.max(...boxes.map((b) => b.y + b.height));
    add({ x: minX, y: minY }, { x: maxX, y: minY }, "overall", -1, undefined, undefined, { layoutPriority: 4 });
    add({ x: maxX, y: minY }, { x: maxX, y: maxY }, "overall", -1, undefined, undefined, { layoutPriority: 4 });
  }
  return layoutCadDimensions(requests, fontMm, [], solids);
}
