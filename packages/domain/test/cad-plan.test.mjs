import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CadDocumentSchema, CadEntitySchema, emptyConstructionTechnologySelections, getCadDrawingTools } from "@asystent/schemas";
import { assignCadMarks, attachCadElement, cadLayerOutline, cadLayerSides, connectCadWallJunctions, copyCadGeometry,
  createCadElement, foundationSetupFromSettings, formatCadDimensionMm, getCadPlanDimensions, getCadPlanFaces, layoutCadDimensions,
  moveCadJunction, polygonCenter, resizeCadRectangle, snapCadConnection, synchronizeCadAttachments, synchronizeCadInfill, translateConnectedCadEntity,
  cadStripFaceSegment, cadEntityColor, configureFoundationWall, synchronizeFoundationSupports, resizeCadStrip, updateConnectedCadEntity,
  cadDimensionLabelAngle, cadDimensionLabelRect, setCadWallHeightForRoom } from "../dist/index.js";
import { rectangleSize, segmentRectangle, segmentsIntersect } from "@asystent/geometry";

const doc = (entities = [], projectId = randomUUID()) => CadDocumentSchema.parse({
  schemaVersion: 1, id: randomUUID(), projectId, requirementId: "foundation-drawing-0", revision: 0,
  status: "draft", calibration: null, entities,
});
const wall = (a, b) => createCadElement("wall", [a, b], { id: randomUUID() });

test("dimension labels use centimeters without losing millimeter precision", () => {
  assert.equal(formatCadDimensionMm(240), "24 cm");
  assert.equal(formatCadDimensionMm(245), "24,5 cm");
  assert.equal(formatCadDimensionMm(248.4), "24,8 cm");
});
const rectangle = (tool = "wall") => {
  const p = [{x:0,y:0},{x:6000,y:0},{x:6000,y:4000},{x:0,y:4000}];
  return p.map((a, i) => createCadElement(tool, [a,p[(i+1)%4]], {id:randomUUID()}));
};
const settings = {type:"strip",side:"both",boundary:true,wallWidth:"240",wallHeight:"1000",wallMaterial:"Bloczek",
  reference:"K-01",baseWidth:"800",baseDepth:"400",slabThickness:"200",overhang:"0",slabMaterial:"C25/30",thermal:"100",waterproof:"4"};

test("foundation settings persist even incomplete; hydro sides do not control outside thermal insulation", () => {
  const hints = [{thermal:true,material:"XPS",label:"Ocieplenie"},{thermal:false,material:"KMB",label:"Hydroizolacja"}];
  const setup = foundationSetupFromSettings(settings,hints);
  assert.equal(setup.buildUp[0].side,"both");
  assert.equal(setup.buildUp[1].side,"exterior");
  assert.equal(setup.widthMm,240);
  assert.throws(() => foundationSetupFromSettings({...settings,wallHeight:""},hints),/Uzupełnij/);
  const saved = CadDocumentSchema.parse({...doc(),foundationSettings:{...settings,wallHeight:""},paperScale:50});
  assert.deepEqual(CadDocumentSchema.parse(JSON.parse(JSON.stringify(saved))),saved);
  assert.equal(CadDocumentSchema.safeParse({...saved,paperScale:0}).success,false);
  assert.equal(CadDocumentSchema.safeParse({...saved,paperScale:1001}).success,false);
  assert.ok(getCadDrawingTools("foundation","Rzut fundamentów",{...emptyConstructionTechnologySelections,
    foundationType:["strip-footings"],foundationBottomSlab:"bottom-slab-yes"}).includes("slab"));
});

test("X crossing creates one movable junction with four ends, is idempotent and preserves source", () => {
  const original = doc([wall({x:0,y:2000},{x:6000,y:2000}),wall({x:3000,y:0},{x:3000,y:4000})]);
  const split = connectCadWallJunctions(original,randomUUID);
  assert.equal(split.entities.length,4);
  assert.equal(original.entities.length,2);
  assert.deepEqual(connectCadWallJunctions(split,randomUUID),split);
  const moved = moveCadJunction(split,{x:3000,y:2000},{x:3200,y:2300});
  assert.equal(moved.entities.filter((e) => [e.geometry.start,e.geometry.end].some((p) => p.x===3200&&p.y===2300)).length,4);
});

test("excavation edges snap, join at corners and split at X without splitting foundation walls", () => {
  const excavation = (a, b) => createCadElement("excavation", [a, b], {id:randomUUID()});
  const wall = createCadElement("foundation-wall", [{x:0,y:2000},{x:4000,y:2000}], {id:randomUUID()});
  const first = excavation({x:0,y:0},{x:4000,y:0});
  const second = excavation({x:2000,y:-2000},{x:2000,y:2000});
  const original = doc([wall, first, second]);
  assert.deepEqual(snapCadConnection(original, {x:5,y:0}, 10), {x:0,y:0});
  assert.deepEqual(snapCadConnection(original, {x:1000,y:12}, 20), {x:1000,y:0});
  const connected = connectCadWallJunctions(original, randomUUID);
  assert.equal(connected.entities.filter((entity) => entity.kind === "construction-line"
    && entity.attributes.role === "excavation").length, 4);
  assert.equal(connected.entities.find((entity) => entity.id === wall.id).geometry.end.x, 4000);
  const moved = moveCadJunction(connected, {x:2000,y:0}, {x:2100,y:100});
  assert.equal(moved.entities.filter((entity) => entity.kind === "construction-line" && entity.attributes.role === "excavation"
    && [entity.geometry.start,entity.geometry.end].some((point) => point.x === 2100 && point.y === 100)).length, 4);
  assert.deepEqual(connectCadWallJunctions(connected, randomUUID), connected);
});

