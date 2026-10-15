import { z } from "zod";
import { ReinforcementBeamAssemblySchema, ReinforcementHostChainSchema, ReinforcementShapeSchema,
  ReinforcementTemplateSchema } from "./reinforcement-geometry.js";

export const CadPointSchema = z.object({
  x: z.number().finite().min(-100_000_000).max(100_000_000),
  y: z.number().finite().min(-100_000_000).max(100_000_000),
}).strict();
export type CadPoint = z.infer<typeof CadPointSchema>;

const segment = z.object({ start: CadPointSchema, end: CadPointSchema }).strict().refine(
  ({ start, end }) => start.x !== end.x || start.y !== end.y,
  "Odcinek musi mieć niezerową długość.",
);
const polygon = z.object({
  vertices: z.array(CadPointSchema).min(3).max(1000),
}).strict();
const positiveMm = z.number().finite().positive().max(1_000_000);
const positiveCount = z.number().int().min(1).max(100_000);
export const FoundationBaseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("strip"), widthMm: positiveMm, depthMm: positiveMm,
    designReference: z.string().trim().min(1).max(240) }).strict(),
  z.object({ type: z.literal("slab"), thicknessMm: positiveMm, overhangMm: z.number().finite().min(0).max(10000),
    boundary: z.boolean(), material: z.string().trim().min(1).max(160),
    designReference: z.string().trim().min(1).max(240) }).strict(),
  z.object({ type: z.literal("manual"), designReference: z.string().trim().min(1).max(240) }).strict(),
]);
export type FoundationBase = z.infer<typeof FoundationBaseSchema>;
export const FoundationSettingsSchema = z.object({
  type: z.enum(["", "strip", "slab", "manual"]), side: z.enum(["interior", "exterior", "both"]),
  boundary: z.boolean(),
  wallWidth: z.string().max(40), wallHeight: z.string().max(40), wallMaterial: z.string().max(160),
  reference: z.string().max(240), baseWidth: z.string().max(40), baseDepth: z.string().max(40),
  slabThickness: z.string().max(40), overhang: z.string().max(40), slabMaterial: z.string().max(160),
  thermal: z.string().max(40), waterproof: z.string().max(40),
}).strict();
export type FoundationSettings = z.infer<typeof FoundationSettingsSchema>;
const common = {
  id: z.uuid(),
  layerId: z.string().trim().min(1).max(80),
  units: z.literal("mm"),
  reviewStatus: z.enum(["draft", "verified"]),
  source: z.object({
    documentId: z.uuid().nullable(),
    page: z.number().int().min(1).max(1000).nullable(),
    origin: z.enum(["manual", "openai"]),
    confidence: z.number().min(0).max(1).nullable(),
  }).strict(),
  buildUp: z.array(z.object({
    purpose: z.enum(["structure", "thermal", "waterproofing", "finish", "bedding"]),
    material: z.string().trim().min(1).max(160),
    thicknessMm: positiveMm,
    side: z.enum(["left", "right", "both", "interior", "exterior"]),
  }).strict()).max(20).optional(),
  derivedFrom: z.object({ documentId: z.uuid(), entityId: z.uuid(), revision: z.number().int().min(0) }).strict().optional(),
  foundationBase: FoundationBaseSchema.optional(),
  supportFor: z.array(z.uuid()).min(1).max(1000).optional(),
  relatedTo: z.array(z.uuid()).min(1).max(1000).optional(),
  placement: z.object({ hostId: z.uuid(), groupId: z.uuid(), start: CadPointSchema, end: CadPointSchema,
    needsReview: z.boolean(), transverseOffsetMm: z.number().finite().optional(),
    verticalOffsetMm: z.number().finite().optional() }).strict().optional(),
  mark: z.string().trim().min(1).max(40).optional(),
  attachment: z.object({ hostId: z.uuid(), start: CadPointSchema, end: CadPointSchema }).strict()
    .refine(({ start, end }) => start.x !== end.x || start.y !== end.y, "Podparcie nie może mieć zerowej długości.").optional(),
  infillFor: z.array(z.uuid()).min(3).max(1000).optional(),
};

