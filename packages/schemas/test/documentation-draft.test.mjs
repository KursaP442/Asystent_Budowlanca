import { test } from "node:test";
import assert from "node:assert/strict";
import { DocumentationDraftSchema } from "../dist/index.js";

const draft = () => ({ version: 1, step: "roof", modules: { roof: { measurements: [""], notes: "" } } });

test("draft preserves incomplete entries without pretending that geometry is approved", () => {
  assert.deepEqual(DocumentationDraftSchema.parse(draft()), draft());
  assert.equal(DocumentationDraftSchema.safeParse({ ...draft(), approved: true }).success, false);
});

test("draft rejects unknown stages and oversized or malformed measurement content", () => {
  assert.equal(DocumentationDraftSchema.safeParse({ ...draft(), step: "foundation" }).success, false);
  const malformed = draft();
  malformed.modules.roof.measurements = [1000];
  assert.equal(DocumentationDraftSchema.safeParse(malformed).success, false);
  const oversized = draft();
  oversized.modules.roof.notes = "x".repeat(4001);
  assert.equal(DocumentationDraftSchema.safeParse(oversized).success, false);
});
