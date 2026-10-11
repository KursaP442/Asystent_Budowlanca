import assert from "node:assert/strict";
import test from "node:test";
import { distanceBetweenPoints, polygonAreaMm2 } from "../dist/index.js";

test("distanceBetweenPoints returns a distance in model units", () => {
  assert.equal(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3000, y: 4000 }), 5000);
});

test("polygonAreaMm2 computes a rectangle area regardless of winding", () => {
  const clockwise = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ];

  assert.equal(polygonAreaMm2(clockwise), 12_000_000);
  assert.equal(polygonAreaMm2([...clockwise].reverse()), 12_000_000);
});

test("polygonAreaMm2 rejects degenerate polygons and non-finite coordinates", () => {
  assert.throws(() => polygonAreaMm2([{ x: 0, y: 0 }, { x: 1, y: 0 }]), RangeError);
  assert.throws(
    () => polygonAreaMm2([{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }, { x: 1, y: 0 }]),
    RangeError,
  );
});
