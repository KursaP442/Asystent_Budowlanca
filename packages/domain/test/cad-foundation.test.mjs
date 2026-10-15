import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CadDocumentSchema, emptyConstructionTechnologySelections, getFoundationSupportOptions } from "@asystent/schemas";
import { configureFoundationWall, connectCadWallJunctions, copyCadGeometry, createCadElement, createReinforcementLayout, moveCadJunction,
placeReinforcementOnHost, synchronizeFoundationSupports, synchronizeReinforcementPlacement,
checkFoundationPlanCompleteness } from "../dist/index.js";

const projectId = randomUUID();
const document = (entities = [], changes = {}) => CadDocumentSchema.parse({ schemaVersion: 1, id: randomUUID(), projectId,
  requirementId: "foundation-drawing-0", revision: 0, status: "draft", calibration: null, entities, ...changes });
const wall = (a, b, base) => configureFoundationWall(createCadElement("foundation-wall", [a,b], { id: randomUUID() }),
  { widthMm: 240, heightMm: 1000, material: "Bloczek betonowy", base,
    buildUp: [{ purpose: "thermal", material: "XPS", thicknessMm: 100, side: "left" }] });
const strip = { type: "strip", widthMm: 800, depthMm: 400, designReference: "K-01" };
const slab = { type: "slab", thicknessMm: 250, overhangMm: 200, boundary: true, material: "C25/30", designReference: "K-01" };

