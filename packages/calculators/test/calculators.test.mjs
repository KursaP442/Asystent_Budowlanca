import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAreaWithWaste,
  calculateVolumeM3FromMillimeters,
} from "../dist/index.js";

test("calculateAreaWithWaste applies the declared waste percentage", () => {
  assert.equal(calculateAreaWithWaste(100, 10), 110);
});

test("calculateVolumeM3FromMillimeters converts cubic millimeters to cubic meters", () => {
  assert.equal(calculateVolumeM3FromMillimeters(4000, 3000, 2500), 30);
});

test("calculators reject negative and non-finite inputs", () => {
  assert.throws(() => calculateAreaWithWaste(-1, 5), RangeError);
  assert.throws(() => calculateAreaWithWaste(10, Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => calculateVolumeM3FromMillimeters(1, -1, 1), RangeError);
});
