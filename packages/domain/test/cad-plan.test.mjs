import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CadDocumentSchema, CadEntitySchema, emptyConstructionTechnologySelections, getCadDrawingTools } from "@asystent/schemas";
import { assignCadMarks, attachCadElement, cadLayerOutline, cadLayerSides, connectCadWallJunctions, copyCadGeometry,
  createCadElement, foundationSetupFromSettings, getCadPlanDimensions, getCadPlanFaces, layoutCadDimensions,
  moveCadJunction, polygonCenter, resizeCadRectangle, synchronizeCadAttachments, synchronizeCadInfill, translateConnectedCadEntity,
  cadStripFaceSegment, cadEntityColor, configureFoundationWall, synchronizeFoundationSupports, resizeCadStrip, updateConnectedCadEntity } from "../dist/index.js";
import { rectangleSize } from "@asystent/geometry";

const doc = (entities = [], projectId = randomUUID()) => CadDocumentSchema.parse({
  schemaVersion: 1, id: randomUUID(), projectId, requirementId: "foundation-drawing-0", revision: 0,
  status: "draft", calibration: null, entities,
});
const wall = (a, b) => createCadElement("wall", [a, b], { id: randomUUID() });
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
  const dims=getCadPlanDimensions(assignCadMarks(doc([...rectangle(),column])),250);
  assert.ok(dims.some((d)=>d.label === "S1 → W1 : 2080 mm"));
  assert.ok(dims.some((d)=>d.label === "S1 → W1 : 1080 mm"));
  assert.ok(!dims.some((d)=>d.label.includes("S1 X:") || d.label.includes("S1 Y:")));
  for(let i=0;i<dims.length;i++)for(let j=i+1;j<dims.length;j++){
    const a=dims[i].box,b=dims[j].box;
    assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y));
  }
  const many=layoutCadDimensions(Array.from({length:20},()=>({start:{x:0,y:0},end:{x:4000,y:0},color:"#000",group:"dense"})),125);
  assert.equal(new Set(many.map((d)=>d.box.y)).size,20);
  assert.equal(CadEntitySchema.safeParse({...column,attachment:{hostId:randomUUID(),start:{x:0,y:0},end:{x:0,y:0}}}).success,false);
});

test("T and X dimension chains meet at junctions without adding wall caps at internal nodes", () => {
  const original = doc([wall({x:0,y:0},{x:6000,y:0}),wall({x:3000,y:-2000},{x:3000,y:2000})]);
  const split = connectCadWallJunctions(original,randomUUID);
  const dims = getCadPlanDimensions(split,125).filter((d)=>d.group.endsWith(":exterior") && Math.hypot(d.end.x-d.start.x,d.end.y-d.start.y)>240);
  assert.equal(dims.length,4);
  assert.deepEqual(dims.map((d)=>Number(d.label.split(" ")[0])).sort((a,b)=>a-b),[2000,2000,3000,3000]);
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
  const dims=getCadPlanDimensions(assignCadMarks(doc([host,support])),125).filter((d)=>d.group.endsWith(":location"));
  assert.equal(dims.length,2);
  assert.equal(dims[0].label,"ST1 → W1 : 5120 mm");
  assert.equal(dims[1].label,"ST1 → W1 : 880 mm");
  assert.equal(dims[1].start.x,dims[1].end.x);
  assert.equal(dims[0].start.y,dims[0].end.y);
});

test("each unequal wall face is dimensioned at real corners and unequal-width T joints", () => {
  const building=assignCadMarks(doc(rectangle()));
  const dims=getCadPlanDimensions(building,125);
  for(const e of building.entities){
    const longitudinal=dims.filter((d)=>d.entityId===e.id&&d.faceSide);
    assert.equal(longitudinal.length,2);
    const axisLength=Math.hypot(e.geometry.end.x-e.geometry.start.x,e.geometry.end.y-e.geometry.start.y);
    assert.deepEqual(longitudinal.map((d)=>Math.hypot(d.end.x-d.start.x,d.end.y-d.start.y)).sort((a,b)=>a-b),
      [axisLength-240,axisLength+240]);
  }
  const wide={...wall({x:0,y:0},{x:6000,y:0}),attributes:{thicknessMm:400,heightMm:2800,material:"Beton"}};
  const branch=wall({x:2500,y:0},{x:2500,y:2000});
  const t=assignCadMarks(connectCadWallJunctions(doc([wide,branch]),randomUUID));
  const first=t.entities.find((e)=>e.id===wide.id);
  assert.deepEqual(cadStripFaceSegment(t,first,"left"),{start:{x:-200,y:200},end:{x:2380,y:200}});
  assert.deepEqual(cadStripFaceSegment(t,first,"right"),{start:{x:-200,y:-200},end:{x:2500,y:-200}});
  const branchFace=cadStripFaceSegment(t,branch,"left");
  assert.equal(branchFace.start.y,200);
  const measured=getCadPlanDimensions(t,125).filter((d)=>d.entityId===first.id&&d.faceSide);
  assert.deepEqual(measured.map((d)=>d.label),["2580 mm","2700 mm"]);
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
  for(const e of moved.entities){
    const a=after.filter((d)=>d.entityId===e.id&&d.faceSide),b=before.filter((d)=>d.entityId===e.id&&d.faceSide);
    assert.notDeepEqual(a.map((d)=>[d.start,d.end]),b.map((d)=>[d.start,d.end]));
  }
});

test("generated footing dimensions and wall dimensions have separate colors and both track resized shared nodes", () => {
  const setup=foundationSetupFromSettings(settings,[]);
  const walls=rectangle("foundation-wall").map((e)=>configureFoundationWall(e,setup));
  const original=assignCadMarks(synchronizeFoundationSupports(doc(walls),randomUUID));
  const before=getCadPlanDimensions(original,125);
  const target=original.entities.find((e)=>e.id===walls[0].id);
  const updated=resizeCadStrip(target,7000);
  const next=synchronizeFoundationSupports(updateConnectedCadEntity(original,updated),randomUUID);
  assert.deepEqual(next.entities.find((e)=>e.id===walls[1].id).geometry.start,updated.geometry.end);
  const after=getCadPlanDimensions(next,125);
  for(const e of next.entities.filter((e)=>e.kind==="footing"||e.id===walls[0].id||e.id===walls[1].id)){
    const dimensions=after.filter((d)=>d.entityId===e.id&&d.faceSide);
    assert.ok(dimensions.length>0);
    assert.ok(dimensions.every((d)=>d.color===cadEntityColor(e)));
    if(e.id===walls[0].id||e.id===walls[1].id||e.supportFor?.includes(walls[0].id)||e.supportFor?.includes(walls[1].id))
      assert.notDeepEqual(dimensions.map((d)=>d.label),before.filter((d)=>d.entityId===e.id&&d.faceSide).map((d)=>d.label));
  }
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
