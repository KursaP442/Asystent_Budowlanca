import { CadEntitySchema, type CadDocument, type CadEntity, type CadPoint, type FoundationSection, type FoundationSectionField } from "@asystent/schemas";
import { pointInCadPolygon } from "./cad-plan.js";
import { segmentRectangle } from "@asystent/geometry";

export interface FoundationSectionIntersection {
  elementId: string;
  elementType: CadEntity["kind"];
  startMm: number;
  endMm: number;
  heightMm: number | null;
  verticalOffsetMm: number;
  baseElevationM: number | null;
  material: string | null;
  dataSource: "element_instance";
}

export interface ResolvedFoundationSectionValue {
  value: number | string;
  unit: "mm" | "cm" | "m" | "tekst";
  source: "section_override" | "element_instance" | "project_technology" | "document_settings";
  validated: boolean;
}

export interface FoundationSectionProposal {
  key: string;
  label: string;
  kind: NonNullable<FoundationSection["kind"]>;
  linkedElementIds: string[];
  marker: CadPoint;
  cutStart: CadPoint;
  cutEnd: CadPoint;
  visibilityRangeMm: number;
  fingerprint: string;
}

export interface FoundationMaterialQuantity {
  key: string;
  elementIds: string[];
  label: string;
  material: string | null;
  unit: "m3" | "m2";
  net: number;
  wastePercent: number;
  gross: number;
  warning?: string;
}