export const CadEntitySchema = z.discriminatedUnion("kind", [
  z.object({
    ...common, kind: z.literal("construction-line"), geometry: segment,
    attributes: z.object({
      role: z.enum(["foundation-wall", "excavation", "beam", "lintel", "ring-beam", "rafter", "ridge", "gutter", "fence", "kerb", "drain", "axis", "section-cut"]),
      widthMm: positiveMm, heightMm: positiveMm, material: z.string().trim().min(1).max(160),
      designReference: z.string().trim().min(1).max(240),
    }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("construction-area"), geometry: polygon,
    attributes: z.object({
      role: z.enum(["column", "pad", "basement-area", "excavation", "section", "elevation", "paving", "finish", "ceiling", "terrain", "equipment", "void"]),
      thicknessMm: positiveMm, heightMm: positiveMm, material: z.string().trim().min(1).max(160),
      designReference: z.string().trim().min(1).max(240),
    }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("rebar-line"), geometry: segment,
    attributes: z.object({
      diameterMm: positiveMm, count: positiveCount, steelGrade: z.string().min(1).max(160),
      coverMm: positiveMm, designReference: z.string().min(1).max(240), specialistVerified: z.boolean(),
      representation: z.enum(["physical", "projection"]).optional(),
      shape: ReinforcementShapeSchema.optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("trace-line"), geometry: segment,
    attributes: z.object({ label: z.string().trim().min(1).max(160) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("trace-area"), geometry: polygon,
    attributes: z.object({ label: z.string().trim().min(1).max(160) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("wall"), geometry: segment,
    attributes: z.object({ thicknessMm: positiveMm, heightMm: positiveMm, material: z.string().trim().min(1).max(160) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("footing"), geometry: segment,
    attributes: z.object({ widthMm: positiveMm, depthMm: positiveMm, designReference: z.string().trim().min(1).max(240) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("slab"), geometry: polygon,
    attributes: z.object({ thicknessMm: positiveMm, material: z.string().trim().min(1).max(160) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("roof-plane"), geometry: polygon,
    attributes: z.object({ pitchDegrees: z.number().finite().min(0).max(89), material: z.string().trim().min(1).max(160) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("opening"), geometry: segment,
    attributes: z.object({ wallId: z.uuid(), heightMm: positiveMm, sillMm: z.number().min(0).max(100_000), type: z.enum(["door", "window", "other"]) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("pipe"), geometry: segment,
    attributes: z.object({ diameterMm: positiveMm, material: z.string().trim().min(1).max(160), system: z.enum(["water", "sewer", "heating", "ventilation", "electrical-conduit"]) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("dimension"), geometry: segment,
    attributes: z.object({ measuredMm: positiveMm, label: z.string().trim().max(160) }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("rebar-annotation"), geometry: z.object({ point: CadPointSchema }).strict(),
    attributes: z.object({
      label: z.string().trim().min(1).max(500),
      designReference: z.string().trim().min(1).max(240),
      diameterMm: positiveMm.nullable(), lengthMm: positiveMm.nullable(), count: positiveCount.nullable(),
      specialistVerified: z.boolean(),
      section: z.object({ widthMm: positiveMm, heightMm: positiveMm, coverMm: positiveMm,
        topCount: positiveCount, bottomCount: positiveCount, stirrupDiameterMm: positiveMm }).strict().optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("annotation"), geometry: z.object({ point: CadPointSchema }).strict(),
    attributes: z.object({ text: z.string().trim().min(1).max(1000), fontSizeMm: positiveMm.optional(),
      leader: CadPointSchema.optional() }).strict(),
  }).strict(),
]);
export type CadEntity = z.infer<typeof CadEntitySchema>;

export const FoundationSectionFieldSchema = z.enum([
  "footing_width_cm", "footing_height_cm", "wall_thickness_cm", "wall_height_cm",
  "pad_length_cm", "pad_width_cm", "pad_height_cm", "column_width_cm", "column_length_cm",
  "beam_width_cm", "beam_height_cm",
  "foundation_bottom_elevation_m", "ground_elevation_m", "zero_level_elevation_m",
  "footing_material", "pad_material", "column_material", "beam_material", "wall_material", "concrete_class", "xps_thickness_cm",
  "waterproofing_type", "blinding_concrete_thickness_cm", "floor_layers", "additional_components",
]);
export type FoundationSectionField = z.infer<typeof FoundationSectionFieldSchema>;
const foundationSectionNumericFields = new Set<FoundationSectionField>([
  "footing_width_cm", "footing_height_cm", "wall_thickness_cm", "wall_height_cm",
  "pad_length_cm", "pad_width_cm", "pad_height_cm", "column_width_cm", "column_length_cm",
  "beam_width_cm", "beam_height_cm",
  "foundation_bottom_elevation_m", "ground_elevation_m", "zero_level_elevation_m",
  "xps_thickness_cm", "blinding_concrete_thickness_cm",
]);
const FoundationSectionOverrideSchema = z.object({
  value: z.union([z.number().finite(), z.string().trim().min(1).max(2000)]),
  unit: z.enum(["mm", "cm", "m", "tekst"]),
  validated: z.boolean(),
  source: z.enum(["project_technology", "document_settings"]).optional(),
}).strict();
export const FoundationSectionSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(40).regex(/^[A-ZĄĆĘŁŃÓŚŹŻ0-9][A-ZĄĆĘŁŃÓŚŹŻ0-9 ._/-]*$/),
  cutEntityId: z.uuid(),
  viewDirection: z.enum(["left", "right"]),
  visibilityRangeMm: z.number().finite().positive().max(100_000_000),
  paperScale: z.union([z.literal(10), z.literal(20), z.literal(25), z.literal(50)]).optional(),
  linkedElementIds: z.array(z.uuid()).max(5000).optional(),
  sourceElementIds: z.array(z.uuid()).max(5000).optional(),
  marker: CadPointSchema.optional(),
  kind: z.enum(["wall-footing", "column-pad", "beam", "slab", "linear", "custom"]).optional(),
  automaticKey: z.string().trim().min(1).max(500).optional(),
  sourceFingerprint: z.string().trim().min(1).max(500).optional(),
  state: z.enum(["incomplete", "needs-review", "complete", "outdated"]).optional(),
  skipped: z.boolean().optional(),
  createdAutomatically: z.boolean().optional(),
  printFormat: z.enum(["A4", "A3"]).optional(),
  wastePercent: z.number().finite().min(0).max(100).optional(),
  layoutOffsets: z.record(z.uuid(), CadPointSchema).optional(),
  overrides: z.partialRecord(FoundationSectionFieldSchema, FoundationSectionOverrideSchema),
}).strict();
export type FoundationSection = z.infer<typeof FoundationSectionSchema>;

export const CalibrationReferenceSchema = z.object({
  startPx: CadPointSchema,
  endPx: CadPointSchema,
  lengthMm: positiveMm,
  confirmedByUser: z.boolean(),
}).strict().refine(
  ({ startPx, endPx }) => Math.hypot(endPx.x - startPx.x, endPx.y - startPx.y) >= 10,
  "Odcinek kalibracji musi mieć co najmniej 10 pikseli.",
);
export const CalibrationSchema = z.object({
  references: z.array(CalibrationReferenceSchema).min(1).max(10),
  originPx: CadPointSchema,
  rotationDegrees: z.number().finite().min(-180).max(180),
}).strict();
export type Calibration = z.infer<typeof CalibrationSchema>;

export const CadDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  projectId: z.uuid(),
  requirementId: z.string().trim().min(1).max(120),
  revision: z.number().int().min(0),
  status: z.enum(["draft", "approved"]),
  calibration: CalibrationSchema.nullable(),
  sourceImage: z.object({
    id: z.uuid(),
    storagePath: z.string().min(1).max(500),
    widthPx: z.number().int().positive().max(10000),
    heightPx: z.number().int().positive().max(10000),
    mmPerPixel: z.number().finite().positive().max(100000),
    originalPath: z.string().min(1).max(500).optional(),
    page: z.number().int().min(1).max(1000).optional(),
  }).strict().nullable().optional(),
  importWarnings: z.array(z.string().min(1).max(1000)).max(40).optional(),
  documentReferences: z.partialRecord(z.enum(["plan", "sections", "reinforcement", "isolation", "geotechnics", "concrete", "penetrations"]),
    z.string().trim().max(240)).optional(),
  foundationSettings: FoundationSettingsSchema.optional(),
  paperScale: z.number().int().min(1).max(1000).optional(),
  sections: z.array(FoundationSectionSchema).max(100).optional(),
  reinforcementChains: z.array(ReinforcementHostChainSchema).max(500).optional(),
  reinforcementTemplates: z.array(ReinforcementTemplateSchema).max(200).optional(),
  reinforcementBeams: z.array(ReinforcementBeamAssemblySchema).max(500).optional(),
  entities: z.array(CadEntitySchema).max(5000),
}).strict().superRefine((document, ctx) => {
  const ids = new Set(document.entities.map(({ id }) => id));
  if (ids.size !== document.entities.length) ctx.addIssue({ code: "custom", path: ["entities"], message: "Identyfikatory obiektów CAD muszą być unikalne." });
  const marks = document.entities.flatMap((e) => e.mark ? [e.mark] : []);
  if (new Set(marks).size !== marks.length) ctx.addIssue({ code: "custom", path: ["entities"], message: "Oznaczenia elementów muszą być unikalne na rysunku." });
  const sectionIds = new Set((document.sections ?? []).map(({ id }) => id));
  const sectionLabels = (document.sections ?? []).map(({ label }) => label);
  if (sectionIds.size !== (document.sections ?? []).length) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "Identyfikatory przekrojów muszą być unikalne." });
  }
  if (new Set(sectionLabels).size !== sectionLabels.length) {
    ctx.addIssue({ code: "custom", path: ["sections"], message: "Oznaczenia przekrojów muszą być unikalne." });
  }
  const chainIds = new Set((document.reinforcementChains ?? []).map(({ id }) => id));
  if (chainIds.size !== (document.reinforcementChains ?? []).length) {
    ctx.addIssue({ code: "custom", path: ["reinforcementChains"], message: "Identyfikatory połączonych elementów zbrojeniowych muszą być unikalne." });
  }
  const templateIds = new Set((document.reinforcementTemplates ?? []).map(({ id }) => id));
  if (templateIds.size !== (document.reinforcementTemplates ?? []).length) {
    ctx.addIssue({ code: "custom", path: ["reinforcementTemplates"], message: "Identyfikatory szablonów zbrojenia muszą być unikalne." });
  }
  const beamIds = new Set((document.reinforcementBeams ?? []).map(({ id }) => id));
  if (beamIds.size !== (document.reinforcementBeams ?? []).length) {
    ctx.addIssue({ code: "custom", path: ["reinforcementBeams"], message: "Identyfikatory konstrukcji belek muszą być unikalne." });
  }
  for (const [index, beam] of (document.reinforcementBeams ?? []).entries()) {
    if (beam.hostIds.some((id) => !ids.has(id))) {
      ctx.addIssue({ code: "custom", path: ["reinforcementBeams", index, "hostIds"],
        message: "Konstrukcja belki musi wskazywać istniejące hosty tego rysunku." });
    }
  }
  for (const [index, chain] of (document.reinforcementChains ?? []).entries()) {
    if (chain.hostIds.some((id) => !ids.has(id))) {
      ctx.addIssue({ code: "custom", path: ["reinforcementChains", index, "hostIds"], message: "Połączony element zbrojeniowy musi wskazywać odcinki istniejące na tym rzucie." });
    }
    if (chain.hostIds.some((id) => {
      const host = document.entities.find((entity) => entity.id === id);
      return !host || !("start" in host.geometry)
        || !["wall", "footing", "construction-line"].includes(host.kind);
    })) {
      ctx.addIssue({ code: "custom", path: ["reinforcementChains", index, "hostIds"], message: "Łączyć można wyłącznie liniowe ściany, ławy i belki." });
    }
  }
  for (const [index, section] of (document.sections ?? []).entries()) {
    const cut = document.entities.find(({ id }) => id === section.cutEntityId);
    if (cut?.kind !== "construction-line" || cut.attributes.role !== "section-cut") {
      ctx.addIssue({ code: "custom", path: ["sections", index, "cutEntityId"], message: "Przekrój musi wskazywać linię cięcia na tym rzucie." });
    }
    if (section.linkedElementIds?.some((id) => !ids.has(id))) {
      ctx.addIssue({ code: "custom", path: ["sections", index, "linkedElementIds"], message: "Powiązane elementy przekroju muszą istnieć na tym rzucie." });
    }
    if (section.sourceElementIds?.some((id) => !ids.has(id))) {
      ctx.addIssue({ code: "custom", path: ["sections", index, "sourceElementIds"], message: "Elementy źródłowe przekroju muszą istnieć na tym rzucie." });
    }
    for (const [field, override] of Object.entries(section.overrides)) {
      const unit = field.endsWith("_cm") ? "cm" : field.endsWith("_m") ? "m" : "tekst";
      if (override.unit !== unit || foundationSectionNumericFields.has(field as FoundationSectionField) !== (typeof override.value === "number")) {
        ctx.addIssue({ code: "custom", path: ["sections", index, "overrides", field], message: "Jednostka i typ wartości muszą odpowiadać polu." });
      }
      if (field.endsWith("_cm") && typeof override.value === "number" && override.value <= 0) {
        ctx.addIssue({ code: "custom", path: ["sections", index, "overrides", field], message: "Wymiary muszą być dodatnie." });
      }
    }
  }
  const walls = new Set(document.entities.filter(({ kind }) => kind === "wall").map(({ id }) => id));
  for (const [index, entity] of document.entities.entries()) {
    if (entity.foundationBase && (entity.kind !== "construction-line" || entity.attributes.role !== "foundation-wall")) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Podparcie przypisuje się do ściany fundamentowej." });
    }
    if (entity.supportFor && ((entity.kind !== "footing" && entity.kind !== "slab") || entity.supportFor.some((id) =>
      !document.entities.some((host) => host.id === id && host.kind === "construction-line" && host.attributes.role === "foundation-wall")))) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Podparcie musi należeć do ścian fundamentowych tego rysunku." });
    }
    if (entity.relatedTo && (entity.relatedTo.includes(entity.id) || entity.relatedTo.some((id) => !ids.has(id)))) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Powiązanie musi wskazywać inny element tego samego rysunku." });
    }
    if (entity.placement && (!ids.has(entity.placement.hostId) || entity.placement.hostId === entity.id)) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Zbrojenie musi wskazywać element podparcia w tym rysunku." });
    }
    if (entity.attachment && (!(entity.kind === "annotation" || entity.kind === "construction-area"
      && ["pad", "column"].includes(entity.attributes.role)) || !document.entities.some((host) => host.id === entity.attachment?.hostId
      && (host.kind === "wall" || host.kind === "footing" || host.kind === "construction-line"))
      || entity.attachment.hostId === entity.id)) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Przyczepiony element musi wskazywać odcinek tego rysunku." });
    }
    if (entity.infillFor && (!(entity.kind === "slab" || entity.kind === "construction-area"
      && entity.attributes.role === "basement-area") || entity.infillFor.some((id) => !ids.has(id)))) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Pole płyty lub piwnicy musi wskazywać obwód tego rysunku." });
    }
    if (entity.kind === "construction-area" && entity.attributes.role === "basement-area" && !entity.infillFor) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Piwnicę zaznacza się w zamkniętym polu ław." });
    }
    if (entity.kind === "opening" && !walls.has(entity.attributes.wallId)) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Otwór musi należeć do ściany w tym dokumencie." });
    }
  }
  if (document.status === "approved") {
    if (document.entities.some((e) => e.placement?.needsReview)) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "Sprawdź położenie zbrojenia po zmianie podparcia." });
    }
    if (!document.entities.length || document.entities.some(({ reviewStatus }) => reviewStatus !== "verified")) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "Zatwierdzenie wymaga niepustej i zweryfikowanej geometrii." });
    }
    if (document.entities.some(({ source }) => source.documentId !== null || source.origin !== "manual")
      && (!document.calibration || document.calibration.references.some(({ confirmedByUser }) => !confirmedByUser))) {
      ctx.addIssue({ code: "custom", path: ["calibration"], message: "Import wymaga skali potwierdzonej przez użytkownika." });
    }
    if (document.entities.some((entity) => (entity.kind === "rebar-annotation" || entity.kind === "rebar-line") && !entity.attributes.specialistVerified)) {
      ctx.addIssue({ code: "custom", path: ["entities"], message: "Zbrojenie wymaga sprawdzenia przez uprawnionego specjalistę." });
    }
  }
});
export type CadDocument = z.infer<typeof CadDocumentSchema>;

const recognitionPoint = z.object({
  x: z.number().min(0).max(10000), y: z.number().min(0).max(10000),
}).strict();
export const PlanRecognitionSchema = z.object({
  elements: z.array(z.object({
    type: z.enum(["line", "area", "text"]),
    points: z.array(recognitionPoint).min(1).max(100),
    label: z.string().min(1).max(160),
    confidence: z.number().min(0).max(1),
  }).strict()).max(300),
  warnings: z.array(z.string().min(1).max(1000)).max(30),
}).strict();
export type PlanRecognition = z.infer<typeof PlanRecognitionSchema>;
export const PlanScanRequestSchema = z.object({
  projectId: z.uuid(),
  requirementId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,119}$/),
  sourceId: z.uuid(),
  consent: z.literal(true),
  page: z.number().int().min(1).max(1000).default(1),
  originalExtension: z.enum(["png", "jpg", "webp", "pdf"]).optional(),
}).strict();

