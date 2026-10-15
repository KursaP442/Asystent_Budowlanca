import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CadDocumentSchema, CadEntitySchema, CadProposalSchema, CalibrationSchema } from "../dist/index.js";

const projectId = randomUUID();
const documentId = randomUUID();
function entity(changes = {}) {
  return {
    id: randomUUID(), layerId: "walls", units: "mm", kind: "wall", reviewStatus: "draft",
    source: { documentId: null, page: null, origin: "manual", confidence: null },
    geometry: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } },
    attributes: { thicknessMm: 240, heightMm: 2800, material: "ceramic" }, ...changes,
  };
}
const document = (entities, changes = {}) => ({
  schemaVersion: 1, id: documentId, projectId, requirementId: "storey-0",
  revision: 0, status: "draft", calibration: null, entities, ...changes,
});
const proposal = (entities) => ({
  schemaVersion: 1, projectId, documentId, baseRevision: 0, idempotencyKey: randomUUID(), entities, warnings: [],
});

test("CAD entities enforce finite mm units, dimensions and strict typed attributes", () => {
  assert.equal(CadEntitySchema.safeParse(entity()).success, true);
  for (const changes of [
    { units: "px" }, { geometry: { start: { x: Infinity, y: 0 }, end: { x: 1000, y: 0 } } },
    { geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } },
    { attributes: { thicknessMm: -1, heightMm: 2800, material: "brick" } },
    { run_shell: "anything" }, { kind: "untyped-object" },
  ]) assert.equal(CadEntitySchema.safeParse(entity(changes)).success, false);
});

test("documents reject duplicate entity ids and openings without a wall", () => {
  const wall = entity();
  assert.equal(CadDocumentSchema.safeParse(document([wall, wall])).success, false);
  const opening = entity({
    kind: "opening", attributes: { wallId: wall.id, heightMm: 2100, sillMm: 0, type: "door" },
  });
  assert.equal(CadDocumentSchema.safeParse(document([opening])).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([wall, opening])).success, true);
});

test("entity relationships only reference other entities in the same document", () => {
  const host = entity();
  const related = entity({ relatedTo: [host.id] });
  assert.equal(CadDocumentSchema.safeParse(document([host, related])).success, true);
  assert.equal(CadDocumentSchema.safeParse(document([host, entity({ relatedTo: [randomUUID()] })])).success, false);
  const self = entity();
  assert.equal(CadDocumentSchema.safeParse(document([entity({ id: self.id, relatedTo: [self.id] })])).success, false);
});

test("foundation ring beam persists as a separate wall-related reinforcement host", () => {
  const wall = entity({
    kind: "construction-line", layerId: "foundation-wall",
    attributes: { role: "foundation-wall", widthMm: 240, heightMm: 1000,
      material: "Bloczek betonowy", designReference: "K-01" },
  });
  const ringBeam = entity({
    kind: "construction-line", layerId: "ring-beam", relatedTo: [wall.id],
    attributes: { role: "ring-beam", widthMm: 240, heightMm: 250,
      material: "C25/30", designReference: "K-04" },
  });
  const bar = entity({
    kind: "rebar-line", layerId: "rebar-bottom",
    placement: { hostId: ringBeam.id, groupId: randomUUID(),
      start: ringBeam.geometry.start, end: ringBeam.geometry.end, needsReview: false },
    attributes: { diameterMm: 12, count: 1, steelGrade: "B500B", coverMm: 40,
      designReference: "K-04", specialistVerified: false },
  });
  assert.equal(CadDocumentSchema.safeParse(document([wall, ringBeam, bar])).success, true);
  assert.equal(CadDocumentSchema.safeParse(document([ringBeam, bar])).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([wall, ringBeam, entity({
    ...bar, placement: { ...bar.placement, hostId: randomUUID() },
  })])).success, false);
});

test("reinforcement chains and templates remain optional and reference current plan hosts", () => {
  const first = entity();
  const second = entity({ geometry: { start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 } } });
  const chain = {
    id: randomUUID(), name: "Ława Ł1", elementType: "strip-footing",
    hostIds: [first.id, second.id], mainPathHostIds: [first.id, second.id],
    status: "draft", geometryFingerprint: "fingerprint",
  };
  const template = {
    id: randomUUID(), name: "Belka 4x12", elementType: "beam", createdAt: new Date().toISOString(),
    bars: [{ layerId: "rebar-bottom", start: { x: 0, y: 0 }, end: { x: 1000, y: 0 },
      diameterMm: 12, count: 2, coverMm: 40, steelGrade: "B500B", designReference: "K-01" }],
  };
  assert.equal(CadDocumentSchema.safeParse(document([first, second], {
    reinforcementChains: [chain], reinforcementTemplates: [template],
  })).success, true);
  assert.equal(CadDocumentSchema.safeParse(document([first], {
    reinforcementChains: [{ ...chain, hostIds: [first.id, randomUUID()] }],
  })).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([first, second], {
    reinforcementChains: [chain, chain],
  })).success, false);
});

