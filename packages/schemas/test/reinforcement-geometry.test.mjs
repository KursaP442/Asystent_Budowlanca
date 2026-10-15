import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ReinforcementBeamAssemblySchema, ReinforcementShapeLibraryItemSchema } from "../dist/index.js";

const item = (overrides = {}) => ({
  id: randomUUID(),
  name: "Podgięcie narożne",
  category: "bend",
  shape: {
    kind: "custom",
    bends: [
      { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: 300, angleDegrees: 0, radiusMm: 20, plane: "xy" },
    ],
  },
  createdAt: new Date().toISOString(),
  ...overrides,
});

test("user reinforcement shape accepts 50 mm segments and zero-degree continuation", () => {
  const parsed = ReinforcementShapeLibraryItemSchema.parse(item({
    shape: { kind: "custom", rotationDegrees: 90,
      bends: [{ lengthMm: 50, angleDegrees: 0, radiusMm: 20, plane: "xy" }] },
  }));
  assert.equal(parsed.shape.bends[0].lengthMm, 50);
  assert.equal(parsed.shape.bends[0].angleDegrees, 0);
  assert.equal(parsed.shape.rotationDegrees, 90);
});

test("user reinforcement shape rejects short segments and sub-degree nonzero bends", () => {
  assert.equal(ReinforcementShapeLibraryItemSchema.safeParse(item({
    shape: { kind: "custom", bends: [{ lengthMm: 49, angleDegrees: 0, radiusMm: 20, plane: "xy" }] },
  })).success, false);
  assert.equal(ReinforcementShapeLibraryItemSchema.safeParse(item({
    shape: { kind: "custom", bends: [{ lengthMm: 50, angleDegrees: .5, radiusMm: 20, plane: "xy" }] },
  })).success, false);
  assert.equal(ReinforcementShapeLibraryItemSchema.safeParse(item({
    shape: { kind: "custom", rotationDegrees: 361,
      bends: [{ lengthMm: 50, angleDegrees: 0, radiusMm: 20, plane: "xy" }] },
  })).success, false);
});

test("user reinforcement shape stores an optional wire diameter", () => {
  const parsed = ReinforcementShapeLibraryItemSchema.parse(item({
    shape: { kind: "custom", diameterMm: 8,
      bends: [{ lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" }] },
  }));
  assert.equal(parsed.shape.diameterMm, 8);
  assert.equal(ReinforcementShapeLibraryItemSchema.parse(item()).shape.diameterMm, undefined);
  assert.equal(ReinforcementShapeLibraryItemSchema.safeParse(item({
    shape: { kind: "custom", diameterMm: 0,
      bends: [{ lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" }] },
  })).success, false);
});

test("stirrup library category requires a stirrup shape", () => {
  assert.equal(ReinforcementShapeLibraryItemSchema.safeParse(item({ category: "stirrup" })).success, false);
  assert.equal(ReinforcementShapeLibraryItemSchema.safeParse(item({
    category: "stirrup",
    shape: { kind: "stirrup", bends: [{ lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" }] },
  })).success, true);
});

const stirrupShape = {
  kind: "stirrup",
  diameterMm: 8,
  bends: [
    { lengthMm: 300, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 300, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
  ],
};

const beam = (overrides = {}) => ({
  id: randomUUID(),
  name: "Ława 1",
  hostIds: [randomUUID()],
  lengthMm: 5000,
  widthMm: 800,
  heightMm: 400,
  firstStirrupMm: 400,
  lastStirrupMm: 4600,
  zones: [{
    id: randomUUID(),
    shapeTemplateId: randomUUID(),
    shapeName: "Strzemię 30×50 Ø8",
    shape: stirrupShape,
    startMm: 400,
    endMm: 2000,
    spacingMm: 200,
    bundleCount: 1,
    bundleGapMm: 0,
    bundleDirection: "right",
    concentrations: [{
      id: randomUUID(),
      startMm: 400,
      endMm: 800,
      spacingMm: 100,
      bundleCount: 2,
      bundleGapMm: 40,
      bundleDirection: "up",
    }],
  }],
  status: "draft",
  ...overrides,
});

test("beam assembly stores consecutive stirrup zones and arbitrary concentration", () => {
  const first = beam();
  const parsed = ReinforcementBeamAssemblySchema.parse({
    ...first,
    zones: [...first.zones, {
      ...first.zones[0],
      id: randomUUID(),
      startMm: 2000,
      endMm: 4600,
      concentrations: [],
    }],
  });
  assert.equal(parsed.zones.length, 2);
  assert.equal(parsed.zones[0].concentrations[0].bundleCount, 2);
  assert.equal(parsed.zones[0].concentrations[0].bundleDirection, "up");
});

test("beam assembly can record an accepted stirrup taller than the concrete section", () => {
  const candidate = beam();
  const parsed = ReinforcementBeamAssemblySchema.parse({
    ...candidate,
    status: "needs-review",
    zones: [{ ...candidate.zones[0], oversizeAccepted: true }],
  });
  assert.equal(parsed.zones[0].oversizeAccepted, true);
  assert.equal(parsed.status, "needs-review");
  assert.equal(ReinforcementBeamAssemblySchema.parse(candidate).zones[0].oversizeAccepted, undefined);
});

test("beam assembly stores one editable standard main-bar set only when stirrups exist", () => {
  const candidate = beam({ standardMainBars: { diameterMm: 16 } });
  const parsed = ReinforcementBeamAssemblySchema.parse(candidate);
  assert.equal(parsed.standardMainBars.diameterMm, 16);
  assert.equal(ReinforcementBeamAssemblySchema.safeParse({
    ...candidate,
    zones: [],
  }).success, false);
});

test("beam assembly rejects gaps and zones outside usable beam length", () => {
  const candidate = beam();
  assert.equal(ReinforcementBeamAssemblySchema.safeParse({
    ...candidate,
    zones: [{ ...candidate.zones[0], startMm: 500 }],
  }).success, false);
  assert.equal(ReinforcementBeamAssemblySchema.safeParse({
    ...candidate,
    zones: [{ ...candidate.zones[0], endMm: 4700 }],
  }).success, false);
});