test("excavation elements can keep a host relationship through foundation support synchronization", () => {
  const host = createCadElement("foundation-wall", [{x:0,y:0},{x:4000,y:0}], {id:randomUUID()});
  const line = createCadElement("excavation", [{x:0,y:-400},{x:4000,y:-400}], {id:randomUUID()});
  const linked = CadEntitySchema.parse({...line, relatedTo:[host.id]});
  const source = doc([host, linked]);
  const synchronized = synchronizeFoundationSupports(source, randomUUID);
  assert.ok(synchronized.entities.some((entity) => entity.id === linked.id && entity.relatedTo?.includes(host.id)));
  const split = connectCadWallJunctions(doc([host, linked, wall({x:2000,y:-1000},{x:2000,y:1000})]), randomUUID);
  const splitWallIds = split.entities.filter((entity) => entity.kind === "construction-line"
    && entity.attributes.role === "foundation-wall").map(({ id }) => id);
  assert.deepEqual(split.entities.find((entity) => entity.id === linked.id).relatedTo, splitWallIds);
  const copied = copyCadGeometry(source, doc([], source.projectId), randomUUID);
  assert.equal(copied.entities.find((entity) => entity.kind === "construction-line" && entity.attributes.role === "excavation")
    .relatedTo[0], copied.entities.find((entity) => entity.kind === "construction-line" && entity.attributes.role === "foundation-wall").id);
});

test("closed fields use inner faces, reverse wall directions and identify multiple rooms after X", () => {
  const walls = rectangle();
  walls[1].geometry = {start:walls[1].geometry.end,end:walls[1].geometry.start};
  const faces = getCadPlanFaces(doc(walls));
  assert.equal(faces.length,1);
  assert.equal(faces[0].areaMm2,5760*3760);
  assert.deepEqual(faces[0].center,{x:3000,y:2000});
  assert.deepEqual(cadLayerSides(walls[0],"exterior",faces),["right"]);
  assert.deepEqual(cadLayerSides(walls[1],"exterior",faces),["left"]);
  const divided = connectCadWallJunctions(doc([...walls,wall({x:3000,y:0},{x:3000,y:4000}),
    wall({x:0,y:2000},{x:6000,y:2000})]),randomUUID);
  assert.equal(getCadPlanFaces(divided).length,4);
  assert.equal(getCadPlanFaces(doc(walls.slice(0,3))).length,0);
  const spur = connectCadWallJunctions(doc([...walls,wall({x:3000,y:0},{x:3000,y:2000})]),randomUUID);
  const spurFaces = getCadPlanFaces(spur);
  assert.equal(spurFaces.length,1);
  assert.equal(spurFaces[0].areaMm2,5760*3760-240*2000);
});

test("changing a room wall height updates every wall in its closed room only", () => {
  const rooms = connectCadWallJunctions(doc([
    ...rectangle(),
    wall({x:3000,y:0},{x:3000,y:4000}),
  ]), randomUUID);
  const faces = getCadPlanFaces(rooms);
  assert.equal(faces.length, 2);
  const firstRoomIds = new Set(faces[0].ids);
  const originalHeights = new Map(rooms.entities.map((entity) => [entity.id, entity.attributes.heightMm]));
  const next = setCadWallHeightForRoom(rooms, faces[0].ids[0], 3000);
  for (const entity of next.entities) {
    if (!("heightMm" in entity.attributes)) continue;
    if (!firstRoomIds.has(entity.id)) assert.equal(entity.attributes.heightMm, originalHeights.get(entity.id));
    else assert.equal(entity.attributes.heightMm, 3000);
  }
  assert.equal(rooms.entities.every((entity) => entity.attributes.heightMm === originalHeights.get(entity.id)), true);
  assert.throws(() => setCadWallHeightForRoom(rooms, faces[0].ids[0], 0), /Wysokość/);
});

test("thermal outlines meet at corner outside actual wall faces rather than stopping at axes", () => {
  const walls=rectangle(),faces=getCadPlanFaces(doc(walls));
  const a=cadLayerOutline(walls[0],"right",120,220,faces);
  const b=cadLayerOutline(walls[1],"right",120,220,faces);
  assert.deepEqual(a,[{x:-120,y:-120},{x:6120,y:-120},{x:6220,y:-220},{x:-220,y:-220}]);
  assert.deepEqual(a[1],b[0]); assert.deepEqual(a[2],b[3]);
});

