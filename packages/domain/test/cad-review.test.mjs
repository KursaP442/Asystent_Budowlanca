import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { approveCadDocument, getCadApprovalIssues, previewCadProposal } from "../dist/index.js";

const projectId = randomUUID();
const documentId = randomUUID();
const wall = () => ({
  id: randomUUID(), units: "mm", layerId: "wall", reviewStatus: "verified", kind: "wall",
  source: { documentId: null, page: null, origin: "manual", confidence: null },
  geometry: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } },
  attributes: { thicknessMm: 240, heightMm: 2800, material: "brick" },
});
const document = (entities, changes = {}) => ({
  schemaVersion: 1, id: documentId, projectId, requirementId: "storey-0", revision: 2, status: "draft",
  calibration: null, entities, ...changes,
});
const calibration = (secondLengthMm) => ({
  originPx: { x: 0, y: 0 }, rotationDegrees: 0,
  references: [1000, secondLengthMm].map((lengthMm) => ({
    startPx: { x: 0, y: 0 }, endPx: { x: 100, y: 0 }, lengthMm, confirmedByUser: true,
  })),
});

test("approval gates unverified geometry, missing calibration and specialist rebar review", () => {
  const manual = wall();
  assert.equal(approveCadDocument(document([manual])).status, "approved");
  assert.throws(() => approveCadDocument(document([{ ...manual, reviewStatus: "draft" }])), /zatwierdzenia/);
  const imported = { ...manual, source: { documentId: randomUUID(), page: 1, origin: "openai", confidence: 0.95 } };
  assert.throws(() => approveCadDocument(document([imported])), /kalibracji/);
  assert.equal(approveCadDocument(document([imported], { calibration: calibration(1000) })).status, "approved");
  assert.throws(() => approveCadDocument(document([imported], { calibration: calibration(1030) })), /1%/);
  assert.throws(() => approveCadDocument(document([])), /nie ma obiektów/);
  const rebar = {
    ...manual, kind: "rebar-annotation", geometry: { point: { x: 0, y: 0 } },
    attributes: { label: "As designed", designReference: "K-01", diameterMm: 12, lengthMm: 1000, count: 4, specialistVerified: false },
  };
  assert.throws(() => approveCadDocument(document([rebar])), /specjalisty/);
});

test("approval blocks scale disagreement above exactly 1 percent", () => {
  const exact = calibration(1010);
  exact.references[0].lengthMm = 990;
  assert.equal(getCadApprovalIssues(document([wall()], { calibration: exact })).some(({ code }) => code === "calibration"), false);
  const excessive = structuredClone(exact);
  excessive.references[1].lengthMm = 1010.1;
  assert.equal(getCadApprovalIssues(document([wall()], { calibration: excessive })).some(({ code }) => code === "calibration"), true);
});

test("self-intersecting polygon cannot enter an approved document", () => {
  const slab = {
    ...wall(), kind: "slab",
    geometry: { vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }] },
    attributes: { thicknessMm: 150, material: "concrete" },
  };
  assert.throws(() => approveCadDocument(document([slab])), /przecina/);
});

test("preview rejects foreign/stale projects and does not mutate or approve the original", () => {
  const original = document([wall()]);
  const candidate = { ...wall(), reviewStatus: "draft" };
  const proposal = { schemaVersion: 1, projectId, documentId, baseRevision: 2, idempotencyKey: randomUUID(), entities: [candidate], warnings: [] };
  const snapshot = structuredClone(original);
  const preview = previewCadProposal(original, proposal);
  assert.deepEqual(original, snapshot);
  assert.equal(preview.entities.length, 2);
  assert.equal(preview.status, "draft");
  assert.equal(preview.revision, original.revision);
  assert.throws(() => previewCadProposal(original, { ...proposal, baseRevision: 1 }), /zmienił/);
  assert.throws(() => previewCadProposal(original, { ...proposal, projectId: randomUUID() }), /projektu/);
  assert.throws(() => previewCadProposal(original, { ...proposal, entities: [{ ...original.entities[0], reviewStatus: "draft" }] }), /obecny/);
});
