import { z } from "zod";

export const ReinforcementBendSchema = z.object({
  lengthMm: z.number().finite().positive().max(100_000),
  angleDegrees: z.number().finite().min(-360).max(360),
  radiusMm: z.number().finite().positive().max(10_000),
  plane: z.enum(["xy", "xz", "yz", "spatial"]),
  azimuthDegrees: z.number().finite().min(-360).max(360).optional(),
  elevationDegrees: z.number().finite().min(-90).max(90).optional(),
}).strict();
export type ReinforcementBend = z.infer<typeof ReinforcementBendSchema>;

export const ReinforcementShapeSchema = z.object({
  kind: z.enum(["straight", "custom", "L", "U", "Z", "hook", "stirrup"]),
  bends: z.array(ReinforcementBendSchema).min(1).max(200),
  diameterMm: z.number().finite().positive().max(100).optional(),
  rotationDegrees: z.number().finite().min(-360).max(360).optional(),
  endHookStartDegrees: z.number().finite().min(-360).max(360).optional(),
  endHookEndDegrees: z.number().finite().min(-360).max(360).optional(),
  manufacturingWarning: z.string().trim().max(500).optional(),
}).strict();
export type ReinforcementShape = z.infer<typeof ReinforcementShapeSchema>;

export const ReinforcementShapeLibraryItemSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["bend", "stirrup"]),
  shape: ReinforcementShapeSchema,
  createdAt: z.string().datetime(),
}).strict().superRefine((item, ctx) => {
  if (item.category === "stirrup" && item.shape.kind !== "stirrup") {
    ctx.addIssue({ code: "custom", path: ["shape", "kind"], message: "Szablon strzemienia musi mieć typ strzemienia." });
  }
  if (item.category === "bend" && item.shape.kind === "stirrup") {
    ctx.addIssue({ code: "custom", path: ["shape", "kind"], message: "Podgięcie nie może mieć typu strzemienia." });
  }
  for (const [index, bend] of item.shape.bends.entries()) {
    if (bend.lengthMm < 50) {
      ctx.addIssue({ code: "custom", path: ["shape", "bends", index, "lengthMm"],
        message: "Każdy odcinek musi mieć co najmniej 50 mm." });
    }
    if (bend.angleDegrees !== 0 && Math.abs(bend.angleDegrees) < 1) {
      ctx.addIssue({ code: "custom", path: ["shape", "bends", index, "angleDegrees"],
        message: "Kąt musi wynosić 0° albo co najmniej 1°." });
    }
  }
});
export type ReinforcementShapeLibraryItem = z.infer<typeof ReinforcementShapeLibraryItemSchema>;

export const ReinforcementStirrupConcentrationSchema = z.object({
  id: z.uuid(),
  startMm: z.number().finite().min(0).max(100_000),
  endMm: z.number().finite().positive().max(100_000),
  spacingMm: z.number().finite().positive().max(10_000),
  bundleCount: z.number().int().min(1).max(4),
  bundleGapMm: z.number().finite().min(0).max(1_000),
  bundleDirection: z.enum(["left", "right", "up", "down"]).optional(),
}).strict().refine((value) => value.endMm > value.startMm,
  "Koniec zagęszczenia musi leżeć za jego początkiem.");
export type ReinforcementStirrupConcentration = z.infer<typeof ReinforcementStirrupConcentrationSchema>;