test("columns attach to their wall and preserve size after translation, rotation and wall splitting", () => {
  const host=wall({x:0,y:0},{x:6000,y:0});
  const column=createCadElement("column",[{x:2800,y:-200},{x:3200,y:-200},{x:3200,y:200},{x:2800,y:200}],{id:randomUUID()});
  const attached=attachCadElement(column,doc([host]),0);
  assert.equal(attached.attachment.hostId,host.id);
  const original=doc([host,attached]);
  const moved=synchronizeCadAttachments(translateConnectedCadEntity(original,host.id,{x:100,y:200}));
  assert.deepEqual(polygonCenter(moved.entities[1].geometry.vertices),{x:3100,y:200});
  assert.deepEqual(synchronizeCadAttachments(moved),moved);
  const rotated=synchronizeCadAttachments(moveCadJunction(original,{x:6000,y:0},{x:0,y:6000}));
  assert.deepEqual(polygonCenter(rotated.entities[1].geometry.vertices),{x:0,y:3000});
  assert.deepEqual(rectangleSize(rotated.entities[1].geometry.vertices),{length:400,width:400});
  const resized = resizeCadRectangle(rotated.entities[1],600,500);
  assert.deepEqual(rectangleSize(resized.geometry.vertices),{length:600,width:500});
  const split=connectCadWallJunctions(doc([host,attached,wall({x:4000,y:0},{x:4000,y:1000})]),randomUUID);
  assert.equal(split.entities.find((e)=>e.id===column.id).attachment.end.x,4000);
  assert.deepEqual(synchronizeCadAttachments(split).entities.find((e)=>e.id===column.id).geometry,column.geometry);
  const far=attachCadElement({...column,geometry:{vertices:column.geometry.vertices.map((p)=>({x:p.x,y:p.y+2000}))}},doc([host]),0);
  assert.equal(far.attachment,undefined);
});

test("columns inside a closed room attach to the nearest wall and preserve their offset when it moves", () => {
  const walls=rectangle();
  const column=createCadElement("column",[{x:2800,y:1800},{x:3200,y:1800},{x:3200,y:2200},{x:2800,y:2200}],{id:randomUUID()});
  const source=doc([...walls,column]);
  const attached=attachCadElement(column,source,0);
  assert.equal(attached.attachment.hostId,walls[0].id);
  const movedHost=translateConnectedCadEntity(doc([...walls,attached]),walls[0].id,{x:0,y:300});
  const moved=synchronizeCadAttachments(movedHost);
  assert.deepEqual(polygonCenter(moved.entities.find((entity)=>entity.id===column.id).geometry.vertices),{x:3000,y:2300});
});

test("infill clicks represent exact inner footing polygon and retain relation on movement/copy", () => {
  const footings=rectangle("footing"),faces=getCadPlanFaces(doc(footings),"footings");
  const slab={...createCadElement("slab",faces[0].inner,{id:randomUUID()}),infillFor:faces[0].ids};
  const original=assignCadMarks(doc([...footings,slab]));
  assert.equal(faces[0].areaMm2,5400*3400);
  const moved=synchronizeCadInfill(translateConnectedCadEntity(original,footings[0].id,{x:0,y:-200}));
  assert.notDeepEqual(moved.entities.at(-1).geometry,slab.geometry);
  const copied=copyCadGeometry(original,doc([],original.projectId),randomUUID);
  assert.ok(copied.entities.at(-1).infillFor.every((id)=>copied.entities.some((e)=>e.id===id)));
  assert.throws(()=>synchronizeCadInfill({...original,entities:original.entities.filter((e)=>e.id!==footings[0].id)}),/utraciło/);
});

test("identifiers remain stable and unique including copies and regenerated defaults", () => {
  const original=assignCadMarks(doc([...rectangle(),createCadElement("column",[{x:100,y:100},{x:500,y:100},{x:500,y:500},{x:100,y:500}],{id:randomUUID()})]));
  assert.equal(original.entities.at(-1).mark,"S1");
  assert.deepEqual(assignCadMarks(original),original);
  const copied=assignCadMarks(copyCadGeometry(original,doc([],original.projectId),randomUUID));
  assert.equal(new Set(copied.entities.map((e)=>e.mark)).size,5);
  assert.equal(CadDocumentSchema.safeParse({...original,entities:original.entities.map((e)=>({...e,mark:"S1"}))}).success,false);
});

test("dense external dimensions have no overlapping label boxes and include detached column positioning", () => {
  const column=createCadElement("column",[{x:2000,y:1000},{x:2400,y:1000},{x:2400,y:1400},{x:2000,y:1400}],{id:randomUUID()});
  const dims=getCadPlanDimensions(assignCadMarks(doc([...rectangle(),column])),250,[],undefined,true);
  const columnChains=dims.filter((d)=>d.chainId?.startsWith("supports:column:"));
  assert.equal(new Set(columnChains.map((d)=>d.chainId)).size,2);
  assert.equal(columnChains.length,2);
  assert.ok(columnChains.every((d)=>d.chainExtensions===false&&d.chainFixedLabels));
  for(let i=0;i<dims.length;i++)for(let j=i+1;j<dims.length;j++){
    const a=dims[i].box,b=dims[j].box;
    assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y));
  }
  const many=layoutCadDimensions(Array.from({length:20},()=>({start:{x:0,y:0},end:{x:4000,y:0},color:"#000",group:"dense"})),125);
  assert.equal(new Set(many.map((d)=>d.box.y)).size,20);
  assert.equal(CadEntitySchema.safeParse({...column,attachment:{hostId:randomUUID(),start:{x:0,y:0},end:{x:0,y:0}}}).success,false);
});