test("automatic footing uses project dimensions, follows its wall, copies relationships and deletes with the wall", () => {
  const source = document([wall({x:0,y:0},{x:6000,y:0},strip)]);
  const assembled = synchronizeFoundationSupports(source,randomUUID);
  assert.equal(assembled.entities.length,2);
  const footing = assembled.entities.find((e) => e.kind === "footing");
  assert.deepEqual(footing.geometry,source.entities[0].geometry);
  assert.equal(footing.attributes.widthMm,800);
  assert.equal(footing.attributes.depthMm,400);
  const moved = synchronizeFoundationSupports(moveCadJunction(assembled,{x:0,y:0},{x:23.75,y:100}),randomUUID);
  assert.equal(moved.entities.find((e) => e.kind === "footing").id,footing.id);
  assert.equal(moved.entities.find((e) => e.kind === "footing").geometry.start.x,23.75);
  assert.equal(assembled.entities.find((e) => e.kind === "footing").geometry.start.x,0);
  const copied = copyCadGeometry(assembled,document(),randomUUID);
  assert.equal(copied.entities.find((e) => e.kind === "footing").supportFor[0],copied.entities.find((e) => e.kind === "construction-line").id);
  const removed = synchronizeFoundationSupports({...assembled,entities:assembled.entities.filter((e) => e.kind !== "construction-line")},randomUUID);
  assert.equal(removed.entities.length,0);
});
test("a slab is generated only from closed perimeter with exterior wall faces and explicit overhang", () => {
  const walls = [
    wall({x:0,y:0},{x:6000,y:0},slab),wall({x:6000,y:4000},{x:6000,y:0},slab),
    wall({x:6000,y:4000},{x:0,y:4000},slab),wall({x:0,y:0},{x:0,y:4000},slab),
  ];
  assert.equal(synchronizeFoundationSupports(document(walls.slice(0,3)),randomUUID).entities.length,3);
  const result = synchronizeFoundationSupports(document(walls),randomUUID);
  const plate = result.entities.find((e) => e.kind === "slab");
  const expected = [{x:-320,y:-320},{x:6320,y:-320},{x:6320,y:4320},{x:-320,y:4320}];
  plate.geometry.vertices.forEach((point,i) => {
    assert.ok(Math.abs(point.x - expected[i].x) < .000001);
    assert.ok(Math.abs(point.y - expected[i].y) < .000001);
  });
  assert.equal(plate.attributes.thicknessMm,250);
  assert.equal(plate.supportFor.length,4);
  const changed = synchronizeFoundationSupports(moveCadJunction(result,{x:6000,y:4000},{x:6200,y:4100}),randomUUID);
  assert.equal(changed.entities.find((e) => e.kind === "slab").id,plate.id);
  assert.notDeepEqual(changed.entities.find((e) => e.kind === "slab").geometry,plate.geometry);
  assert.throws(() => synchronizeFoundationSupports(document([...walls,wall({x:0,y:0},{x:3000,y:2000},slab)]),randomUUID),/rozgałęzienie/);
  assert.throws(() => synchronizeFoundationSupports(document([...walls.slice(0,3),wall({x:0,y:0},{x:0,y:4000},{...slab,thicknessMm:300})]),randomUUID),/te same parametry/);
});
test("foundation options match house and other-work selections without inventing pile spacing", () => {
  const t = structuredClone(emptyConstructionTechnologySelections);
  t.foundationType = ["strip-footings","foundation-slab"];
  assert.deepEqual(getFoundationSupportOptions(t).map((o) => o.value),["strip","slab"]);
  t.foundationType = []; t.otherFoundationType = ["other-foundation-strip"];
  assert.deepEqual(getFoundationSupportOptions(t).map((o) => o.value),["strip"]);
  t.otherFoundationType = []; t.foundationType = ["pile-foundation"];
  assert.deepEqual(getFoundationSupportOptions(t).map((o) => o.value),["manual"]);
});
test("T joints split foundation walls without losing generated supports or closed slab boundary", () => {
  const perimeter = [wall({x:0,y:0},{x:6000,y:0},slab),wall({x:6000,y:0},{x:6000,y:4000},slab),
    wall({x:6000,y:4000},{x:0,y:4000},slab),wall({x:0,y:4000},{x:0,y:0},slab)];
  const internal = wall({x:3000,y:0},{x:3000,y:3000},{...slab,boundary:false});
  const connected = connectCadWallJunctions(document([...perimeter,internal]),randomUUID);
  assert.equal(connected.entities.length,6);
  const result = synchronizeFoundationSupports(connected,randomUUID);
  const plate = result.entities.find((e) => e.kind === "slab");
  assert.equal(plate.supportFor.length,5);
  assert.ok(Math.abs(Math.max(...plate.geometry.vertices.map((p) => p.x))-6320) < .000001);
  const stripWalls = connectCadWallJunctions(document([wall({x:0,y:0},{x:6000,y:0},strip),
    wall({x:3000,y:0},{x:3000,y:3000},strip)]),randomUUID);
  const supported = synchronizeFoundationSupports(stripWalls,randomUUID);
  assert.equal(supported.entities.filter((e) => e.kind === "footing").length,3);
  const moved = synchronizeFoundationSupports(moveCadJunction(supported,{x:3000,y:0},{x:3200,y:200}),randomUUID);
  assert.equal(moved.entities.filter((e) => e.kind === "construction-line"
    && [e.geometry.start,e.geometry.end].some((p) => p.x === 3200 && p.y === 200)).length,3);
});

test("foundation completeness distinguishes missing geometry, designer review and complete documentation", () => {
  const empty = checkFoundationPlanCompleteness(document());
  assert.equal(empty.status, "requires-completion");
  assert.ok(empty.issues.some(({ code }) => code === "geometry"));
  assert.ok(empty.issues.some(({ code }) => code === "sections"));

  const foundationWall = { ...wall({x:0,y:0},{x:6000,y:0},strip), reviewStatus: "verified" };
  const axis = { ...createCadElement("axis", [{x:0,y:-1000},{x:0,y:1000}], {id:randomUUID()}), mark:"A", reviewStatus: "verified" };
  const cut = { ...createCadElement("section-cut", [{x:0,y:0},{x:6000,y:0}], {id:randomUUID()}), reviewStatus: "verified" };
  const section = { id:randomUUID(), label:"A-A", cutEntityId:cut.id, viewDirection:"left",
    visibilityRangeMm:8000, kind:"wall-footing", state:"complete", overrides:{
      foundation_bottom_elevation_m:{value:-1.2,unit:"m",validated:true},
      ground_elevation_m:{value:0,unit:"m",validated:true},
      wall_height_cm:{value:100,unit:"cm",validated:true},
      wall_thickness_cm:{value:24,unit:"cm",validated:true},
      footing_width_cm:{value:80,unit:"cm",validated:true},
      footing_height_cm:{value:40,unit:"cm",validated:true},
    } };
  const references = { geotechnics:"G-01", concrete:"K-01", reinforcement:"K-02", isolation:"A-01" };
  const ready = document([foundationWall, axis, cut], { sections:[section], documentReferences:references });
  assert.deepEqual(checkFoundationPlanCompleteness(ready), { status:"complete", issues:[] });

  const draft = document([{...foundationWall, reviewStatus:"draft"}, axis, cut],
    { sections:[section], documentReferences:references });
  assert.equal(checkFoundationPlanCompleteness(draft).status, "requires-review");
});

