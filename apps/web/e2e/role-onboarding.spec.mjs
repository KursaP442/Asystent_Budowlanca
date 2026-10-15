import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assignCadMarks, connectCadWallJunctions, createCadElement, synchronizeFoundationSupports } from "@asystent/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const userIds = [];
const password = "Local-test-password-2026!";

test("slanted foundation plan stays sparse, uses short guides and exports the same simple dimensions", async ({page,request}) => {
  await page.setViewportSize({width:1440,height:1100});
  const owner=await createAccount(),title=`Prosty rzut ${randomUUID()}`;
  await login(page,owner.email);await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page,title);
  const {data:job,error}=await admin.from("construction_jobs").select("id").eq("title",title).single();
  if(error)throw error;
  const points=[{x:-26000,y:1000},{x:-6000,y:2500},{x:-6500,y:20700},{x:-21000,y:22300},{x:-22400,y:12800}];
  const walls=points.map((p,i)=>createCadElement("foundation-wall",[p,points[(i+1)%points.length]],{id:randomUUID()}));
  walls.push(createCadElement("foundation-wall",[points[4],{x:-17500,y:10800}],{id:randomUUID()}));
  for(const wall of walls)wall.foundationBase={type:"strip",widthMm:800,depthMm:400,designReference:"K-01"};
  const pad=createCadElement("pad",[{x:-19300,y:4900},{x:-16700,y:4900},{x:-16700,y:6600},{x:-19300,y:6600}],{id:randomUUID()});
  const column=createCadElement("column",[{x:-24100,y:16500},{x:-22800,y:16500},{x:-22800,y:17800},{x:-24100,y:17800}],{id:randomUUID()});
  const draft={schemaVersion:1,id:randomUUID(),projectId:job.id,requirementId:"foundation-drawing-0",revision:0,
    status:"draft",calibration:null,entities:[...walls,pad,column],paperScale:50};
  const plan=assignCadMarks(synchronizeFoundationSupports(connectCadWallJunctions(draft,randomUUID),randomUUID));
  const token=await tokenFor(owner.email);
  const response=await request.post("/api/cad/drawings",{data:plan,headers:{Authorization:`Bearer ${token}`}});
  expect(response.status()).toBe(200);
  await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  const editor=page.locator(".cad-editor"),canvas=editor.getByRole("img",{name:/Płótno projektu/});
  await expect(canvas.locator(".cad-entity")).toHaveCount(plan.entities.length);
  await editor.getByRole("button",{name:"Ukryj legendę",exact:true}).click();
  await editor.getByRole("button",{name:"Dopasuj widok",exact:true}).click();
  await expect(canvas.locator(".cad-dimension")).toHaveCount(8);
  await expect(canvas.locator(".cad-location-leader line")).toHaveCount(2);
  await expect(canvas.locator(".cad-location-dimensions .cad-dimension-extension")).toHaveCount(0);
  const checkGuides=async()=>{
    const result=await canvas.locator(".cad-dimension").evaluateAll((nodes)=>nodes.map((n)=>{
      const font=Number(n.querySelector("text").getAttribute("font-size"));
      return {box:n.getAttribute("data-label-box").split(" ").map(Number),font,
        lengths:[...n.querySelectorAll(".cad-dimension-extension")].map((l)=>Math.hypot(
          Number(l.getAttribute("x2"))-Number(l.getAttribute("x1")),Number(l.getAttribute("y2"))-Number(l.getAttribute("y1"))))};
    }));
    for(const d of result)for(const length of d.lengths)expect(length).toBeLessThanOrEqual(d.font*1.5+.001);
    for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++){
      const [ax,ay,aw,ah]=result[i].box,[bx,by,bw,bh]=result[j].box;
      expect(ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by).toBe(false);
    }
  };
  await checkGuides();
  await canvas.scrollIntoViewIfNeeded();
  await canvas.screenshot({path:test.info().outputPath("simple-slanted-foundations.png")});
  for(let i=0;i<3;i++)await editor.getByRole("button",{name:"Pomniejsz",exact:true}).click();
  await checkGuides();
  const downloadPromise=page.waitForEvent("download");
  await editor.getByRole("button",{name:"Eksport SVG",exact:true}).click();
  const svg=await readFile(await (await downloadPromise).path(),"utf8");
  expect(svg.match(/class="cad-dimension"/g)).toHaveLength(8);
  expect(svg.match(/class="cad-dimension-line"/g)).toHaveLength(6);
  await editor.getByRole("button",{name:"Wymiary szczegółowe",exact:true}).click();
  expect(await canvas.locator(".cad-dimension").count()).toBeGreaterThan(16);
  await editor.getByRole("button",{name:"Wymiary uproszczone",exact:true}).click();
  await expect(canvas.locator(".cad-dimension")).toHaveCount(8);
  await expect(canvas.locator(".cad-entity")).toHaveCount(plan.entities.length);
});

test("CAD dimensions measure both colored faces, refresh connected geometry and keep support labels nearby when zooming", async ({page,request}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:1440,height:1100});
  const owner=await createAccount(),title=`Wymiary lic ${randomUUID()}`;
  await login(page,owner.email); await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page,title);
  const {data:job,error:jobError}=await admin.from("construction_jobs").select("id").eq("title",title).single();
  if(jobError)throw jobError;
  const points=[{x:1000,y:1000},{x:7000,y:1000},{x:7000,y:5000},{x:1000,y:5000}];
  const walls=points.map((p,i)=>createCadElement("foundation-wall",[p,points[(i+1)%4]],{id:randomUUID()}));
  walls.push(createCadElement("foundation-wall",[{x:4000,y:1000},{x:4000,y:3000}],{id:randomUUID()}));
  for(const wall of walls)wall.foundationBase={type:"strip",widthMm:800,depthMm:400,designReference:"K-01"};
  const excavation=createCadElement("excavation",[{x:1000,y:6500},{x:7000,y:6500}],{id:randomUUID()});
  excavation.attributes.widthMm=1200;
  const pad=createCadElement("pad",[{x:2000,y:2000},{x:2600,y:2000},{x:2600,y:2600},{x:2000,y:2600}],{id:randomUUID()});
  const draft={schemaVersion:1,id:randomUUID(),projectId:job.id,requirementId:"foundation-drawing-0",revision:0,
    status:"draft",calibration:null,entities:[...walls,excavation,pad],paperScale:50};
  const plan=assignCadMarks(synchronizeFoundationSupports(connectCadWallJunctions(draft,randomUUID),randomUUID));
  const token=await tokenFor(owner.email);
  const response=await request.post("/api/cad/drawings",{data:plan,headers:{Authorization:`Bearer ${token}`}});
  expect(response.status()).toBe(200);
  await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  const editor=page.locator(".cad-editor"),canvas=editor.getByRole("img",{name:/Płótno projektu/});
  await expect(canvas.locator(".cad-entity")).toHaveCount(plan.entities.length);
  await editor.getByRole("button",{name:"Ukryj legendę",exact:true}).click();
  await editor.getByRole("button",{name:"Dopasuj widok",exact:true}).click();
  const simpleCount=plan.entities.filter((e)=>e.kind==="construction-line").length+1;
  await expect(canvas.locator(".cad-dimension")).toHaveCount(simpleCount);
  for(const wall of plan.entities.filter((e)=>e.kind==="construction-line"&&e.attributes.role==="foundation-wall"))
    await expect(canvas.locator(`.cad-dimension[data-dimension-entity="${wall.id}"]`)).toHaveCount(1);
  await expect(canvas.locator(".cad-overall-dimensions")).toHaveCount(0);
  await expect(canvas.locator(".cad-location-dimensions .cad-dimension-line")).toHaveCount(0);
  await expect(canvas.locator(".cad-location-dimensions text")).toHaveText(/^ST1 → SF1 : \d+ \/ \d+ mm$/);
  await editor.getByRole("button",{name:"Wymiary szczegółowe",exact:true}).click();
  const face=(id,side)=>canvas.locator(`.cad-dimension[data-dimension-entity="${id}"][data-face-side="${side}"]`);
  const footing=plan.entities.find((e)=>e.supportFor?.includes(walls[0].id));
  await expect(face(walls[0].id,"left")).toContainText("2760 mm");
  await expect(face(walls[0].id,"right")).toContainText("3120 mm");
  await expect(face(footing.id,"left")).toContainText("2200 mm");
  await expect(face(footing.id,"right")).toContainText("3400 mm");
  await expect(face(walls[0].id,"left")).toHaveAttribute("stroke","#2563eb");
  await expect(face(footing.id,"left")).toHaveAttribute("stroke","#b45309");
  await expect(face(excavation.id,"left")).toHaveAttribute("stroke","#4d7c0f");
  for(const wall of plan.entities.filter((e)=>e.kind==="construction-line"&&e.attributes.role==="foundation-wall")){
    expect(await canvas.locator(`.cad-dimension[data-dimension-entity="${wall.id}"][data-face-side]`).count()).toBeGreaterThan(0);
  }
  const locations=canvas.locator(`.cad-dimension[data-dimension-entity="${pad.id}"]`);
  await expect(locations).toHaveCount(2);
  for(const node of await locations.all())await expect(node.locator("text")).toHaveText(/^ST1 → SF1 : \d+ mm$/);
  const checkLocationLabels=async()=>{
    await canvas.scrollIntoViewIfNeeded();
    const polygon=await canvas.locator(`.cad-entity[data-entity-id="${pad.id}"] polygon`).boundingBox();
    const labels=await locations.locator("text").evaluateAll((nodes)=>nodes.map((n)=>{
      const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
    }));
    for(const label of labels){
      expect(label.height).toBeGreaterThanOrEqual(11);
      expect(label.height).toBeLessThanOrEqual(15);
      const dx=Math.max(0,polygon.x-label.x-label.width,label.x-polygon.x-polygon.width);
      const dy=Math.max(0,polygon.y-label.y-label.height,label.y-polygon.y-polygon.height);
      expect(Math.hypot(dx,dy)).toBeLessThan(160);
    }
    await expect(locations.locator(".cad-location-leader circle")).toHaveCount(2);
    const boxes=await canvas.locator(".cad-dimension").evaluateAll((nodes)=>nodes.map((n)=>n.getAttribute("data-label-box").split(" ").map(Number)));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const [ax,ay,aw,ah]=boxes[i],[bx,by,bw,bh]=boxes[j];
      expect(ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by).toBe(false);
    }
  };
  await checkLocationLabels();
  for(let i=0;i<4;i++)await editor.getByRole("button",{name:"Pomniejsz",exact:true}).click();
  await checkLocationLabels();
  for(let i=0;i<7;i++)await editor.getByRole("button",{name:"Powiększ",exact:true}).click();
  await checkLocationLabels();
  const labelsBeforeExport=await locations.locator("text").evaluateAll((nodes)=>nodes.map((n)=>[n.getAttribute("x"),n.getAttribute("y"),n.getAttribute("font-size")]));
  const downloadPromise=page.waitForEvent("download");
  await editor.getByRole("button",{name:"Eksport SVG",exact:true}).click();
  const download=await downloadPromise,svg=await readFile(await download.path(),"utf8");
  const exported=await page.evaluate((markup)=>{
    const root=new DOMParser().parseFromString(markup,"image/svg+xml");
    return [...root.querySelectorAll(".cad-dimension")].map((n)=>({
      box:n.getAttribute("data-label-box").split(" ").map(Number),
      font:Number(n.querySelector("text").getAttribute("font-size")),color:n.getAttribute("stroke"),
    }));
  },svg);
  for(const d of exported)expect(d.font).toBe(125);
  expect(new Set(exported.map((d)=>d.color))).toEqual(new Set(["#2563eb","#b45309","#4d7c0f","#7c3aed","#334155"]));
  for(let i=0;i<exported.length;i++)for(let j=i+1;j<exported.length;j++){
    const [ax,ay,aw,ah]=exported[i].box,[bx,by,bw,bh]=exported[j].box;
    expect(ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by).toBe(false);
  }
  expect(await locations.locator("text").evaluateAll((nodes)=>nodes.map((n)=>[n.getAttribute("x"),n.getAttribute("y"),n.getAttribute("font-size")]))).toEqual(labelsBeforeExport);
  await editor.getByRole("button",{name:"Dopasuj widok",exact:true}).click();
  const watched=plan.entities.filter((e)=>e.kind==="construction-line"&&e.attributes.role==="foundation-wall"
    && [e.geometry.start,e.geometry.end].some((p)=>p.x===4000&&p.y===1000)).map((e)=>e.id);
  const ids=[...watched,...plan.entities.filter((e)=>e.supportFor?.some((id)=>watched.includes(id))).map((e)=>e.id)];
  const measurements=async()=>Object.fromEntries(await Promise.all(ids.map(async(id)=>[id,await canvas.locator(`.cad-dimension[data-dimension-entity="${id}"][data-face-side]`)
    .evaluateAll((nodes)=>nodes.map((n)=>Number(n.getAttribute("data-measurement"))))])));
  const before=await measurements();
  await editor.locator(".cad-element-list button").filter({hasText:/SF1 Ściana fundamentowa/}).click();
  await editor.getByLabel("Punkt 2 X (mm)",{exact:true}).fill("4500");
  await editor.getByLabel("Punkt 2 X (mm)",{exact:true}).press("Tab");
  const afterNumeric=await measurements();
  for(const id of ids)expect(afterNumeric[id]).not.toEqual(before[id]);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const handle=canvas.locator(".cad-junction").nth(1);
  await canvas.scrollIntoViewIfNeeded(); const grip=await handle.boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+20,grip.y+grip.height/2+15);
  const live=await measurements();
  for(const id of ids)expect(live[id]).not.toEqual(afterNumeric[id]);
  await page.mouse.up();
  const committed=await measurements();
  for(const id of ids)for(let i=0;i<committed[id].length;i++)expect(committed[id][i]).toBeCloseTo(live[id][i],3);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await editor.getByRole("button",{name:"Cofnij",exact:true}).click();
  expect(await measurements()).toEqual(afterNumeric);
  await editor.getByRole("button",{name:"Ponów",exact:true}).click();
  expect(await measurements()).toEqual(committed);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath("colored-face-dimensions.png"),fullPage:true});
  await page.reload();await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(plan.entities.length);
  await expect(canvas.locator(".cad-dimension")).toHaveCount(simpleCount);
  await editor.getByRole("button",{name:"Wymiary szczegółowe",exact:true}).click();
  expect(await measurements()).toEqual(committed);
});