test("supports along one wall share a single dimension chain", () => {
  const host=wall({x:0,y:0},{x:6000,y:0});
  const supports=[
    createCadElement("column",[{x:800,y:800},{x:1200,y:800},{x:1200,y:1200},{x:800,y:1200}],{id:randomUUID()}),
    createCadElement("pad",[{x:3800,y:800},{x:4200,y:800},{x:4200,y:1200},{x:3800,y:1200}],{id:randomUUID()}),
  ];
  const dimensions=getCadPlanDimensions(assignCadMarks(doc([host,...supports])),125,[],undefined,true);
  const chains=dimensions.filter((dimension)=>dimension.chainId?.includes("support-locations"));
  assert.equal(chains.length,2);
  assert.equal(new Set(chains.map((dimension)=>dimension.chainId)).size,1);
  assert.ok(chains.every((dimension)=>dimension.referenceId===host.id));
  assert.ok(chains.every((dimension)=>dimension.chainStart.y===dimension.chainEnd.y));
  assert.ok(chains.every((dimension)=>dimension.chainColor===cadEntityColor(host)));
  assert.ok(chains.every((dimension)=>dimension.color===cadEntityColor(supports.find((entity)=>entity.id===dimension.entityId))));
});

test("each room uses two column-axis chains and two separate pad-edge chains", () => {
  const walls=rectangle();
  const support=(kind,x,y)=>createCadElement(kind,[{x:x-200,y:y-200},{x:x+200,y:y-200},
    {x:x+200,y:y+200},{x:x-200,y:y+200}],{id:randomUUID()});
  const supports=[
    support("column",2000,1000),support("pad",2000,1000),
    support("column",4000,1000),support("pad",4000,1000),
    support("column",4000,3000),support("pad",4000,3000),
  ];
  const plan=assignCadMarks(doc([...walls,...supports]));
  const chains=getCadPlanDimensions(plan,125).filter((dimension)=>dimension.chainId?.startsWith("supports:"));
  const columns=chains.filter((dimension)=>dimension.chainId.includes(":column:"));
  const pads=chains.filter((dimension)=>dimension.chainId.includes(":pad:"));
  assert.equal(new Set(columns.map((dimension)=>dimension.chainId)).size,2);
  assert.equal(new Set(pads.map((dimension)=>dimension.chainId)).size,2);
  assert.equal(columns.length,4);
  assert.equal(pads.length,8);
  assert.ok(chains.every((dimension)=>dimension.chainExtensions===false&&dimension.chainFixedLabels));
  const horizontalColumns=columns.filter((dimension)=>dimension.chainId.endsWith(":horizontal"));
  const verticalColumns=columns.filter((dimension)=>dimension.chainId.endsWith(":vertical"));
  assert.deepEqual(horizontalColumns.map((dimension)=>dimension.end.x),[2000,4000]);
  assert.deepEqual(verticalColumns.map((dimension)=>dimension.end.y),[1000,3000]);
  const horizontalPads=pads.filter((dimension)=>dimension.chainId.endsWith(":horizontal"));
  const verticalPads=pads.filter((dimension)=>dimension.chainId.endsWith(":vertical"));
  assert.deepEqual(horizontalPads.map((dimension)=>dimension.end.x),[1800,2200,3800,4200]);
  assert.deepEqual(verticalPads.map((dimension)=>dimension.end.y),[800,1200,2800,3200]);
  assert.ok(horizontalColumns.every((dimension)=>dimension.chainStart.y===3880
    &&dimension.chainEnd.y===3880&&dimension.chainStart.x===120&&dimension.chainEnd.x===5880));
  assert.ok(verticalColumns.every((dimension)=>dimension.chainStart.x===5880
    &&dimension.chainEnd.x===5880&&dimension.chainStart.y===120&&dimension.chainEnd.y===3880));
});

test("column axes create exactly two dimension lines per closed room", () => {
  const divided=connectCadWallJunctions(doc([
    ...rectangle(),
    wall({x:3000,y:0},{x:3000,y:4000}),
    createCadElement("column",[{x:800,y:800},{x:1200,y:800},{x:1200,y:1200},{x:800,y:1200}],{id:randomUUID()}),
    createCadElement("column",[{x:4800,y:2800},{x:5200,y:2800},{x:5200,y:3200},{x:4800,y:3200}],{id:randomUUID()}),
  ]),randomUUID);
  const chains=getCadPlanDimensions(assignCadMarks(divided),125)
    .filter((dimension)=>dimension.chainId?.startsWith("supports:column:"));
  assert.equal(getCadPlanFaces(divided).length,2);
  assert.equal(new Set(chains.map((dimension)=>dimension.chainId)).size,4);
  for(const faceIndex of [0,1]){
    const roomChains=chains.filter((dimension)=>dimension.chainId.startsWith(`supports:column:${faceIndex}:`));
    assert.equal(new Set(roomChains.map((dimension)=>dimension.chainId)).size,2);
    assert.ok(roomChains.some((dimension)=>dimension.chainId.endsWith(":horizontal")));
    assert.ok(roomChains.some((dimension)=>dimension.chainId.endsWith(":vertical")));
  }
});

