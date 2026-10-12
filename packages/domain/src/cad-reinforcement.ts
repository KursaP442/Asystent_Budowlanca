import { CadEntitySchema, ReinforcementLayoutSchema, type ReinforcementLayout, type CadEntity } from "@asystent/schemas";
export { ReinforcementLayoutSchema, type ReinforcementLayout } from "@asystent/schemas";

export function createReinforcementLayout(input: ReinforcementLayout, createId: () => string): CadEntity[] {
  const p = ReinforcementLayoutSchema.parse(input);
  const entities: CadEntity[] = [];
  const c = p.coverMm + Math.max(p.diameterMm, p.transverseDiameterMm) / 2;
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
  rows.forEach((y) => line(x1, y, x2, y, p.diameterMm, "rebar-longitudinal"));
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
  return entities;
}