test("foundation sections add optional version-compatible cut references and validated overrides", () => {
  const line = entity({
    kind: "construction-line", layerId: "section-cut", mark: "A-A",
    attributes: { role: "section-cut", widthMm: 240, heightMm: 2800, material: "Do uzupełnienia z projektu",
      designReference: "Do uzupełnienia z projektu" },
  });
  const savedSection = { id: randomUUID(), label: "A-A", cutEntityId: line.id, viewDirection: "left",
    visibilityRangeMm: 8000, paperScale: 20, linkedElementIds: [line.id],
    overrides: { foundation_bottom_elevation_m: { value: -1.2, unit: "m", validated: true } } };
  assert.equal(CadDocumentSchema.safeParse(document([line], { sections: [savedSection] })).success, true);
  assert.equal(CadDocumentSchema.safeParse(document([line], { sections: [{
    ...savedSection, label: "S1", kind: "column-pad", marker: { x: 500, y: 250 },
    automaticKey: "column-pad:test", sourceFingerprint: "geometry-v1", state: "needs-review",
    createdAutomatically: true, printFormat: "A3", wastePercent: 8,
    layoutOffsets: { [line.id]: { x: 20, y: -10 } },
    overrides: { pad_height_cm: { value: 45, unit: "cm", validated: true } },
  }] })).success, true);
  assert.equal(CadDocumentSchema.safeParse(document([line])).success, true);
  assert.equal(CadDocumentSchema.safeParse(document([line], { sections: [{ ...savedSection, cutEntityId: randomUUID() }] })).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([line], { sections: [{ ...savedSection, paperScale: 30 }] })).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([line], { sections: [{ ...savedSection, linkedElementIds: [randomUUID()] }] })).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([line], { sections: [{ ...savedSection, overrides: {
    footing_width_cm: { value: 0, unit: "m", validated: true },
  } }] })).success, false);
});

test("AI proposals require provenance and cannot approve geometry or reinforcement", () => {
  const ai = entity({ source: { documentId: randomUUID(), page: 1, origin: "openai", confidence: 0.8 } });
  assert.equal(CadProposalSchema.safeParse(proposal([ai])).success, true);
  assert.equal(CadProposalSchema.safeParse(proposal([entity({ source: { ...ai.source, page: null } })])).success, false);
  assert.equal(CadProposalSchema.safeParse(proposal([entity({ ...ai, reviewStatus: "verified" })])).success, false);
  assert.equal(CadProposalSchema.safeParse(proposal([ai, ai])).success, false);
  const reinforcement = entity({
    kind: "rebar-annotation", source: ai.source, geometry: { point: { x: 0, y: 0 } },
    attributes: { label: "Project note", designReference: "K-01", diameterMm: null, lengthMm: null, count: null, specialistVerified: true },
  });
  assert.equal(CadProposalSchema.safeParse(proposal([reinforcement])).success, false);
});

test("imported documents cannot be approved without confirmed calibration and verified objects", () => {
  const ai = entity({ source: { documentId: randomUUID(), page: 1, origin: "openai", confidence: 0.8 } });
  assert.equal(CadDocumentSchema.safeParse(document([ai], { status: "approved" })).success, false);
  const verified = { ...ai, reviewStatus: "verified" };
  assert.equal(CadDocumentSchema.safeParse(document([verified], { status: "approved" })).success, false);
  const calibration = {
    references: [{ startPx: { x: 0, y: 0 }, endPx: { x: 100, y: 0 }, lengthMm: 1000, confirmedByUser: true }],
    originPx: { x: 0, y: 0 }, rotationDegrees: 0,
  };
  assert.equal(CadDocumentSchema.safeParse(document([verified], { status: "approved", calibration })).success, true);
  assert.equal(CalibrationSchema.safeParse({ ...calibration, references: [{ ...calibration.references[0], endPx: { x: 1, y: 0 } }] }).success, false);
  assert.equal(CadDocumentSchema.safeParse(document([], { status: "approved" })).success, false);
});