test("pad chains mark both edges and preserve wall-to-edge, width and remaining spans", () => {
  const points=[{x:0,y:0},{x:7990,y:0},{x:7990,y:4000},{x:0,y:4000}];
  const walls=points.map((point,index)=>wall(point,points[(index+1)%points.length]));
  const pad=createCadElement("pad",[{x:4370,y:1500},{x:4870,y:1500},{x:4870,y:2500},{x:4370,y:2500}],{id:randomUUID()});
  const horizontal=getCadPlanDimensions(assignCadMarks(doc([...walls,pad])),125)
    .filter((dimension)=>dimension.chainId==="supports:pad:0:horizontal");
  assert.equal(horizontal.length,2);
  assert.deepEqual(horizontal.map((dimension)=>dimension.end.x),[4370,4870]);
  const stations=[horizontal[0].chainStart.x,...horizontal.map((dimension)=>dimension.end.x),horizontal[0].chainEnd.x];
  assert.deepEqual(stations.slice(1).map((station,index)=>station-stations[index]),[4250,500,3000]);
  assert.deepEqual(horizontal.map((dimension)=>dimension.label),["425 cm","50 cm"]);
});

test("T and X dimension chains meet at junctions without adding wall caps at internal nodes", () => {
  const original = doc([wall({x:0,y:0},{x:6000,y:0}),wall({x:3000,y:-2000},{x:3000,y:2000})]);
  const split = connectCadWallJunctions(original,randomUUID);
  const dims = getCadPlanDimensions(split,125).filter((d)=>d.group.endsWith(":exterior") && Math.hypot(d.end.x-d.start.x,d.end.y-d.start.y)>240);
  assert.equal(dims.length,4);
  assert.deepEqual(dims.map((d)=>Math.round(Math.hypot(d.end.x-d.start.x,d.end.y-d.start.y))).sort((a,b)=>a-b),
    [2000,2000,3000,3000]);
  const horizontal = dims.filter((d)=>d.start.y===d.end.y);
  assert.ok(horizontal.some((d)=>d.end.x===2880));
  assert.ok(horizontal.some((d)=>d.start.x===3120));
});

test("basement field is gated, persists with slab in the same field and follows footing movement", () => {
  assert.ok(!getCadDrawingTools("foundation","Rzut fundamentów",emptyConstructionTechnologySelections,false).includes("basement-area"));
  assert.ok(getCadDrawingTools("foundation","Rzut fundamentów",emptyConstructionTechnologySelections,true).includes("basement-area"));
  assert.ok(!getCadDrawingTools("foundation","Przekroje fundamentów",emptyConstructionTechnologySelections,true).includes("basement-area"));
  const footings=rectangle("footing"),face=getCadPlanFaces(doc(footings),"footings")[0];
  const area={...createCadElement("basement-area",face.inner,{id:randomUUID()}),infillFor:face.ids};
  const slab={...createCadElement("slab",face.inner,{id:randomUUID()}),infillFor:face.ids};
  const original=doc([...footings,area,slab]);
  const saved=CadDocumentSchema.parse(JSON.parse(JSON.stringify(original)));
  const moved=synchronizeCadInfill(translateConnectedCadEntity(saved,footings[0].id,{x:0,y:-200}));
  assert.notDeepEqual(moved.entities.at(-2).geometry,area.geometry);
  assert.deepEqual(moved.entities.at(-1).geometry,moved.entities.at(-2).geometry);
  assert.equal(CadDocumentSchema.safeParse(doc()).success,true);
  assert.equal(CadDocumentSchema.safeParse({...original,entities:[...footings,{...area,infillFor:undefined}]}).success,false);
});

test("detached supports beyond a wall end dimension from that wall, not drawing bounds or a diagonal", () => {
  const host=wall({x:1000,y:1000},{x:5000,y:1000});
  const support=createCadElement("pad",[{x:5700,y:1700},{x:6300,y:1700},{x:6300,y:2300},{x:5700,y:2300}],{id:randomUUID()});
  const dims=getCadPlanDimensions(assignCadMarks(doc([host,support])),125,[],undefined,true).filter((d)=>d.group.endsWith(":location"));
  assert.equal(dims.length,2);
  assert.equal(dims[0].label,"ST1 → W1 : 512 cm");
  assert.equal(dims[1].label,"ST1 → W1 : 88 cm");
  assert.equal(dims[1].start.x,dims[1].end.x);
  assert.equal(dims[0].start.y,dims[0].end.y);
});

