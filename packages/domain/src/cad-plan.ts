import { CadDocumentSchema, CadEntitySchema, FoundationBaseSchema, type CadDocument, type CadEntity,
  type CadPoint, type FoundationSettings } from "@asystent/schemas";
import { insetPolygon, isSimplePolygon, offsetPolygon, polygonAreaMm2, segmentRectangle } from "@asystent/geometry";
import { projectPointOnSegment } from "./cad-edit.js";
import type { FoundationWallSetup } from "./cad-foundation.js";
export class CadPlanError extends Error {}

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
  if (!host || host.distance > cadStripWidth(host.e) / 2 + radius + toleranceMm || !("start" in host.e.geometry)) {
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
    if (!face) throw new CadPlanError("Płyta denna utraciła zamknięty obwód. Usuń płytę przed zmianą podziału pól.");
    return { ...e, infillFor: face.ids, geometry: { vertices: face.inner }, reviewStatus: "draft" };
  }) });
}

export interface CadDimensionRequest { start: CadPoint; end: CadPoint; color: string; group: string; side?: number; label?: string }
export interface CadDimensionLayout extends CadDimensionRequest {
  a: CadPoint; b: CadPoint; text: CadPoint; box: { x: number; y: number; width: number; height: number }; label: string;
}
export function layoutCadDimensions(requests: CadDimensionRequest[], fontMm: number,
  reserved: { x: number; y: number; width: number; height: number }[] = []): CadDimensionLayout[] {
  const boxes = [...reserved], result: CadDimensionLayout[] = [];
  const overlaps = (a: typeof boxes[number], b: typeof boxes[number]) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const request of requests) {
    const { start, end } = request, length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < .001) continue;
    const label = request.label ?? `${Math.round(length)} mm`, nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
    const width = (label.length * .62 + 1) * fontMm, height = fontMm * 1.5;
    let placed = false;
    for (let lane = 0; lane < 300; lane++) {
      const offset = (request.side ?? 1) * fontMm * (2.5 + lane * 2);
      const a = { x: start.x + nx * offset, y: start.y + ny * offset }, b = { x: end.x + nx * offset, y: end.y + ny * offset };
      const text = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - fontMm * .35 };
      const box = { x: text.x - width / 2, y: text.y - fontMm, width, height };
      if (boxes.some((other) => overlaps(box, other))) continue;
      boxes.push(box); result.push({ ...request, a, b, text, box, label }); placed = true; break;
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

export function getCadPlanDimensions(document: CadDocument, fontMm: number): CadDimensionLayout[] {
  const requests: CadDimensionRequest[] = [];
  const widths = new Set<string>();
  const entities = document.entities.filter((e) => !["annotation", "rebar-annotation", "dimension", "trace-line", "trace-area", "rebar-line"].includes(e.kind));
  const boxes = entities.map(cadElementBounds);
  const minX = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0, minY = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const add = (start: CadPoint, end: CadPoint, group: string, side = 1, label?: string) =>
    requests.push({ start, end, group, color: "#334155", side, label });
  for (const e of document.entities) {
    if ("start" in e.geometry) {
      const width = cadStripWidth(e);
      if (width > 0) {
        const p = segmentRectangle(e.geometry.start, e.geometry.end, width);
        if (!e.supportFor) add(p[0]!, p[1]!, `${e.id}:exterior`);
        const widthKey = `${e.kind}:${e.kind === "construction-line" ? e.attributes.role : ""}:${width}`;
        if (!widths.has(widthKey)) { add(p[1]!, p[2]!, `${e.id}:exterior`); widths.add(widthKey); }
      } else if (e.kind === "dimension") add(e.geometry.start, e.geometry.end, `${e.id}:manual`, 1,
        e.attributes.label || `${Math.round(e.attributes.measuredMm)} mm`);
    } else if ("vertices" in e.geometry) {
      if (e.kind === "construction-area" && ["pad", "column"].includes(e.attributes.role)) {
        const center = polygonCenter(e.geometry.vertices), b = cadElementBounds(e);
        add({ x: minX, y: center.y }, center, `${e.id}:location`, 1, `${e.mark ?? ""} X: ${Math.round(center.x - minX)} mm`);
        add({ x: center.x, y: minY }, center, `${e.id}:location`, -1, `${e.mark ?? ""} Y: ${Math.round(center.y - minY)} mm`);
        if (e.attachment) {
          const host = document.entities.find((h) => h.id === e.attachment!.hostId);
          if (host && "start" in host.geometry) {
            const projection = projectPointOnSegment(center, host.geometry.start, host.geometry.end);
            add(host.geometry.start, projection, `${e.id}:location`, -1, `${e.mark ?? ""} od ${host.mark ?? "początku"}: ${Math.round(Math.hypot(projection.x - host.geometry.start.x, projection.y - host.geometry.start.y))} mm`);
            add(projection, center, `${e.id}:location`, 1, `${e.mark ?? ""} odsunięcie: ${Math.round(Math.hypot(projection.x - center.x, projection.y - center.y))} mm`);
          }
        }
        // Size is printed inside the symbol; only its position uses external dimension chains.
        if (!b.width || !b.height) throw new Error("Stopa lub słup wymaga niezerowych wymiarów.");
      } else if (!e.infillFor) {
        const vertices = e.geometry.vertices;
        for (let i = 0; i < vertices.length; i++) add(vertices[i]!, vertices[(i + 1) % vertices.length]!, `${e.id}:exterior`, -1);
      }
    }
  }
  if (boxes.length) {
    const maxX = Math.max(...boxes.map((b) => b.x + b.width)), maxY = Math.max(...boxes.map((b) => b.y + b.height));
    add({ x: minX, y: minY }, { x: maxX, y: minY }, "overall", -1);
    add({ x: maxX, y: minY }, { x: maxX, y: maxY }, "overall", -1);
  }
  return layoutCadDimensions(requests, fontMm, boxes);
}
