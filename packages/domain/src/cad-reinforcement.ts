import { CadEntitySchema, ReinforcementLayoutSchema, type ReinforcementLayout, type CadEntity, type CadDocument } from "@asystent/schemas";
export { ReinforcementLayoutSchema, type ReinforcementLayout } from "@asystent/schemas";

export function createReinforcementLayout(input: ReinforcementLayout, createId: () => string): CadEntity[] {
  const p = ReinforcementLayoutSchema.parse(input);
  const entities: CadEntity[] = [];
  const c = p.coverMm + (p.mode === "beam" && p.heightMm ? p.transverseDiameterMm + p.diameterMm / 2
    : Math.max(p.diameterMm, p.transverseDiameterMm) / 2);
  const x1 = p.origin.x + c, x2 = p.origin.x + p.lengthMm - c;
  const y1 = p.origin.y + c, y2 = p.origin.y + p.widthMm - c;
  const line = (x: number, y: number, xx: number, yy: number, diameterMm: number, layerId: string) => {
    entities.push(CadEntitySchema.parse({ id: createId(), kind: "rebar-line", layerId, units: "mm", reviewStatus: "draft",
      source: { origin: "manual", documentId: null, page: null, confidence: null },
      geometry: { start: { x, y }, end: { x: xx, y: yy } },
      attributes: { diameterMm, count: 1, coverMm: p.coverMm, steelGrade: p.steelGrade,
        designReference: p.designReference, specialistVerified: false,
        representation: layerId === "rebar-stirrups-projection" ? "projection" : "physical" } }));
  };
  const positions = (a: number, b: number) => {
    const values: number[] = [];
    for (let position = a; position <= b + 0.001; position += p.spacingMm) values.push(Math.min(position, b));
    return values;
  };
  const rows = p.mode === "beam" ? Array.from({ length: p.longitudinalCount }, (_, i) =>
    y1 + i * (y2 - y1) / (p.longitudinalCount - 1)) : positions(y1, y2);
  if (p.mode === "beam" && p.heightMm) {
    const top = p.topBarCount ?? Math.floor(p.longitudinalCount / 2);
    for (const [count, layer] of [[top, "rebar-top"], [p.longitudinalCount - top, "rebar-bottom"]] as const) {
      Array.from({ length: count }, (_, i) => count === 1 ? (y1 + y2) / 2 : y1 + i * (y2 - y1) / (count - 1))
        .forEach((y) => line(x1, y, x2, y, p.diameterMm, layer));
    }
  } else rows.forEach((y) => line(x1, y, x2, y, p.diameterMm, "rebar-longitudinal"));
  positions(x1, x2).forEach((x) => line(x, y1, x, y2, p.transverseDiameterMm, p.mode === "beam" ? "rebar-stirrups-projection" : "rebar-transverse"));
  const common = { units: "mm", reviewStatus: "draft", source: { origin: "manual", documentId: null, page: null, confidence: null } };
  entities.push(CadEntitySchema.parse({ ...common, id: createId(), kind: "annotation", layerId: "annotation",
    geometry: { point: { x: p.origin.x, y: p.origin.y - 250 } },
    attributes: { text: `${p.mode === "beam" ? `Belka: ${p.longitudinalCount} prętów` : "Siatka"} Ø${p.diameterMm}; ${p.mode === "beam" ? "strzemiona w rzucie" : "kierunek poprzeczny"} Ø${p.transverseDiameterMm} co ${p.spacingMm} mm · ${p.designReference}` } }));
  for (const [end, measuredMm] of [[{ x: p.origin.x + p.lengthMm, y: p.origin.y }, p.lengthMm],
    [{ x: p.origin.x, y: p.origin.y + p.widthMm }, p.widthMm]] as const) {
    entities.push(CadEntitySchema.parse({ ...common, id: createId(), kind: "dimension", layerId: "dimension",
      geometry: { start: p.origin, end }, attributes: { measuredMm, label: "" } }));
  }
  if (p.mode === "beam" && p.heightMm) {
    const topCount = p.topBarCount ?? Math.floor(p.longitudinalCount / 2);
    entities.push(CadEntitySchema.parse({ ...common, id: createId(), kind: "rebar-annotation", layerId: "rebar-section",
      geometry: { point: { x: p.origin.x + p.lengthMm + p.widthMm, y: p.origin.y } },
      attributes: { label: `Przekrój belki ${p.widthMm}×${p.heightMm} mm · ${p.steelGrade} · ${p.designReference}`,
        designReference: p.designReference, diameterMm: p.diameterMm, lengthMm: p.lengthMm, count: p.longitudinalCount,
        specialistVerified: false, section: { widthMm: p.widthMm, heightMm: p.heightMm, coverMm: p.coverMm,
          topCount, bottomCount: p.longitudinalCount - topCount, stirrupDiameterMm: p.transverseDiameterMm } } }));
  }
  return entities;
}