test("aligned walls use complete dimension chains with wall thicknesses and an outer total", () => {
  const building=assignCadMarks(doc(rectangle()));
  const dims=getCadPlanDimensions(building,125,[],undefined,true);
  const chains=dims.filter((d)=>d.chainId?.startsWith("strips:wall:"));
  assert.ok(chains.some((d)=>d.measurementKind==="strip-width"&&d.label==="24 cm"));
  assert.ok(dims.some((d)=>d.group==="overall"&&d.label==="624 cm"));
  for(const e of building.entities)
    assert.ok(chains.some((d)=>d.entityId===e.id&&d.measurementKind==="strip-width"));
  const wide={...wall({x:0,y:0},{x:6000,y:0}),attributes:{thicknessMm:400,heightMm:2800,material:"Beton"}};
  const branch=wall({x:2500,y:0},{x:2500,y:2000});
  const t=assignCadMarks(connectCadWallJunctions(doc([wide,branch]),randomUUID));
  const first=t.entities.find((e)=>e.id===wide.id);
  assert.deepEqual(cadStripFaceSegment(t,first,"left"),{start:{x:-200,y:200},end:{x:2380,y:200}});
  assert.deepEqual(cadStripFaceSegment(t,first,"right"),{start:{x:-200,y:-200},end:{x:2500,y:-200}});
  const branchFace=cadStripFaceSegment(t,branch,"left");
  assert.equal(branchFace.start.y,200);
  const measured=getCadPlanDimensions(t,125,[],undefined,true).filter((d)=>d.entityId===first.id
    &&d.measurementKind==="strip-width");
  assert.ok(measured.some((d)=>d.label==="40 cm"));
});

test("simple plan dimensions every wall length and thickness without duplicate automatic supports", () => {
  const walls=rectangle("foundation-wall").map((e)=>configureFoundationWall(e,foundationSetupFromSettings(settings,[])));
  walls[1].geometry={start:walls[1].geometry.end,end:walls[1].geometry.start};
  const pad=createCadElement("pad",[{x:1800,y:800},{x:2200,y:800},{x:2200,y:1200},{x:1800,y:1200}],{id:randomUUID()});
  const plan=assignCadMarks(synchronizeFoundationSupports(doc([...walls,pad]),randomUUID));
  const simple=getCadPlanDimensions(plan,125),detail=getCadPlanDimensions(plan,125,[],undefined,true);
  assert.ok(simple.length>9);
  for(const e of walls){
    const dimensions=simple.filter((d)=>d.entityId===e.id);
    assert.ok(dimensions.some((d)=>d.chainId?.startsWith("strips:wall:")&&d.measurementKind==="strip-width"));
    assert.ok(dimensions.every((d)=>d.color===cadEntityColor(e)));
  }
  assert.ok(simple.some((d)=>d.group==="overall"));
  const generatedFootings=plan.entities.filter((e)=>e.kind==="footing"&&e.supportFor?.some((id)=>plan.entities.some((host)=>host.id===id)));
  const simpleFootingDimensions=simple.filter((d)=>d.chainId?.startsWith("strips:footing:"));
  assert.ok(generatedFootings.length>0);
  assert.ok(simpleFootingDimensions.some((d)=>d.measurementKind==="strip-width"&&d.label==="80 cm"));
  assert.ok(simple.some((d)=>d.group==="overall"&&d.color===cadEntityColor(generatedFootings[0])));
  assert.ok(simpleFootingDimensions.every((d)=>d.color===cadEntityColor(generatedFootings[0])));
  assert.ok(!simple.some((d)=>plan.entities.find((e)=>e.id===d.entityId)?.supportFor
    &&!d.chainId?.startsWith("strips:footing:")));
  const padChains=simple.filter((d)=>d.chainId?.startsWith("supports:pad:"));
  assert.equal(new Set(padChains.map((d)=>d.chainId)).size,2);
  assert.equal(padChains.length,4);
  assert.ok(padChains.every((d)=>!d.entityId&&d.chainExtensions===false));
  assert.ok(detail.length>simple.length);
  assert.ok(detail.some((d)=>d.chainId?.startsWith("strips:footing:")));
  const hidden=getCadPlanDimensions(plan,125,["foundation-wall"]);
  for(const footing of plan.entities.filter((e)=>e.kind==="footing"))
    assert.ok(hidden.some((d)=>d.chainId?.startsWith("strips:footing:")&&d.entityId===footing.id));
});

test("strip dimension lanes stay ordered wall, footing, excavation regardless of entity storage order", () => {
  const excavation=rectangle("excavation");
  const footings=rectangle("footing");
  const walls=rectangle("foundation-wall");
  const dimensions=getCadPlanDimensions(doc([...excavation,...footings,...walls]),125);
  const chain=(family)=>dimensions.find((dimension)=>dimension.chainId===`strips:${family}:horizontal:end`);
  const wallChain=chain("wall"),footingChain=chain("footing"),excavationChain=chain("excavation");
  assert.ok(wallChain&&footingChain&&excavationChain);
  const baselineY=(dimension)=>dimension.chainStart.y+dimension.chainSide*125*dimension.chainLane;
  const overallY=(familyChain)=>dimensions.find((dimension)=>dimension.group==="overall"
    &&dimension.color===familyChain.chainColor&&dimension.a.y===dimension.b.y).a.y;
  assert.ok(baselineY(wallChain)<overallY(wallChain));
  assert.ok(overallY(wallChain)<baselineY(footingChain));
  assert.ok(baselineY(footingChain)<overallY(footingChain));
  assert.ok(overallY(footingChain)<baselineY(excavationChain));
  assert.ok(baselineY(excavationChain)<overallY(excavationChain));
  assert.deepEqual([...new Set(dimensions.filter((dimension)=>dimension.chainId?.startsWith("strips:"))
    .map((dimension)=>dimension.chainId.split(":")[1]))],["wall","footing","excavation"]);
  const phase=(dimension)=>{
    const family=dimension.chainId?.startsWith("strips:")?dimension.chainId.split(":")[1]
      : dimension.group==="overall" ? [["wall",wallChain],["footing",footingChain],["excavation",excavationChain]]
        .find(([,familyChain])=>dimension.color===familyChain.chainColor)?.[0] : null;
    return family?`${family}:${dimension.group==="overall"?"overall":"segments"}`:null;
  };
  assert.deepEqual([...new Set(dimensions.map(phase).filter(Boolean))],
    ["wall:segments","wall:overall","footing:segments","footing:overall","excavation:segments","excavation:overall"]);
});

