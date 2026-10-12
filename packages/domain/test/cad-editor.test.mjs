import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assembleRecognizedPlan, calibrateCadSource, translateCadEntity, getCadApprovalIssues } from "../dist/index.js";

const sourceId = randomUUID();
const source = { documentId: sourceId, widthPx: 1000, heightPx: 800, layerId: "foundation-drawing-0" };
const recognition = () => ({ elements: [
  { type: "line", label: "Obrys ławy", points: [{ x: 10, y: 10 }, { x: 510, y: 10 }], confidence: 0.8 },
  { type: "area", label: "Obrys płyty", points: [{ x: 10, y: 10 }, { x: 510, y: 10 }, { x: 510, y: 510 }], confidence: 0.7 },
], warnings: [] });
const document = () => ({
  schemaVersion: 1, id: randomUUID(), projectId: randomUUID(), requirementId: source.layerId,
  revision: 1, status: "draft", calibration: null,
  sourceImage: { id: sourceId, storagePath: "user/job/source.png", widthPx: 1000, heightPx: 800, mmPerPixel: 1 },
  entities: assembleRecognizedPlan(recognition(), source, randomUUID),
});
test("recognition preserves geometry and provenance without inventing structural sizes", () => {
  const entities = assembleRecognizedPlan(recognition(), source, randomUUID);
  assert.equal(entities[0].kind, "trace-line");
  assert.deepEqual(entities[0].geometry, { start: { x: 10, y: 10 }, end: { x: 510, y: 10 } });
  assert.equal(entities[0].source.documentId, sourceId);
  assert.equal(entities[0].source.confidence, 0.8);
  assert.equal(entities[0].reviewStatus, "draft");
  assert.equal(getCadApprovalIssues(document()).some(({ code }) => code === "calibration"), true);
  assert.throws(() => assembleRecognizedPlan({ elements: [], warnings: [] }, source, randomUUID), /nie rozpoznało/);
});
test("recognition rejects malformed, out-of-page and self-intersecting proposals", () => {
  const bad = recognition(); bad.elements[0].points[1].x = 1001;
  assert.throws(() => assembleRecognizedPlan(bad, source, randomUUID), /granicami/);
  const invalid = recognition(); invalid.elements[0].points.push({ x: 100, y: 100 });
  assert.throws(() => assembleRecognizedPlan(invalid, source, randomUUID), /dwa punkty/);
  const polygon = recognition();
  polygon.elements[1].points = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }];
  assert.throws(() => assembleRecognizedPlan(polygon, source, randomUUID), /obrys/);
});
test("calibration rescales geometry and overlay together, supports recalibration and never approves", () => {
  const original = document();
  const next = calibrateCadSource(original, { x: 10, y: 10 }, { x: 510, y: 10 }, 5000);
  assert.deepEqual(next.entities[0].geometry.end, { x: 5100, y: 100 });
  assert.equal(next.sourceImage.mmPerPixel, 10);
  assert.equal(next.calibration.references[0].lengthMm, 5000);
  const recalibrated = calibrateCadSource(next, { x: 100, y: 100 }, { x: 5100, y: 100 }, 2500);
  assert.equal(recalibrated.sourceImage.mmPerPixel, 5);
  assert.equal(original.sourceImage.mmPerPixel, 1);
  assert.equal(recalibrated.entities[0].reviewStatus, "draft");
  assert.equal(recalibrated.status, "draft");
  assert.equal(getCadApprovalIssues(next).some(({ message }) => message.includes("klasyfikacji")), true);
});
test("moving entities updates all polygon vertices without mutation and resets review", () => {
  const polygon = document().entities[1];
  const moved = translateCadEntity({ ...polygon, reviewStatus: "verified" }, { x: 100, y: -10 });
  assert.deepEqual(moved.geometry.vertices[0], { x: 110, y: 0 });
  assert.equal(polygon.geometry.vertices[0].x, 10);
  assert.equal(moved.reviewStatus, "draft");
});