const known = (value: string) => value.trim() && !/do uzupełnienia|uzupełnij|unknown|^—$/i.test(value);
const cross = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.y - a.y * b.x;
const round = (value: number, digits = 6) => Number(value.toFixed(digits));
const entityCenter = (entity: CadEntity): CadPoint => {
  if ("start" in entity.geometry) return {
    x: (entity.geometry.start.x + entity.geometry.end.x) / 2,
    y: (entity.geometry.start.y + entity.geometry.end.y) / 2,
  };
  if ("vertices" in entity.geometry) {
    return {
      x: entity.geometry.vertices.reduce((sum, point) => sum + point.x, 0) / entity.geometry.vertices.length,
      y: entity.geometry.vertices.reduce((sum, point) => sum + point.y, 0) / entity.geometry.vertices.length,
    };
  }
  return entity.geometry.point;
};
const polygonBounds = (vertices: readonly CadPoint[]) => ({
  minX: Math.min(...vertices.map(({ x }) => x)),
  minY: Math.min(...vertices.map(({ y }) => y)),
  maxX: Math.max(...vertices.map(({ x }) => x)),
  maxY: Math.max(...vertices.map(({ y }) => y)),
});
const polygonArea = (vertices: readonly CadPoint[]) => Math.abs(vertices.reduce((sum, point, index) => {
  const next = vertices[(index + 1) % vertices.length]!;
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);
const segmentLength = (entity: Extract<CadEntity, { geometry: { start: CadPoint; end: CadPoint } }>) =>
  Math.hypot(entity.geometry.end.x - entity.geometry.start.x, entity.geometry.end.y - entity.geometry.start.y);

export function foundationSectionFingerprint(document: CadDocument, linkedElementIds: readonly string[]): string {
  return linkedElementIds.map((id) => {
    const entity = document.entities.find((item) => item.id === id);
    if (!entity) return `${id}:missing`;
    return `${id}:${JSON.stringify({ geometry: entity.geometry, attributes: entity.attributes, buildUp: entity.buildUp,
      supportFor: entity.supportFor, attachment: entity.attachment })}`;
  }).sort().join("|").slice(0, 500);
}

export function detectFoundationSectionProposals(document: CadDocument): FoundationSectionProposal[] {
  const proposals: FoundationSectionProposal[] = [];
  const areas = document.entities.filter((entity): entity is Extract<CadEntity, { kind: "construction-area" }> =>
    entity.kind === "construction-area");
  const pads = areas.filter(({ attributes }) => attributes.role === "pad");
  const columns = areas.filter(({ attributes }) => attributes.role === "column");
  const consumedPads = new Set<string>();
  for (const column of columns) {
    const center = entityCenter(column);
    const pad = pads.find((candidate) => pointInCadPolygon(center, candidate.geometry.vertices));
    if (pad) consumedPads.add(pad.id);
    const linked = [column.id, ...(pad ? [pad.id] : [])];
    const vertices = [...column.geometry.vertices, ...(pad?.geometry.vertices ?? [])];
    const bounds = polygonBounds(vertices);
    const margin = Math.max(500, (bounds.maxX - bounds.minX) * .35);
    const key = `column-pad:${linked.sort().join(":")}`;
    proposals.push({
      key, label: column.mark ?? pad?.mark ?? `S${proposals.length + 1}`, kind: "column-pad",
      linkedElementIds: linked, marker: center,
      cutStart: { x: bounds.minX - margin, y: center.y }, cutEnd: { x: bounds.maxX + margin, y: center.y },
      visibilityRangeMm: bounds.maxX - bounds.minX + margin * 2,
      fingerprint: foundationSectionFingerprint(document, linked),
    });
  }
  for (const pad of pads.filter(({ id }) => !consumedPads.has(id))) {
    const center = entityCenter(pad), bounds = polygonBounds(pad.geometry.vertices);
    const margin = Math.max(500, (bounds.maxX - bounds.minX) * .35), linked = [pad.id];
    proposals.push({
      key: `column-pad:${pad.id}`, label: pad.mark ?? `SF${proposals.length + 1}`, kind: "column-pad",
      linkedElementIds: linked, marker: center,
      cutStart: { x: bounds.minX - margin, y: center.y }, cutEnd: { x: bounds.maxX + margin, y: center.y },
      visibilityRangeMm: bounds.maxX - bounds.minX + margin * 2,
      fingerprint: foundationSectionFingerprint(document, linked),
    });
  }
  const walls = document.entities.filter((entity): entity is Extract<CadEntity, { kind: "construction-line" }> =>
    entity.kind === "construction-line" && entity.attributes.role === "foundation-wall");
  for (const wall of walls) {
    const footing = document.entities.find((entity): entity is Extract<CadEntity, { kind: "footing" }> =>
      entity.kind === "footing" && entity.supportFor?.includes(wall.id) === true);
    const linked = [wall.id, ...(footing ? [footing.id] : [])], center = entityCenter(wall);
    const dx = wall.geometry.end.x - wall.geometry.start.x, dy = wall.geometry.end.y - wall.geometry.start.y;
    const norm = Math.hypot(dx, dy) || 1;
    const half = Math.max(1000, (footing?.attributes.widthMm ?? wall.attributes.widthMm) * 1.5);
    proposals.push({
      key: `wall-footing:${wall.id}`, label: wall.mark ?? footing?.mark ?? `Ł${proposals.length + 1}`,
      kind: "wall-footing", linkedElementIds: linked, marker: center,
      cutStart: { x: center.x - dy / norm * half, y: center.y + dx / norm * half },
      cutEnd: { x: center.x + dy / norm * half, y: center.y - dx / norm * half },
      visibilityRangeMm: half * 2, fingerprint: foundationSectionFingerprint(document, linked),
    });
  }
  for (const beam of document.entities.filter((entity): entity is Extract<CadEntity, { kind: "construction-line" }> =>
    entity.kind === "construction-line" && entity.attributes.role === "beam")) {
    const center = entityCenter(beam), dx = beam.geometry.end.x - beam.geometry.start.x;
    const dy = beam.geometry.end.y - beam.geometry.start.y, norm = Math.hypot(dx, dy) || 1;
    const half = Math.max(1000, beam.attributes.widthMm * 2), linked = [beam.id];
    proposals.push({
      key: `beam:${beam.id}`, label: beam.mark ?? `B${proposals.length + 1}`, kind: "beam",
      linkedElementIds: linked, marker: center,
      cutStart: { x: center.x - dy / norm * half, y: center.y + dx / norm * half },
      cutEnd: { x: center.x + dy / norm * half, y: center.y - dx / norm * half },
      visibilityRangeMm: half * 2, fingerprint: foundationSectionFingerprint(document, linked),
    });
  }
  return proposals;
}

export function addDetectedFoundationSections(
  document: CadDocument,
  createId: () => string = () => crypto.randomUUID(),
): CadDocument {
  const existing = new Set((document.sections ?? []).flatMap((section) =>
    section.automaticKey ? [section.automaticKey] : []));
  const proposals = detectFoundationSectionProposals(document).filter(({ key }) => !existing.has(key));
  if (!proposals.length) return synchronizeFoundationSections(document);
  const labels = new Set((document.sections ?? []).map(({ label }) => label));
  const entities = [...document.entities], sections = [...(document.sections ?? [])];
  for (const proposal of proposals) {
    let label = proposal.label.toLocaleUpperCase("pl-PL").replace(/[^A-ZĄĆĘŁŃÓŚŹŻ0-9 ._/-]/g, "").slice(0, 40) || "PRZEKRÓJ";
    const base = label;
    for (let suffix = 2; labels.has(label); suffix += 1) label = `${base.slice(0, 35)} ${suffix}`;
    labels.add(label);
    const cutId = createId(), sectionId = createId();
    entities.push(CadEntitySchema.parse({
      id: cutId, layerId: "section-cut", units: "mm", kind: "construction-line", reviewStatus: "draft",
      source: { documentId: null, page: null, origin: "manual", confidence: null },
      geometry: { start: proposal.cutStart, end: proposal.cutEnd },
      attributes: { role: "section-cut", widthMm: 1, heightMm: 1, material: "Linia cięcia",
        designReference: "Automatycznie wyznaczona z rzutu" },
    }));
    sections.push({
      id: sectionId, label, cutEntityId: cutId, viewDirection: "left",
      visibilityRangeMm: proposal.visibilityRangeMm, paperScale: 20,
      linkedElementIds: proposal.linkedElementIds, sourceElementIds: proposal.linkedElementIds,
      marker: proposal.marker, kind: proposal.kind,
      automaticKey: proposal.key, sourceFingerprint: proposal.fingerprint, state: "incomplete",
      createdAutomatically: true, printFormat: "A4", wastePercent: 0, overrides: {},
    });
  }
  return synchronizeFoundationSections({ ...document, entities, sections });
}


export function getFoundationSectionConflicts(document: CadDocument, section: FoundationSection): FoundationSectionField[] {
  const intersections = getFoundationSectionIntersections(document, section);
  const intersected = new Set(intersections.map(({ elementId }) => elementId));
  const candidates: Partial<Record<FoundationSectionField, (string | number)[]>> = {};
  const add = (field: FoundationSectionField, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "" || typeof value === "string" && !known(value)) return;
    (candidates[field] ??= []).push(value);
  };
  for (const entity of document.entities) {
    if (!intersected.has(entity.id)) continue;
    if (entity.kind === "construction-line" && entity.attributes.role === "foundation-wall") {
      add("wall_thickness_cm", entity.attributes.widthMm / 10);
      add("wall_height_cm", entity.attributes.heightMm / 10);
      add("wall_material", entity.attributes.material);
      add("xps_thickness_cm", entity.buildUp?.find(({ purpose }) => purpose === "thermal")?.thicknessMm !== undefined
        ? entity.buildUp.find(({ purpose }) => purpose === "thermal")!.thicknessMm / 10 : null);
      add("waterproofing_type", entity.buildUp?.find(({ purpose }) => purpose === "waterproofing")?.material);
    } else if (entity.kind === "wall") {
      add("wall_thickness_cm", entity.attributes.thicknessMm / 10);
      add("wall_height_cm", entity.attributes.heightMm / 10);
      add("wall_material", entity.attributes.material);
    } else if (entity.kind === "footing") {
      add("footing_width_cm", entity.attributes.widthMm / 10);
      add("footing_height_cm", entity.attributes.depthMm / 10);
    } else if (entity.kind === "slab") add("concrete_class", entity.attributes.material);
  }
  return Object.entries(candidates).flatMap(([field, values]) =>
    values && new Set(values).size > 1 ? [field as FoundationSectionField] : []);
}

function polygonIntervals(
  start: { x: number; y: number },
  end: { x: number; y: number },
  vertices: readonly { x: number; y: number }[],
): [number, number][] {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length === 0) throw new RangeError("Linia przekroju musi mieć niezerową długość.");
  const cuts = [0, 1];
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!, b = vertices[(index + 1) % vertices.length]!;
    const ex = b.x - a.x, ey = b.y - a.y, denominator = cross({ x: dx, y: dy }, { x: ex, y: ey });
    if (Math.abs(denominator) < 1e-9) {
      if (Math.abs(cross({ x: a.x - start.x, y: a.y - start.y }, { x: dx, y: dy })) < 1e-7) {
        cuts.push(((a.x - start.x) * dx + (a.y - start.y) * dy) / (length * length),
          ((b.x - start.x) * dx + (b.y - start.y) * dy) / (length * length));
      }
      continue;
    }
    const t = cross({ x: a.x - start.x, y: a.y - start.y }, { x: ex, y: ey }) / denominator;
    const u = cross({ x: a.x - start.x, y: a.y - start.y }, { x: dx, y: dy }) / denominator;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
  }
  const ordered = [...new Set(cuts.filter((t) => t >= -1e-9 && t <= 1 + 1e-9)
    .map((t) => Math.max(0, Math.min(1, t))).sort((a, b) => a - b))];
  const intervals: [number, number][] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const a = ordered[index]!, b = ordered[index + 1]!, middle = (a + b) / 2;
    if (b - a > 1e-9 && pointInCadPolygon({ x: start.x + dx * middle, y: start.y + dy * middle }, [...vertices])) {
      intervals.push([a * length, b * length]);
    }
  }
  return intervals;
}

