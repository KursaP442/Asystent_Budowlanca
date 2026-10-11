import assert from "node:assert/strict";
import test from "node:test";
import { UI_TOKENS } from "../dist/index.js";

test("UI tokens provide the product's navigation and primary action colors", () => {
  assert.equal(UI_TOKENS.color.navigation, "#172554");
  assert.equal(UI_TOKENS.color.action, "#F97316");
});

test("UI spacing tokens are ordered and based on a four-pixel unit", () => {
  const values = Object.values(UI_TOKENS.spacing);
  assert.deepEqual(values, [4, 8, 16, 24, 32]);
});
