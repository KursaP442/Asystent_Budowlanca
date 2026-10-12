import test from "node:test";
import assert from "node:assert/strict";
import { distanceBetweenPoints, offsetPolygon, polygonExteriorSide, rectangleFromCorners, segmentRectangle } from "../dist/index.js";

test("exterior rectangle dimensions include square end faces, not center-line length", () => {
  for (const end of [{ x: 5000, y: 0 }, { x: 0, y: 5000 }, { x: 3000, y: 4000 }]) {
    const outline = segmentRectangle({ x: 0, y: 0 }, end, 240);
    assert.ok(Math.abs(distanceBetweenPoints(outline[0], outline[1]) - 5240) < .000001);
    assert.ok(Math.abs(distanceBetweenPoints(outline[1], outline[2]) - 240) < .000001);
  }
});
test("rectangles retain real extents for either drag direction, dimensions always point outside", () => {
  const polygon = rectangleFromCorners({ x: 3000, y: 2000 }, { x: 1000, y: 500 });
  assert.deepEqual(polygon, [{ x: 1000, y: 500 }, { x: 3000, y: 500 }, { x: 3000, y: 2000 }, { x: 1000, y: 2000 }]);
  assert.equal(polygonExteriorSide(polygon), -1);
  assert.equal(polygonExteriorSide([...polygon].reverse()), 1);
  assert.throws(() => rectangleFromCorners({ x: 0, y: 0 }, { x: 0, y: 1000 }));
});
test("exterior offset preserves winding and accepts collinear edges without inventing corners", () => {
  const vertices = [{x:0,y:0},{x:3000,y:0},{x:6000,y:0},{x:6000,y:4000},{x:0,y:4000}];
  for (const polygon of [vertices,[...vertices].reverse()]) {
    const outline = offsetPolygon(polygon,polygon.map(() => 320));
    assert.ok(Math.abs(Math.min(...outline.map((p) => p.x)) + 320) < .000001);
    assert.ok(Math.abs(Math.max(...outline.map((p) => p.x)) - 6320) < .000001);
    assert.ok(Math.abs(Math.min(...outline.map((p) => p.y)) + 320) < .000001);
    assert.ok(Math.abs(Math.max(...outline.map((p) => p.y)) - 4320) < .000001);
  }
  assert.throws(() => offsetPolygon(vertices,[100,200,100,100,100]),/różne odsunięcia/);
});