function sectionPolygon(entity: CadEntity): { vertices: { x: number; y: number }[]; heightMm: number | null; material: string | null } | null {
  if (entity.kind === "construction-line" && entity.attributes.role === "foundation-wall") {
    return { vertices: segmentRectangle(entity.geometry.start, entity.geometry.end, entity.attributes.widthMm),
      heightMm: entity.attributes.heightMm,
      material: known(entity.attributes.material) ? entity.attributes.material : null };
  }
  if (entity.kind === "footing") return {
    vertices: segmentRectangle(entity.geometry.start, entity.geometry.end, entity.attributes.widthMm),
    heightMm: entity.attributes.depthMm, material: known(entity.attributes.designReference) ? null : null,
  };
  if (entity.kind === "wall") return {
    vertices: segmentRectangle(entity.geometry.start, entity.geometry.end, entity.attributes.thicknessMm),
    heightMm: entity.attributes.heightMm, material: known(entity.attributes.material) ? entity.attributes.material : null,
  };
  if (entity.kind === "slab") return {
    vertices: entity.geometry.vertices, heightMm: entity.attributes.thicknessMm,
    material: known(entity.attributes.material) ? entity.attributes.material : null,
  };
  if (entity.kind === "construction-area" && ["pad", "column"].includes(entity.attributes.role)) return {
    vertices: entity.geometry.vertices, heightMm: entity.attributes.heightMm,
    material: known(entity.attributes.material) ? entity.attributes.material : null,
  };
  return null;
}

