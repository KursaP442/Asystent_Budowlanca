import { CadDocumentSchema, CadEntitySchema, type CadDocument, type CadEntity, type FoundationBase } from "@asystent/schemas";
import { isSimplePolygon, offsetPolygon, segmentRectangle } from "@asystent/geometry";

export class FoundationAssemblyError extends Error {}

export function synchronizeFoundationSupports(document: CadDocument, createId: () => string): CadDocument {
  const walls = document.entities.filter((e) => e.kind === "construction-line" && e.attributes.role === "foundation-wall" && e.foundationBase && !e.derivedFrom);
  const supports: CadEntity[] = [];
  for (const wall of walls) {
    if (wall.kind !== "construction-line" || wall.foundationBase?.type !== "strip") continue;
    const base = wall.foundationBase;
    if (base.widthMm < wall.attributes.widthMm) throw new FoundationAssemblyError("Ława jest węższa niż ściana. Sprawdź dane konstrukcyjne.");
    const previous = document.entities.find((e) => e.kind === "footing" && e.supportFor?.length === 1 && e.supportFor[0] === wall.id);
    supports.push(CadEntitySchema.parse({
      id: previous?.id ?? createId(), kind: "footing", layerId: "footing", units: "mm", reviewStatus: "draft",
      source: wall.source, geometry: wall.geometry, supportFor: [wall.id],
      attributes: { widthMm: base.widthMm, depthMm: base.depthMm, designReference: base.designReference },
    }));
  }
  const boundaryWalls = walls.filter((e) => e.foundationBase?.type === "slab" && e.foundationBase.boundary);
  const nodes: { x: number; y: number }[] = [];
  const node = (p: { x: number; y: number }) => {
    const found = nodes.findIndex((n) => Math.hypot(n.x - p.x, n.y - p.y) < .001);
    if (found >= 0) return found;
    nodes.push(p); return nodes.length - 1;
  };
  const edges = boundaryWalls.flatMap((wall) => wall.kind === "construction-line" ? [{
    wall, a: node(wall.geometry.start), b: node(wall.geometry.end),
  }] : []);
  const visited = new Set<number>();
  for (let first = 0; first < edges.length; first++) {
    if (visited.has(first)) continue;
    const component: number[] = [], pending = [first];
    while (pending.length) {
      const index = pending.pop()!;
      if (visited.has(index)) continue;
      visited.add(index); component.push(index);
      const edge = edges[index]!;
      edges.forEach((other, j) => { if (!visited.has(j) && [edge.a, edge.b].some((n) => n === other.a || n === other.b)) pending.push(j); });
    }
    const degree = new Map<number, number>();
    component.forEach((i) => { const e = edges[i]!; for (const n of [e.a, e.b]) degree.set(n, (degree.get(n) ?? 0) + 1); });
    if ([...degree.values()].some((d) => d > 2)) throw new FoundationAssemblyError("Obwód płyty ma rozgałęzienie. Ściany wewnętrzne oznacz jako nieobwodowe.");
    if (component.length < 3 || [...degree.values()].some((d) => d !== 2)) continue;
    const ordered: typeof edges = [];
    let at = edges[component[0]!]!.a;
    const remaining = new Set(component);
    const vertices: typeof nodes = [];
    while (remaining.size) {
      const index = [...remaining].find((i) => edges[i]!.a === at || edges[i]!.b === at);
      if (index === undefined) throw new FoundationAssemblyError("Obwód płyty nie tworzy jednej zamkniętej pętli.");
      const edge = edges[index]!;
      remaining.delete(index); vertices.push(nodes[at]!); ordered.push(edge); at = edge.a === at ? edge.b : edge.a;
    }
    const base = ordered[0]!.wall.foundationBase;
    if (base?.type !== "slab") throw new FoundationAssemblyError("Brak parametrów płyty.");
    if (ordered.some(({ wall }) => wall.foundationBase?.type !== "slab" || wall.foundationBase.thicknessMm !== base.thicknessMm
      || wall.foundationBase.overhangMm !== base.overhangMm || wall.foundationBase.material !== base.material)) {
      throw new FoundationAssemblyError("Ściany jednego obwodu muszą wskazywać te same parametry płyty.");
    }
    const outline = offsetPolygon(vertices, ordered.map(({ wall }) => wall.attributes.widthMm / 2 + base.overhangMm));
    if (!isSimplePolygon(outline) || outline.some((p) => Math.abs(p.x) > 100000000 || Math.abs(p.y) > 100000000)) {
      throw new FoundationAssemblyError("Obwód płyty przecina sam siebie lub przekracza zakres współrzędnych. Popraw ściany lub odsunięcie.");
    }
    const ids = ordered.map(({ wall }) => wall.id).sort();
    const previous = document.entities.find((e) => e.kind === "slab" && e.supportFor?.slice().sort().join() === ids.join());
    supports.push(CadEntitySchema.parse({
      id: previous?.id ?? createId(), kind: "slab", layerId: "slab", units: "mm", reviewStatus: "draft",
      source: ordered[0]!.wall.source, supportFor: ids, geometry: { vertices: outline },
      attributes: { thicknessMm: base.thicknessMm, material: base.material },
    }));
  }
  const entities = [...supports, ...document.entities.filter((e) => !e.supportFor || e.derivedFrom)];
  return CadDocumentSchema.parse({ ...document, entities });
}

export interface FoundationWallSetup {
  widthMm: number; heightMm: number; material: string; base: FoundationBase; buildUp: NonNullable<CadEntity["buildUp"]>;
}

export function configureFoundationWall(entity: CadEntity, setup: FoundationWallSetup): CadEntity {
  if (entity.kind !== "construction-line" || entity.attributes.role !== "foundation-wall") throw new Error("Wybierz ścianę fundamentową.");
  if (setup.base.type === "strip" && setup.base.widthMm < setup.widthMm) throw new Error("Ława jest węższa niż ściana. Sprawdź dane konstrukcyjne.");
  return CadEntitySchema.parse({ ...entity, foundationBase: setup.base, buildUp: setup.buildUp,
    attributes: { ...entity.attributes, widthMm: setup.widthMm, heightMm: setup.heightMm,
      material: setup.material, designReference: setup.base.designReference } });
}

export function foundationPlanExtents(document: CadDocument): { x: number; y: number }[] {
  const points = document.entities.flatMap((e) => {
    if (e.kind === "slab" || e.kind === "construction-area" && ["pad", "column"].includes(e.attributes.role)) return e.geometry.vertices;
    if (e.kind !== "footing" && e.kind !== "wall" && !(e.kind === "construction-line" && e.attributes.role === "foundation-wall")) return [];
    const width = e.kind === "wall" ? e.attributes.thicknessMm : e.attributes.widthMm;
    const { start, end } = e.geometry, length = Math.hypot(end.x - start.x, end.y - start.y);
    const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
    let left = width / 2, right = width / 2;
    for (const layer of e.buildUp ?? []) {
      if (layer.side !== "right") left += layer.thicknessMm;
      if (layer.side !== "left") right += layer.thicknessMm;
    }
    return [...segmentRectangle(start, end, width),
      { x: start.x + nx * left, y: start.y + ny * left }, { x: end.x + nx * left, y: end.y + ny * left },
      { x: start.x - nx * right, y: start.y - ny * right }, { x: end.x - nx * right, y: end.y - ny * right }];
  });
  if (!points.length) return [];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return [{ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.min(...ys) },
    { x: Math.max(...xs), y: Math.max(...ys) }, { x: Math.min(...xs), y: Math.max(...ys) }];
}