export const CadProposalSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.uuid(),
  documentId: z.uuid(),
  baseRevision: z.number().int().min(0),
  idempotencyKey: z.uuid(),
  entities: z.array(CadEntitySchema).min(1).max(1000),
  warnings: z.array(z.string().trim().min(1).max(1000)).max(100),
}).strict().superRefine((proposal, ctx) => {
  if (new Set(proposal.entities.map(({ id }) => id)).size !== proposal.entities.length) {
    ctx.addIssue({ code: "custom", path: ["entities"], message: "Propozycja zawiera zduplikowane obiekty." });
  }
  for (const [index, entity] of proposal.entities.entries()) {
    if (entity.reviewStatus !== "draft" || (entity.kind === "rebar-annotation" || entity.kind === "rebar-line") && entity.attributes.specialistVerified) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Propozycja AI nie może zatwierdzać obiektów ani zbrojenia." });
    }
    if (entity.source.origin === "openai" && (!entity.source.documentId || entity.source.page === null || entity.source.confidence === null)) {
      ctx.addIssue({ code: "custom", path: ["entities", index, "source"], message: "Rozpoznanie AI wymaga źródła, strony i pewności." });
    }
  }
});
export type CadProposal = z.infer<typeof CadProposalSchema>;

export const CadApprovalSchema = z.object({
  projectId: z.uuid(), documentId: z.uuid(), proposalId: z.uuid(),
  baseRevision: z.number().int().min(0), idempotencyKey: z.uuid(),
  approvalToken: z.string().min(32).max(256),
}).strict();
