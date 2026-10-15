import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CadDocumentSchema } from "@asystent/schemas";
import { addDetectedFoundationSections, calculateFoundationSectionMaterials, configureFoundationWall, createCadElement,
  detectFoundationSectionProposals, foundationSectionMissingFields, foundationSectionState,
  getFoundationSectionIntersections, getFoundationSectionConflicts, resolveFoundationSectionValues,
  synchronizeFoundationSections } from "../dist/index.js";

const projectId = randomUUID();
function makeDocument(entities, sections = []) {
  return CadDocumentSchema.parse({ schemaVersion: 1, id: randomUUID(), projectId, requirementId: "foundation-plan",
    revision: 0, status: "draft", calibration: null, sections, entities });
}
const wall = (start, end) => configureFoundationWall(
  createCadElement("foundation-wall", [start, end], { id: randomUUID() }),
  { widthMm: 240, heightMm: 1200, material: "Bloczek betonowy", base: {
    type: "strip", widthMm: 600, depthMm: 300, designReference: "K-01",
  }, buildUp: [{ purpose: "thermal", material: "XPS", thicknessMm: 100, side: "left" }] });
const cut = createCadElement("section-cut", [{ x: 2000, y: -2000 }, { x: 2000, y: 5000 }],
  { id: randomUUID() });
const section = (cutEntityId, overrides = {}) => ({ id: randomUUID(), label: "A-A", cutEntityId,
  viewDirection: "left", visibilityRangeMm: 7000, overrides });

test("foundation section resolves actual strip intersections and preserves source element IDs", () => {
  const firstWall = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const secondWall = wall({ x: 0, y: 3000 }, { x: 4000, y: 3000 });
  const footing = createCadElement("footing", [firstWall.geometry.start, firstWall.geometry.end], { id: randomUUID() });
  const cutLine = createCadElement("section-cut", [cut.geometry.start, cut.geometry.end], { id: randomUUID() });
  const currentSection = section(cutLine.id);
  const document = makeDocument([firstWall, secondWall, footing, cutLine], [currentSection]);

  const hits = getFoundationSectionIntersections(document, currentSection);
  assert.deepEqual(hits.map(({ elementId }) => elementId), [footing.id, firstWall.id, secondWall.id]);
  assert.deepEqual(hits.map(({ startMm, endMm }) => [startMm, endMm]), [
    [1700, 2300], [1880, 2120], [4880, 5120],
  ]);
  assert.ok(hits.every(({ baseElevationM }) => baseElevationM === null));
  const linked = synchronizeFoundationSections(document);
  assert.deepEqual(linked.sections[0].linkedElementIds, [footing.id, firstWall.id, secondWall.id]);
  const movedAway = { ...linked, entities: linked.entities.map((entity) => entity.id === secondWall.id
    ? { ...entity, geometry: { start: { x: 0, y: 8000 }, end: { x: 4000, y: 8000 } } } : entity) };
  assert.deepEqual(synchronizeFoundationSections(movedAway).sections[0].linkedElementIds, [footing.id, firstWall.id]);
});

test("section-specific values override known instance values without mutating the plan", () => {
  const sourceWall = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const cutLine = createCadElement("section-cut", [cut.geometry.start, cut.geometry.end], { id: randomUUID() });
  const currentSection = section(cutLine.id, {
    wall_thickness_cm: { value: 30, unit: "cm", validated: true },
  });

  const document = makeDocument([sourceWall, cutLine], [currentSection]);
  const resolved = resolveFoundationSectionValues(document, currentSection);

  assert.deepEqual(resolved.wall_thickness_cm, {
    value: 30, unit: "cm", source: "section_override", validated: true,
  });
  assert.deepEqual(resolved.wall_height_cm, {
    value: 120, unit: "cm", source: "element_instance", validated: true,
  });
  assert.deepEqual(sourceWall.geometry, wall({ x: 0, y: 0 }, { x: 4000, y: 0 }).geometry);
});

test("conflicting intersected wall parameters stay unresolved until an explicit section override", () => {
  const firstWall = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const secondWall = configureFoundationWall(createCadElement("foundation-wall",
    [{ x: 0, y: 3000 }, { x: 4000, y: 3000 }], { id: randomUUID() }), {
    widthMm: 300, heightMm: 1200, material: "Bloczek silikatowy",
    base: { type: "strip", widthMm: 800, depthMm: 400, designReference: "K-02" }, buildUp: [],
  });
  const cutLine = createCadElement("section-cut", [cut.geometry.start, cut.geometry.end], { id: randomUUID() });
  const currentSection = section(cutLine.id);
  const document = makeDocument([firstWall, secondWall, cutLine], [currentSection]);
  assert.deepEqual(getFoundationSectionConflicts(document, currentSection), ["wall_thickness_cm", "wall_material"]);
  assert.equal(resolveFoundationSectionValues(document, currentSection).wall_thickness_cm, undefined);
});

