import type { CadDocument, CadEntity, FoundationSection, FoundationSectionField } from "@asystent/schemas";
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
  source: "section_override" | "element_instance";
  validated: boolean;
}

const known = (value: string) => value.trim() && !/do uzupełnienia|uzupełnij|unknown|^—$/i.test(value);
const cross = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.y - a.y * b.x;

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
    sections: document.sections.map((section) => ({
      ...section,
      linkedElementIds: getFoundationSectionIntersections(document, section)
        .map(({ elementId }) => elementId).filter((id, index, ids) => ids.indexOf(id) === index),
    })),
  };
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
  const dimensionedSlab = first((entity) => entity.kind === "slab");
  if (dimensionedSlab?.kind === "slab") assign("concrete_class", dimensionedSlab.attributes.material, "tekst");
  for (const [field, override] of Object.entries(section.overrides) as [FoundationSectionField, FoundationSection["overrides"][FoundationSectionField]][]) {
    if (override) values[field] = { ...override, source: "section_override" };
  }
  return values;
}
