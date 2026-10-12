import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { classifyCadTrace, copyCadGeometry, createCadElement, createReinforcementLayout, entityPoints, getCadApprovalIssues, moveCadJunction,
  projectCadWallElevations, resizeCadRectangle, resizeCadStrip, snapCadEndpoint, translateConnectedCadEntity } from "../dist/index.js";
import { CadDocumentSchema, cadDrawingTools, emptyConstructionTechnologySelections, getCadDrawingTools, projectDocumentationCatalog } from "@asystent/schemas";

const common = () => ({ id: randomUUID(), layerId: "wall", units: "mm", reviewStatus: "draft",
  source: { origin: "manual", documentId: null, page: null, confidence: null } });
const wall = (start, end) => ({ ...common(), kind: "wall", geometry: { start, end },
  attributes: { thicknessMm: 240, heightMm: 2800, material: "Ceramika" } });
const document = (entities = [], projectId = randomUUID()) => CadDocumentSchema.parse({
  schemaVersion: 1, id: randomUUID(), projectId, requirementId: "storey-0-drawing-0",
  revision: 2, status: "draft", calibration: null, sourceImage: null, entities,
});
test("every documentation kind exposes scoped tools; foundations cannot draw a roof", () => {
  for (const [kind, definition] of Object.entries(projectDocumentationCatalog)) {
    for (const title of definition.drawings) {
      const tools = getCadDrawingTools(kind, title);
      assert.ok(tools.length > 2);
      assert.ok(tools.includes("dimension"));
      assert.equal(new Set(tools).size, tools.length);
    }
  }
  assert.ok(getCadDrawingTools("foundation", "Rzut fundamentów").includes("foundation-wall"));
  assert.ok(!getCadDrawingTools("foundation", "Rzut fundamentów").includes("roof-plane"));
  assert.ok(!getCadDrawingTools("roof", "Rzut dachu").includes("footing"));
  assert.ok(getCadDrawingTools("paving", "Plan nawierzchni").includes("kerb"));
  assert.ok(getCadDrawingTools("fencing", "Plan ogrodzenia").includes("fence"));
  assert.ok(getCadDrawingTools("foundation", "Detale zbrojenia i zestawienie prętów").includes("rebar-line"));
  assert.ok(!getCadDrawingTools("foundation", "Przekroje fundamentów").includes("slab"));
  assert.ok(getCadDrawingTools("roofStructure", "Zestawienie drewna, stali lub zbrojenia").includes("rafter"));
  assert.ok(!getCadDrawingTools("storey", "Rzut stropu, detale konstrukcyjne i zbrojenie").includes("wall"));
});
test("all drawing tools produce typed geometry and trace classification preserves source provenance", () => {
  const points = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }];
  const parent = wall(points[0], points[1]);
  for (const tool of cadDrawingTools) {
    const entity = createCadElement(tool.id, tool.geometry === "area" ? points : points.slice(0, 2),
      { id: randomUUID(), wall: parent, text: "Opis z projektu" });
    assert.equal(entity.reviewStatus, "draft");
    assert.equal("vertices" in entity.geometry, tool.geometry === "area");
  }
  const trace = { ...common(), kind: "trace-line", geometry: { start: points[0], end: points[1] },
    source: { origin: "openai", documentId: randomUUID(), page: 1, confidence: .9 }, attributes: { label: "Ściana" } };
  const classified = classifyCadTrace(trace, "wall");
  assert.equal(classified.kind, "wall");
  assert.equal(classified.id, trace.id);
  assert.deepEqual(classified.source, trace.source);
  assert.deepEqual(classified.geometry, trace.geometry);
  assert.equal(classified.layerId, "wall");
  assert.throws(() => classifyCadTrace(trace, "roof-plane"), /Typ elementu/);
  assert.throws(() => classifyCadTrace(trace, "annotation"), /Typ elementu/);
});
test("junction snapping and shared corner movement preserve openings and source immutability", () => {
  const a = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const b = wall({ x: 4000, y: 0 }, { x: 4000, y: 3000 });
  const opening = { ...common(), kind: "opening", geometry: { start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 } },
    attributes: { wallId: a.id, heightMm: 1200, sillMm: 900, type: "window" } };
  const original = document([a, b, opening]);
  assert.deepEqual(snapCadEndpoint(original, { x: 3990, y: 8 }, 20), { x: 4000, y: 0 });
  const next = moveCadJunction(original, { x: 4000, y: 0 }, { x: 5000, y: 1000 });
  assert.deepEqual(next.entities[0].geometry.end, next.entities[1].geometry.start);
  assert.deepEqual(next.entities[2].geometry.start, { x: 1250, y: 250 });
  assert.deepEqual(original.entities[0].geometry.end, { x: 4000, y: 0 });
  assert.throws(() => moveCadJunction(original, { x: 4000, y: 0 }, { x: 0, y: 0 }), /niezerową/);
  const translated = translateConnectedCadEntity(original, a.id, { x: 4000, y: 0 });
  assert.deepEqual(translated.entities[0].geometry.start, { x: 4000, y: 0 });
  assert.deepEqual(translated.entities[0].geometry.end, { x: 8000, y: 0 });
  assert.deepEqual(translated.entities[1].geometry.start, { x: 8000, y: 0 });
  assert.deepEqual(translated.entities[2].geometry.start, { x: 5000, y: 0 });
});
test("copying drawings remaps opening ownership and retains revision lineage without double approval", () => {
  const a = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const opening = { ...common(), kind: "opening", geometry: { start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 } },
    attributes: { wallId: a.id, heightMm: 1200, sillMm: 900, type: "window" } };
  const from = document([a, opening]), to = document([], from.projectId);
  const result = copyCadGeometry(from, to, randomUUID);
  assert.equal(result.entities[1].attributes.wallId, result.entities[0].id);
  assert.notEqual(result.entities[0].id, a.id);
  assert.equal(result.entities[0].derivedFrom.revision, from.revision);
  assert.ok(getCadApprovalIssues(result).some(({ message }) => message.includes("podkładem")));
  assert.throws(() => copyCadGeometry(from, document(), randomUUID), /tego samego projektu/);
  assert.throws(() => copyCadGeometry({ ...from, sourceImage: {
    id: randomUUID(), storagePath: "scan.png", widthPx: 100, heightPx: 100, mmPerPixel: 1,
  } }, to, randomUUID), /skalibruj/);
});
test("wall elevations use explicit heights and project opening sizes, not assumed cross sections", () => {
  const a = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  const opening = { ...common(), kind: "opening", geometry: { start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 } },
    attributes: { wallId: a.id, heightMm: 1200, sillMm: 900, type: "window" } };
  const from = document([a, opening]);
  const result = projectCadWallElevations(from, document([], from.projectId), randomUUID);
  assert.deepEqual(entityPoints(result.entities[0])[2], { x: 4000, y: 2800 });
  assert.deepEqual(entityPoints(result.entities[1]), [
    { x: 1000, y: 900 }, { x: 2000, y: 900 }, { x: 2000, y: 2100 }, { x: 1000, y: 2100 },
  ]);
  assert.equal(result.entities[1].attributes.role, "void");
  assert.throws(() => projectCadWallElevations({ ...from, entities: [a, { ...opening,
    attributes: { ...opening.attributes, heightMm: 3000 } }] }, document([], from.projectId), randomUUID), /Otwór wykracza/);
});
test("reinforcement generates bounded editable lines with explicit geometry and no specialist approval", () => {
  const params = { mode: "beam", origin: { x: 0, y: 0 }, lengthMm: 4000, widthMm: 400,
    coverMm: 40, diameterMm: 12, transverseDiameterMm: 8, spacingMm: 200, longitudinalCount: 4,
    steelGrade: "B500", designReference: "K-03" };
  const entities = createReinforcementLayout(params, randomUUID);
  assert.equal(entities.filter(({ layerId }) => layerId === "rebar-longitudinal").length, 4);
  assert.equal(new Set(entities.map(({ id }) => id)).size, entities.length);
  assert.ok(entities.every(({ attributes, reviewStatus }) => !attributes.specialistVerified && reviewStatus === "draft"));
  assert.equal(entities.filter(({ kind }) => kind === "dimension").length, 2);
  assert.ok(getCadApprovalIssues(document(entities)).some(({ message }) => message.includes("długości gięcia")));
  assert.deepEqual(entities[0].geometry.start, { x: 46, y: 46 });
  const mesh = createReinforcementLayout({ ...params, mode: "mesh", widthMm: 2000 }, randomUUID);
  assert.ok(mesh.some(({ layerId }) => layerId === "rebar-transverse"));
  assert.throws(() => createReinforcementLayout({ ...params, coverMm: 200 }, randomUUID), /Otulina/);
  assert.throws(() => createReinforcementLayout({ ...params, spacingMm: 1 }, randomUUID), /limit/);
});
test("material layers retain real thickness and reject empty material or zero thickness", () => {
  const a = wall({ x: 0, y: 0 }, { x: 4000, y: 0 });
  a.buildUp = [{ purpose: "thermal", material: "XPS", thicknessMm: 150, side: "left" }];
  assert.equal(document([a]).entities[0].buildUp[0].thicknessMm, 150);
  assert.throws(() => document([{ ...a, buildUp: [{ ...a.buildUp[0], thicknessMm: 0 }] }]));
});
test("foundation slab follows saved technology; pad dimensions update actual geometry", () => {
  const technology = structuredClone(emptyConstructionTechnologySelections);
  technology.foundationType = ["strip-footings"];
  assert.ok(!getCadDrawingTools("foundation", "Rzut fundamentów", technology).includes("slab"));
  technology.foundationType.push("foundation-slab");
  assert.ok(getCadDrawingTools("foundation", "Rzut fundamentów", technology).includes("slab"));
  technology.foundationType = [];
  technology.otherFoundationType = ["according-to-project"];
  assert.ok(getCadDrawingTools("foundation", "Rzut fundamentów", technology).includes("slab"));
  technology.otherFoundationType = ["other-foundation-slab"];
  assert.ok(getCadDrawingTools("foundation", "Rzut fundamentów", technology).includes("slab"));
  const pad = createCadElement("pad", [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], { id: randomUUID() });
  const resized = resizeCadRectangle(pad, 2500, 1500);
  assert.deepEqual(resized.geometry.vertices[2], { x: 2500, y: 1500 });
  assert.deepEqual(pad.geometry.vertices[2], { x: 2000, y: 1000 });
  assert.throws(() => resizeCadRectangle(pad, 0, 10));
  const footing = createCadElement("footing", [{ x: 0, y: 0 }, { x: 5000, y: 0 }], { id: randomUUID() });
  const adjusted = resizeCadStrip(footing, 6000);
  assert.equal(adjusted.geometry.end.x + adjusted.attributes.widthMm, 6000);
  assert.throws(() => resizeCadStrip(footing, footing.attributes.widthMm));
});