test("slanted building dimensions avoid crossing strips and remain sparse with T junction, infill and zoom fonts", () => {
  const points=[{x:-26000,y:1000},{x:-6000,y:2500},{x:-6500,y:20700},{x:-21000,y:22300},{x:-22400,y:12800}];
  const walls=points.map((p,i)=>createCadElement("foundation-wall",[p,points[(i+1)%points.length]],{id:randomUUID()}));
  walls.push(createCadElement("foundation-wall",[points[4],{x:-17500,y:10800}],{id:randomUUID()}));
  const plan=assignCadMarks(synchronizeFoundationSupports(doc(walls.map((e)=>configureFoundationWall(e,foundationSetupFromSettings(settings,[])))),randomUUID));
  const solids=plan.entities.map((e)=>segmentRectangle(e.geometry.start,e.geometry.end,e.kind==="footing"?800:240));
  for(const font of [125,250,500]){
    const dims=getCadPlanDimensions(plan,font);
    assert.equal(dims.length,24);
    assert.equal(dims.filter((d)=>d.measurementKind==="strip-width").length,12);
    for(const d of dims.filter((dimension)=>dimension.measurementKind!=="strip-width"))
      for(const solid of solids)for(let i=0;i<solid.length;i++)
      assert.ok(!segmentsIntersect(d.a,d.b,solid[i],solid[(i+1)%solid.length]));
    for(let i=0;i<dims.length;i++)for(let j=i+1;j<dims.length;j++){
      const a=dims[i].box,b=dims[j].box;
      assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y));
    }
  }
  assert.equal(getCadPlanDimensions(moveCadJunction(plan,points[4],{x:-22000,y:13000}),125).length,24);
});

test("support at reference origin keeps its zero station and nonzero offset in the compact label", () => {
  const host=wall({x:0,y:0},{x:6000,y:0});
  const support=createCadElement("pad",[{x:-220,y:800},{x:-20,y:800},{x:-20,y:1200},{x:-220,y:1200}],{id:randomUUID()});
  const dimensions=getCadPlanDimensions(assignCadMarks(doc([host,support])),125).filter((d)=>d.anchor);
  assert.equal(dimensions.length,1);
  assert.equal(dimensions[0].label,"ST1 → W1 : 0 cm / 88 cm");
});

test("oblique T dimensions intersect actual neighbor faces and update immediately after movement", () => {
  const slant=wall({x:0,y:0},{x:1000,y:8000});
  const branch=wall({x:500,y:4000},{x:3500,y:4000});
  const t=connectCadWallJunctions(doc([slant,branch]),randomUUID);
  const segment=t.entities.find((e)=>e.id===slant.id);
  const left=cadStripFaceSegment(t,segment,"left"),right=cadStripFaceSegment(t,segment,"right");
  assert.ok(Math.abs(left.end.y-right.end.y)>100);
  const side=Math.abs(left.end.y-3880)<.001?left:right;
  assert.ok(Math.abs(side.end.y-3880)<.001);
  const norm=Math.hypot(500,4000);
  for(const face of [left,right]) assert.ok(Math.abs(Math.abs((-4000*face.end.x+500*face.end.y)/norm)-120)<.001);
  const before=getCadPlanDimensions(t,125);
  const moved=moveCadJunction(t,{x:500,y:4000},{x:800,y:4300});
  const after=getCadPlanDimensions(moved,125);
  assert.notDeepEqual(after.map((d)=>[d.group,d.start,d.end]),before.map((d)=>[d.group,d.start,d.end]));
});