export function getFoundationSectionIntersections(
  document: CadDocument,
  section: FoundationSection,
): FoundationSectionIntersection[] {
  const cut = document.entities.find(({ id }) => id === section.cutEntityId);
  if (cut?.kind !== "construction-line" || cut.attributes.role !== "section-cut") {
    throw new Error(`Brak geometrii linii cięcia dla przekroju ${section.label}.`);
  }
  const dx = cut.geometry.end.x - cut.geometry.start.x, dy = cut.geometry.end.y - cut.geometry.start.y;
  const length = Math.hypot(dx, dy);
  const center = { x: (cut.geometry.start.x + cut.geometry.end.x) / 2, y: (cut.geometry.start.y + cut.geometry.end.y) / 2 };
  const half = section.visibilityRangeMm / 2;
  const rangeStart = { x: center.x - dx / length * half, y: center.y - dy / length * half };
  const rangeEnd = { x: center.x + dx / length * half, y: center.y + dy / length * half };
  const hits = document.entities.flatMap((entity) => {
    if (entity.id === cut.id) return [];
    const polygon = sectionPolygon(entity);
    if (!polygon) return [];
    return polygonIntervals(rangeStart, rangeEnd, polygon.vertices).map(([startMm, endMm]) => ({
      elementId: entity.id, elementType: entity.kind, startMm, endMm,
      heightMm: polygon.heightMm, verticalOffsetMm: 0, baseElevationM: null,
      material: polygon.material, dataSource: "element_instance" as const,
    }));
  });
  for (const hit of hits) {
    const host = document.entities.find((entity) => entity.id === hit.elementId);
    if (host?.kind !== "construction-line" || host.attributes.role !== "foundation-wall") continue;
    const support = document.entities.find((entity) => entity.kind === "footing"
      && entity.supportFor?.includes(host.id) && hits.some(({ elementId }) => elementId === entity.id));
    if (support?.kind === "footing") hit.verticalOffsetMm = support.attributes.depthMm;
  }
  return hits.sort((a, b) => a.startMm - b.startMm || a.endMm - b.endMm);
}

