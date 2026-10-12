import assert from "node:assert/strict";
import test from "node:test";
import { calibrateDrawing, imagePointToMillimeters, millimeterPointToImage, isSimplePolygon } from "../dist/index.js";

test("calibration uses reference length in mm and reports measured scale disagreement", () => {
  const reference = { startPx: { x: 0, y: 0 }, endPx: { x: 100, y: 0 }, lengthMm: 1000 };
  const calibrated = calibrateDrawing([reference], { x: 20, y: 30 }, 0);
  assert.equal(calibrated.mmPerPixel, 10);
  assert.equal(calibrated.relativeError, 0);
  assert.deepEqual(imagePointToMillimeters({ x: 120, y: 80 }, calibrated), { x: 1000, y: 500 });
  const disagreed = calibrateDrawing([reference, { ...reference, lengthMm: 1200 }], { x: 0, y: 0 }, 0);
  assert.ok(Math.abs(disagreed.relativeError - 1 / 11) < 1e-12);
});

test("coordinate transforms are inverse within 0.000001 mm for all supported rotations", () => {
  for (let rotation = -180; rotation <= 180; rotation += 5) {
    const transform = calibrateDrawing([{ startPx: { x: 0, y: 0 }, endPx: { x: 100, y: 0 }, lengthMm: 2500 }], { x: 250, y: 150 }, rotation);
    for (const point of [{ x: 0, y: 0 }, { x: 300, y: 450 }, { x: -50, y: 12 }]) {
      const world = imagePointToMillimeters(point, transform);
      const restored = millimeterPointToImage(world, transform);
      assert.ok(Math.abs(restored.x - point.x) * transform.mmPerPixel < 0.000001);
      assert.ok(Math.abs(restored.y - point.y) * transform.mmPerPixel < 0.000001);
    }
  }
});

test("bad scale input fails instead of returning a default scale", () => {
  for (const reference of [
    { startPx: { x: 0, y: 0 }, endPx: { x: 0, y: 0 }, lengthMm: 1000 },
    { startPx: { x: 0, y: 0 }, endPx: { x: 5, y: 0 }, lengthMm: 1000 },
    { startPx: { x: Infinity, y: 0 }, endPx: { x: 100, y: 0 }, lengthMm: 1000 },
    { startPx: { x: 0, y: 0 }, endPx: { x: 100, y: 0 }, lengthMm: -1 },
  ]) assert.throws(() => calibrateDrawing([reference], { x: 0, y: 0 }, 0), RangeError);
  assert.throws(() => calibrateDrawing([], { x: 0, y: 0 }, 0), RangeError);
  assert.throws(() => imagePointToMillimeters({ x: 0, y: 0 }, { originPx: { x: 0, y: 0 }, rotationDegrees: 0, mmPerPixel: 0 }), RangeError);
});

test("polygon validation rejects self intersections and degenerate edges", () => {
  const rectangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  assert.equal(isSimplePolygon(rectangle), true);
  assert.equal(isSimplePolygon([...rectangle].reverse()), true);
  assert.equal(isSimplePolygon([rectangle[0], rectangle[2], rectangle[1], rectangle[3]]), false);
  assert.equal(isSimplePolygon([rectangle[0], rectangle[1], rectangle[1], rectangle[3]]), false);
  assert.equal(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]), false);
  assert.throws(() => isSimplePolygon([{ x: NaN, y: 0 }, rectangle[1], rectangle[2]]), RangeError);
});