test("generated footing dimensions and wall dimensions have separate colors and both track resized shared nodes", () => {
  const setup=foundationSetupFromSettings(settings,[]);
  const walls=rectangle("foundation-wall").map((e)=>configureFoundationWall(e,setup));
  const original=assignCadMarks(synchronizeFoundationSupports(doc(walls),randomUUID));
  const before=getCadPlanDimensions(original,125,[],undefined,true);
  const target=original.entities.find((e)=>e.id===walls[0].id);
  const updated=resizeCadStrip(target,7000);
  const next=synchronizeFoundationSupports(updateConnectedCadEntity(original,updated),randomUUID);
  assert.deepEqual(next.entities.find((e)=>e.id===walls[1].id).geometry.start,updated.geometry.end);
  const after=getCadPlanDimensions(next,125,[],undefined,true);
  const wallDimensions=after.filter((d)=>d.chainId?.startsWith("strips:wall:"));
  const footingDimensions=after.filter((d)=>d.chainId?.startsWith("strips:footing:"));
  assert.ok(wallDimensions.some((d)=>d.measurementKind==="strip-width"&&d.label==="24 cm"));
  assert.ok(footingDimensions.some((d)=>d.measurementKind==="strip-width"&&d.label==="80 cm"));
  assert.ok(wallDimensions.every((d)=>d.color===cadEntityColor(walls[0])));
  assert.ok(footingDimensions.every((d)=>d.color===cadEntityColor(next.entities.find((e)=>e.kind==="footing"))));
  assert.notDeepEqual(wallDimensions.map((d)=>[d.chainId,d.start,d.end]),
    before.filter((d)=>d.chainId?.startsWith("strips:wall:")).map((d)=>[d.chainId,d.start,d.end]));
  assert.notDeepEqual(footingDimensions.map((d)=>[d.chainId,d.start,d.end]),
    before.filter((d)=>d.chainId?.startsWith("strips:footing:")).map((d)=>[d.chainId,d.start,d.end]));
  const excavation=createCadElement("excavation",[{x:0,y:9000},{x:5000,y:9000}],{id:randomUUID()});
  assert.equal(new Set([cadEntityColor(excavation),cadEntityColor(walls[0]),cadEntityColor(original.entities[0])]).size,3);
});

test("hiding a layer preserves full junction topology and support reference labels", () => {
  const a=wall({x:0,y:0},{x:6000,y:0});
  const b={...wall({x:3000,y:0},{x:3000,y:2000}),layerId:"hidden-branch"};
  const support=createCadElement("pad",[{x:1800,y:800},{x:2200,y:800},{x:2200,y:1200},{x:1800,y:1200}],{id:randomUUID()});
  const t=assignCadMarks(connectCadWallJunctions(doc([a,b,support]),randomUUID));
  const all=getCadPlanDimensions(t,125),hidden=getCadPlanDimensions(t,125,["hidden-branch"]);
  const endpoints=(dims)=>dims.filter((d)=>d.entityId===a.id).map((d)=>[d.start,d.end,d.label]);
  assert.deepEqual(endpoints(hidden),endpoints(all));
  assert.equal(hidden.some((d)=>d.entityId===b.id),false);
  const locations=hidden.filter((d)=>d.entityId===support.id);
  assert.ok(locations.every((d)=>d.referenceId===a.id&&d.anchor));
  assert.ok(locations.every((d)=>d.label.startsWith("ST1 → W1 :")));
});

test("moving junctions updates manual geometric dimensions but retains explicit reference measurements", () => {
  const a=wall({x:0,y:0},{x:6000,y:0});
  const dim=createCadElement("dimension",[{x:0,y:0},{x:6000,y:0}],{id:randomUUID()});
  const reference={...dim,id:randomUUID(),attributes:{...dim.attributes,measuredMm:6200}};
  const moved=moveCadJunction(doc([a,dim,reference]),{x:6000,y:0},{x:7000,y:0});
  assert.equal(moved.entities[1].attributes.measuredMm,7000);
  assert.equal(moved.entities[2].attributes.measuredMm,6200);
  assert.equal(moved.entities[1].geometry.end.x,7000);
});

test("dimension labels read along their dimension line instead of across it", () => {
  assert.equal(cadDimensionLabelAngle({x:0,y:0},{x:1000,y:0}),0);
  assert.equal(cadDimensionLabelAngle({x:0,y:0},{x:0,y:1000}),-90);
  assert.equal(cadDimensionLabelAngle({x:0,y:1000},{x:0,y:0}),-90);
  assert.equal(cadDimensionLabelAngle({x:0,y:0},{x:0,y:0}),0);
  assert.equal(Math.round(cadDimensionLabelAngle({x:0,y:0},{x:1000,y:1000})),45);
  assert.equal(Math.round(cadDimensionLabelAngle({x:0,y:0},{x:-1000,y:1000})),-45);
  const font=125;
  const [horizontal]=layoutCadDimensions([{start:{x:0,y:0},end:{x:4000,y:0},color:"#000",group:"g"}],font);
  const [vertical]=layoutCadDimensions([{start:{x:0,y:0},end:{x:0,y:4000},color:"#000",group:"g"}],font);
  assert.equal(horizontal.labelAngle,0);
  assert.equal(vertical.labelAngle,-90);
  assert.ok(horizontal.box.width>horizontal.box.height);
  assert.ok(vertical.box.height>vertical.box.width,"pionowa etykieta zajmuje pas wzdłuż linii, nie w poprzek");
  assert.ok(Math.abs(vertical.box.height-horizontal.box.width)<.001);
  assert.ok(Math.abs(vertical.box.width-horizontal.box.height)<.001);
  const rect=cadDimensionLabelRect(vertical.text,vertical.label,font);
  assert.ok(Math.abs(rect.width-horizontal.box.width)<.001);
  assert.equal(rect.height,font*1.5);
  for(const dimension of getCadPlanDimensions(assignCadMarks(doc(rectangle("foundation-wall")
    .map((e)=>configureFoundationWall(e,foundationSetupFromSettings(settings,[]))))),font))
    assert.ok(dimension.labelAngle>=-90&&dimension.labelAngle<90);
});