export function synchronizeFoundationSections(document: CadDocument): CadDocument {
  if (!document.sections?.length) return document;
  return {
    ...document,
    sections: document.sections.map((section) => {
      const linkedElementIds = getFoundationSectionIntersections(document, section)
        .map(({ elementId }) => elementId).filter((id, index, ids) => ids.indexOf(id) === index);
      const trackedIds = section.automaticKey ? section.sourceElementIds ?? section.linkedElementIds ?? linkedElementIds : linkedElementIds;
      const fingerprint = foundationSectionFingerprint(document, trackedIds);
      return {
        ...section,
        linkedElementIds,
        state: section.sourceFingerprint && section.sourceFingerprint !== fingerprint ? "outdated" : section.state,
      };
    }),
  };
}

export function foundationSectionMissingFields(
  document: CadDocument,
  section: FoundationSection,
): FoundationSectionField[] {
  const values = resolveFoundationSectionValues(document, section);
  const required: FoundationSectionField[] = section.kind === "column-pad"
    ? ["foundation_bottom_elevation_m", "ground_elevation_m", "pad_height_cm", "column_width_cm", "column_length_cm"]
    : section.kind === "beam"
      ? ["foundation_bottom_elevation_m", "beam_width_cm", "beam_height_cm"]
      : ["foundation_bottom_elevation_m", "ground_elevation_m", "wall_height_cm", "wall_thickness_cm"];
  if (section.kind === "wall-footing") required.push("footing_width_cm", "footing_height_cm");
  return required.filter((field) => !values[field]);
}

export function foundationSectionState(document: CadDocument, section: FoundationSection): NonNullable<FoundationSection["state"]> {
  if (section.state === "outdated") return "outdated";
  if (foundationSectionMissingFields(document, section).length) return "incomplete";
  return document.entities.some((entity) => section.linkedElementIds?.includes(entity.id) && entity.reviewStatus !== "verified")
    ? "needs-review" : "complete";
}

export function calculateFoundationSectionMaterials(
  document: CadDocument,
  section: FoundationSection,
): FoundationMaterialQuantity[] {
  const wastePercent = section.wastePercent ?? 0;
  const ids = new Set(section.linkedElementIds ?? getFoundationSectionIntersections(document, section).map(({ elementId }) => elementId));
  const quantities: FoundationMaterialQuantity[] = [];
  const add = (key: string, entity: CadEntity, label: string, material: string | null, unit: "m3" | "m2", net: number, warning?: string) => {
    if (!(net > 0)) return;
    quantities.push({ key, elementIds: [entity.id], label, material, unit, net: round(net),
      wastePercent, gross: round(net * (1 + wastePercent / 100)), warning });
  };
  for (const entity of document.entities) {
    if (!ids.has(entity.id)) continue;
    if (entity.kind === "construction-line" && entity.attributes.role === "foundation-wall") {
      const length = segmentLength(entity);
      add(`wall:${entity.id}`, entity, `Ściana ${entity.mark ?? entity.id}`, entity.attributes.material, "m3",
        length * entity.attributes.widthMm * entity.attributes.heightMm / 1e9);
      for (const layer of entity.buildUp ?? []) {
        const sides = layer.side === "both" ? 2 : 1;
        add(`layer:${entity.id}:${layer.purpose}:${layer.side}`, entity,
          `${layer.purpose === "thermal" ? "Termoizolacja" : layer.purpose === "waterproofing" ? "Hydroizolacja" : "Warstwa"} ${entity.mark ?? ""}`.trim(),
          layer.material, "m2", length * entity.attributes.heightMm * sides / 1e6);
      }
    } else if (entity.kind === "footing") {
      add(`footing:${entity.id}`, entity, `Ława ${entity.mark ?? entity.id}`, null, "m3",
        segmentLength(entity) * entity.attributes.widthMm * entity.attributes.depthMm / 1e9,
        "Ilość nie odejmuje nakładania ław w węzłach; wymaga kontroli przed zamówieniem.");
    } else if (entity.kind === "construction-area" && ["pad", "column"].includes(entity.attributes.role)) {
      add(`${entity.attributes.role}:${entity.id}`, entity,
        `${entity.attributes.role === "pad" ? "Stopa" : "Słup"} ${entity.mark ?? entity.id}`,
        known(entity.attributes.material) ? entity.attributes.material : null, "m3",
        polygonArea(entity.geometry.vertices) * entity.attributes.heightMm / 1e9);
    } else if (entity.kind === "construction-line" && entity.attributes.role === "beam") {
      add(`beam:${entity.id}`, entity, `Belka ${entity.mark ?? entity.id}`, known(entity.attributes.material) ? entity.attributes.material : null,
        "m3", segmentLength(entity) * entity.attributes.widthMm * entity.attributes.heightMm / 1e9);
    } else if (entity.kind === "slab") {
      add(`slab:${entity.id}`, entity, `Płyta ${entity.mark ?? entity.id}`, entity.attributes.material, "m3",
        polygonArea(entity.geometry.vertices) * entity.attributes.thicknessMm / 1e9);
    }
  }
  return quantities;
}