export const ReinforcementStirrupZoneSchema = z.object({
  id: z.uuid(),
  shapeTemplateId: z.uuid(),
  shapeName: z.string().trim().min(1).max(120),
  shape: ReinforcementShapeSchema,
  startMm: z.number().finite().min(0).max(100_000),
  endMm: z.number().finite().positive().max(100_000),
  spacingMm: z.number().finite().positive().max(10_000),
  bundleCount: z.number().int().min(1).max(4),
  bundleGapMm: z.number().finite().min(0).max(1_000),
  bundleDirection: z.enum(["left", "right", "up", "down"]).optional(),
  widthAlignment: z.enum(["center", "left", "right"]).optional(),
  heightAlignment: z.enum(["center", "top", "bottom"]).optional(),
  oversizeAccepted: z.boolean().optional(),
  concentrations: z.array(ReinforcementStirrupConcentrationSchema).max(20),
}).strict().superRefine((zone, ctx) => {
  if (zone.shape.kind !== "stirrup") {
    ctx.addIssue({ code: "custom", path: ["shape"], message: "Strefa belki wymaga kształtu strzemienia." });
  }
  if (zone.endMm <= zone.startMm) {
    ctx.addIssue({ code: "custom", path: ["endMm"], message: "Koniec strefy musi leżeć za jej początkiem." });
  }
  let previousEnd = zone.startMm;
  for (const [index, concentration] of zone.concentrations.entries()) {
    if (concentration.startMm < zone.startMm || concentration.endMm > zone.endMm) {
      ctx.addIssue({ code: "custom", path: ["concentrations", index],
        message: "Zagęszczenie musi mieścić się w swojej strefie strzemion." });
    }
    if (concentration.startMm < previousEnd) {
      ctx.addIssue({ code: "custom", path: ["concentrations", index],
        message: "Zagęszczenia nie mogą się nakładać i muszą być uporządkowane." });
    }
    previousEnd = concentration.endMm;
  }
});
export type ReinforcementStirrupZone = z.infer<typeof ReinforcementStirrupZoneSchema>;

export const ReinforcementStandardMainBarsSchema = z.object({
  diameterMm: z.number().finite().positive().max(100),
}).strict();
export type ReinforcementStandardMainBars = z.infer<typeof ReinforcementStandardMainBarsSchema>;

export const ReinforcementBeamCustomMainBarSchema = z.object({
  id: z.uuid(),
  anchorZoneId: z.uuid(),
  bundleIndex: z.number().int().min(0).max(3),
  slotSide: z.enum(["top", "right", "bottom", "left"]),
  slotRatio: z.number().finite().min(0).lt(1),
  diameterMm: z.number().finite().positive().max(100),
  lengthMm: z.number().finite().positive().max(100_000),
  fromSide: z.enum(["start", "end"]),
  fullBeam: z.boolean().optional(),
  /** Wypust drutu poza zakres jego strzemion — od lewej (początek) i prawej (koniec) strony. */
  extensionStartMm: z.number().finite().min(0).max(100_000).optional(),
  extensionEndMm: z.number().finite().min(0).max(100_000).optional(),
}).strict();
export type ReinforcementBeamCustomMainBar = z.infer<typeof ReinforcementBeamCustomMainBarSchema>;

export const ReinforcementBeamAssemblySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  hostIds: z.array(z.uuid()).min(1).max(200),
  lengthMm: z.number().finite().positive().max(100_000),
  widthMm: z.number().finite().positive().max(100_000),
  heightMm: z.number().finite().positive().max(100_000),
  firstStirrupMm: z.number().finite().min(0).max(100_000),
  lastStirrupMm: z.number().finite().min(0).max(100_000),
  zones: z.array(ReinforcementStirrupZoneSchema).max(100),
  standardMainBars: ReinforcementStandardMainBarsSchema.optional(),
  customMainBars: z.array(ReinforcementBeamCustomMainBarSchema).max(200).optional(),
  status: z.enum(["draft", "needs-review"]),
}).strict().superRefine((assembly, ctx) => {
  if (new Set(assembly.hostIds).size !== assembly.hostIds.length) {
    ctx.addIssue({ code: "custom", path: ["hostIds"], message: "Hosty belki nie mogą się powtarzać." });
  }
  if (assembly.firstStirrupMm >= assembly.lastStirrupMm || assembly.lastStirrupMm > assembly.lengthMm) {
    ctx.addIssue({ code: "custom", path: ["lastStirrupMm"],
      message: "Zakres strzemion musi mieścić się w długości belki." });
  }
  if (assembly.standardMainBars && !assembly.zones.length) {
    ctx.addIssue({ code: "custom", path: ["standardMainBars"],
      message: "Standardowe druty wymagają co najmniej jednego strzemienia." });
  }
  const zoneIds = new Set(assembly.zones.map((zone) => zone.id));
  for (const [index, bar] of (assembly.customMainBars ?? []).entries()) {
    if (!zoneIds.has(bar.anchorZoneId)) {
      ctx.addIssue({ code: "custom", path: ["customMainBars", index, "anchorZoneId"],
        message: "Drut niestandardowy musi być osadzony w strzemieniu istniejącej strefy." });
    }
  }
  let previousEnd = assembly.firstStirrupMm;
  for (const [index, zone] of assembly.zones.entries()) {
    if (zone.startMm < assembly.firstStirrupMm || zone.endMm > assembly.lastStirrupMm) {
      ctx.addIssue({ code: "custom", path: ["zones", index],
        message: "Strefa strzemion wykracza poza dopuszczalny zakres belki." });
    }
    if (Math.abs(zone.startMm - previousEnd) > 0.001) {
      ctx.addIssue({ code: "custom", path: ["zones", index, "startMm"],
        message: "Każda kolejna strefa musi zaczynać się dokładnie na końcu poprzedniej." });
    }
    previousEnd = zone.endMm;
  }
});
export type ReinforcementBeamAssembly = z.infer<typeof ReinforcementBeamAssemblySchema>;

export const ReinforcementHostChainSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  elementType: z.enum(["strip-footing", "beam", "ring-beam", "wall", "custom"]),
  hostIds: z.array(z.uuid()).min(1).max(200),
  mainPathHostIds: z.array(z.uuid()).min(1).max(200),
  status: z.enum(["draft", "complete", "needs-review"]),
  geometryFingerprint: z.string().trim().min(1).max(500),
}).strict().superRefine((chain, ctx) => {
  if (new Set(chain.hostIds).size !== chain.hostIds.length) {
    ctx.addIssue({ code: "custom", path: ["hostIds"], message: "Odcinki elementu zbrojeniowego nie mogą się powtarzać." });
  }
  if (new Set(chain.mainPathHostIds).size !== chain.mainPathHostIds.length
    || chain.mainPathHostIds.some((id) => !chain.hostIds.includes(id))) {
    ctx.addIssue({ code: "custom", path: ["mainPathHostIds"], message: "Ciąg główny musi wskazywać unikalne odcinki połączonego elementu." });
  }
});
export type ReinforcementHostChain = z.infer<typeof ReinforcementHostChainSchema>;

export const ReinforcementTemplateBarSchema = z.object({
  layerId: z.string().trim().min(1).max(80),
  start: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  end: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  diameterMm: z.number().finite().positive().max(100),
  count: z.number().int().min(1).max(100_000),
  coverMm: z.number().finite().positive().max(10_000),
  steelGrade: z.string().trim().min(1).max(160),
  designReference: z.string().trim().min(1).max(240),
  representation: z.enum(["physical", "projection"]).optional(),
  shape: ReinforcementShapeSchema.optional(),
}).strict().refine((bar) => bar.start.x !== bar.end.x || bar.start.y !== bar.end.y,
  "Pręt szablonu musi mieć niezerową długość.");
export type ReinforcementTemplateBar = z.infer<typeof ReinforcementTemplateBarSchema>;

export const ReinforcementTemplateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  elementType: z.enum(["beam", "strip-footing", "column", "pad", "wall", "slab", "bar", "stirrup", "connection", "custom"]),
  sourceWidthMm: z.number().finite().positive().max(100_000).optional(),
  sourceHeightMm: z.number().finite().positive().max(100_000).optional(),
  bars: z.array(ReinforcementTemplateBarSchema).min(1).max(1000),
  createdAt: z.string().datetime(),
}).strict();
export type ReinforcementTemplate = z.infer<typeof ReinforcementTemplateSchema>;
