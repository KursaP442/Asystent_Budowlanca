import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyReinforcementTemplate, buildReinforcementSchedule, createBentRebarEntity, createReinforcementHostChain,
  createReinforcementTemplate, developedLengthOfShape, reinforcementPath3d, classifyCadTrace, connectCadWallJunctions,
  beamStandardMainBarBundles, beamStandardMainBarCorners, beamStirrupSlots, beamStirrupSlotStates,
  beamCustomMainBarAllowedRange, beamCustomMainBarFullBeamCheck, beamCustomMainBarIssues, beamResolvedCustomMainBars, beamStirrupConnectionIssues, beamStirrupPlacements, copyCadGeometry, reinforcementShapeOutline, createCadElement, createReinforcementLayout, entityPoints, getCadApprovalIssues, moveCadJunction,
  groupCollinearReinforcementHosts, locateBeamHostStation, splitReinforcementHostChain, synchronizeReinforcementHostChains, validateReinforcement,
  projectCadWallElevations, resizeCadRectangle, resizeCadStrip, snapCadConnection, snapCadEndpoint, translateConnectedCadEntity } from "../dist/index.js";
import { CadDocumentSchema, cadDrawingTools, emptyConstructionTechnologySelections, getCadDrawingTools, getCadWallDefaults, projectDocumentationCatalog } from "@asystent/schemas";

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
test("connection snapping prioritizes corners, supports T joints and excludes the moving group", () => {
  const a = wall({x:0,y:0},{x:4000,y:0});
  const original = document([a]);
  assert.deepEqual(snapCadConnection(original,{x:3995,y:8},20),{x:4000,y:0});
  assert.deepEqual(snapCadConnection(original,{x:2000,y:8},20),{x:2000,y:0});
  assert.equal(snapCadConnection(original,{x:2000,y:25},20),null);
  assert.equal(snapCadConnection(original,{x:2000,y:8},20,[a.id]),null);
  const b = wall({x:2000,y:0},{x:2000,y:3000});
  const joined = connectCadWallJunctions(document([a,b]),randomUUID);
  assert.equal(joined.entities.length,3);
  const corner = moveCadJunction(joined,{x:2000,y:0},{x:2100,y:400});
  assert.equal(corner.entities.filter((e) => entityPoints(e).some((p) => p.x === 2100 && p.y === 400)).length,3);
  assert.deepEqual(a.geometry.end,{x:4000,y:0});
  assert.equal(connectCadWallJunctions(joined,randomUUID).entities.length,3);
});
test("joining a wall preserves opening ownership and rejects a joint inside an opening", () => {
  const a = wall({x:0,y:0},{x:4000,y:0});
  const opening = {...common(),kind:"opening",geometry:{start:{x:2500,y:0},end:{x:3500,y:0}},
    attributes:{wallId:a.id,heightMm:1200,sillMm:900,type:"window"}};
  const b = wall({x:2000,y:0},{x:2000,y:3000});
  const joined = connectCadWallJunctions(document([a,b,opening]),randomUUID);
  const relocated = joined.entities.find((e) => e.kind === "opening");
  assert.notEqual(relocated.attributes.wallId,a.id);
  assert.equal(joined.entities.find((e) => e.id === relocated.attributes.wallId).geometry.start.x,2000);
  assert.throws(() => connectCadWallJunctions(document([a,wall({x:3000,y:0},{x:3000,y:3000}),opening]),randomUUID),/otworze/);
});
test("only explicit technology thicknesses are automatic, and remain editable", () => {
  const t = structuredClone(emptyConstructionTechnologySelections);
  for (const [choice,width] of [["shuttering-block-24",240],["shuttering-block-25",250],["shuttering-block-30",300],["concrete-block-24",240]]) {
    t.foundationWalls = choice;
    assert.equal(getCadWallDefaults(t,true).widthMm,width);
    assert.ok(getCadWallDefaults(t,true).material);
  }
  t.foundationWalls = "hollow-shuttering-block";
  assert.equal(getCadWallDefaults(t,true).widthMm,null);
  t.foundationWalls = "according-to-project";
  assert.equal(getCadWallDefaults(t,true).material,null);
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
test("beam reinforcement supports distinct stirrup zones and groups equal straight bars for schedule", () => {
  const params = { mode: "beam", origin: { x: 0, y: 0 }, lengthMm: 4000, widthMm: 400, heightMm: 500,
    coverMm: 40, diameterMm: 12, transverseDiameterMm: 8, spacingMm: 200, longitudinalCount: 4,
    topBarCount: 2, steelGrade: "B500B", designReference: "K-03",
    stirrupZones: [
      { startMm: 0, endMm: 1000, spacingMm: 250 },
      { startMm: 1000, endMm: 2000, spacingMm: 500 },
      { startMm: 2500, endMm: 4000, spacingMm: 500 },
    ] };
  const entities = createReinforcementLayout(params, randomUUID);
  const stirrups = entities.filter(({ layerId }) => layerId === "rebar-stirrups-projection");
  assert.equal(stirrups.length, 11);
  assert.equal(new Set(stirrups.map(({ geometry }) => geometry.start.x)).size, 11);
  const rows = buildReinforcementSchedule(entities);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(({ quantity, developedLengthMm, shape }) => quantity === 2 && developedLengthMm === 3892 && shape === "straight"));
  assert.ok(rows.every(({ unitMassKg }) => Math.abs(unitMassKg - 0.8878) < 0.001));
  assert.ok(rows.every(({ totalMassKg, totalLengthM }) => Math.abs(totalMassKg - totalLengthM * 0.8878) < 0.01));
});
test("reinforcement zones reject overlap, out-of-range and excessive placement", () => {
  const params = { mode: "beam", origin: { x: 0, y: 0 }, lengthMm: 4000, widthMm: 400, heightMm: 500,
    coverMm: 40, diameterMm: 12, transverseDiameterMm: 8, spacingMm: 200, longitudinalCount: 4,
    topBarCount: 2, steelGrade: "B500B", designReference: "K-03" };
  assert.throws(() => createReinforcementLayout({ ...params, stirrupZones: [
    { startMm: 0, endMm: 1500, spacingMm: 100 },
    { startMm: 1000, endMm: 2000, spacingMm: 200 },
  ] }, randomUUID), /nakładać/);
  assert.throws(() => createReinforcementLayout({ ...params, stirrupZones: [
    { startMm: 3500, endMm: 4500, spacingMm: 200 },
  ] }, randomUUID), /wykracza/);
  assert.throws(() => createReinforcementLayout({ ...params, stirrupZones: [
    { startMm: 0, endMm: 4000, spacingMm: 1 },
  ] }, randomUUID), /1000/);
});
test("beam constructor expands regular, concentrated and bundled stirrup placements", () => {
  const shape = { kind: "stirrup", diameterMm: 8, bends: [
    { lengthMm: 300, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 300, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
  ] };
  const zoneId = randomUUID();
  const placements = beamStirrupPlacements({
    id: randomUUID(),
    name: "Ława 1",
    hostIds: [randomUUID()],
    lengthMm: 5000,
    widthMm: 800,
    heightMm: 400,
    firstStirrupMm: 400,
    lastStirrupMm: 4600,
    status: "draft",
    zones: [{
      id: zoneId,
      shapeTemplateId: randomUUID(),
      shapeName: "S1",
      shape,
      startMm: 400,
      endMm: 1400,
      spacingMm: 500,
      bundleCount: 1,
      bundleGapMm: 0,
      bundleDirection: "right",
      concentrations: [{
        id: randomUUID(),
        startMm: 400,
        endMm: 800,
        spacingMm: 200,
        bundleCount: 2,
        bundleGapMm: 40,
        bundleDirection: "up",
      }],
    }],
  });
  assert.deepEqual(placements.map(({ stationMm }) => stationMm), [400, 400, 600, 600, 800, 800, 900, 1400]);
  assert.deepEqual(placements.slice(0, 2).map(({ transverseOffsetMm, verticalOffsetMm }) =>
    [transverseOffsetMm, verticalOffsetMm]), [[0, 50], [0, 90]]);
  assert.ok(placements.every((placement) => placement.zoneId === zoneId && placement.shapeName === "S1"));
  assert.deepEqual(locateBeamHostStation([
    { hostId: "host-a", lengthMm: 1000 },
    { hostId: "host-b", lengthMm: 750 },
  ], 1400), { hostId: "host-b", stationOnHostMm: 400 });
  assert.throws(() => locateBeamHostStation([{ hostId: "host-a", lengthMm: 1000 }], 1001),
    /przekracza długość belki/);
  const nextZoneId = randomUUID();
  const sequential = beamStirrupPlacements({
    id: randomUUID(),
    name: "Ława 2",
    hostIds: [randomUUID()],
    lengthMm: 2000,
    widthMm: 400,
    heightMm: 500,
    firstStirrupMm: 200,
    lastStirrupMm: 1800,
    status: "draft",
    zones: [
      {
        id: randomUUID(),
        shapeTemplateId: randomUUID(),
        shapeName: "S1",
        shape: { kind: "stirrup", diameterMm: 8, bends: [{ lengthMm: 100, angleDegrees: 0, radiusMm: 20, plane: "xy" }] },
        startMm: 200,
        endMm: 1000,
        spacingMm: 200,
        bundleCount: 1,
        bundleGapMm: 0,
        bundleDirection: "right",
        concentrations: [],
      },
      {
        id: nextZoneId,
        shapeTemplateId: randomUUID(),
        shapeName: "S2",
        shape: { kind: "stirrup", diameterMm: 10, bends: [{ lengthMm: 100, angleDegrees: 0, radiusMm: 20, plane: "xy" }] },
        startMm: 1000,
        endMm: 1800,
        spacingMm: 200,
        bundleCount: 1,
        bundleGapMm: 0,
        bundleDirection: "right",
        concentrations: [],
      },
    ],
  });
  assert.equal(sequential.filter(({ stationMm }) => stationMm === 1000).length, 1);
  assert.equal(sequential.find(({ stationMm }) => stationMm === 1000)?.zoneId, nextZoneId);
});
test("custom bent bars retain bend geometry, 3D path and developed arc length", () => {
  const shape = { kind: "custom", bends: [
    { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    { lengthMm: 300, angleDegrees: 0, radiusMm: 20, plane: "spatial", azimuthDegrees: 45, elevationDegrees: 30 },
  ] };
  const bar = createBentRebarEntity({ id: randomUUID(), origin: { x: 10, y: 20 }, diameterMm: 12,
    coverMm: 40, steelGrade: "B500B", designReference: "B-01", shape });
  assert.equal(bar.attributes.shape.kind, "custom");
  assert.equal(reinforcementPath3d({ x: 10, y: 20 }, shape).length, 3);
  assert.ok(Math.abs(developedLengthOfShape(shape) - (500 + Math.PI / 2 * 20 + 300)) < .001);
  const rotatedPath = reinforcementPath3d({ x: 10, y: 20 }, { ...shape, rotationDegrees: 90 });
  assert.ok(Math.abs(rotatedPath[1].x - 10) < .001);
  assert.ok(Math.abs(rotatedPath[1].y - 520) < .001);
  assert.ok(Math.abs(developedLengthOfShape({ ...shape, rotationDegrees: 90 }) - developedLengthOfShape(shape)) < .001);
  const xzPath = reinforcementPath3d({ x: 10, y: 20, z: 30 }, {
    kind: "custom", bends: [
      { lengthMm: 100, angleDegrees: 90, radiusMm: 20, plane: "xz" },
      { lengthMm: 50, angleDegrees: 0, radiusMm: 20, plane: "xz" },
    ],
  });
  assert.deepEqual(xzPath, [
    { x: 10, y: 20, z: 30 },
    { x: 110, y: 20, z: 30 },
    { x: 110, y: 20, z: 80 },
  ]);
  const yzPath = reinforcementPath3d({ x: 10, y: 20, z: 30 }, {
    kind: "custom", bends: [
      { lengthMm: 100, angleDegrees: 90, radiusMm: 20, plane: "yz" },
      { lengthMm: 50, angleDegrees: 0, radiusMm: 20, plane: "yz" },
    ],
  });
  assert.deepEqual(yzPath, [
    { x: 10, y: 20, z: 30 },
    { x: 10, y: 120, z: 30 },
    { x: 10, y: 120, z: 80 },
  ]);
  const row = buildReinforcementSchedule([bar]);
  assert.equal(row[0].shape, "custom");
  assert.ok(Math.abs(row[0].developedLengthMm - developedLengthOfShape(shape)) < .001);
});
test("reinforcement host chains preserve source segments and require an explicitly continuous order", () => {
  const first = wall({ x: 0, y: 0 }, { x: 2000, y: 0 });
  const second = wall({ x: 2000, y: 0 }, { x: 2000, y: 1500 });
  const detached = wall({ x: 5000, y: 0 }, { x: 6000, y: 0 });
  const base = document([first, second, detached]);
  const joined = createReinforcementHostChain(base, {
    id: randomUUID(), name: "Ciąg L1", elementType: "strip-footing", hostIds: [first.id, second.id],
  });
  assert.equal(joined.entities.length, 3);
  assert.deepEqual(joined.reinforcementChains[0].hostIds, [first.id, second.id]);
  assert.equal(joined.reinforcementChains[0].status, "draft");
  const moved = { ...joined, entities: joined.entities.map((entity) => entity.id === second.id
    ? { ...entity, geometry: { ...entity.geometry, end: { x: 2500, y: 1500 } } } : entity) };
  assert.equal(synchronizeReinforcementHostChains(moved).reinforcementChains[0].status, "needs-review");
  assert.equal(splitReinforcementHostChain(joined, joined.reinforcementChains[0].id).reinforcementChains.length, 0);
  assert.throws(() => createReinforcementHostChain(base, {
    id: randomUUID(), name: "Błędny", elementType: "custom", hostIds: [first.id, detached.id],
  }), /uporządkowanej/);
});
test("reinforcement plan groups straight T-junction splits without joining corners", () => {
  const entities = [
    wall({ x: 0, y: 0 }, { x: 6000, y: 0 }),
    wall({ x: 6000, y: 0 }, { x: 6000, y: 2000 }),
    wall({ x: 6000, y: 2000 }, { x: 6000, y: 4000 }),
    wall({ x: 6000, y: 4000 }, { x: 0, y: 4000 }),
    wall({ x: 0, y: 4000 }, { x: 0, y: 2000 }),
    wall({ x: 0, y: 2000 }, { x: 0, y: 0 }),
    wall({ x: 0, y: 2000 }, { x: 6000, y: 2000 }),
  ];
  const groups = groupCollinearReinforcementHosts(entities);
  assert.equal(groups.length, 5);
  assert.deepEqual(groups.map((group) => group.length).sort(), [1, 1, 1, 2, 2]);

  const bent = [
    wall({ x: 0, y: 0 }, { x: 1000, y: 0 }),
    wall({ x: 1000, y: 0 }, { x: 1800, y: 600 }),
  ];
  assert.equal(groupCollinearReinforcementHosts(bent).length, 2);
});
test("reinforcement templates snapshot bars and apply them in target host coordinates", () => {
  const host = wall({ x: 100, y: 200 }, { x: 100, y: 2200 });
  const source = createReinforcementLayout({
    mode: "beam", origin: { x: 0, y: 0 }, lengthMm: 1000, widthMm: 300, heightMm: 400,
    coverMm: 30, diameterMm: 12, transverseDiameterMm: 8, spacingMm: 200,
    longitudinalCount: 4, topBarCount: 2, steelGrade: "B500B", designReference: "K-11",
  }, randomUUID);
  const template = createReinforcementTemplate({
    id: randomUUID(), name: "Belka testowa", elementType: "beam", entities: source,
    createdAt: new Date().toISOString(),
  });
  const applied = applyReinforcementTemplate(template, host, randomUUID);
  assert.equal(applied.length, source.filter((entity) => entity.kind === "rebar-line").length);
  assert.ok(applied.every((entity) => entity.placement?.hostId === host.id));
  assert.deepEqual(applied[0].geometry.start, host.geometry.start);
});
test("reinforcement validation reports cover, collisions, missing material and bend radius without approving", () => {
  const host = { ...wall({ x: 0, y: 0 }, { x: 2000, y: 0 }), attributes: {
    thicknessMm: 200, heightMm: 1000, material: "Beton",
  } };
  const bar = {
    ...common(), kind: "rebar-line", layerId: "rebar-bottom",
    placement: { hostId: host.id, groupId: randomUUID(), start: host.geometry.start, end: host.geometry.end, needsReview: true },
    geometry: { start: { x: 0, y: 90 }, end: { x: 1000, y: 90 } },
    attributes: { diameterMm: 12, count: 1, steelGrade: "według projektu", coverMm: 40,
      designReference: "K-01", specialistVerified: false, shape: {
        kind: "L", bends: [{ lengthMm: 1000, angleDegrees: 90, radiusMm: 10, plane: "xy" }],
      } },
  };
  const duplicate = { ...bar, id: randomUUID(), placement: { ...bar.placement, groupId: randomUUID(), needsReview: false } };
  const issues = validateReinforcement(document([host, bar, duplicate]));
  assert.ok(issues.some(({ code }) => code === "missing-material"));
  assert.ok(issues.some(({ code }) => code === "outside-cover"));
  assert.ok(issues.some(({ code }) => code === "collision"));
  assert.ok(issues.some(({ code }) => code === "placement-review"));
  assert.ok(issues.some(({ code }) => code === "bend-radius"));
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

test("stirrup outline keeps the real shape size instead of the concrete section", () => {
  const outline = reinforcementShapeOutline({
    kind: "stirrup",
    diameterMm: 8,
    bends: [
      { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: 500, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  assert.equal(Math.round(outline.widthMm), 500);
  assert.equal(Math.round(outline.heightMm), 500);
  assert.equal(outline.points.length, 5);
  assert.ok(outline.points.every(({ x, y }) => x >= -0.001 && y >= -0.001));
});

test("standard beam bars fit inside all four corners of the smallest stirrup", () => {
  const shape = (widthMm, heightMm) => ({
    kind: "stirrup",
    diameterMm: 8,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const firstZoneId = randomUUID();
  const corners = beamStandardMainBarCorners({
    id: randomUUID(),
    name: "Ława narożna",
    hostIds: [randomUUID()],
    lengthMm: 3000,
    widthMm: 700,
    heightMm: 600,
    firstStirrupMm: 300,
    lastStirrupMm: 2700,
    standardMainBars: { diameterMm: 12 },
    zones: [{
      id: firstZoneId,
      shapeTemplateId: randomUUID(),
      shapeName: "Duże",
      shape: shape(500, 500),
      startMm: 300,
      endMm: 1500,
      spacingMm: 200,
      bundleCount: 1,
      bundleGapMm: 0,
      concentrations: [],
    }, {
      id: randomUUID(),
      shapeTemplateId: randomUUID(),
      shapeName: "Małe",
      shape: shape(300, 400),
      startMm: 1500,
      endMm: 2700,
      spacingMm: 200,
      bundleCount: 1,
      bundleGapMm: 0,
      concentrations: [],
    }],
    status: "draft",
  });
  assert.deepEqual(corners, [
    { id: "bundle-0-top-left", corner: "top-left", bundleIndex: 0, transverseOffsetMm: -140, verticalOffsetMm: 190 },
    { id: "bundle-0-top-right", corner: "top-right", bundleIndex: 0, transverseOffsetMm: 140, verticalOffsetMm: 190 },
    { id: "bundle-0-bottom-left", corner: "bottom-left", bundleIndex: 0, transverseOffsetMm: -140, verticalOffsetMm: -190 },
    { id: "bundle-0-bottom-right", corner: "bottom-right", bundleIndex: 0, transverseOffsetMm: 140, verticalOffsetMm: -190 },
  ]);
  const innerHalfWidthMm = 300 / 2 - 8 / 2;
  const innerHalfHeightMm = 400 / 2 - 8 / 2;
  for (const corner of corners) {
    assert.equal(Math.abs(corner.transverseOffsetMm) + 12 / 2, innerHalfWidthMm);
    assert.equal(Math.abs(corner.verticalOffsetMm) + 12 / 2, innerHalfHeightMm);
  }
});

test("bundled smallest stirrups receive a full set of standard corner bars each", () => {
  const shape = (widthMm, heightMm) => ({
    kind: "stirrup",
    diameterMm: 8,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const assembly = {
    id: randomUUID(),
    name: "Ława z pakietem",
    hostIds: [randomUUID()],
    lengthMm: 3000,
    widthMm: 700,
    heightMm: 600,
    firstStirrupMm: 300,
    lastStirrupMm: 2700,
    standardMainBars: { diameterMm: 12 },
    zones: [{
      id: randomUUID(),
      shapeTemplateId: randomUUID(),
      shapeName: "Duże",
      shape: shape(500, 500),
      startMm: 300,
      endMm: 1500,
      spacingMm: 200,
      bundleCount: 1,
      bundleGapMm: 0,
      concentrations: [],
    }, {
      id: randomUUID(),
      shapeTemplateId: randomUUID(),
      shapeName: "Małe w pakiecie",
      shape: shape(300, 400),
      startMm: 1500,
      endMm: 2700,
      spacingMm: 200,
      bundleCount: 2,
      bundleGapMm: 150,
      bundleDirection: "right",
      concentrations: [],
    }],
    status: "draft",
  };
  const bundles = beamStandardMainBarBundles(assembly);
  assert.deepEqual(bundles, [
    { bundleIndex: 0, transverseOffsetMm: 0, verticalOffsetMm: 0 },
    { bundleIndex: 1, transverseOffsetMm: 150, verticalOffsetMm: 0 },
  ]);
  const corners = beamStandardMainBarCorners(assembly);
  assert.equal(corners.length, 8);
  assert.deepEqual(corners.filter((corner) => corner.bundleIndex === 1)
    .map(({ transverseOffsetMm, verticalOffsetMm }) => ({ transverseOffsetMm, verticalOffsetMm })), [
    { transverseOffsetMm: 10, verticalOffsetMm: 190 },
    { transverseOffsetMm: 290, verticalOffsetMm: 190 },
    { transverseOffsetMm: 10, verticalOffsetMm: -190 },
    { transverseOffsetMm: 290, verticalOffsetMm: -190 },
  ]);
  assert.equal(new Set(corners.map((corner) => corner.id)).size, 8);
});

test("custom main bar slots follow the stirrup, block occupied places and stay in compatible stirrups", () => {
  const shape = (widthMm, heightMm) => ({
    kind: "stirrup",
    diameterMm: 8,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const zone = (name, size, startMm, endMm) => ({
    id: randomUUID(), shapeTemplateId: randomUUID(), shapeName: name, shape: shape(...size),
    startMm, endMm, spacingMm: 200, bundleCount: 1, bundleGapMm: 0, concentrations: [],
  });
  const low1 = zone("Niskie 1", [300, 300], 300, 1300);
  const high = zone("Wysokie", [300, 500], 1300, 2300);
  const low2 = zone("Niskie 2", [300, 300], 2300, 3300);
  const base = {
    id: randomUUID(), name: "Belka 30/50/30", hostIds: [randomUUID()],
    lengthMm: 3600, widthMm: 400, heightMm: 600, firstStirrupMm: 300, lastStirrupMm: 3300,
    zones: [low1, high, low2], standardMainBars: { diameterMm: 12 }, status: "draft",
  };

  const slots = beamStirrupSlots(base, low1.id, 12);
  const top = slots.filter((slot) => slot.side === "top");
  assert.equal(top[0].kind, "corner");
  assert.equal(top.filter((slot) => slot.kind === "middle").length, 1);
  assert.ok(Math.abs(top[1].transverseMm - top[0].transverseMm) <= 25, "sloty co około 2 cm");
  assert.equal(slots.filter((slot) => slot.kind === "corner").length, 4);
  assert.equal(slots.filter((slot) => slot.kind === "middle").length, 4);
  // Narożnik: (300/2 − (8 + 12)/2) = 140 mm od osi.
  assert.deepEqual([top[0].transverseMm, top[0].verticalMm], [-140, 140]);

  const states = beamStirrupSlotStates(base, low1.id, 12);
  assert.equal(states.filter((slot) => slot.occupiedBy).length, 4, "4 standardowe druty zajmują narożniki");
  assert.ok(states.filter((slot) => slot.kind === "corner").every((slot) => slot.occupiedBy?.startsWith("standard:")));

  const leftMiddle = { anchorZoneId: low1.id, bundleIndex: 0, slotSide: "left", slotRatio: 0.5, diameterMm: 12 };
  assert.deepEqual(beamCustomMainBarAllowedRange(base, leftMiddle),
    { startMm: 0, endMm: 3600, firstZoneIndex: 0, lastZoneIndex: 2 }, "środek boku jest wspólny dla 30 i 50");

  const topMiddleHigh = { anchorZoneId: high.id, bundleIndex: 0, slotSide: "top", slotRatio: 0.5, diameterMm: 12 };
  assert.deepEqual(beamCustomMainBarAllowedRange(base, topMiddleHigh),
    { startMm: 1300, endMm: 2300, firstZoneIndex: 1, lastZoneIndex: 1 }, "góra wysokiego strzemienia to docinka");

  const withBars = {
    ...base,
    customMainBars: [
      { id: randomUUID(), ...leftMiddle, lengthMm: 99_999, fromSide: "start" },
      { id: randomUUID(), ...topMiddleHigh, lengthMm: 400, fromSide: "end" },
    ],
  };
  const [through, cut] = beamResolvedCustomMainBars(withBars);
  assert.deepEqual([through.startMm, through.endMm, through.clamped], [0, 3600, true]);
  assert.deepEqual([cut.startMm, cut.endMm, cut.clamped], [1900, 2300, false]);

  for (const zoneItem of [low1, high, low2]) {
    const middle = beamStirrupSlotStates(withBars, zoneItem.id, 12)
      .find((slot) => slot.side === "left" && slot.kind === "middle");
    assert.equal(middle.occupiedBy, through.id, `drut przez całą belkę zajmuje slot w strefie ${zoneItem.shapeName}`);
  }
  const highTop = beamStirrupSlotStates(withBars, high.id, 12).find((slot) => slot.side === "top" && slot.kind === "middle");
  assert.equal(highTop.occupiedBy, cut.id);
  const lowTop = beamStirrupSlotStates(withBars, low2.id, 12).find((slot) => slot.side === "top" && slot.kind === "middle");
  assert.equal(lowTop.occupiedBy, null, "docinka nie zajmuje slotu w innym strzemieniu");
});

test("full-beam custom bar must occupy the same slot in every stirrup of the beam", () => {
  const shape = (widthMm, heightMm) => ({
    kind: "stirrup",
    diameterMm: 8,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const zone = (name, size, startMm, endMm) => ({
    id: randomUUID(), shapeTemplateId: randomUUID(), shapeName: name, shape: shape(...size),
    startMm, endMm, spacingMm: 200, bundleCount: 1, bundleGapMm: 0, concentrations: [],
  });
  const low1 = zone("Niskie 1", [300, 300], 300, 1300);
  const high = zone("Wysokie", [300, 500], 1300, 2300);
  const low2 = zone("Niskie 2", [300, 300], 2300, 3300);
  const base = {
    id: randomUUID(), name: "Belka 30/50/30", hostIds: [randomUUID()],
    lengthMm: 3600, widthMm: 400, heightMm: 600, firstStirrupMm: 300, lastStirrupMm: 3300,
    zones: [low1, high, low2], standardMainBars: { diameterMm: 12 }, status: "draft",
  };
  const leftMiddle = { anchorZoneId: low1.id, bundleIndex: 0, slotSide: "left", slotRatio: 0.5, diameterMm: 12 };
  const topMiddleLow = { anchorZoneId: low1.id, bundleIndex: 0, slotSide: "top", slotRatio: 0.5, diameterMm: 12 };

  const shared = beamCustomMainBarFullBeamCheck(base, leftMiddle);
  assert.equal(shared.available, true, "środek boku istnieje w każdym strzemieniu");
  assert.deepEqual(shared.zones.map((item) => item.holdsBar), [true, true, true]);

  const partial = beamCustomMainBarFullBeamCheck(base, topMiddleLow);
  assert.equal(partial.available, false, "góra niskiego strzemienia nie istnieje w wysokim");
  assert.deepEqual(partial.missingZoneIndexes, [1]);

  const throughId = randomUUID();
  const blockedId = randomUUID();
  const withBars = {
    ...base,
    customMainBars: [
      { id: throughId, ...leftMiddle, lengthMm: 3600, fromSide: "start", fullBeam: true },
      { id: blockedId, ...topMiddleLow, lengthMm: 3600, fromSide: "start", fullBeam: true },
    ],
  };
  const [through, blocked] = beamResolvedCustomMainBars(withBars);
  assert.deepEqual([through.startMm, through.endMm, through.fullBeam, through.clamped], [0, 3600, true, false]);
  for (const zoneItem of [low1, high, low2]) {
    const middle = beamStirrupSlotStates(withBars, zoneItem.id, 12)
      .find((slot) => slot.side === "left" && slot.kind === "middle");
    assert.equal(middle.occupiedBy, throughId, `drut przez całą belkę zajmuje slot w strefie ${zoneItem.shapeName}`);
  }
  assert.deepEqual(blocked.fullBeamMissingZoneIndexes, [1], "żądanie całej belki nie jest po cichu skracane");
  assert.ok(blocked.endMm < 3600);

  const issues = beamCustomMainBarIssues(withBars);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Drut niestandardowy 2/);
  assert.match(issues[0], /strefy 2 nie ma tego slotu/);

  const asCut = { ...withBars, customMainBars: [withBars.customMainBars[0],
    { ...withBars.customMainBars[1], fullBeam: false, lengthMm: 1300, fromSide: "start" }] };
  assert.deepEqual(beamCustomMainBarIssues(asCut), [], "docinka od wybranej strony jest dopuszczalna");

  const duplicate = beamCustomMainBarFullBeamCheck(withBars, { ...leftMiddle, id: randomUUID() });
  assert.equal(duplicate.available, false);
  assert.deepEqual(duplicate.occupiedZoneIndexes, [0, 1, 2], "zajęty slot blokuje całą belkę w każdej strefie");
  assert.equal(beamCustomMainBarFullBeamCheck(withBars, { ...leftMiddle, id: throughId }).available, true,
    "drut nie blokuje sam siebie");
});

test("custom bar extensions protrude past the stirrup range on one or both sides", () => {
  const shape = (widthMm, heightMm) => ({
    kind: "stirrup",
    diameterMm: 8,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const zone = (name, size, startMm, endMm) => ({
    id: randomUUID(), shapeTemplateId: randomUUID(), shapeName: name, shape: shape(...size),
    startMm, endMm, spacingMm: 200, bundleCount: 1, bundleGapMm: 0, concentrations: [],
  });
  const low1 = zone("Niskie 1", [300, 300], 300, 1300);
  const high = zone("Wysokie", [300, 500], 1300, 2300);
  const low2 = zone("Niskie 2", [300, 300], 2300, 3300);
  const cutId = randomUUID();
  const edgeId = randomUUID();
  const assembly = {
    id: randomUUID(), name: "Belka z wypustem", hostIds: [randomUUID()],
    lengthMm: 3600, widthMm: 400, heightMm: 600, firstStirrupMm: 300, lastStirrupMm: 3300,
    zones: [low1, high, low2], status: "draft",
    customMainBars: [
      { id: cutId, anchorZoneId: high.id, bundleIndex: 0, slotSide: "top", slotRatio: 0.5, diameterMm: 12,
        lengthMm: 1000, fromSide: "start", extensionStartMm: 100, extensionEndMm: 150 },
      { id: edgeId, anchorZoneId: low1.id, bundleIndex: 0, slotSide: "top", slotRatio: 0.5, diameterMm: 12,
        lengthMm: 600, fromSide: "start", extensionStartMm: 200, extensionEndMm: 50 },
    ],
  };
  const [cut, edge] = beamResolvedCustomMainBars(assembly);
  assert.deepEqual([cut.allowedStartMm, cut.allowedEndMm], [1300, 2300]);
  assert.deepEqual([cut.startMm, cut.endMm, cut.extensionStartMm, cut.extensionEndMm], [1200, 2450, 100, 150],
    "wypust z obu stron wychodzi poza strzemiona strefy");
  assert.deepEqual([edge.startMm, edge.endMm, edge.extensionStartMm, edge.extensionEndMm], [0, 650, 0, 50],
    "wypust nie wychodzi poza długość belki");
});

test("larger stirrups align independently by left/right and top/bottom faces", () => {
  const shape = (widthMm, heightMm, diameterMm = 8) => ({
    kind: "stirrup",
    diameterMm,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const zone = (name, widthMm, heightMm, startMm, endMm, alignment = {}) => ({
    id: randomUUID(), shapeTemplateId: randomUUID(), shapeName: name, shape: shape(widthMm, heightMm),
    startMm, endMm, spacingMm: endMm - startMm, bundleCount: 1, bundleGapMm: 0,
    concentrations: [], ...alignment,
  });
  const small = zone("Punkt odniesienia", 300, 300, 300, 500);
  const left = zone("Szersze — lewo", 500, 300, 500, 700, { widthAlignment: "left" });
  const right = zone("Szersze — prawo", 500, 300, 700, 900, { widthAlignment: "right" });
  const top = zone("Wyższe — góra", 300, 500, 900, 1100, { heightAlignment: "top" });
  const bottom = zone("Wyższe — dół", 300, 500, 1100, 1300, { heightAlignment: "bottom" });
  const both = zone("Szersze i wyższe", 500, 500, 1300, 1500,
    { widthAlignment: "right", heightAlignment: "top", bundleCount: 2, bundleGapMm: 50, bundleDirection: "left" });
  const assembly = {
    id: randomUUID(), name: "Wyrównanie niezależne osi", hostIds: [randomUUID()],
    lengthMm: 3000, widthMm: 700, heightMm: 600, firstStirrupMm: 300, lastStirrupMm: 2700,
    zones: [small, left, right, top, bottom, both], status: "draft",
  };
  const placements = beamStirrupPlacements(assembly);
  const firstPlacement = (zoneId) => placements.find((item) => item.zoneId === zoneId && item.bundleIndex === 0);
  assert.deepEqual([
    firstPlacement(small.id).transverseOffsetMm,
    firstPlacement(left.id).transverseOffsetMm,
    firstPlacement(right.id).transverseOffsetMm,
    firstPlacement(top.id).verticalOffsetMm,
    firstPlacement(bottom.id).verticalOffsetMm,
    firstPlacement(both.id).transverseOffsetMm,
    firstPlacement(both.id).verticalOffsetMm,
  ], [0, 100, -100, -100, 100, -100, -100]);
  const secondBoth = placements.find((item) => item.zoneId === both.id && item.bundleIndex === 1);
  assert.equal(secondBoth.transverseOffsetMm, -150,
    "przesunięcie pakietu dodaje się do niezależnego wyrównania szerokości");
});

test("beam connection diagnostics flag stirrups without a clear opening and allow connected sections", () => {
  const shape = (widthMm, heightMm, diameterMm = 8) => ({
    kind: "stirrup",
    diameterMm,
    bends: [
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: widthMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
      { lengthMm: heightMm, angleDegrees: 90, radiusMm: 20, plane: "xy" },
    ],
  });
  const zone = (name, dimensions, startMm, endMm) => ({
    id: randomUUID(), shapeTemplateId: randomUUID(), shapeName: name, shape: shape(...dimensions),
    startMm, endMm, spacingMm: endMm - startMm, bundleCount: 1, bundleGapMm: 0, concentrations: [],
  });
  const base = {
    id: randomUUID(), name: "Kontrola ciągłości", hostIds: [randomUUID()],
    lengthMm: 3000, widthMm: 600, heightMm: 600, firstStirrupMm: 300, lastStirrupMm: 2700,
    zones: [zone("Prawidłowe", [300, 300], 300, 1500),
      zone("Prawidłowe — szersze", [500, 500], 1500, 2700,)],
    status: "draft",
  };
  assert.deepEqual(beamStirrupConnectionIssues(base), [],
    "zagnieżdżone przekroje mają wspólne wolne pole wewnątrz betonu");
  const invalid = {
    ...base,
    zones: [zone("Za małe dla średnicy drutu", [10, 10, 12], 300, 1500),
      base.zones[1]],
  };
  const issues = beamStirrupConnectionIssues(invalid);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "no-clear-stirrup-opening");
  assert.match(issues[0].message, /nie ma wolnego otworu/);
});
