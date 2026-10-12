import { z } from "zod";

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
    side: z.enum(["left", "right", "both"]),
  }).strict()).max(20).optional(),
  derivedFrom: z.object({ documentId: z.uuid(), entityId: z.uuid(), revision: z.number().int().min(0) }).strict().optional(),
  foundationBase: FoundationBaseSchema.optional(),
  supportFor: z.array(z.uuid()).min(1).max(1000).optional(),
  placement: z.object({ hostId: z.uuid(), groupId: z.uuid(), start: CadPointSchema, end: CadPointSchema,
    needsReview: z.boolean() }).strict().optional(),
};

export const CadEntitySchema = z.discriminatedUnion("kind", [
  z.object({
    ...common, kind: z.literal("construction-line"), geometry: segment,
    attributes: z.object({
      role: z.enum(["foundation-wall", "beam", "lintel", "ring-beam", "rafter", "ridge", "gutter", "fence", "kerb", "drain", "axis", "section-cut"]),
      widthMm: positiveMm, heightMm: positiveMm, material: z.string().trim().min(1).max(160),
      designReference: z.string().trim().min(1).max(240),
    }).strict(),
  }).strict(),
  z.object({
    ...common, kind: z.literal("construction-area"), geometry: polygon,
    attributes: z.object({
      role: z.enum(["column", "pad", "section", "elevation", "paving", "finish", "ceiling", "terrain", "equipment", "void"]),
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
    attributes: z.object({ text: z.string().trim().min(1).max(1000) }).strict(),
  }).strict(),
]);
export type CadEntity = z.infer<typeof CadEntitySchema>;

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
  entities: z.array(CadEntitySchema).max(5000),
}).strict().superRefine((document, ctx) => {
  const ids = new Set(document.entities.map(({ id }) => id));
  if (ids.size !== document.entities.length) ctx.addIssue({ code: "custom", path: ["entities"], message: "Identyfikatory obiektów CAD muszą być unikalne." });
  const walls = new Set(document.entities.filter(({ kind }) => kind === "wall").map(({ id }) => id));
  for (const [index, entity] of document.entities.entries()) {
    if (entity.foundationBase && (entity.kind !== "construction-line" || entity.attributes.role !== "foundation-wall")) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Podparcie przypisuje się do ściany fundamentowej." });
    }
    if (entity.supportFor && ((entity.kind !== "footing" && entity.kind !== "slab") || entity.supportFor.some((id) =>
      !document.entities.some((host) => host.id === id && host.kind === "construction-line" && host.attributes.role === "foundation-wall")))) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Podparcie musi należeć do ścian fundamentowych tego rysunku." });
    }
    if (entity.placement && (!ids.has(entity.placement.hostId) || entity.placement.hostId === entity.id)) {
      ctx.addIssue({ code: "custom", path: ["entities", index], message: "Zbrojenie musi wskazywać element podparcia w tym rysunku." });
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