test("saved section metadata validates its cut-line reference and field units", () => {
  const cutLine = createCadElement("section-cut", [cut.geometry.start, cut.geometry.end], { id: randomUUID() });
  const valid = section(cutLine.id, {
    ground_elevation_m: { value: -0.25, unit: "m", validated: true },
    waterproofing_type: { value: "Masa bitumiczna", unit: "tekst", validated: true },
  });

  assert.equal(makeDocument([cutLine], [valid]).sections[0].overrides.ground_elevation_m.value, -0.25);
  assert.throws(() => makeDocument([cutLine], [{ ...valid, cutEntityId: randomUUID() }]), /linię cięcia/);
  assert.throws(() => makeDocument([cutLine], [{ ...valid, overrides: {
    footing_width_cm: { value: 0, unit: "cm", validated: true },
  } }]), /Wymiary muszą być dodatnie/);
});

test("automatic detection creates stable column-pad and wall-footing sections only once", () => {
  const sourceWall = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const footing = createCadElement("footing", [sourceWall.geometry.start, sourceWall.geometry.end], { id: randomUUID() });
  const linkedFooting = { ...footing, supportFor: [sourceWall.id] };
  const pad = createCadElement("pad", [
    { x: 1000, y: 1000 }, { x: 2200, y: 1000 }, { x: 2200, y: 2200 }, { x: 1000, y: 2200 },
  ], { id: randomUUID() });
  const column = createCadElement("column", [
    { x: 1400, y: 1400 }, { x: 1800, y: 1400 }, { x: 1800, y: 1800 }, { x: 1400, y: 1800 },
  ], { id: randomUUID() });
  const document = makeDocument([{ ...sourceWall, mark: "W1" }, { ...linkedFooting, mark: "Ł1" },
    { ...pad, mark: "SF1" }, { ...column, mark: "S1" }]);
  const proposals = detectFoundationSectionProposals(document);
  assert.deepEqual(proposals.map(({ kind }) => kind).sort(), ["column-pad", "wall-footing"]);
  assert.deepEqual(proposals.find(({ kind }) => kind === "column-pad").linkedElementIds.sort(), [column.id, pad.id].sort());

  const ids = Array.from({ length: 4 }, () => randomUUID());
  const generated = addDetectedFoundationSections(document, () => ids.shift());
  assert.equal(generated.sections.length, 2);
  assert.equal(generated.entities.filter((entity) => entity.kind === "construction-line"
    && entity.attributes.role === "section-cut").length, 2);
  assert.equal(addDetectedFoundationSections(generated).sections.length, 2);
  assert.equal(generated.sections.find(({ kind }) => kind === "column-pad").label, "S1");
});

test("section completeness and quantities react to missing values, overrides and source geometry changes", () => {
  const sourceWall = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const footing = { ...createCadElement("footing", [sourceWall.geometry.start, sourceWall.geometry.end], { id: randomUUID() }),
    supportFor: [sourceWall.id] };
  const base = makeDocument([sourceWall, footing]);
  const ids = Array.from({ length: 2 }, () => randomUUID());
  const generated = addDetectedFoundationSections(base, () => ids.shift());
  const current = generated.sections[0];
  assert.deepEqual(foundationSectionMissingFields(generated, current),
    ["foundation_bottom_elevation_m", "ground_elevation_m"]);
  const complete = {
    ...generated,
    sections: [{ ...current, overrides: {
      foundation_bottom_elevation_m: { value: -1.2, unit: "m", validated: true },
      ground_elevation_m: { value: -0.2, unit: "m", validated: true },
    } }],
  };
  assert.equal(foundationSectionState(complete, complete.sections[0]), "needs-review");
  const quantities = calculateFoundationSectionMaterials(complete, complete.sections[0]);
  assert.ok(quantities.some(({ label, net }) => label.startsWith("Ściana") && net > 0));
  assert.ok(quantities.some(({ label, warning }) => label.startsWith("Ława") && warning));

  const changed = { ...complete, entities: complete.entities.map((entity) => entity.id === sourceWall.id
    ? { ...entity, attributes: { ...entity.attributes, heightMm: 1500 } } : entity) };
  assert.equal(synchronizeFoundationSections(changed).sections[0].state, "outdated");
});