export function placeReinforcementOnHost(entities: CadEntity[], host: CadEntity, offsetMm: number, createId: () => string): CadEntity[] {
  if (!("start" in host.geometry) || !Number.isFinite(offsetMm) || offsetMm < 0) throw new Error("Wybierz ścianę, ławę lub belkę i dodatnią odległość od jej początku.");
  const { start, end } = host.geometry;
  const length = Math.hypot(end.x - start.x, end.y - start.y), ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
  const dimensions = entities.filter((e) => e.kind === "dimension");
  const layoutLength = dimensions[0]?.kind === "dimension" ? dimensions[0].attributes.measuredMm : 0;
  const width = dimensions[1]?.kind === "dimension" ? dimensions[1].attributes.measuredMm : 0;
  if (!layoutLength || !width || layoutLength + offsetMm > length + .001) throw new Error("Układ zbrojenia wykracza poza długość wskazanego podparcia.");
  const groupId = createId();
  const point = (p: { x: number; y: number }) => ({ x: start.x + ux * (p.x + offsetMm) - uy * (p.y - width / 2),
    y: start.y + uy * (p.x + offsetMm) + ux * (p.y - width / 2) });
  return entities.map((e) => CadEntitySchema.parse({ ...e,
    placement: { hostId: host.id, groupId, start, end, needsReview: false },
    geometry: "start" in e.geometry ? { start: point(e.geometry.start), end: point(e.geometry.end) }
      : "vertices" in e.geometry ? { vertices: e.geometry.vertices.map(point) }
        : { point: e.kind === "rebar-annotation" && e.attributes.section
          ? point({ x: layoutLength / 2, y: width / 2 + e.attributes.section.heightMm * 2 }) : point(e.geometry.point) },
  }));
}

export function synchronizeReinforcementPlacement(document: CadDocument): CadDocument {
  return { ...document, entities: document.entities.map((e) => {
    const placement = e.placement;
    if (!placement) return e;
    const host = document.entities.find((candidate) => candidate.id === placement.hostId);
    if (!host || !("start" in host.geometry)) throw new Error("Zbrojenie straciło podparcie. Usuń układ lub przypisz go ponownie.");
    const oldLength = Math.hypot(placement.end.x - placement.start.x, placement.end.y - placement.start.y);
    const { start, end } = host.geometry;
    const newLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (!oldLength || !newLength) throw new Error("Podparcie zbrojenia ma zerową długość.");
    const ux = (end.x - start.x) / newLength, uy = (end.y - start.y) / newLength;
    const ox = (placement.end.x - placement.start.x) / oldLength, oy = (placement.end.y - placement.start.y) / oldLength;
    const point = (p: { x: number; y: number }) => {
      const x = p.x - placement.start.x, y = p.y - placement.start.y, along = x * ox + y * oy, across = -x * oy + y * ox;
      return { x: start.x + ux * along - uy * across, y: start.y + uy * along + ux * across };
    };
    return CadEntitySchema.parse({ ...e, reviewStatus: "draft",
      placement: { ...placement, start, end, needsReview: placement.needsReview || Math.abs(newLength - oldLength) > .001 },
      geometry: "start" in e.geometry ? { start: point(e.geometry.start), end: point(e.geometry.end) }
        : "vertices" in e.geometry ? { vertices: e.geometry.vertices.map(point) } : { point: point(e.geometry.point) },
    });
  }) };
}