test("foundation completeness blocks impossible support dimensions and invalid outlines", () => {
  const narrowBase = { ...wall({x:0,y:0},{x:6000,y:0},strip),
    foundationBase:{...strip,widthMm:100} };
  assert.equal(checkFoundationPlanCompleteness(document([narrowBase])).status, "error");

  const bowTie = createCadElement("slab", [
    {x:0,y:0},{x:1000,y:1000},{x:0,y:1000},{x:1000,y:0},
  ], {id:randomUUID()});
  const result = checkFoundationPlanCompleteness(document([bowTie]));
  assert.equal(result.status, "error");
  assert.ok(result.issues.some(({ code }) => code === "invalid-outline"));
});

test("foundation completeness rejects placeholder materials and reports both axis issues", () => {
  const foundationWall = wall({x:0,y:0},{x:6000,y:0},strip);
  const placeholderWall = { ...foundationWall,
    attributes: { ...foundationWall.attributes, material:"Zgodnie z projektem" } };
  const axis = { ...createCadElement("axis", [{x:0,y:-1000},{x:0,y:1000}], {id:randomUUID()}) };
  const result = checkFoundationPlanCompleteness(document([placeholderWall, axis]));
  assert.ok(result.issues.some(({ code, status }) => code === `material-${placeholderWall.id}` && status === "missing"));
  assert.ok(result.issues.some(({ code }) => code === "axis-labels"));
  assert.ok(result.issues.some(({ code }) => code === "axis-review"));
});
test("graphic beam section retains bar groups; placement rotates, follows host and flags length changes", () => {
  const host = wall({x:1000,y:2000},{x:1000,y:7000},strip);
  const layout = createReinforcementLayout({ mode:"beam",origin:{x:0,y:0},lengthMm:4000,widthMm:300,heightMm:500,
    coverMm:40,diameterMm:12,transverseDiameterMm:8,spacingMm:200,longitudinalCount:4,topBarCount:2,
    steelGrade:"B500",designReference:"K-03" },randomUUID);
  const placed = placeReinforcementOnHost(layout,host,100,randomUUID);
  const detail = placed.find((e) => e.kind === "rebar-annotation");
  assert.equal(detail.attributes.section.topCount,2);
  assert.equal(detail.attributes.section.bottomCount,2);
  assert.equal(placed[0].placement.hostId,host.id);
  const oldLength = Math.hypot(placed[0].geometry.end.x-placed[0].geometry.start.x,placed[0].geometry.end.y-placed[0].geometry.start.y);
  const shiftedHost = {...host,geometry:{start:{x:1200,y:2000},end:{x:1200,y:7000}}};
  const shifted = synchronizeReinforcementPlacement(document([shiftedHost,...placed]));
  assert.equal(shifted.entities[1].geometry.start.x,placed[0].geometry.start.x+200);
  assert.equal(shifted.entities[1].placement.needsReview,false);
  const shortened = synchronizeReinforcementPlacement(document([{...host,geometry:{start:host.geometry.start,end:{x:1000,y:6000}}},...placed]));
  assert.equal(shortened.entities[1].placement.needsReview,true);
  assert.equal(Math.hypot(shortened.entities[1].geometry.end.x-shortened.entities[1].geometry.start.x,
    shortened.entities[1].geometry.end.y-shortened.entities[1].geometry.start.y),oldLength);
  assert.throws(() => placeReinforcementOnHost(layout,host,2000,randomUUID),/wykracza/);
  assert.throws(() => document(placed),/podparcia/);
});
