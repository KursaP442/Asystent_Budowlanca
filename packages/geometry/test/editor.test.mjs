import test from "node:test";
import assert from "node:assert/strict";
import { viewportToWorld, drawingBounds, calibrationScale } from "../dist/index.js";

test("viewport transform respects CSS size, panning, zoom and optional millimeter grid", () => {
  const bounds = { x: 100, y: 200, width: 700, height: 500 };
  const view = { x: -1000, y: -500, width: 14000, height: 10000 };
  assert.deepEqual(viewportToWorld({ x: 450, y: 450 }, bounds, view), { x: 6000, y: 4500 });
  assert.deepEqual(viewportToWorld({ x: 451, y: 450 }, bounds, view, 100), { x: 6000, y: 4500 });
  assert.throws(() => viewportToWorld({ x: 0, y: 0 }, { ...bounds, width: 0 }, view));
});
test("fit bounds handles empty and negative drawings without invalid zoom", () => {
  assert.equal(drawingBounds([]).width, 14000);
  const bounds = drawingBounds([{ x: -1000, y: -1000 }, { x: 2000, y: 3000 }]);
  assert.equal(bounds.width, 3600);
  assert.equal(bounds.height, 4800);
  assert.throws(() => drawingBounds([{ x: NaN, y: 0 }]));
  assert.equal(calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 1000), 10);
  assert.throws(() => calibrationScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 1000));
});
import { zoomDrawingView } from "../dist/index.js";
test("zoom fixes cursor world coordinates, preserves aspect and bounds scale", () => {
  const view = { x: -1000, y: -500, width: 14000, height: 10000 };
  const anchor = { x: 2000, y: 1500 };
  const next = zoomDrawingView(view, anchor, .5);
  assert.equal((anchor.x - next.x) / next.width, (anchor.x - view.x) / view.width);
  assert.equal((anchor.y - next.y) / next.height, (anchor.y - view.y) / view.height);
  assert.equal(next.width / next.height, view.width / view.height);
  assert.equal(zoomDrawingView(view, anchor, 1e-12).width, 100);
  assert.throws(() => zoomDrawingView(view, anchor, 0));
});