export function resolveFoundationSectionValues(
  document: CadDocument,
  section: FoundationSection,
): Partial<Record<FoundationSectionField, ResolvedFoundationSectionValue>> {
  const intersections = getFoundationSectionIntersections(document, section);
  const conflicts = new Set(getFoundationSectionConflicts(document, section));
  const first = (predicate: (entity: CadEntity) => boolean) =>
    document.entities.find((entity) => intersections.some(({ elementId }) => elementId === entity.id) && predicate(entity));
  const wall = first((entity) => entity.kind === "construction-line" && entity.attributes.role === "foundation-wall" || entity.kind === "wall");
  const footing = first((entity) => entity.kind === "footing");
  const pad = first((entity) => entity.kind === "construction-area" && entity.attributes.role === "pad");
  const column = first((entity) => entity.kind === "construction-area" && entity.attributes.role === "column");
  const beam = first((entity) => entity.kind === "construction-line" && entity.attributes.role === "beam");
  const values: Partial<Record<FoundationSectionField, ResolvedFoundationSectionValue>> = {};
  const assign = (field: FoundationSectionField, value: number | string | null | undefined, unit: ResolvedFoundationSectionValue["unit"]) => {
    if (!conflicts.has(field) && value !== null && value !== undefined && value !== "" && (typeof value !== "string" || known(value))) {
      values[field] = { value, unit, source: "element_instance", validated: true };
    }
  };
  if (wall?.kind === "construction-line") {
    assign("wall_thickness_cm", wall.attributes.widthMm / 10, "cm");
    assign("wall_height_cm", wall.attributes.heightMm / 10, "cm");
    assign("wall_material", wall.attributes.material, "tekst");
    assign("waterproofing_type", wall.buildUp?.find(({ purpose }) => purpose === "waterproofing")?.material, "tekst");
    assign("xps_thickness_cm", wall.buildUp?.find(({ purpose }) => purpose === "thermal")?.thicknessMm !== undefined
      ? wall.buildUp.find(({ purpose }) => purpose === "thermal")!.thicknessMm / 10 : null, "cm");
  } else if (wall?.kind === "wall") {
    assign("wall_thickness_cm", wall.attributes.thicknessMm / 10, "cm");
    assign("wall_height_cm", wall.attributes.heightMm / 10, "cm");
    assign("wall_material", wall.attributes.material, "tekst");
  }
  if (footing?.kind === "footing") {
    assign("footing_width_cm", footing.attributes.widthMm / 10, "cm");
    assign("footing_height_cm", footing.attributes.depthMm / 10, "cm");
  }
  if (pad?.kind === "construction-area") {
    const bounds = polygonBounds(pad.geometry.vertices);
    assign("pad_length_cm", (bounds.maxX - bounds.minX) / 10, "cm");
    assign("pad_width_cm", (bounds.maxY - bounds.minY) / 10, "cm");
    assign("pad_height_cm", pad.attributes.heightMm / 10, "cm");
    assign("pad_material", pad.attributes.material, "tekst");
  }
  if (column?.kind === "construction-area") {
    const bounds = polygonBounds(column.geometry.vertices);
    assign("column_length_cm", (bounds.maxX - bounds.minX) / 10, "cm");
    assign("column_width_cm", (bounds.maxY - bounds.minY) / 10, "cm");
    assign("column_material", column.attributes.material, "tekst");
  }
  if (beam?.kind === "construction-line") {
    assign("beam_width_cm", beam.attributes.widthMm / 10, "cm");
    assign("beam_height_cm", beam.attributes.heightMm / 10, "cm");
    assign("beam_material", beam.attributes.material, "tekst");
  }
  const dimensionedSlab = first((entity) => entity.kind === "slab");
  if (dimensionedSlab?.kind === "slab") assign("concrete_class", dimensionedSlab.attributes.material, "tekst");
  for (const [field, override] of Object.entries(section.overrides) as [FoundationSectionField, FoundationSection["overrides"][FoundationSectionField]][]) {
    if (override) values[field] = { ...override, source: override.source ?? "section_override" };
  }
  return values;
}