test("CAD plan settings autosave, readable dimensions, insulation, attached columns, infill and paper scale persist", async ({page,request}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:1440,height:1200});
  const owner=await createAccount(),title=`Czytelny rzut ${randomUUID()}`;
  await login(page,owner.email); await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page,title);
  await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByLabel("Budynek z piwnicą",{exact:true}).check();
  await page.getByRole("tab",{name:"Materiały i technologia",exact:true}).click();
  await selectTechnology(page,"foundationBottomSlab","bottom-slab-yes","Tak — płyta denna");
  await selectTechnology(page,"foundationInsulation","foundation-xps","Płyty XPS");
  await selectTechnology(page,"foundationWaterproofing","kmb-coating","Grubowarstwowa masa");
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  const editor=page.locator(".cad-editor"),canvas=editor.getByRole("img",{name:/Płótno projektu/});
  await editor.getByRole("button",{name:"Ściana fundamentowa",exact:true}).click();
  await editor.getByLabel("Podparcie rysowanej ściany",{exact:true}).selectOption("strip");
  for(const [label,value] of [
    ["Grubość ściany fundamentowej (mm)","240"],["Wysokość ściany fundamentowej (mm)","1000"],
    ["Materiał ściany fundamentowej","Bloczek"],["Szerokość automatycznej ławy (mm)","800"],
    ["Wysokość automatycznej ławy (mm)","400"],["Grubość hydroizolacji ściany (mm)","4"],
    ["Grubość ocieplenia ściany (mm)","100"],["Grubość płyty dennej (mm)","200"],["Beton płyty dennej","C25/30"],
  ]) await editor.getByLabel(label,{exact:true}).fill(value);
  await editor.getByLabel("Strona hydroizolacji",{exact:true}).selectOption("both");
  await expect(editor.getByRole("button",{name:"Zastosuj do nowych ścian",exact:true})).toHaveCount(0);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.reload(); await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  await expect(editor.getByLabel("Wysokość ściany fundamentowej (mm)",{exact:true})).toHaveValue("1000");
  await expect(canvas.locator(".cad-entity")).toHaveCount(0);
  await editor.getByRole("button",{name:"Ściana fundamentowa",exact:true}).click();
  const screen=async(p)=>{
    await canvas.scrollIntoViewIfNeeded();
    const r=await canvas.boundingBox(),v=(await canvas.getAttribute("viewBox")).split(" ").map(Number);
    return {x:r.x+(p.x-v[0])/v[2]*r.width,y:r.y+(p.y-v[1])/v[3]*r.height};
  };
  const segment=async(a,b)=>{
    const p=await screen(a),q=await screen(b);
    await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(q.x,q.y); await page.mouse.up();
  };
  const corners=[{x:1000,y:1500},{x:6500,y:1500},{x:6500,y:4500},{x:1000,y:4500}];
  for(let i=0;i<4;i++)await segment(corners[i],corners[(i+1)%4]);
  await expect(canvas.locator(".cad-room-area")).toContainText("14.52 m²");
  await expect(canvas.locator(".cad-insulation-symbol")).toHaveCount(4);
  const thermalPattern=canvas.locator('[data-purpose="thermal"] pattern').first();
  expect(Number(await thermalPattern.getAttribute("width"))).toBe(Number(await thermalPattern.getAttribute("height"))*10);
  await expect(canvas.locator('[data-purpose="waterproofing"] polygon')).toHaveCount(8);
  await editor.getByRole("button",{name:"Dopasuj widok",exact:true}).click();
  await editor.getByRole("button",{name:"Płyta fundamentowa / denna",exact:true}).click();
  const middle=await screen({x:3500,y:3000}); await page.mouse.click(middle.x,middle.y);
  await expect(canvas.locator('.cad-entity[data-role="slab"]')).toHaveCount(1);
  await editor.getByRole("button",{name:"Pomieszczenie z piwnicą",exact:true}).click();
  await page.mouse.click(middle.x,middle.y);
  await expect(canvas.locator('.cad-entity[data-role="basement-area"]')).toHaveCount(1);
  await expect(canvas).toContainText("Piwnica");
  await editor.getByRole("button",{name:"Słup",exact:true}).click();
  await segment({x:3300,y:1300},{x:3700,y:1700});
  await expect(canvas.locator('.cad-entity[data-role="column"]')).toContainText("S1");
  await expect(canvas.locator('.cad-entity[data-role="column"]')).toContainText("400 × 400");
  const column=canvas.locator('.cad-entity[data-role="column"] .cad-solid-outline');
  const before=await column.getAttribute("points");
  await editor.locator(".cad-element-list button").filter({hasText:/SF1 Ściana fundamentowa/}).click();
  const handle=canvas.locator(".cad-junction").first(); await canvas.scrollIntoViewIfNeeded();
  const grip=await handle.boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2); await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+5,grip.y+grip.height/2+8); await page.mouse.up();
  expect(await column.getAttribute("points")).not.toBe(before);
  await editor.getByRole("button",{name:"Cofnij",exact:true}).click();
  await expect(column).toHaveAttribute("points",before);
  await editor.locator(".cad-element-list button").filter({hasText:/SF1 Ściana fundamentowa/}).click();
  await editor.getByRole("button",{name:"Usuń element",exact:true}).click();
  await expect(canvas.locator('.cad-entity[data-role="column"]')).toHaveCount(1);
  await expect(canvas.locator('.cad-entity[data-role="slab"]')).toHaveCount(0);
  await editor.getByRole("button",{name:"Cofnij",exact:true}).click();
  await expect(column).toHaveAttribute("points",before);
  await expect(canvas.locator('.cad-entity[data-role="slab"]')).toHaveCount(1);
  await editor.getByRole("button",{name:"Stopa fundamentowa",exact:true}).click();
  await segment({x:2300,y:2500},{x:2900,y:3100});
  await expect(canvas.locator(".cad-location-dimensions")).toContainText(["S1","ST1"]);
  await editor.getByRole("button",{name:"Opis",exact:true}).click();
  await segment({x:1500,y:1500},{x:1300,y:900});
  await expect(canvas.locator(".cad-annotation-leader")).toHaveCount(1);
  await editor.getByLabel("Opis na rysunku",{exact:true}).fill("Ściana SF1 według K-01");
  await editor.getByLabel("Czcionka opisu na arkuszu (mm)",{exact:true}).fill("3.5");
  await canvas.locator('.cad-entity[data-role="annotation"] text').dblclick();
  const inline=canvas.getByLabel("Edytuj opis na canvas",{exact:true});
  await expect(inline).toBeFocused();
  await inline.fill("Opis edytowany wewnątrz canvas"); await inline.press("Enter");
  await expect(inline).toHaveCount(0);
  await expect(canvas).toContainText("Opis edytowany wewnątrz canvas");
  await canvas.locator('.cad-entity[data-role="annotation"] text').dblclick();
  await inline.fill("Anulowana zmiana"); await inline.press("Escape");
  await expect(canvas).not.toContainText("Anulowana zmiana");
  await editor.getByRole("button",{name:"Płyta fundamentowa / denna",exact:true}).click();
  await canvas.locator('.cad-entity[data-role="annotation"] text').dblclick();
  await expect(inline).toBeFocused(); await inline.press("Escape");
  const zoomBeforeScale=await canvas.getAttribute("viewBox");
  await editor.getByLabel("Skala arkusza",{exact:true}).selectOption("50");
  await expect(canvas).toHaveAttribute("viewBox",zoomBeforeScale);
  await expect(canvas.locator(".cad-project-legend")).toContainText("1:50");
  const boxes=await canvas.locator(".cad-dimension").evaluateAll((nodes)=>nodes.map((n)=>n.getAttribute("data-label-box").split(" ").map(Number)));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const [ax,ay,aw,ah]=boxes[i],[bx,by,bw,bh]=boxes[j];
    expect(ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by).toBe(false);
  }
  const actualLabels=await canvas.locator(".cad-dimension text").evaluateAll((nodes)=>nodes.map((n)=>{
    const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  for(let i=0;i<actualLabels.length;i++){
    expect(actualLabels[i].height).toBeGreaterThanOrEqual(11);
    for(let j=i+1;j<actualLabels.length;j++){
      const a=actualLabels[i],b=actualLabels[j];
      expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y).toBe(false);
    }
  }
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:job,error:jobError}=await admin.from("construction_jobs").select("id").eq("title",title).single();
  if(jobError)throw jobError;
  const {data:row,error:rowError}=await admin.from("cad_drawings").select("payload").eq("job_id",job.id)
    .eq("requirement_id","foundation-drawing-0").single();
  if(rowError)throw rowError;
  const token=await tokenFor(owner.email);
  for(const corrupted of ["infill","attachment"]){
    const invalid=structuredClone(row.payload);
    if(corrupted==="infill")invalid.entities.find((e)=>e.infillFor).geometry.vertices[0].x+=10;
    else invalid.entities.find((e)=>e.attachment).attachment.end.x+=10;
    const response=await request.post("/api/cad/drawings",{data:invalid,headers:{Authorization:`Bearer ${token}`}});
    expect(response.status()).toBe(400);
  }
  const downloadPromise=page.waitForEvent("download");
  await editor.getByRole("button",{name:"Eksport SVG",exact:true}).click();
  const download=await downloadPromise,svg=await readFile(await download.path(),"utf8");
  expect(svg).toContain('data-paper-scale="50"'); expect(svg).toMatch(/width="[\d.]+mm"/);
  expect(Number(svg.match(/width="([\d.]+)mm"/)[1])).toBeCloseTo(Number(zoomBeforeScale.split(" ")[2])/50,3);
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath("readable-foundation-plan.png"),fullPage:true});
  await page.reload(); await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  await expect(editor.getByLabel("Wysokość ściany fundamentowej (mm)",{exact:true})).toHaveValue("1000");
  await expect(editor.getByLabel("Szerokość automatycznej ławy (mm)",{exact:true})).toHaveValue("800");
  await expect(editor.getByLabel("Strona hydroizolacji",{exact:true})).toHaveValue("both");
  await expect(editor.getByLabel("Skala arkusza",{exact:true})).toHaveValue("50");
  await expect(canvas.locator('.cad-entity[data-role="slab"]')).toHaveCount(1);
  await expect(canvas.locator(".cad-annotation-leader")).toHaveCount(1);
  await expect(canvas).toContainText("Opis edytowany wewnątrz canvas");
  await expect(canvas.locator('.cad-entity[data-role="basement-area"]')).toHaveCount(1);
  const entityCount=await canvas.locator(".cad-entity").count();
  const enabledTools=await editor.getByRole("toolbar",{name:"Narzędzia rysowania"}).getByRole("button").all();
  for(const button of enabledTools){
    if(await button.isDisabled())continue;
    await button.click(); await canvas.scrollIntoViewIfNeeded();
    const beforeView=await canvas.getAttribute("viewBox"),bounds=await canvas.boundingBox();
    await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);
    await page.mouse.down({button:"right"});
    await page.mouse.move(bounds.x+bounds.width*.5+24,bounds.y+bounds.height*.5+16);
    await page.mouse.up({button:"right"});
    expect(await canvas.getAttribute("viewBox")).not.toBe(beforeView);
    await expect(canvas.locator(".cad-entity")).toHaveCount(entityCount);
    await editor.getByRole("button",{name:"Dopasuj widok",exact:true}).click();
  }
  await page.getByRole("tab",{name:"Przekroje fundamentów i poziomy posadowienia",exact:true}).click();
  await expect(canvas).toHaveAttribute("aria-label","Płótno projektu: Przekroje fundamentów i poziomy posadowienia");
  await expect(editor.getByLabel("Wysokość ściany fundamentowej (mm)",{exact:true})).toHaveValue("1000");
  await editor.getByRole("button",{name:"Ściana",exact:true}).click();
  await expect(editor.getByRole("button",{name:"Ściana",exact:true})).toHaveAttribute("aria-pressed","true");
  await segment({x:1000,y:2500},{x:6000,y:2500});
  await segment({x:3500,y:1000},{x:3500,y:4000});
  await expect(canvas.locator('.cad-entity[data-role="wall"]')).toHaveCount(4);
  await editor.getByRole("button",{name:"Zaznacz / przesuń",exact:true}).click();
  const crossing=await screen({x:3500,y:2500});
  await page.mouse.move(crossing.x,crossing.y); await page.mouse.down();
  await page.mouse.move(crossing.x+30,crossing.y+20);
  const segments=await canvas.locator('.cad-entity[data-role="wall"] > g > line').evaluateAll((nodes)=>nodes.map((n)=>
    ["x1","y1","x2","y2"].map((key)=>Number(n.getAttribute(key)))));
  const endpointCounts=new Map();
  for(const s of segments)for(const p of [[s[0],s[1]],[s[2],s[3]]]){
    const key=p.map((v)=>v.toFixed(3)).join(","); endpointCounts.set(key,(endpointCounts.get(key)??0)+1);
  }
  expect([...endpointCounts.values()]).toContain(4);
  expect(endpointCounts.get("3500.000,2500.000")).toBeUndefined();
  await page.mouse.up();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const countBeforeClear=await canvas.locator(".cad-entity").count();
  page.once("dialog",(dialog)=>dialog.dismiss());
  await editor.getByRole("button",{name:"Wyczyść canvas",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(countBeforeClear);
  page.once("dialog",(dialog)=>dialog.accept());
  await editor.getByRole("button",{name:"Wyczyść canvas",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(0);
  await editor.getByRole("button",{name:"Cofnij",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(countBeforeClear);
  page.once("dialog",(dialog)=>dialog.accept());
  await editor.getByRole("button",{name:"Wyczyść canvas",exact:true}).click();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.reload(); await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  await page.getByRole("tab",{name:"Przekroje fundamentów i poziomy posadowienia",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(0);
  await expect(editor.getByLabel("Wysokość ściany fundamentowej (mm)",{exact:true})).toHaveValue("1000");
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("foundation slab without bottom slab selects a closed footing field and basement is gated", async ({page,request}) => {
  const owner=await createAccount(),title=`Płyta z pola ${randomUUID()}`;
  await login(page,owner.email); await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page,title);
  await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("tab",{name:"Materiały i technologia",exact:true}).click();
  await selectTechnology(page,"foundationBottomSlab","bottom-slab-no","Nie — bez płyty");
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  const editor=page.locator(".cad-editor"),canvas=editor.getByRole("img",{name:/Płótno projektu/});
  await expect(editor.getByRole("button",{name:"Pomieszczenie z piwnicą",exact:true})).toHaveCount(0);
  const screen=async(p)=>{
    await canvas.scrollIntoViewIfNeeded();
    const r=await canvas.boundingBox(),v=(await canvas.getAttribute("viewBox")).split(" ").map(Number);
    return {x:r.x+(p.x-v[0])/v[2]*r.width,y:r.y+(p.y-v[1])/v[3]*r.height};
  };
  await editor.getByRole("button",{name:"Płyta fundamentowa / denna",exact:true}).click();
  await expect(editor.getByRole("button",{name:/Zamknij obrys/})).toHaveCount(0);
  const empty=await screen({x:3000,y:3000}); await page.mouse.click(empty.x,empty.y);
  await expect(editor.getByRole("alert")).toContainText("Kliknij zamknięte pole ław");
  await expect(canvas.locator(".cad-entity")).toHaveCount(0);
  await editor.getByRole("button",{name:"Ława fundamentowa",exact:true}).click();
  const corners=[{x:1000,y:1500},{x:6500,y:1500},{x:6500,y:4500},{x:1000,y:4500}];
  for(let i=0;i<4;i++){
    const a=await screen(corners[i]),b=await screen(corners[(i+1)%4]);
    await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y); await page.mouse.up();
  }
  await editor.getByLabel("Grubość płyty dennej (mm)",{exact:true}).fill("250");
  await editor.getByLabel("Beton płyty dennej",{exact:true}).fill("C30/37");
  await editor.getByRole("button",{name:"Płyta fundamentowa / denna",exact:true}).click();
  const center=await screen({x:3000,y:3000}); await page.mouse.click(center.x,center.y);
  await expect(canvas.locator('.cad-entity[data-role="slab"]')).toHaveCount(1);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:job,error:jobError}=await admin.from("construction_jobs").select("id").eq("title",title).single();
  if(jobError)throw jobError;
  const {data:row,error:rowError}=await admin.from("cad_drawings").select("payload").eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if(rowError)throw rowError;
  const slab=row.payload.entities.find((e)=>e.kind==="slab");
  expect(slab.infillFor).toHaveLength(4); expect(slab.attributes.thicknessMm).toBe(250);
  const invalid=structuredClone(row.payload);
  invalid.entities.push({...slab,id:randomUUID(),mark:undefined,kind:"construction-area",layerId:"basement-area",
    attributes:{role:"basement-area",thicknessMm:200,heightMm:2800,material:"Z projektu",designReference:"K-01"}});
  const token=await tokenFor(owner.email);
  const response=await request.post("/api/cad/drawings",{data:invalid,headers:{Authorization:`Bearer ${token}`}});
  expect(response.status()).toBe(400);
  await page.reload(); await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  await expect(canvas.locator('.cad-entity[data-role="slab"]')).toHaveCount(1);
});

function planPdfFixture() {
  const stream = "0 0 0 RG 3 w 100 100 500 400 re S\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 800] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i,object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i+1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10,"0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function unusedNip() {
  for (;;) {
    const prefix = randomInt(100000000, 999999999).toString();
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(prefix[index]), 0) % 11;
    if (checksum === 10) continue;
    const nip = `${prefix}${checksum}`;
    const { data, error } = await admin.from("organizations").select("id").eq("nip", nip);
    if (error) throw error;
    if (data.length === 0) return nip;
  }
}
async function createAccount({ administrator = false } = {}) {
  const email = `e2e-${randomUUID()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Test lokalny" },
    app_metadata: administrator ? { role: "admin" } : {},
  });
  if (error) throw error;
  userIds.push(data.user.id);
  return { email, id: data.user.id };
}
async function createPublishedMarketJob(title) {
  const client = await createAccount();
  const { error } = await admin.from("construction_jobs").insert({
    client_id: client.id,
    title,
    city: "Kraków",
    postal_code: "30-001",
    address: "Rynek 1",
    description: "Zakres prac dla rynku",
    building_type: "house",
    area_m2: 100,
    floors: 2,
    basement: false,
    plot_area_m2: 600,
    requirements: "Wymagania dla wykonawcy",
    acceptance_criteria: "Kryteria odbioru rynku",
    report_summary: `Raport wniosku: ${title}`,
    site_access: "Dojazd od ulicy",
    utilities: "Prąd i woda",
    materials: "Materiały inwestora",
    start_date: "2026-12-15",
    status: "open",
  });
  if (error) throw error;
  return title;
}
async function login(page, email, secret = password) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Adres e-mail", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Hasło", exact: true }).fill(secret);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
}
test("registration validates input and completes client onboarding", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Utwórz konto", exact: true }).first().click();
  await expect(page.locator(".auth-submit")).toHaveText(/Utwórz konto/);
  await page.getByLabel("Imię lub nazwa", { exact: true }).fill("Test E2E");
  await page.getByLabel("Adres e-mail", { exact: true }).fill("invalid-email");
  await page.getByLabel("Hasło", { exact: true }).fill("short");
  await page.locator(".auth-submit").click();
  await expect(page.locator(".auth-card .alert-error")).toContainText("Podaj poprawny adres e-mail.");
  await expect(page.locator(".auth-card .alert-error")).toContainText("Hasło musi mieć co najmniej 8 znaków.");

  const email = `e2e-signup-${randomUUID()}@example.test`;
  await page.getByLabel("Adres e-mail", { exact: true }).fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.locator(".auth-submit").click();
  await expect(page.getByRole("heading", { name: "Jak chcesz korzystać z aplikacji?" })).toBeVisible();
  const { data: listedUsers, error: listUsersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listUsersError) throw listUsersError;
  const owner = listedUsers.users.find((user) => user.email === email);
  if (!owner) throw new Error("Konto zarejestrowane w UI nie zostało znalezione do sprzątania testu.");
  userIds.push(owner.id);
  await page.locator(".account-type-card.type-client").click();
  await expect(page.getByRole("tab", { name: "Dane budowy" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Materiały i technologia" }).click();
  await expect(page.getByRole("tab", { name: "Materiały i technologia" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Materiały i technologia" })).toBeVisible();
  await page.getByRole("button", { name: "Przejdź dalej", exact: true }).click();
  await expect(page.locator(".workflow-form .alert-error")).toContainText("To pole jest wymagane.");
  await expect(page.getByRole("tab", { name: "Materiały i technologia" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Dane budowy" }).click();
  await page.getByLabel("Nazwa budowy", { exact: true }).fill("Budowa E2E");
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("30-001");
  await page.getByLabel("Miejscowość", { exact: true }).fill("Kraków");
  await page.getByLabel("Ulica lub nazwa miejsca", { exact: true }).fill("Działka");
  await page.getByLabel("Nr budynku / działki", { exact: true }).fill("1");
  await page.getByLabel("Powierzchnia (m²)", { exact: true }).fill("100");
  await page.getByLabel("Zakres prac", { exact: true }).fill("Zakres testowy");
  await page.getByLabel("Planowany termin", { exact: true }).fill("2026-12-01");
  await page.getByRole("tab", { name: "Materiały i technologia" }).click();
  await expect(page.getByRole("heading", { name: "Materiały i technologia" })).toBeVisible();
  await page.getByRole("tab", { name: "Dane budowy" }).click();
  await page.getByRole("button", { name: "Przejdź dalej", exact: true }).click();
  await expect(page.locator(".workflow-form .alert-error")).toContainText("Wybierz technologię:");
});
test("admin shortcut is granted only through app metadata and does not bypass save validation", async ({ page }) => {
  const regular = await createAccount();
  await login(page, regular.email);
  await page.locator(".account-type-card.type-client").click();
  await expect(page.getByRole("button", { name: "Pomiń walidację i przejdź do materiałów i technologii" })).toHaveCount(0);
  await signout(page);

  const administrator = await createAccount({ administrator: true });
  await login(page, administrator.email);
  await page.locator(".account-type-card.type-client").click();
  await expect(page.getByRole("button", { name: "Pomiń walidację i przejdź do materiałów i technologii" })).toBeVisible();
  await page.getByRole("button", { name: "Pomiń walidację i przejdź do materiałów i technologii" }).click();
  await expect(page.getByRole("tab", { name: "Materiały i technologia" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Przejdź dalej", exact: true }).click();
  await expect(page.locator(".workflow-form .alert-error")).toBeVisible();
});
async function signout(page) {
  await page.getByRole("button", { name: "Wyloguj", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zaloguj się", exact: true })).toBeVisible();
}
async function tokenFor(email, secret = password) {
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: secret });
  if (error) throw error;
  return data.session.access_token;
}
async function fillBusiness(page, kind, nip) {
  await page.getByLabel(kind === "store" ? "Nazwa sklepu" : "Nazwa firmy", { exact: true }).fill(`E2E ${kind}`);
  await page.getByLabel("NIP", { exact: true }).fill(nip);
  await page.getByLabel("Telefon", { exact: true }).fill("123456789");
  await page.getByLabel("Miejscowość", { exact: true }).fill("Kraków");
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("30-001");
  await page.getByLabel("Adres", { exact: true }).fill("Budowlana 1");
  await page.getByLabel("Branża i specjalizacja", { exact: true }).fill(kind === "store" ? "Materiały budowlane" : "Budowa domów");
  await page.getByLabel("Obszar działania", { exact: true }).fill("Małopolskie");
  await page.getByLabel("Opis działalności", { exact: true }).fill("Lokalna działalność testowa");
  await page.getByRole("button", { name: "Zapisz profil i przejdź do panelu" }).click();
  await expect(page.getByRole("heading", { name: `E2E ${kind}`, exact: true }).first()).toBeVisible();
}
async function fillConstruction(page, title) {
  await page.getByLabel("Nazwa budowy", { exact: true }).fill(title);
  await page.getByLabel("Kod pocztowy", { exact: true }).fill("30-001");
  await page.getByLabel("Miejscowość", { exact: true }).fill("Kraków");
  await page.getByLabel("Ulica lub nazwa miejsca", { exact: true }).fill("Działka");
  await page.getByLabel("Nr budynku / działki", { exact: true }).fill("42");
  await page.getByLabel("Powierzchnia (m²)", { exact: true }).fill("120");
  await page.getByLabel("Zakres prac", { exact: true }).fill("Fundamenty i stan surowy domu");
  await page.getByLabel("Planowany termin", { exact: true }).fill("2026-12-01");
  await fillTechnology(page, "house");
  await page.getByRole("button", { name: "Przejdź dalej", exact: true }).click();
  await returnToPanelFromDocumentation(page);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

async function returnToPanelFromDocumentation(page) {
  await expect(page.getByRole("heading", { name: "Dokumentacja projektu", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zapisz szkic i wróć do panelu", exact: true }).click();
}

async function fillTechnology(page, workType) {
  await page.getByRole("tab", {name:"Materiały i technologia"}).click();
  if (workType === "house" || workType === "extension") {
    await selectTechnology(page, "completionStandard", "turnkey", "Pod klucz");
    for (const [value, label] of [
      ["shell-open", "Stan surowy otwarty"],
      ["shell-closed", "Stan surowy zamknięty"],
      ["developer", "Stan deweloperski"],
      ["turnkey", "Pod klucz"],
    ]) {
      await selectTechnology(page, "completionStandard", value, label);
      await expect(page.locator('[data-technology-stage="waterSewerInstallation"]')).toBeVisible();
    }
    const foundation = page.locator('[data-technology-stage="foundationType"]');
    await foundation.locator(".technology-select-trigger").click();
    const foundationSearch = foundation.getByRole("searchbox", {name:"Szukaj: Sposób posadowienia"});
    await foundationSearch.fill("ławy");
    await expect(foundation.getByRole("option")).toHaveCount(2);
    await foundation.getByRole("option").filter({hasText:"Ławy fundamentowe żelbetowe"}).click();
    await foundationSearch.fill("płyta");
    await foundation.getByRole("option").filter({hasText:"Płyta fundamentowa żelbetowa"}).click();
    await expect(foundation.locator(".technology-select-trigger")).toContainText("Ławy fundamentowe żelbetowe");
    await expect(foundation.locator(".technology-select-trigger")).toContainText("Płyta fundamentowa żelbetowa");
    await foundationSearch.press("Escape");
    await expect(foundation.locator(".technology-select-trigger")).toBeFocused();
    await selectTechnology(page, "foundationWalls", "monolithic-foundation-wall", "Ściana monolityczna");
    const foundationFormwork = page.locator('[data-technology-stage="foundationFormwork"]');
    await expect(foundationFormwork).toBeVisible();
    await selectTechnology(page, "foundationFormwork", "foundation-system-formwork", "Szalunek systemowy");
    await selectTechnology(page, "foundationWalls", "concrete-block-24", "Bloczki betonowe murowane");
    await expect(foundationFormwork).toHaveCount(0);
    await selectTechnology(page, "foundationWalls", "monolithic-foundation-wall", "Ściana monolityczna");
    await selectTechnology(page, "foundationRingBeam", "project", "Zgodnie z projektem");
    await selectTechnology(page, "floorStructure", "monolithic", "Strop monolityczny");
    await selectTechnology(page, "roofStructure", "rafter-roof", "Więźba krokwiowa");
    await selectTechnology(page, "roofSlopePlate", "sloped-plate-yes", "Tak — żelbetowa płyta skośna");
    await selectTechnology(page, "roofDecking", "full-board-decking", "Pełne deskowanie z desek");
    await selectTechnology(page, "roofUnderlayment", "roofing-felt-underlay", "Papa podkładowa na pełnym poszyciu");
    await selectTechnology(page, "roofCovering", "metal-roof-tile", "Blachodachówka modułowa");
    await selectTechnology(page, "roofMetalTileProfile", "metal-tile-modular", "Blachodachówka modułowa, krótkie arkusze");
    await selectTechnology(page, "roofChimneySystem", "chimney-ceramic-system", "Systemowy komin ceramiczny");
    await selectTechnology(page, "roofChimneyFlashing", "chimney-flashing-system-kit", "Kompletna obróbka systemowa");
    await selectTechnology(page, "roofChimneyFlashingMaterial", "chimney-flashing-coated-steel", "Blacha stalowa powlekana");
    await selectTechnology(page, "roofGutterSystem", "gutter-pvc-semicircular", "Rynny PVC — półokrągłe");
    await selectTechnology(page, "roofDownspoutSystem", "downspout-pvc-round", "Rury PVC — okrągłe");
    await selectTechnology(page, "stairStructure", "stair-structure-cast-in-place-concrete", "Schody żelbetowe monolityczne");
    await selectTechnology(page, "waterSewerInstallation", "plastic-drainage", "System kanalizacji wewnętrznej");
    await selectTechnology(page, "interiorFloorFinish", "finish-floor-tile", "Płytki ceramiczne / gres");
    await selectTechnology(page, "interiorFloorFinish", "finish-floor-engineered-wood", "Deska warstwowa / parkiet");
    await selectTechnology(page, "interiorWallFinish", "finish-wall-paint", "Gładź i malowanie");
    await selectTechnology(page, "interiorWallFinish", "finish-wall-tile", "Płytki ceramiczne / gres");
    await selectTechnology(page, "stairFinish", "stair-finish-wood", "Okładzina drewniana");
    await selectTechnology(page, "stairFinish", "stair-railing-metal", "Balustrada stalowa / metalowa");
    await selectTechnology(page, "exteriorFacadeFinish", "facade-finish-thin-coat-render", "Tynk cienkowarstwowy");
    await selectTechnology(page, "exteriorFacadeFinish", "facade-finish-brick-slip", "Płytki klinkierowe");
  }
  if (workType !== "other") {
    if (workType === "renovation") {
      await selectTechnology(page, "renovationScope", "room-renovation", "Remont wybranych pomieszczeń");
      await expect(page.locator('[data-technology-stage="renovationKitchenFitout"]')).toBeVisible();
      await selectTechnology(page, "renovationKitchenFitout", "kitchen-cabinets", "Meble kuchenne");
      await selectTechnology(page, "renovationKitchenFitout", "kitchen-worktop", "Blat kuchenny");
      await selectTechnology(page, "renovationBathroomFitout", "bathroom-shower", "Prysznic");
      await selectTechnology(page, "renovationBathroomFitout", "bathroom-basin-cabinet", "Umywalka");
      await selectTechnology(page, "renovationFloor", "floor-ceramic-tile", "Płytki ceramiczne / gres");
      await selectTechnology(page, "renovationFloor", "floor-vinyl", "Panele winylowe");
      await selectTechnology(page, "renovationWall", "wall-paint", "Gładź i farba");
      await selectTechnology(page, "renovationWall", "wall-ceramic-tile", "Płytki ceramiczne / gres ścienny");
      await selectTechnology(page, "renovationScope", "thermal-modernization", "Remont z termomodernizacją");
      await selectTechnology(page, "roofStructure", "rafter-roof", "Więźba krokwiowa");
      await selectTechnology(page, "roofSlopePlate", "sloped-plate-no", "Nie — dach bez płyty skośnej");
      await selectTechnology(page, "roofDecking", "other-roof-decking", "Inne poszycie — opisz");
      const otherDecking = page.getByLabel("Opisz wybraną opcję „Inne” — Poszycie i deskowanie dachu");
      await expect(otherDecking).toHaveAttribute("required", "");
      await otherDecking.fill("Deski impregnowane o grubości 25 mm");
      await selectTechnology(page, "roofUnderlayment", "roof-membrane-high-permeable", "Wysokoparoprzepuszczalna membrana dachowa");
      await selectTechnology(page, "roofCovering", "flat-sheet-metal", "Płaska blacha łączona na rąbek lub zwoje");
      await selectTechnology(page, "roofStandingSeamSystem", "standing-seam-double-lock", "Rąbek stojący podwójny");
      await selectTechnology(page, "roofChimneySystem", "chimney-ceramic-system", "Systemowy komin ceramiczny");
      await selectTechnology(page, "roofChimneyFlashing", "chimney-flashing-apron-counterflashing", "Obróbka z fartuchami");
      await selectTechnology(page, "roofChimneyFlashingMaterial", "chimney-flashing-zinc-titanium", "Blacha cynkowo-tytanowa");
      await selectTechnology(page, "roofGutterSystem", "gutter-hidden-box", "Rynna ukryta / gzymsowa");
      await selectTechnology(page, "roofDownspoutSystem", "downspout-hidden", "Ukryte rury spustowe");
    }
  } else {
    const workTechnology = page.locator('[data-technology-stage="otherWorkTechnology"]');
    await workTechnology.locator(".technology-select-trigger").click();
    await expect(workTechnology.getByRole("option", { name: /zgodnie z projektem/i })).toHaveCount(0);
    await workTechnology.locator('input[type="search"]').press("Escape");
    await selectTechnology(page, "otherWorkTechnology", "driveway-paving", "Podjazd, ścieżki i nawierzchnie");
    await selectTechnology(page, "otherWorkTechnology", "site-drainage", "Odwodnienie terenu / drenaż");
    await selectTechnology(page, "otherWorkTechnology", "foundation-construction", "Fundamenty, ławy");
    await selectTechnology(page, "otherWorkTechnology", "roof-structure", "Konstrukcja dachu");
    await selectTechnology(page, "otherWorkTechnology", "roof-covering", "Pokrycie, naprawa");
    await selectTechnology(page, "otherWorkTechnology", "facade-work", "Fasada / elewacja");
    await expect(page.locator('[data-technology-stage="otherResinGravelSystem"]')).toHaveCount(0);
    await expect(page.locator('[data-technology-stage="otherFacadePreparation"]')).toBeVisible();
    await expect(page.locator('[data-technology-stage="otherFoundationReinforcement"]')).toBeVisible();
    await expect(page.locator('[data-technology-stage="otherRoofCovering"]')).toBeVisible();
    await expect(page.locator('[data-technology-stage="otherFacadeInsulation"]')).toBeVisible();
    await expect(page.locator('[data-technology-stage="otherFacadeReinforcement"]')).toBeVisible();
    await expect(page.locator('[data-technology-stage="otherFacadeColor"]')).toHaveCount(0);
    await expect(page.locator('[data-technology-stage="otherFacadeFinish"]')).toBeVisible();
    await selectTechnology(page, "otherFacadePreparation", "facade-cleaning", "Czyszczenie i gruntowanie podłoża");
    await selectTechnology(page, "otherFoundationScope", "foundation-rebar-placement", "montaż zbrojenia");
    await selectTechnology(page, "otherFoundationType", "other-foundation-strip", "Ławy fundamentowe");
    await selectTechnology(page, "otherFoundationReinforcement", "reinforcement-prefabricated-cages", "Gotowe kosze");
    await selectTechnology(page, "otherFoundationFormwork", "other-formwork-system", "Szalunek systemowy");
    await selectTechnology(page, "otherFoundationConcrete", "concrete-ready-mix-pump", "Beton towarowy z pompy");
    await selectTechnology(page, "otherRoofStructure", "other-roof-rafter", "Więźba krokwiowa");
    await selectTechnology(page, "otherRoofDecking", "other-roof-full-boarding", "Pełne deskowanie");
    await selectTechnology(page, "otherRoofCovering", "other-roof-metal-tile", "Blachodachówka");
    await selectTechnology(page, "otherRoofUnderlayment", "other-underlayment-high-permeable", "Membrana wysokoparoprzepuszczalna");
    await selectTechnology(page, "otherRoofInsulation", "other-roof-mineral-wool", "Wełna mineralna");
    await selectTechnology(page, "otherRoofDrainage", "other-roof-gutters", "Rynny i rury spustowe");
    await selectTechnology(page, "otherFacadeInsulation", "other-facade-eps-white", "Styropian biały EPS");
    await selectTechnology(page, "otherFacadeFixing", "other-facade-adhesive", "Mocowanie klejem");
    await selectTechnology(page, "otherFacadeReinforcement", "other-facade-mesh-standard", "Jedna warstwa siatki");
    await selectTechnology(page, "otherFacadeReinforcement", "other-facade-opening-reinforcement", "Wzmocnienia diagonalne");
    await selectTechnology(page, "otherFacadeFinish", "facade-thin-coat-render", "Tynk cienkowarstwowy w systemie ocieplenia");
    await expect(page.locator('[data-technology-stage="otherFacadeColor"]')).toBeVisible();
    await selectTechnology(page, "otherFacadeCoating", "other-facade-silicone-render", "Tynk silikonowy");
    await selectTechnology(page, "otherFacadeColor", "other-facade-color-white", "Biały / złamana biel");
    await selectTechnology(page, "otherDrivewaySurface", "paving-resin-gravel", "Nawierzchnia żywiczno-żwirowa");
    await selectTechnology(page, "otherDrivewaySurface", "paving-concrete-block", "Kostka betonowa brukowa");
    await selectTechnology(page, "otherDrivewaySurface", "paving-natural-stone", "Kostka lub bruk z kamienia naturalnego");
    await expect(page.locator('[data-technology-stage="otherResinGravelSystem"]')).toBeVisible();
    await selectTechnology(page, "otherResinGravelSystem", "resin-bound-permeable", "Kruszywo związane żywicą — system przepuszczalny");
  }
  const fields = page.locator(".technology-field");
  for (let index = 0; index < await fields.count(); index += 1) {
    const field = fields.nth(index);
    const stageKey = await field.getAttribute("data-technology-stage");
    if (stageKey === "foundationType") continue;
    const trigger = field.locator(".technology-select-trigger");
    if ((await trigger.innerText()).includes("Wybierz technologię")) {
      const options = field.getByRole("option");
      await trigger.click();
      const project = options.filter({hasText:"Zgodnie z projektem"});
      if (await project.count()) await project.first().click();
      else {
        const first = field.getByRole("option").first();
        await first.click();
      }
      const listbox = field.locator('[role="listbox"]');
      if (await listbox.count() && await listbox.getAttribute("aria-multiselectable") === "true") {
        await field.getByRole("searchbox").press("Escape");
      }
    }
  }
  await page.getByRole("tab", {name:"Dane budowy"}).click();
}

async function selectTechnology(page, stageKey, value, label) {
  const field = page.locator(`[data-technology-stage="${stageKey}"]`);
  const trigger = field.locator(".technology-select-trigger");
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await field.getByRole("option").filter({hasText:label}).click();
  await expect(trigger).toContainText(label);
  const listbox = field.locator('[role="listbox"]');
  if (await listbox.count() && await listbox.getAttribute("aria-multiselectable") === "true") {
    await field.getByRole("searchbox").press("Escape");
  }
}
test.afterEach(async () => {
  for (const id of userIds.splice(0).reverse()) {
    const { data: jobs, error: jobsError } = await admin.from("construction_jobs").select("id").eq("client_id", id);
    if (jobsError) throw jobsError;
    for (const job of jobs) {
      const prefix = `${id}/${job.id}`;
      const { data: objects, error: listError } = await admin.storage.from("job-photos").list(prefix);
      if (listError) throw listError;
      if (objects.length) {
        const { error: removeError } = await admin.storage.from("job-photos").remove(objects.map((object) => `${prefix}/${object.name}`));
        if (removeError) throw removeError;
      }
      const scans = admin.storage.from("project-scans");
      const { data: scanObjects, error: scanListError } = await scans.list(prefix);
      if (scanListError) throw scanListError;
      if (scanObjects.length) {
        const { error: scanCleanupError } = await scans.remove(scanObjects.map((object) => `${prefix}/${object.name}`));
        if (scanCleanupError) throw scanCleanupError;
      }
    }
    const { error: businessError } = await admin.from("organizations").delete().eq("created_by", id);
    if (businessError) throw businessError;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

test("work-specific details, consent map, private photos and upload retry persist", async ({ page }) => {
  const owner = await createAccount();
  const outsider = await createAccount();
  await login(page, owner.email);
  await page.locator(".account-type-card.type-client").click();
  await expect(page.getByLabel("Rodzaj prac", {exact:true})).toBeVisible();
  await expect(page.getByLabel("Dach", {exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Szerokość geograficzna (opcjonalnie)")).toHaveCount(0);
  await expect(page.getByLabel("Długość geograficzna (opcjonalnie)")).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Pokaż na mapie"})).toHaveCount(0);
  await expect(page.getByLabel("Kod pocztowy", {exact:true})).toHaveAttribute("required", "");
  await expect(page.getByLabel("Planowany termin", {exact:true})).toHaveAttribute("required", "");
  await expect(page.getByRole("tab", {name:"Materiały i technologia"})).toBeVisible();
  await expect(page.getByLabel("Wymagania szczegółowe")).toHaveCount(0);
  await expect(page.getByLabel("Kryteria odbioru")).toHaveCount(0);
  await page.getByLabel("Rodzaj prac", {exact:true}).selectOption("extension");
  await expect(page.getByLabel("Powierzchnia istniejącego budynku (m²)", {exact:true})).toHaveCount(0);
  await page.getByLabel("Rodzaj prac", {exact:true}).selectOption("other");
  await expect(page.getByLabel("Kategoria prac", {exact:true})).toBeVisible();
  await expect(page.getByLabel("Liczba kondygnacji", {exact:true})).toHaveCount(0);
  await page.getByLabel("Rodzaj prac", {exact:true}).selectOption("renovation");
  await expect(page.getByRole("checkbox", {name:"Budynek z piwnicą"})).toHaveCount(0);
  const map = page.locator(".construction-location-map");
  const mapStatus = page.locator(".location-map-status");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("src", /maps\.google\.com\/maps\?q=/);
  await expect(mapStatus).toContainText("Google Maps: Warszawa, Polska");
  const googleMapQueries = [];
  await page.route("**://maps.google.com/**", async (route) => {
    googleMapQueries.push(route.request().url());
    await route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><title>Google Maps test</title>"});
  });
  await page.getByLabel("Nazwa budowy", {exact:true}).fill("Remont mieszkania");
  await page.getByLabel("Kod pocztowy", {exact:true}).fill("32-740");
  await page.getByLabel("Miejscowość", {exact:true}).fill("Łapanów");
  await page.getByLabel("Ulica lub nazwa miejsca", {exact:true}).fill("Grabie");
  await page.getByLabel("Nr budynku / działki", {exact:true}).fill("156a");
  await expect.poll(() => {
    const latest = googleMapQueries.at(-1);
    return latest ? new URL(latest).searchParams.get("q") : null;
  }).toBe("Grabie 156a, Łapanów, 32-740, Polska");
  await expect(mapStatus).toContainText("Grabie 156a, Łapanów, 32-740, Polska");
  await page.getByLabel("Kod pocztowy", {exact:true}).fill("30-001");
  await page.getByLabel("Miejscowość", {exact:true}).fill("Kraków");
  await page.getByLabel("Ulica lub nazwa miejsca", {exact:true}).fill("Testowa");
  await page.getByLabel("Nr budynku / działki", {exact:true}).fill("1");
  await expect.poll(() => {
    const latest = googleMapQueries.at(-1);
    return latest ? new URL(latest).searchParams.get("q") : null;
  }).toBe("Testowa 1, Kraków, 30-001, Polska");
  await page.getByLabel("Nr budynku / działki", {exact:true}).fill("2");
  await expect.poll(() => {
    const latest = googleMapQueries.at(-1);
    return latest ? new URL(latest).searchParams.get("q") : null;
  }).toBe("Testowa 2, Kraków, 30-001, Polska");
  await page.getByLabel("Powierzchnia (m²)", {exact:true}).fill("40");
  await page.getByLabel("Pomieszczenia do remontu", {exact:true}).fill("Kuchnia i łazienka");
  await page.getByLabel("Stan istniejący", {exact:true}).fill("Stare płytki i instalacja");
  await page.getByLabel("Zakres prac", {exact:true}).fill("Wymiana płytek, malowanie");
  await page.getByLabel("Planowany termin", { exact: true }).fill("2026-11-20");
  await fillTechnology(page, "renovation");
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Dodaj zdjęcia", {exact:true}).setInputFiles({name:"invalid.svg",mimeType:"image/svg+xml",buffer:Buffer.from("<svg/>")});
  await expect(page.locator(".alert-error")).toContainText("JPEG, PNG lub WebP");
  await page.getByLabel("Dodaj zdjęcia", {exact:true}).setInputFiles(Array.from({length:11},(_,index) => ({name:`photo-${index}.png`,mimeType:"image/png",buffer:pixel})));
  await expect(page.locator(".alert-error")).toContainText("maksymalnie 10");
  await page.getByLabel("Dodaj zdjęcia", {exact:true}).setInputFiles({name:"too-big.png",mimeType:"image/png",buffer:Buffer.alloc(10485761)});
  await expect(page.locator(".alert-error")).toContainText("do 10 MB");
  await page.getByLabel("Dodaj zdjęcia", {exact:true}).setInputFiles({name:"room.png",mimeType:"image/png",buffer:pixel});
  await expect(page.getByAltText("room.png")).toBeVisible();
  await expect.poll(() => page.getByAltText("room.png").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({path:test.info().outputPath("renovation-mobile.png"),fullPage:true});
  const uploadRoute = "**/storage/v1/object/job-photos/**";
  await page.route(uploadRoute, (route) => route.request().method() === "POST"
    ? route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({statusCode:"503",error:"Test upload failure",message:"Test upload failure"})})
    : route.continue());
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await expect(page.locator(".alert-error")).toContainText("Dane zlecenia zapisano");
  await page.unroute(uploadRoute);
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Dokumentacja projektu",exact:true})).toBeVisible();
  await expect(page.getByText("Dane szczegółowe etapu i źródła pomiarów", {exact:true})).toHaveCount(0);
  const draftRoute = "**/rest/v1/rpc/save_documentation_draft";
  await page.route(draftRoute, (route) => route.fulfill({
    status:503,contentType:"application/json",body:JSON.stringify({message:"Test draft save failure"}),
  }));
  await page.getByRole("navigation", {name:"Etapy projektu"}).getByRole("button", {name:/Pomieszczenia i wykończenia/}).click();
  await expect(page.getByRole("region", {name:"Dokumentacja projektu"}).getByRole("alert"))
    .toContainText("Test draft save failure");
  await expect(page.getByRole("navigation", {name:"Etapy projektu"}).locator('[aria-current="step"]')).toContainText("Istniejący obiekt");
  await page.unroute(draftRoute);
  await page.getByRole("navigation", {name:"Etapy projektu"}).getByRole("button", {name:/Pomieszczenia i wykończenia/}).click();
  await expect(page.getByRole("navigation", {name:"Etapy projektu"}).locator('[aria-current="step"]')).toContainText("Pomieszczenia i wykończenia");
  await returnToPanelFromDocumentation(page);
  await expect(page.getByRole("heading", {name:"Remont mieszkania",exact:true})).toBeVisible();
  const {data:jobs,error} = await admin.from("construction_jobs").select("*").eq("client_id",owner.id);
  if (error) throw error;
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({floors:null,basement:null,rooms:"Kuchnia i łazienka",postal_code:"30-001",start_date:"2026-11-20"});
  expect(jobs[0].report_summary).toContain("Raport wniosku");
  expect(jobs[0].report_summary).toContain("Poszycie i deskowanie dachu: Inne poszycie — opisz — Deski impregnowane o grubości 25 mm");
  expect(jobs[0].report_summary).toContain("Warstwa wstępnego krycia dachu: Wysokoparoprzepuszczalna membrana dachowa");
  expect(jobs[0].report_summary).toContain("Płaska blacha łączona na rąbek lub zwoje");
  expect(jobs[0].report_summary).toContain("System blachy płaskiej / rąbka: Rąbek stojący podwójny");
  expect(jobs[0].report_summary).toContain("Sposób obróbki komina: Obróbka z fartuchami");
  expect(jobs[0].report_summary).toContain("Materiał obróbki komina: Blacha cynkowo-tytanowa");
  expect(jobs[0].report_summary).toContain("System rynnowy: Rynna ukryta / gzymsowa");
  expect(jobs[0].report_summary).toContain("Rury spustowe i odprowadzenie wody: Ukryte rury spustowe");
  expect(jobs[0].report_summary).toContain("Posadzki i wykończenie podłóg: Płytki ceramiczne / gres; Panele winylowe / LVT");
  expect(jobs[0].report_summary).toContain("Ściany wewnętrzne — wykończenie: Gładź i farba wewnętrzna; Płytki ceramiczne / gres ścienny");
  const savedRenovationSelections = JSON.parse(jobs[0].materials);
  expect(savedRenovationSelections.renovationKitchenFitout).toEqual(["kitchen-cabinets","kitchen-worktop"]);
  expect(savedRenovationSelections.renovationBathroomFitout).toEqual(["bathroom-shower","bathroom-basin-cabinet"]);
  expect(savedRenovationSelections.locationPin).toBeNull();
  expect(jobs[0].requirements).toContain("zgodnie z aktualną dokumentacją projektową");
  expect(jobs[0].acceptance_criteria).toContain("zasadami sztuki budowlanej");
  await page.reload();
  await expect(page.getByRole("heading", {name:"Remont mieszkania",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await expect(page.locator(".location-map-status")).toContainText("Google Maps: Testowa 2, Kraków, 30-001, Polska");
  const savedPhoto = page.getByAltText("Zapisane zdjęcie miejsca prac 1");
  await expect(savedPhoto).toBeVisible();
  await expect.poll(() => savedPhoto.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByLabel("Pomieszczenia do remontu")).toHaveValue("Kuchnia i łazienka");
  await page.getByRole("tab", {name:"Materiały i technologia"}).click();
  await expect(page.locator('[data-technology-stage="roofCovering"] .technology-select-trigger'))
    .toContainText("Płaska blacha łączona na rąbek lub zwoje");
  await expect(page.locator('[data-technology-stage="roofStandingSeamSystem"] .technology-select-trigger'))
    .toContainText("Rąbek stojący podwójny");
  await expect(page.locator('[data-technology-stage="roofChimneyFlashingMaterial"] .technology-select-trigger'))
    .toContainText("Blacha cynkowo-tytanowa");
  await expect(page.locator('[data-technology-stage="renovationKitchenFitout"]')).toHaveCount(0);
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await expect(page.getByRole("navigation", {name:"Etapy projektu"}).locator('[aria-current="step"]')).toContainText("Pomieszczenia i wykończenia");
  await page.getByRole("navigation", {name:"Etapy projektu"}).getByRole("button", {name:/Istniejący obiekt/}).click();
  await expect(page.getByText("Dane szczegółowe etapu i źródła pomiarów", {exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"Wróć do danych budowy",exact:true}).click();
  await page.getByRole("tab", {name:"Dane budowy"}).click();
  const other = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {auth:{persistSession:false}});
  const {error:loginError} = await other.auth.signInWithPassword({email:outsider.email,password});
  if (loginError) throw loginError;
  const prefix = `${owner.id}/${jobs[0].id}`;
  const {data:objects,error:listError} = await admin.storage.from("job-photos").list(prefix);
  if (listError) throw listError;
  expect(objects).toHaveLength(1);
  const {data:foreignObjects,error:foreignListError} = await other.storage.from("job-photos").list(prefix);
  if (foreignListError) throw foreignListError;
  expect(foreignObjects).toHaveLength(0);
  const {error:downloadError} = await other.storage.from("job-photos").download(`${prefix}/${objects[0].name}`);
  expect(downloadError).toBeTruthy();
  const {error:deleteError} = await other.storage.from("job-photos").remove([`${prefix}/${objects[0].name}`]);
  if (deleteError) throw deleteError;
  const {data:remaining,error:remainingError} = await admin.storage.from("job-photos").list(prefix);
  if (remainingError) throw remainingError;
  expect(remaining).toHaveLength(1);
  await page.getByRole("button", {name:"Usuń zapisane zdjęcie 1"}).click();
  await expect(savedPhoto).toHaveCount(0);
  await page.getByRole("button", {name:"Wróć do panelu",exact:true}).click();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await expect(page.getByAltText("Zapisane zdjęcie miejsca prac 1")).toHaveCount(0);
  await page.getByLabel("Rodzaj prac", {exact:true}).selectOption("extension");
  await expect(page.getByLabel("Powierzchnia istniejącego budynku (m²)", {exact:true})).toHaveCount(0);
  await page.getByLabel("Liczba kondygnacji", {exact:true}).fill("2");
  await fillTechnology(page, "extension");
  await page.getByLabel("Planowany termin", { exact: true }).fill("2026-12-10");
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await returnToPanelFromDocumentation(page);
  await expect(page.getByRole("heading", {name:"Remont mieszkania",exact:true})).toBeVisible();
  const {data:extension,error:extensionError} = await admin.from("construction_jobs").select("*").eq("id",jobs[0].id).single();
  if (extensionError) throw extensionError;
  expect(extension).toMatchObject({building_type:"extension",floors:2,rooms:""});
  expect(extension.requirements).toContain("zgodnie z aktualną dokumentacją projektową");
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByLabel("Rodzaj prac", {exact:true}).selectOption("other");
  await page.getByLabel("Kategoria prac", {exact:true}).fill("Kostka wokół domu i odwodnienie");
  const otherDescription = page.locator('textarea[name="description"]');
  await expect(otherDescription).toHaveAttribute("required", "");
  await otherDescription.fill("Ułożenie kostki wokół domu i wykonanie odwodnienia terenu.");
  await fillTechnology(page, "other");
  await page.getByLabel("Planowany termin", { exact: true }).fill("2026-12-20");
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  const pavingEditor = page.locator(".cad-editor");
  const pavingCanvas = pavingEditor.getByRole("img", {name:/Płótno projektu/});
  await expect(pavingEditor.getByRole("button", {name:"Pole nawierzchni",exact:true})).toBeVisible();
  await expect(pavingEditor.getByRole("button", {name:"Połać dachu",exact:true})).toHaveCount(0);
  await pavingEditor.getByRole("button", {name:"Pole nawierzchni",exact:true}).click();
  await pavingCanvas.scrollIntoViewIfNeeded();
  const pavingBox = await pavingCanvas.boundingBox();
  for (const [x,y] of [[.2,.4],[.6,.4],[.6,.7],[.2,.7]]) {
    await page.mouse.click(pavingBox.x+pavingBox.width*x,pavingBox.y+pavingBox.height*y);
  }
  await pavingEditor.getByRole("button", {name:"Zamknij obrys (4)",exact:true}).click();
  await pavingEditor.getByLabel("Grubość (mm)", {exact:true}).fill("80");
  await pavingEditor.getByLabel("Grubość (mm)", {exact:true}).press("Tab");
  await expect(pavingEditor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.getByRole("navigation", {name:"Etapy projektu"}).getByRole("button", {name:/Elewacja/}).click();
  await expect(pavingEditor.getByRole("button", {name:"Pole elewacji",exact:true})).toBeVisible();
  await expect(pavingEditor.getByRole("button", {name:"Ława fundamentowa",exact:true})).toHaveCount(0);
  await returnToPanelFromDocumentation(page);
  await expect(page.getByRole("heading", {name:"Remont mieszkania",exact:true})).toBeVisible();
  const {data:otherJob,error:otherError} = await admin.from("construction_jobs").select("*").eq("id",jobs[0].id).single();
  if (otherError) throw otherError;
  expect(otherJob).toMatchObject({building_type:"other",floors:null,basement:null,work_category:"Kostka wokół domu i odwodnienie"});
  const otherSelections = JSON.parse(otherJob.materials);
  expect(otherSelections.otherWorkTechnology).toEqual([
    "driveway-paving",
    "site-drainage",
    "foundation-construction",
    "roof-structure",
    "roof-covering",
    "facade-work",
  ]);
  expect(otherJob.description).toBe("Ułożenie kostki wokół domu i wykonanie odwodnienia terenu.");
  expect(otherSelections.otherDrivewaySurface).toEqual(["paving-resin-gravel","paving-concrete-block","paving-natural-stone"]);
  expect(otherJob.report_summary).toContain("Podjazd, ścieżki i nawierzchnie");
  expect(otherJob.report_summary).toContain("Zakres: Ułożenie kostki wokół domu i wykonanie odwodnienia terenu.");
  expect(otherJob.report_summary).toContain("Rodzaj nawierzchni: Nawierzchnia żywiczno-żwirowa; Kostka betonowa brukowa; Kostka lub bruk z kamienia naturalnego");
  expect(otherJob.report_summary).toContain("System nawierzchni żywiczno-żwirowej: Kruszywo związane żywicą — system przepuszczalny");
  expect(otherJob.report_summary).toContain("Przygotowanie elewacji: Czyszczenie i gruntowanie podłoża");
  expect(otherJob.report_summary).toContain("Materiał i sposób ocieplenia fasady: Styropian biały EPS fasadowy");
  expect(otherJob.report_summary).toContain("Warstwa zbrojona siatką: Jedna warstwa siatki zatopionej w zaprawie; Wzmocnienia diagonalne przy narożach otworów");
  expect(otherJob.report_summary).toContain("Kolor i faktura elewacji: Biały / złamana biel");
  expect(otherJob.report_summary).toContain("Warstwa elewacyjna: Tynk cienkowarstwowy w systemie ocieplenia");
  expect(otherJob.report_summary).toContain("System odwodnienia / drenażu:");
  await page.reload();
  await expect(page.getByRole("heading", {name:"Remont mieszkania",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("tab", {name:"Materiały i technologia"}).click();
  await expect(page.locator('[data-technology-stage="otherWorkTechnology"] .technology-select-trigger'))
    .toContainText("Podjazd, ścieżki i nawierzchnie");
  await expect(page.locator('[data-technology-stage="otherWorkTechnology"] .technology-select-trigger'))
    .toContainText("Fasada / elewacja");
  await expect(page.locator('[data-technology-stage="otherFoundationReinforcement"] .technology-select-trigger'))
    .toContainText("Gotowe kosze / szkielety zbrojeniowe");
  await expect(page.locator('[data-technology-stage="otherRoofCovering"] .technology-select-trigger'))
    .toContainText("Blachodachówka");
  await expect(page.locator('[data-technology-stage="otherFacadeColor"] .technology-select-trigger'))
    .toContainText("Biały / złamana biel");
  await expect(page.locator('[data-technology-stage="otherDrivewaySurface"] .technology-select-trigger'))
    .toContainText("Kostka betonowa brukowa");
  const categories = page.locator('[data-technology-stage="otherWorkTechnology"]');
  await categories.locator(".technology-select-trigger").click();
  for (const label of [
    "Podjazd, ścieżki i nawierzchnie", "Odwodnienie terenu / drenaż",
    "Fundamenty, ławy, płyta fundamentowa i zbrojenie",
    "Konstrukcja dachu / więźba dachowa", "Fasada / elewacja",
  ]) {
    await categories.getByRole("option", {name:label,exact:true}).click();
  }
  await categories.locator(".technology-select-trigger").click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  const steps = page.getByRole("navigation", {name:"Etapy projektu"});
  await expect(steps.getByRole("button")).toHaveCount(1);
  await expect(steps.locator('[aria-current="step"]')).toContainText("Dach");
  await expect(page.getByLabel("Etap dokumentacji", {exact:true})).toHaveCount(0);
  await expect(page.locator(".cad-editor").getByRole("button", {name:"Połać dachu",exact:true})).toBeVisible();
  await expect(page.locator(".cad-editor").getByRole("button", {name:"Ława fundamentowa",exact:true})).toHaveCount(0);
  await expect(page.locator(".cad-drawing-progress")).not.toContainText("fundamentów");
  await returnToPanelFromDocumentation(page);
});

test("client goes straight to construction, dashboard on next login and adds another job", async ({ page }) => {
  const account = await createAccount();
  await login(page, account.email);
  await expect(page.locator(".account-type-card")).toHaveCount(3);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.locator(".account-type-card").evaluateAll((cards) => {
      return {
        sameRow: cards.every((card) => card.offsetTop === cards[0].offsetTop),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        nestedButtons: cards.some((card) => !!card.querySelector("button")),
      };
    });

    expect(result).toEqual({ sameRow: true, overflow: false, nestedButtons: false });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".account-type-card.type-client .account-type-art").click();
  await expect(page.getByRole("heading", { name: "Opowiedz nam o swojej budowie" })).toBeVisible();
  await expect(page.getByText("Utwórz organizację", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("client-construction.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const checkbox = await page.getByRole("checkbox", { name: "Budynek z piwnicą" }).boundingBox();
  expect(checkbox.width).toBeLessThanOrEqual(20);
  expect(checkbox.height).toBeLessThanOrEqual(20);
  await page.screenshot({ path: test.info().outputPath("client-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fillConstruction(page, "Pierwsza budowa");
  const {data:constructionJobs,error:constructionError} = await admin.from("construction_jobs").select("materials,report_summary").eq("client_id",account.id);
  if (constructionError) throw constructionError;
  const savedTechnology = JSON.parse(constructionJobs[0].materials);
  expect(savedTechnology.foundationType).toEqual(["strip-footings","foundation-slab"]);
  expect(savedTechnology.completionStandard).toBe("turnkey");
  expect(savedTechnology.interiorFloorFinish).toEqual(["finish-floor-tile","finish-floor-engineered-wood"]);
  expect(savedTechnology.interiorWallFinish).toEqual(["finish-wall-paint","finish-wall-tile"]);
  expect(savedTechnology.stairFinish).toEqual(["stair-finish-wood","stair-railing-metal"]);
  expect(savedTechnology.exteriorFacadeFinish).toEqual(["facade-finish-thin-coat-render","facade-finish-brick-slip"]);
  expect(constructionJobs[0].report_summary).toContain("Sposób posadowienia: Ławy fundamentowe żelbetowe; Płyta fundamentowa żelbetowa");
  expect(constructionJobs[0].report_summary).toContain("Wykończenie podłóg: Płytki ceramiczne / gres; Deska warstwowa / parkiet");
  expect(constructionJobs[0].report_summary).toContain("Wykończenie ścian wewnętrznych: Gładź i malowanie; Płytki ceramiczne / gres");
  expect(constructionJobs[0].report_summary).toContain("Konstrukcja schodów: Schody żelbetowe monolityczne, wylewane na budowie");
  expect(constructionJobs[0].report_summary).toContain("Instalacja wodno-kanalizacyjna: System kanalizacji wewnętrznej z rur tworzywowych");
  expect(constructionJobs[0].report_summary).toContain("Wykończenie elewacji: Tynk cienkowarstwowy w systemie ocieplenia; Płytki klinkierowe / cegła elewacyjna");
  expect(constructionJobs[0].report_summary).toContain("Zakładany etap zakończenia budowy: Pod klucz");
  expect(constructionJobs[0].report_summary).toContain("Pokrycie dachowe: Blachodachówka modułowa lub cięta na wymiar");
  expect(constructionJobs[0].report_summary).toContain("Profil i kształt blachodachówki: Blachodachówka modułowa, krótkie arkusze");
  await page.getByRole("button", { name: "Edytuj", exact: true }).click();
  await page.getByLabel("Nazwa budowy", { exact: true }).fill("Pierwsza budowa po edycji");
  await page.getByRole("button", { name: "Przejdź dalej", exact: true }).click();
  await returnToPanelFromDocumentation(page);
  await expect(page.getByRole("heading", { name: "Pierwsza budowa po edycji" })).toBeVisible();
  await page.getByRole("button", { name: "Opublikuj", exact: true }).click();
  await expect(page.getByText("Opublikowane", { exact: true })).toBeVisible();
  await signout(page);
  await login(page, account.email);
  await expect(page.getByRole("heading", { name: "Twoje budowy i zlecenia" })).toBeVisible();
  await page.getByRole("button", { name: "+ Nowe zlecenie", exact: true }).click();
  await fillConstruction(page, "Druga budowa");
  await expect(page.locator(".job-card")).toHaveCount(2);
  const { data, error } = await admin.from("organizations").select("id").eq("created_by", account.id);
  if (error) throw error;
  expect(data).toHaveLength(0);
});

test("stage canvas draws, edits, undoes, autosaves and imports AI proposal with calibration", async ({ page, request }) => {
  const owner = await createAccount();
  const outsider = await createAccount();
  await page.setViewportSize({width:1440,height:1000});
  await login(page, owner.email);
  await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page, "Projekt CAD E2E");
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  const editor = page.locator(".cad-editor");
  const canvas = editor.getByRole("img", {name:/Płótno projektu/});
  await expect(canvas).toBeVisible();
  await editor.getByRole("button", {name:"Ława fundamentowa",exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Brak płótna.");
  await page.mouse.move(box.x + 80, box.y + 130);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 130);
  await page.mouse.up();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(1);
  await editor.getByRole("button", {name:"Cofnij",exact:true}).click();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(0);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await expect(page.locator(".cad-drawing-progress button").first()).toHaveAttribute("data-completion","empty");
  await editor.getByRole("button", {name:"Ponów",exact:true}).click();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(1);
  await editor.locator(".cad-element-list button").first().click();
  await page.route("**/api/cad/drawings", (route) => route.fulfill({
    status:503,contentType:"application/json",body:JSON.stringify({error:"Test CAD save failure"}),
  }));
  await editor.getByLabel("Szerokość (mm)", {exact:true}).fill("800");
  await editor.getByLabel("Szerokość (mm)", {exact:true}).press("Tab");
  await expect(editor.getByRole("alert")).toContainText("Test CAD save failure");
  await expect(page.getByRole("tab", {name:"Detale zbrojenia i zestawienie prętów",exact:true})).toBeDisabled();
  await page.unroute("**/api/cad/drawings");
  await editor.getByRole("button", {name:"Ponów zapis rysunku",exact:true}).click();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:jobs,error:jobError} = await admin.from("construction_jobs").select("*").eq("client_id",owner.id);
  if (jobError) throw jobError;
  const job = jobs[0];
  const {data:stored,error:cadError} = await admin.from("cad_drawings").select("*").eq("job_id",job.id).single();
  if (cadError) throw cadError;
  expect(stored.payload.entities[0].attributes.widthMm).toBe(800);
  const token = await tokenFor(owner.email);
  const drawing = stored.payload;
  const unauthorized = await request.post("/api/cad/drawings", {data:drawing});
  expect(unauthorized.status()).toBe(401);
  const foreign = await request.post("/api/cad/drawings", {data:drawing,headers:{Authorization:`Bearer ${await tokenFor(outsider.email)}`}});
  expect(foreign.status()).toBe(403);
  const stale = await request.post("/api/cad/drawings", {data:{...drawing,revision:0},headers:{Authorization:`Bearer ${token}`}});
  expect(stale.status()).toBe(409);
  const invalidStage = await request.post("/api/cad/drawings", {data:{...drawing,requirementId:"unknown-drawing-0"},headers:{Authorization:`Bearer ${token}`}});
  expect(invalidStage.status()).toBe(400);
  const scanInput = {projectId:job.id,requirementId:"foundation-drawing-0",sourceId:randomUUID(),consent:true};
  expect((await request.post("/api/cad/scan", {data:scanInput})).status()).toBe(401);
  expect((await request.post("/api/cad/scan", {data:scanInput,headers:{Authorization:`Bearer ${await tokenFor(outsider.email)}`}})).status()).toBe(403);
  expect((await request.post("/api/cad/scan", {data:{...scanInput,consent:false},headers:{Authorization:`Bearer ${token}`}})).status()).toBe(400);
  const keyResponse = await request.put("/api/ai/key", {data:{key:`sk-test-${"A".repeat(30)}`},headers:{Authorization:`Bearer ${token}`}});
  expect(keyResponse.status()).toBe(200);
  const {data:credential,error:keyError} = await admin.from("ai_user_credentials").select("*").eq("user_id",owner.id).single();
  if (keyError) throw keyError;
  expect(credential.encrypted_key).not.toContain("sk-test");
  const ownClient = createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
  await ownClient.auth.signInWithPassword({email:owner.email,password});
  const forbiddenKeyRead = await ownClient.from("ai_user_credentials").select("*");
  expect(forbiddenKeyRead.error).toBeTruthy();

  await page.reload();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(1);
  await editor.locator(".cad-element-list button").first().click();
  await expect(editor.getByLabel("Szerokość (mm)", {exact:true})).toHaveValue("800");
  await editor.getByRole("button", {name:"Otwór w płycie / polu",exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();
  const polygonBox = await canvas.boundingBox();
  for (const [x,y] of [[70,260],[200,260],[200,360],[70,360]]) {
    await page.mouse.click(polygonBox.x+x,polygonBox.y+y);
  }
  const polygonPoints = await canvas.locator("circle").evaluateAll((circles) => circles.map((circle) => ({
    x:Number(circle.getAttribute("cx")),y:Number(circle.getAttribute("cy")),
  })));
  expect(polygonPoints).toHaveLength(4);
  expect(polygonPoints[0].x).toBe(polygonPoints[3].x);
  expect(polygonPoints[0].y).toBe(polygonPoints[1].y);
  expect(polygonPoints[1].x).toBe(polygonPoints[2].x);
  expect(polygonPoints[2].y).toBe(polygonPoints[3].y);
  expect(polygonPoints[0].x).not.toBe(polygonPoints[1].x);
  expect(polygonPoints[0].y).not.toBe(polygonPoints[3].y);
  await editor.getByRole("button", {name:"Zamknij obrys (4)",exact:true}).click();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(2);
  await expect(editor.locator(".cad-inspector")).toContainText("Pole rzutu roboczego");
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const download = page.waitForEvent("download");
  await editor.getByRole("button", {name:"Eksport SVG",exact:true}).click();
  expect((await download).suggestedFilename()).toBe("foundation-drawing-0.svg");
  await page.getByRole("tab", {name:"Detale zbrojenia i zestawienie prętów",exact:true}).click();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(0);
  await editor.getByRole("button", {name:"Pręt zbrojeniowy",exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();
  const rebarBox = await canvas.boundingBox();
  await page.mouse.move(rebarBox.x + 80,rebarBox.y + 200); await page.mouse.down();
  await page.mouse.move(rebarBox.x + 300,rebarBox.y + 200); await page.mouse.up();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(1);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.getByRole("tab", {name:"Rzut fundamentów z osiami i wymiarami",exact:true}).click();
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(2);
  await expect(editor.getByRole("button", {name:/Skanuj lub importuj projekt/})).toBeEnabled();
  await editor.getByRole("button", {name:/Skanuj lub importuj projekt/}).click();
  const dialog = page.getByRole("dialog", {name:"Skanuj lub importuj projekt"});
  await expect(dialog.getByRole("button", {name:"Skanuj i narysuj z AI"})).toBeDisabled();
  const pixel = Buffer.from(await page.evaluate(() => {
    const image = document.createElement("canvas"); image.width = 1000; image.height = 800;
    const context = image.getContext("2d");
    context.fillStyle="white"; context.fillRect(0,0,1000,800);
    context.strokeStyle="#333"; context.lineWidth=3; context.strokeRect(100,100,500,400);
    return image.toDataURL("image/png").split(",")[1];
  }),"base64");
  await dialog.getByLabel("Projekt PDF lub zdjęcie").setInputFiles({name:"plan.png",mimeType:"image/png",buffer:pixel});
  await dialog.getByRole("checkbox").check();
  await page.route("**/api/cad/scan", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.consent).toBe(true);
    expect(input.requirementId).toBe("foundation-drawing-0");
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      sourceImage:{id:input.sourceId,storagePath:`${owner.id}/${job.id}/${input.sourceId}.png`,widthPx:1000,heightPx:800,mmPerPixel:1},
      entities:[{id:randomUUID(),layerId:input.requirementId,units:"mm",reviewStatus:"draft",kind:"trace-line",
        source:{documentId:input.sourceId,page:1,origin:"openai",confidence:0.85},
        geometry:{start:{x:100,y:100},end:{x:600,y:100}},attributes:{label:"Obrys ławy"}}],
      warnings:["Testowa propozycja, nie wynik rzeczywistej analizy AI."],
    })});
  });
  await dialog.getByRole("button", {name:"Skanuj i narysuj z AI"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas.locator("[data-entity-id]")).toHaveCount(1);
  await expect(editor.getByRole("status")).toContainText("Skan bez skali");
  await editor.locator(".cad-element-list button").click();
  await expect(editor.locator(".cad-inspector")).toContainText("85% pewności");
  await editor.getByRole("button", {name:"Ustaw skalę skanu",exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();
  const importedView = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
  const importedBox = await canvas.boundingBox();
  const screen = (x,y) => ({x:importedBox.x+(x-importedView[0])/importedView[2]*importedBox.width,
    y:importedBox.y+(y-importedView[1])/importedView[3]*importedBox.height});
  const start=screen(100,100), end=screen(600,100);
  await page.mouse.click(start.x,start.y); await page.mouse.click(end.x,end.y);
  await editor.getByLabel("Znana odległość (mm)", {exact:true}).fill("5000");
  await editor.getByRole("button", {name:"Zastosuj skalę",exact:true}).click();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await expect(editor.getByRole("status")).not.toContainText("Skan bez skali");
  const {data:calibrated,error:calibrationError} = await admin.from("cad_drawings").select("*")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if (calibrationError) throw calibrationError;
  expect(calibrated.payload.sourceImage.mmPerPixel).toBeCloseTo(10,5);
  expect(Math.abs(calibrated.payload.entities[0].geometry.end.x-6000)).toBeLessThan(0.01);
  expect(calibrated.payload.entities[0].reviewStatus).toBe("draft");
  await editor.locator(".cad-element-list button").click();
  await editor.getByLabel("Klasyfikacja rozpoznanego elementu", {exact:true}).selectOption("footing");
  await expect(editor.getByLabel("Szerokość (mm)", {exact:true})).toBeVisible();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:classified,error:classificationError} = await admin.from("cad_drawings").select("payload")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if (classificationError) throw classificationError;
  expect(classified.payload.entities[0].kind).toBe("footing");
  expect(classified.payload.entities[0].source.origin).toBe("openai");
  await page.screenshot({path:test.info().outputPath("stage-canvas-desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({path:test.info().outputPath("stage-canvas-mobile.png"),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await editor.getByRole("button", {name:/Skanuj lub importuj projekt/}).click();
  await dialog.getByLabel("Projekt PDF lub zdjęcie").setInputFiles({name:"foundation.pdf",mimeType:"application/pdf",buffer:planPdfFixture()});
  await expect(dialog.getByLabel("Strona PDF", {exact:true})).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", {name:"Skanuj i narysuj z AI"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await expect(editor.getByRole("status")).toContainText("Skan bez skali");
  const {data:scanFiles,error:scanListError} = await admin.storage.from("project-scans").list(`${owner.id}/${job.id}`);
  if (scanListError) throw scanListError;
  expect(scanFiles.some(({name}) => name.endsWith("-original.pdf"))).toBe(true);
  await expect(canvas.locator("image")).toHaveCount(1);
  page.once("dialog",(dialog)=>dialog.accept());
  await editor.getByRole("button",{name:"Wyczyść canvas",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(0);
  await expect(canvas.locator("image")).toHaveCount(0);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:cleared,error:clearError}=await admin.from("cad_drawings").select("payload")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if(clearError)throw clearError;
  expect(cleared.payload.entities).toHaveLength(0);
  expect(cleared.payload.sourceImage??null).toBeNull(); expect(cleared.payload.calibration).toBeNull();
  await editor.getByRole("button",{name:"Cofnij",exact:true}).click();
  await expect(canvas.locator(".cad-entity")).toHaveCount(1);
  await expect(canvas.locator("image")).toHaveCount(1);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await returnToPanelFromDocumentation(page);
});
test("scoped CAD workspace zooms, joins corners, shows layers, reuses plans and keeps reinforcement stage-based", async ({ page, request }) => {
  test.setTimeout(90000);
  const owner = await createAccount();
  await page.setViewportSize({width:1440,height:1100});
  await login(page, owner.email);
  await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page, "CAD narzędzia etapowe");
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  const editor = page.locator(".cad-editor");
  const canvas = editor.getByRole("img", {name:/Płótno projektu/});
  await expect(canvas).toBeVisible();
  await expect(editor.getByRole("button", {name:"Połać dachu",exact:true})).toHaveCount(0);
  await expect(editor.getByRole("button", {name:"Ściana fundamentowa",exact:true})).toBeVisible();
  const progress = page.getByRole("navigation", {name:"Etapy projektu"});
  await expect(progress.locator("button").first()).toHaveAttribute("data-completion","empty");
  const originalView = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);
  await page.mouse.wheel(0,-300);
  await expect.poll(async () => Number((await canvas.getAttribute("viewBox")).split(" ")[2])).toBeLessThan(originalView[2]);
  await expect(editor.locator(".cad-coordinates")).toContainText("X:");
  await expect(canvas.locator(".cad-rulers")).toHaveCount(1);
  await editor.getByRole("button", {name:"Dopasuj widok",exact:true}).click();
  async function draw(tool, from, to) {
    await editor.getByRole("button", {name:tool,exact:true}).click();
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox();
    const v = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
    const screen = (point) => ({x:rect.x+(point.x-v[0])/v[2]*rect.width,y:rect.y+(point.y-v[1])/v[3]*rect.height});
    const a = screen(from), b = screen(to);
    await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y); await page.mouse.up();
  }
  await draw("Ściana",{x:1000,y:1000},{x:6000,y:1000});
  await draw("Ściana",{x:6000,y:1000},{x:6000,y:5000});
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(2);
  await expect(canvas.locator(".cad-dimension line[stroke-dasharray]")).not.toHaveCount(0);
  await editor.locator(".cad-element-list button").first().click();
  await expect(canvas.locator(".cad-junction")).toHaveCount(2);
  await editor.getByLabel("Punkt 2 X (mm)", {exact:true}).fill("7000");
  await editor.getByLabel("Punkt 2 X (mm)", {exact:true}).press("Tab");
  await editor.getByText("Warstwy materiałowe / ocieplenie", {exact:true}).click();
  await editor.getByLabel("Materiał warstwy", {exact:true}).fill("XPS projektowy");
  await editor.getByLabel("Grubość warstwy (mm)", {exact:true}).fill("150");
  await editor.getByRole("button", {name:"Dodaj warstwę",exact:true}).click();
  await expect(canvas.locator('.cad-material-layer > polygon')).toHaveCount(2);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await expect(progress.locator("button").first()).toContainText("1/4 rysunków");
  await expect(page.getByRole("tab", {name:/Rzut fundamentów z osiami i wymiarami/})).toHaveAttribute("data-completion","saved");
  const {data:job,error:jobError} = await admin.from("construction_jobs").select("*").eq("client_id",owner.id).single();
  if (jobError) throw jobError;
  const {data:saved,error:saveError} = await admin.from("cad_drawings").select("*").eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if (saveError) throw saveError;
  expect(saved.payload.entities[0].geometry.end).toEqual(saved.payload.entities[1].geometry.start);
  expect(saved.payload.entities[0].buildUp[0].thicknessMm).toBe(150);
  const forbiddenRoof = {...saved.payload,entities:[{...saved.payload.entities[0],kind:"roof-plane",
    geometry:{vertices:[{x:0,y:0},{x:1000,y:0},{x:1000,y:1000}]},attributes:{pitchDegrees:30,material:"Dachówka"}}]};
  expect((await request.post("/api/cad/drawings",{data:forbiddenRoof,headers:{Authorization:`Bearer ${await tokenFor(owner.email)}`}})).status()).toBe(400);
  expect((await request.post("/api/cad/drawings",{data:{...forbiddenRoof,entities:forbiddenRoof.entities.map((entity) => ({
    ...entity,derivedFrom:{documentId:randomUUID(),entityId:randomUUID(),revision:1},
  }))},headers:{Authorization:`Bearer ${await tokenFor(owner.email)}`}})).status()).toBe(400);
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await expect(editor.getByRole("heading", {name:"Przekroje fundamentów i poziomy posadowienia",exact:true})).toBeVisible();
  await expect(editor.getByRole("button", {name:"Obrys / płyta",exact:true})).toHaveCount(0);
  await progress.getByRole("button", {name:/Parter/}).click();
  await expect(canvas).toBeVisible();
  await editor.getByText("Wykorzystaj wcześniejszy rysunek", {exact:true}).click();
  await editor.getByLabel("Rysunek źródłowy", {exact:true}).selectOption("foundation-drawing-0");
  await editor.getByRole("button", {name:"Dodaj kopię geometrii",exact:true}).click();
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(2);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await editor.locator(".cad-element-list button").first().click();
  await draw("Otwór w ścianie",{x:2200,y:1000},{x:3400,y:1000});
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(3);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.getByRole("tab", {name:"Przekroje oraz zestawienie ścian",exact:true}).click();
  await expect(canvas).toBeVisible();
  await editor.getByText("Wykorzystaj wcześniejszy rysunek", {exact:true}).click();
  await editor.getByLabel("Rysunek źródłowy", {exact:true}).selectOption("storey-0-drawing-0");
  await editor.getByRole("button", {name:"Rozwiń ściany z otworami",exact:true}).click();
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(3);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.getByRole("tab", {name:"Rzut stropu, detale konstrukcyjne i zbrojenie",exact:true}).click();
  await expect(canvas).toBeVisible();
  await expect(editor.getByRole("heading", {name:"Detale zbrojenia i zestawienie prętów",exact:true})).toBeVisible();
  await expect(editor.getByRole("button", {name:"Kreator zbrojenia belki / płyty",exact:true})).toHaveCount(0);
  await expect(editor.getByText("Brak rozpoznanych elementów konstrukcyjnych.", {exact:false})).toBeVisible();
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(3);
  const steps = page.getByRole("navigation", {name:"Kroki budowy"});
  await steps.getByRole("button", {name:"Materiały i technologia",exact:false}).click();
  await expect(page.getByRole("tab", {name:"Materiały i technologia",exact:true})).toHaveAttribute("aria-selected","true");
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await page.getByRole("tab", {name:"Rzut stropu, detale konstrukcyjne i zbrojenie",exact:true}).click();
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await page.getByRole("tab", {name:"Rzut stropu, detale konstrukcyjne i zbrojenie",exact:true}).click();
  await expect(canvas.locator("[data-entity-id].cad-entity")).toHaveCount(3);
  await expect(progress.locator('button[data-completion="saved"]')).toHaveCount(1);
  await page.screenshot({path:test.info().outputPath("specialized-cad-desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({path:test.info().outputPath("specialized-cad-mobile.png"),fullPage:true});
});
test("CAD smooth live drag, exterior dimensions and editable foundation rectangles persist", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:1100});
  const owner = await createAccount();
  await login(page, owner.email);
  await page.locator(".account-type-card.type-client").click();
  const title = `Prostokąt fundamentu ${randomUUID()}`;
  await fillConstruction(page, title);
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  const editor = page.locator(".cad-editor");
  const canvas = editor.getByRole("img", {name:/Płótno projektu/});
  const progress = page.getByRole("navigation", {name:"Etapy projektu"});
  await expect(page.getByLabel("Etap dokumentacji", {exact:true})).toHaveCount(0);
  await expect(page.getByRole("tab", {name:"Fundamenty",exact:true})).toHaveCount(0);
  await expect(progress.locator("button").first()).toContainText("Fundamenty");
  await expect(editor.getByRole("button", {name:"Płyta fundamentowa / denna",exact:true})).toBeVisible();
  await editor.getByRole("button", {name:"Ściana",exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const worldToScreen = async (point) => {
    await canvas.scrollIntoViewIfNeeded();
    const currentBox = await canvas.boundingBox();
    const view = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
    return {x:currentBox.x + (point.x - view[0]) / view[2] * currentBox.width,
      y:currentBox.y + (point.y - view[1]) / view[3] * currentBox.height};
  };
  let start = await worldToScreen({x:1000,y:1500}), end = await worldToScreen({x:6000,y:1500});
  await page.mouse.move(start.x,start.y); await page.mouse.down();
  await page.mouse.move(end.x,end.y); await page.mouse.up();
  await expect(canvas.locator(".cad-exterior-dimensions")).toContainText("5240 mm");
  await editor.getByRole("button",{name:"Wymiary szczegółowe",exact:true}).click();
  await expect(canvas.locator(".cad-exterior-dimensions")).toContainText("240 mm");
  await editor.getByRole("button", {name:"Zaznacz / przesuń",exact:true}).click();
  const handle = canvas.locator(".cad-junction").first();
  const originalX = Number(await handle.getAttribute("cx"));
  const originalY = Number(await handle.getAttribute("cy"));
  const screen = await handle.boundingBox();
  const dragBox = await canvas.boundingBox();
  const view = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
  await page.mouse.move(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await page.mouse.down();
  await page.mouse.move(screen.x + screen.width / 2 + 1, screen.y + screen.height / 2 + 1);
  const firstX = Number(await handle.getAttribute("cx"));
  expect(firstX).toBeCloseTo(originalX + view[2] / dragBox.width,3);
  expect(firstX).not.toBe(originalX);
  await expect(progress.locator("button").first()).toBeDisabled();
  await page.mouse.move(screen.x + screen.width / 2 + 2, screen.y + screen.height / 2 + 2);
  const secondX = Number(await handle.getAttribute("cx"));
  expect(secondX).toBeCloseTo(originalX + 2 * view[2] / dragBox.width,3);
  expect(secondX).not.toBe(firstX);
  await page.mouse.up();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await editor.getByRole("button", {name:"Cofnij",exact:true}).click();
  await editor.locator(".cad-element-list button").first().click();
  await expect(handle).toHaveAttribute("cx",String(originalX));
  await expect(handle).toHaveAttribute("cy",String(originalY));
  await editor.getByRole("button", {name:"Ponów",exact:true}).click();
  await editor.locator(".cad-element-list button").first().click();
  await expect(handle).toHaveAttribute("cx",String(secondX));
  await editor.getByRole("button", {name:"Stopa fundamentowa",exact:true}).click();
  start = await worldToScreen({x:2000,y:2000}); end = await worldToScreen({x:3500,y:2500});
  await page.mouse.move(start.x,start.y); await page.mouse.down();
  await page.mouse.move(end.x,end.y);
  await expect(canvas.locator("polygon")).toHaveCount(2);
  await page.mouse.up();
  await expect(canvas.locator(".cad-entity .cad-solid-outline")).toHaveCount(2);
  await editor.getByLabel("Długość prostokąta (mm)",{exact:true}).fill("1800");
  await editor.getByLabel("Długość prostokąta (mm)",{exact:true}).press("Tab");
  await editor.getByLabel("Szerokość prostokąta (mm)",{exact:true}).fill("1200");
  await editor.getByLabel("Szerokość prostokąta (mm)",{exact:true}).press("Tab");
  await expect(canvas.locator(".cad-entity").last()).toContainText("1800 × 1200");
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:job,error} = await admin.from("construction_jobs").select("id").eq("title",title).single();
  if (error) throw error;
  const {data:row,error:readError} = await admin.from("cad_drawings").select("payload")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if (readError) throw readError;
  expect(row.payload.entities[0].geometry.start.x).toBeCloseTo(secondX,3);
  const vertices = row.payload.entities[1].geometry.vertices;
  expect(vertices[1].x - vertices[0].x).toBe(1800);
  expect(vertices[3].y - vertices[0].y).toBe(1200);
  await page.reload();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await expect(canvas.locator(".cad-entity").last()).toContainText("1800 × 1200");
});
test("foundation wall generates linked footing or closed slab and the host-bound reinforcement editor persists", async ({ page, request }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:1200});
  const owner = await createAccount(), title = `Fundament powiązany ${randomUUID()}`;
  await login(page, owner.email);
  await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page,title);
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("tab", {name:"Materiały i technologia",exact:true}).click();
  await selectTechnology(page,"foundationInsulation","foundation-xps","Płyty XPS");
  await selectTechnology(page,"foundationWaterproofing","kmb-coating","Grubowarstwowa masa");
  await selectTechnology(page,"foundationRingBeam","foundation-ring-beam-yes","Tak — wieniec górny");
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  const editor = page.locator(".cad-editor"), canvas = editor.getByRole("img", {name:/Płótno projektu/});
  await editor.getByRole("button", {name:"Ściana fundamentowa",exact:true}).click();
  await editor.getByLabel("Podparcie rysowanej ściany",{exact:true}).selectOption("strip");
  await editor.getByText("Opcjonalne odniesienie do dokumentacji",{exact:true}).click();
  for (const [label,value] of [
    ["Grubość ściany fundamentowej (mm)","240"],["Wysokość ściany fundamentowej (mm)","1000"],
    ["Materiał ściany fundamentowej","Bloczek betonowy"],["Rysunek fundamentów / pozycja","K-01"],
    ["Szerokość automatycznej ławy (mm)","800"],["Wysokość automatycznej ławy (mm)","400"],
    ["Grubość hydroizolacji ściany (mm)","4"],["Grubość ocieplenia ściany (mm)","100"],
  ]) await editor.getByLabel(label,{exact:true}).fill(value);
  await expect(editor.getByRole("button", {name:"Zastosuj do nowych ścian",exact:true})).toHaveCount(0);
  async function segment(a,b) {
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox(), view = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
    const point = (p) => ({x:rect.x+(p.x-view[0])/view[2]*rect.width,y:rect.y+(p.y-view[1])/view[3]*rect.height});
    const start = point(a), end = point(b);
    await page.mouse.move(start.x,start.y); await page.mouse.down(); await page.mouse.move(end.x,end.y); await page.mouse.up();
  }
  await segment({x:1000,y:1500},{x:6000,y:1500});
  await expect(canvas.locator(".cad-entity")).toHaveCount(2);
  await expect(canvas.locator(".cad-material-legend")).toContainText("XPS");
  await expect(canvas.locator('[data-purpose="thermal"]')).toContainText("100 mm");
  await expect(canvas.locator('[data-purpose="waterproofing"]')).toContainText("4 mm");
  await expect(canvas.locator(".cad-dimension")).toHaveCount(1);
  await editor.getByRole("button",{name:"Wymiary szczegółowe",exact:true}).click();
  await expect(canvas.locator(".cad-exterior-dimensions")).toContainText(["800 mm","240 mm"]);
  await expect(canvas.locator(".cad-overall-dimensions")).toContainText("5800 mm");
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const {data:job,error} = await admin.from("construction_jobs").select("id").eq("title",title).single();
  if (error) throw error;
  const {data:original,error:readError} = await admin.from("cad_drawings").select("payload")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if (readError) throw readError;
  const invalid = structuredClone(original.payload);
  invalid.entities.find((e) => e.kind === "footing").geometry.start.x += 10;
  const token = await tokenFor(owner.email);
  const denied = await request.post("/api/cad/drawings",{data:invalid,headers:{Authorization:`Bearer ${token}`}});
  expect(denied.status()).toBe(400);
  await editor.locator("summary").filter({hasText:"Dokumenty do fundamentów"}).click();
  await editor.getByLabel("Opinia / dokumentacja geotechniczna i warunki gruntowo-wodne",{exact:true}).fill("Opinia geotechniczna G-01");
  await editor.getByLabel("Opinia / dokumentacja geotechniczna i warunki gruntowo-wodne",{exact:true}).press("Tab");
  await editor.getByLabel("Podparcie rysowanej ściany",{exact:true}).selectOption("slab");
  for (const [label,value] of [
    ["Grubość automatycznej płyty (mm)","250"],["Wysunięcie płyty poza lico ściany (mm)","200"],["Beton płyty według projektu","C25/30"],
  ]) await editor.getByLabel(label,{exact:true}).fill(value);
  await expect(editor.locator(".cad-settings-status")).toContainText("Parametry gotowe");
  const corners = [{x:8000,y:1500},{x:10000,y:1500},{x:10000,y:3500},{x:8000,y:3500}];
  for (let i=0;i<3;i++) await segment(corners[i],corners[i+1]);
  await expect(canvas.locator(".cad-entity")).toHaveCount(5);
  await segment(corners[3],corners[0]);
  await expect(canvas.locator(".cad-entity")).toHaveCount(7);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.getByRole("tab", {name:"Detale zbrojenia i zestawienie prętów",exact:true}).click();
  await expect(editor.getByRole("heading", {name:"Detale zbrojenia i zestawienie prętów",exact:true})).toBeVisible();
  await expect(editor.getByRole("button",{name:"Kreator zbrojenia belki / płyty",exact:true})).toHaveCount(0);
  await expect(editor.locator(".cad-toolbar, .cad-tool-button")).toHaveCount(0);
  await expect(editor.locator(".cad-reinforcement-stage-canvas")).toBeVisible();
  const reinforcementStages = editor.getByRole("navigation",{name:"Etapy zbrojenia",exact:true});
  await expect(reinforcementStages.getByRole("button",{name:/Ławy fundamentowe/})).toHaveCount(1);
  await expect(reinforcementStages.getByRole("button",{name:/Ściany fundamentowe/})).toHaveCount(1);
  await expect(reinforcementStages.getByRole("button",{name:/Wieńce fundamentowe/})).toHaveCount(1);
  await reinforcementStages.getByRole("button",{name:/Ściany fundamentowe/}).click();
  const foundationWallElementCount = await editor.locator(".cad-reinforcement-stage-shape").count();
  await reinforcementStages.getByRole("button",{name:/Wieńce fundamentowe/}).click();
  await expect(editor.locator(".cad-reinforcement-stage-shape")).toHaveCount(foundationWallElementCount);
  await editor.locator(".cad-reinforcement-stage-picker button").first().click();
  const reinforcementDialog = editor.getByRole("dialog",{name:"Detale zbrojenia elementu",exact:true});
  await expect(reinforcementDialog).toBeVisible();
  await expect(reinforcementDialog.getByRole("tab",{name:"Rysunek 2D",exact:true})).toBeVisible();
  await expect(reinforcementDialog.getByRole("tab",{name:"Widok 3D",exact:true})).toBeVisible();
  const ringBeam = reinforcementDialog.getByRole("region",{name:"Wieniec górny ściany fundamentowej",exact:true});
  await expect(ringBeam.getByLabel("Szerokość wieńca (mm)",{exact:true})).toHaveValue("240");
  await ringBeam.getByLabel("Wysokość wieńca (mm)",{exact:true}).fill("250");
  await ringBeam.getByLabel("Materiał / beton wieńca",{exact:true}).fill("C25/30");
  await ringBeam.getByLabel("Numer rysunku konstrukcyjnego",{exact:true}).fill("K-04");
  await ringBeam.getByRole("button",{name:"Dodaj wieniec górny",exact:true}).click();
  await ringBeam.getByRole("button",{name:"Otwórz zbrojenie wieńca",exact:true}).click();
  await expect(reinforcementDialog.getByRole("button",{name:"Wróć do ściany fundamentowej",exact:true})).toBeVisible();
  await reinforcementDialog.getByRole("button",{name:"Edytuj pręty",exact:true}).click();
  const customBar = reinforcementDialog.locator(".cad-custom-bar-editor");
  await customBar.getByLabel("Gatunek stali",{exact:true}).fill("B500");
  await customBar.getByLabel("Numer rysunku konstrukcyjnego",{exact:true}).fill("K-04");
  await reinforcementDialog.getByRole("button",{name:"Dodaj pręt do elementu",exact:true}).click();
  await expect(reinforcementDialog.locator(".cad-reinforcement-3d svg")).toBeVisible();
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  await page.screenshot({path:test.info().outputPath("reinforcement-element-editor.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await reinforcementDialog
    .evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.screenshot({path:test.info().outputPath("reinforcement-element-editor-mobile.png"),fullPage:true});
  await page.setViewportSize({width:1440,height:1200});
  const {data:result,error:resultError} = await admin.from("cad_drawings").select("payload")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-2").single();
  if (resultError) throw resultError;
  expect(result.payload.documentReferences.geotechnics).toBe("Opinia geotechniczna G-01");
  const topRingBeam = result.payload.entities.find((entity) => entity.kind === "construction-line"
    && entity.attributes.role === "ring-beam" && entity.relatedTo?.length);
  expect(topRingBeam.attributes).toMatchObject({widthMm:240,heightMm:250,material:"C25/30",designReference:"K-04"});
  const bar = result.payload.entities.find((entity) => entity.kind === "rebar-line");
  expect(bar.placement.hostId).toBe(topRingBeam.id);
  expect(bar.attributes).toMatchObject({diameterMm:12,steelGrade:"B500",designReference:"K-04"});
  expect(bar.shape.bends).toHaveLength(1);
  await reinforcementDialog.getByRole("button",{name:"Zamknij detale",exact:true}).click();
  await page.reload();
  await page.getByRole("button", {name:"Edytuj",exact:true}).click();
  await page.getByRole("button", {name:"Przejdź dalej",exact:true}).click();
  await page.getByRole("tab", {name:"Detale zbrojenia i zestawienie prętów",exact:true}).click();
  await reinforcementStages.getByRole("button",{name:/Wieńce fundamentowe/}).click();
  await editor.locator(".cad-reinforcement-stage-picker button").first().click();
  await ringBeam.getByRole("button",{name:"Otwórz zbrojenie wieńca",exact:true}).click();
  await reinforcementDialog.getByRole("tab",{name:"Pręty i edycja",exact:true}).click();
  await expect(reinforcementDialog.locator(".cad-reinforcement-bar")).toHaveCount(1);
  await expect(editor.getByLabel("Punkt 1 X (mm)",{exact:true})).toHaveCount(0);
});
test("CAD connects nearby wall corners and T joints, preserves shared movement and expands workspace", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:1000});
  const owner = await createAccount(), title = `Połączony obrys ${randomUUID()}`;
  await login(page,owner.email);
  await page.locator(".account-type-card.type-client").click();
  await fillConstruction(page,title);
  await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("tab",{name:"Materiały i technologia",exact:true}).click();
  await selectTechnology(page,"foundationWalls","shuttering-block-24","Bloczki szalunkowe zalewane betonem (24 cm)");
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  const editor = page.locator(".cad-editor"), canvas = editor.getByRole("img",{name:/Płótno projektu/});
  await editor.getByRole("button",{name:"Ściana fundamentowa",exact:true}).click();
  await expect(editor.getByLabel("Grubość ściany fundamentowej (mm)",{exact:true})).toHaveValue("240");
  await expect(editor.getByLabel("Materiał ściany fundamentowej",{exact:true})).toHaveValue("Bloczki szalunkowe zalewane betonem (24 cm)");
  const widthInput = editor.getByLabel("Grubość ściany fundamentowej (mm)",{exact:true});
  await widthInput.fill("300"); await expect(widthInput).toHaveValue("300");
  await editor.getByRole("button",{name:"Ściana",exact:true}).click();
  await editor.getByLabel("Skok przyciągania (mm, 0 = bez siatki)",{exact:true}).fill("0");
  await expect(editor.getByLabel("Grubość nowej ściany (mm)",{exact:true})).toHaveValue("240");
  const screen = async (p) => {
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox(), view = (await canvas.getAttribute("viewBox")).split(" ").map(Number);
    return {x:rect.x+(p.x-view[0])/view[2]*rect.width,y:rect.y+(p.y-view[1])/view[3]*rect.height};
  };
  const segment = async (a,b) => {
    const p = await screen(a), q = await screen(b);
    await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(q.x,q.y); await page.mouse.up();
  };
  await segment({x:1000,y:1500},{x:5000,y:1500});
  await segment({x:5200,y:2000},{x:5000,y:4500});
  await editor.getByRole("button",{name:"Zaznacz / przesuń",exact:true}).click();
  await editor.locator(".cad-element-list button").nth(1).click();
  const aEnd = canvas.locator('.cad-entity[data-role="wall"]').first();
  const bWall = canvas.locator('.cad-entity[data-role="wall"]').nth(1);
  const readSegment = (element) => element.locator(".cad-solid-outline").getAttribute("points");
  await canvas.scrollIntoViewIfNeeded();
  const handle = canvas.locator(".cad-junction").first();
  const grip = await handle.boundingBox(), corner = await screen({x:5000,y:1500});
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2); await page.mouse.down();
  await page.mouse.move(corner.x+7,corner.y+3);
  await expect(canvas.locator(".cad-snap-target")).toHaveCount(1);
  expect(Number(await handle.getAttribute("cx"))).toBeCloseTo(5000,3);
  expect(Number(await handle.getAttribute("cy"))).toBeCloseTo(1500,3);
  await page.mouse.up();
  await expect(canvas.locator(".cad-snap-target")).toHaveCount(0);
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const connectedBeforeA = await readSegment(aEnd), connectedBeforeB = await readSegment(bWall);
  const newGrip = await handle.boundingBox();
  await page.mouse.move(newGrip.x+newGrip.width/2,newGrip.y+newGrip.height/2); await page.mouse.down();
  await page.mouse.move(newGrip.x+newGrip.width/2+30,newGrip.y+newGrip.height/2+20);
  expect(await readSegment(aEnd)).not.toBe(connectedBeforeA);
  expect(await readSegment(bWall)).not.toBe(connectedBeforeB);
  await page.mouse.up();
  await editor.getByRole("button",{name:"Cofnij",exact:true}).click();
  await expect(aEnd.locator(".cad-solid-outline")).toHaveAttribute("points",connectedBeforeA);
  await expect(bWall.locator(".cad-solid-outline")).toHaveAttribute("points",connectedBeforeB);
  await editor.getByRole("button",{name:"Ściana",exact:true}).click();
  await segment({x:5000,y:4500},{x:1000,y:4500});
  const p = await screen({x:1000,y:4500}), q = await screen({x:1000,y:1500});
  await page.mouse.move(p.x+5,p.y+2); await page.mouse.down();
  await page.mouse.move(q.x+6,q.y+2);
  await expect(canvas.locator(".cad-snap-target")).toHaveCount(1);
  await page.mouse.up();
  await expect(canvas.locator('.cad-entity[data-role="wall"]')).toHaveCount(4);
  await segment({x:3000,y:3500},{x:3000,y:1500});
  await expect(canvas.locator('.cad-entity[data-role="wall"]')).toHaveCount(6);
  await editor.getByRole("button",{name:"Stopa fundamentowa",exact:true}).click();
  await segment({x:2000,y:2500},{x:2600,y:3000});
  await editor.getByRole("button",{name:"Wykop",exact:true}).click();
  await segment({x:3500,y:2500},{x:4200,y:3500});
  await expect(editor.getByLabel("Głębokość wykopu (mm)",{exact:true})).toBeVisible();
  const wallFill = await canvas.locator('.cad-entity[data-role="wall"] .cad-solid-outline').first().getAttribute("fill");
  const padFill = await canvas.locator('.cad-entity[data-role="pad"] .cad-solid-outline').getAttribute("fill");
  const excavationFill = await canvas.locator('.cad-entity[data-role="excavation"] .cad-solid-outline').getAttribute("fill");
  expect(new Set([wallFill,padFill,excavationFill]).size).toBe(3);
  await expect(editor.getByLabel("Kolory elementów",{exact:true})).toContainText("Wykop");
  await expect(editor.getByRole("status")).toContainText("Rysunek zapisany automatycznie");
  const rect = await canvas.boundingBox(), options = await editor.getByLabel("Ustawienia pod płótnem",{exact:true}).boundingBox();
  expect(rect.width).toBeGreaterThan(1250);
  expect(rect.height).toBeGreaterThanOrEqual(640);
  expect(options.y).toBeGreaterThan(rect.y+rect.height);
  const {data:job,error} = await admin.from("construction_jobs").select("id").eq("title",title).single();
  if (error) throw error;
  const {data:row,error:readError} = await admin.from("cad_drawings").select("payload")
    .eq("job_id",job.id).eq("requirement_id","foundation-drawing-0").single();
  if (readError) throw readError;
  const walls = row.payload.entities.filter((e) => e.kind === "wall");
  const at = (p,x,y) => Math.abs(p.x-x)<.001 && Math.abs(p.y-y)<.001;
  expect(walls.filter((w) => at(w.geometry.start,5000,1500) || at(w.geometry.end,5000,1500))).toHaveLength(2);
  expect(walls.filter((w) => at(w.geometry.start,3000,1500) || at(w.geometry.end,3000,1500))).toHaveLength(3);
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath("expanded-connected-cad.png"),fullPage:true});
  await page.reload();
  await page.getByRole("button",{name:"Edytuj",exact:true}).click();
  await page.getByRole("button",{name:"Przejdź dalej",exact:true}).click();
  await expect(canvas.locator('.cad-entity[data-role="wall"]')).toHaveCount(6);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const mobileCanvas = await canvas.boundingBox(), mobileOptions = await editor.getByLabel("Ustawienia pod płótnem",{exact:true}).boundingBox();
  expect(mobileOptions.y).toBeGreaterThan(mobileCanvas.y+mobileCanvas.height);
});
for (const kind of ["contractor", "store"]) {
  test(`${kind} profile, owner-only employee provisioning and mandatory password change`, async ({ page, request }) => {
    const marketTitle = await createPublishedMarketJob(`Rynek ${kind}`);
    const owner = await createAccount();
    const outsider = await createAccount();
    await login(page, owner.email);
    await page.locator(`.account-type-card.type-${kind}`).click();
    await expect(page.getByRole("heading", { name: kind === "store" ? "Dane Twojego sklepu" : "Dane Twojej firmy" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${kind}-profile.png`), fullPage: true });
    await fillBusiness(page, kind, await unusedNip());
    await expect(page.getByText("Małopolskie · do 50 km", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Otwarte zlecenia klientów", exact: true })).toBeVisible();
    await expect(page.locator(".market-jobs li").filter({ hasText: marketTitle }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: `E2E ${kind}`, exact: true }).first()).toBeVisible();
    await expect(page.locator(".market-jobs li").filter({ hasText: marketTitle }).first()).toBeVisible();
    const { data: business, error } = await admin.from("organizations").select("id").eq("created_by", owner.id).single();
    if (error) throw error;
    const body = { business_id: business.id, email: `employee-${randomUUID()}@example.test`, display_name: "Pracownik testowy" };
    const unauthenticated = await request.post("/api/employees", { data: body });
    expect(unauthenticated.status()).toBe(401);
    const outsiderToken = await tokenFor(outsider.email);
    const forbidden = await request.post("/api/employees", { data: body, headers: { Authorization: `Bearer ${outsiderToken}` } });
    expect(forbidden.status()).toBe(403);
    await page.getByRole("button", { name: "Pracownicy", exact: true }).click();
    await page.getByLabel("Imię i nazwisko", { exact: true }).fill(body.display_name);
    await page.getByLabel("E-mail pracownika", { exact: true }).fill(body.email);
    await page.getByRole("button", { name: "Utwórz konto i wygeneruj hasło", exact: true }).click();
    await expect(page.getByText("Konto pracownika utworzone", { exact: true })).toBeVisible();
    const temporaryPassword = await page.getByLabel("Wygenerowane hasło tymczasowe", { exact: true }).inputValue();
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(24);
    const { data: employee, error: employeeError } = await admin.from("employee_accounts").select("user_id").eq("email", body.email).single();
    if (employeeError) throw employeeError;
    userIds.push(employee.user_id);
    const ownerToken = await tokenFor(owner.email);
    const duplicate = await request.post("/api/employees", { data: body, headers: { Authorization: `Bearer ${ownerToken}` } });
    expect(duplicate.status()).toBe(409);
    await signout(page);
    await login(page, body.email, temporaryPassword);
    await expect(page.getByRole("heading", { name: "Ustaw własne hasło" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pracownicy", exact: true })).toHaveCount(0);
    await page.getByLabel("Hasło tymczasowe", { exact: true }).fill(temporaryPassword);
    await page.getByLabel("Nowe hasło", { exact: true }).fill("Employee-own-password-2026!");
    await page.getByLabel("Powtórz nowe hasło", { exact: true }).fill("Employee-own-password-2026!");
    await page.getByRole("button", { name: "Zapisz hasło i otwórz panel", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Witaj, Pracownik testowy", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dodaj pracownika", exact: true })).toHaveCount(0);
    await expect(page.locator(".market-jobs li").filter({ hasText: marketTitle }).first()).toBeVisible();
    const employeeToken = await tokenFor(body.email, "Employee-own-password-2026!");
    const memberForbidden = await request.post("/api/employees", { data: {...body,email:`other-${randomUUID()}@example.test`}, headers: { Authorization: `Bearer ${employeeToken}` } });
    expect(memberForbidden.status()).toBe(403);
    await signout(page);
    await login(page, body.email, "Employee-own-password-2026!");
    await expect(page.getByRole("heading", { name: "Witaj, Pracownik testowy", exact: true })).toBeVisible();
  });
}
