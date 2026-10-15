import assert from "node:assert/strict";
import test from "node:test";
import { ConstructionDetailsInputSchema, ConstructionInputSchema, constructionTechnologyCatalog, emptyConstructionTechnologySelections, getConstructionTechnologyStages, BusinessInputSchema, EmployeeInputSchema, EmployeePasswordSchema, otherWorkTechnologyKeys, SignInInputSchema, SignUpInputSchema } from "../dist/index.js";

const houseTechnology = {
  ...emptyConstructionTechnologySelections,
  completionStandard: "turnkey",
  foundationType: ["strip-footings"],
  foundationWalls: "project",
  foundationRingBeam: "project",
  foundationWaterproofing: "project",
  foundationDimpleMembrane: "project",
  foundationInsulation: "project",
  loadBearingWall: "project",
  exteriorWallSystem: "project",
  wallInsulation: "project",
  partitionWall: "project",
  floorStructure: "monolithic",
  floorFormwork: "system-panel-formwork",
  roofStructure: "rafter-roof",
  roofSlopePlate: "sloped-plate-no",
  roofDecking: "full-board-decking",
  roofUnderlayment: "roofing-felt-underlay",
  roofCovering: "project",
  roofChimneySystem: "no-chimney",
  roofGutterSystem: "project",
  roofDownspoutSystem: "project",
  roofInsulation: "project",
  windowsSystem: "window-pvc",
  windowInstallation: "window-installation-standard",
  exteriorDoor: "steel-exterior-door",
  stairStructure: "stair-structure-cast-in-place-concrete",
  heatingSystem: "project",
  ventilationSystem: "project",
  electricalInstallation: "project",
  waterSewerInstallation: "project",
  interiorDoor: "interior-door-rebate",
  interiorFloorFinish: ["finish-floor-tile", "finish-floor-engineered-wood"],
  interiorWallFinish: ["finish-wall-paint", "finish-wall-tile"],
  interiorCeilingFinish: ["finish-ceiling-plaster"],
  stairFinish: ["stair-finish-wood", "stair-railing-metal"],
  exteriorFacadeFinish: ["facade-finish-thin-coat-render", "facade-finish-brick-slip"],
};
const renovationTechnology = {
  ...emptyConstructionTechnologySelections,
  renovationScope: "thermal-modernization",
  renovationDemolition: "demolition-comprehensive",
  foundationWaterproofing: "project",
  foundationDimpleMembrane: "project",
  foundationInsulation: "project",
  wallInsulation: "project",
  roofStructure: "project",
  roofSlopePlate: "sloped-plate-no",
  roofDecking: "full-board-decking",
  roofUnderlayment: "roof-membrane-high-permeable",
  roofCovering: "flat-sheet-metal",
  roofStandingSeamSystem: "standing-seam-double-lock",
  roofChimneySystem: "chimney-ceramic-system",
  roofChimneyFlashing: "chimney-flashing-system-kit",
  roofChimneyFlashingMaterial: "chimney-flashing-coated-steel",
  roofGutterSystem: "gutter-coated-steel",
  roofDownspoutSystem: "downspout-coated-steel-round",
  roofInsulation: "project",
  heatingSystem: "project",
  ventilationSystem: "project",
  electricalInstallation: "project",
  waterSewerInstallation: "project",
  renovationFloor: ["floor-ceramic-tile", "floor-vinyl"],
  renovationWall: ["wall-paint", "wall-ceramic-tile"],
  renovationCeiling: ["ceiling-plaster-paint"],
  renovationWindows: "project",
};

const construction = {
  title: "Dom", city: "Krakow", address: "Dzialka 1", description: "Budowa domu",
  building_type: "house", area_m2: 120, floors: 2, basement: false, postal_code: "30-001",
  site_access: "", utilities: "", technology_selections: houseTechnology,
  start_date: "2026-12-01", budget_pln: null,
};
const business = {
  name: "Firma", nip: "5260250995", city: "Krakow", address: "Budowlana 1",
  postal_code: "30-001", phone: "+48 123 456 789", industry: "Budowa domow",
  service_area: "Malopolskie", radius_km: 50, description: "Prace budowlane",
};
test("authentication validates email, password and registration name", () => {
  assert.deepEqual(SignInInputSchema.parse({email:" Person@Example.test ",password:"existing"}), {email:"person@example.test",password:"existing"});
  assert.deepEqual(SignUpInputSchema.parse({display_name:"  Patryk  ",email:" PATRYK@example.test ",password:"Password-2026"}), {
    display_name:"Patryk",email:"patryk@example.test",password:"Password-2026",
  });
  for (const input of [
    {email:"not-an-email",password:"existing"},
    {email:"person@example.test",password:""},
    {email:"person@example.test",password:"x".repeat(129)},
  ]) assert.equal(SignInInputSchema.safeParse(input).success,false);
  for (const input of [
    {display_name:" ",email:"person@example.test",password:"Password-2026"},
    {display_name:"A",email:"not-an-email",password:"Password-2026"},
    {display_name:"A",email:"person@example.test",password:"short"},
    {display_name:"A",email:"person@example.test",password:"x".repeat(129)},
  ]) assert.equal(SignUpInputSchema.safeParse(input).success,false);
});
test("construction validates measurements, date and optional budget", () => {
  assert.equal(ConstructionInputSchema.parse(construction).title, "Dom");
  for (const changes of [{area_m2:0},{area_m2:Infinity},{floors:1.2},{start_date:"2026-02-30"},{budget_pln:-1},{description:" "},{postal_code:"123"},{start_date:""}]) {
    assert.equal(ConstructionInputSchema.safeParse({...construction,...changes}).success,false);
  }
});

test("construction detail schema validates required fields independently of tab navigation", () => {
  const { technology_selections, ...details } = construction;
  assert.equal(ConstructionDetailsInputSchema.safeParse(details).success, true);
  assert.equal(ConstructionDetailsInputSchema.safeParse({ ...details, title: "   " }).success, false);
  assert.equal(ConstructionDetailsInputSchema.safeParse({ ...details, postal_code: "30001" }).success, false);
  assert.equal(ConstructionDetailsInputSchema.safeParse({
    ...details,
    building_type: "renovation",
    floors: null,
    basement: null,
    rooms: "",
    existing_condition: "",
  }).success, false);
  assert.ok(technology_selections);
});
test("construction details depend on work type and exclude roof from general data", () => {
  assert.equal("roof" in ConstructionInputSchema.parse(construction), false);
  const renovation = {...construction, building_type:"renovation", floors:null, basement:null, rooms:"Kitchen", existing_condition:"Old tiles", technology_selections:renovationTechnology};
  assert.equal(ConstructionInputSchema.safeParse(renovation).success,true);
  for (const changes of [{rooms:""},{existing_condition:""},{floors:2},{plot_area_m2:100}]) {
    assert.equal(ConstructionInputSchema.safeParse({...renovation,...changes}).success,false);
  }
  assert.equal(ConstructionInputSchema.safeParse({...construction,building_type:"extension"}).success,true);
});
test("construction validates required technology choices, date and measurements without freeform acceptance fields", () => {
  for (const changes of [{postal_code:""},{plot_area_m2:-1},{technology_selections:emptyConstructionTechnologySelections}]) {
    assert.equal(ConstructionInputSchema.safeParse({...construction,...changes}).success,false);
  }
  assert.equal("requirements" in ConstructionInputSchema.parse(construction), false);
  assert.equal("acceptance_criteria" in ConstructionInputSchema.parse(construction), false);
  assert.equal(ConstructionInputSchema.safeParse({...construction,technology_selections:{...houseTechnology,roofCovering:"unknown"}}).success,false);
  assert.equal(ConstructionInputSchema.safeParse({...construction,postal_code:"30-001",plot_area_m2:800}).success,true);
});
test("foundation selection allows multiple values and only requires shuttering for monolithic foundation walls", () => {
  const base = {...construction, technology_selections:houseTechnology};
  assert.equal(ConstructionInputSchema.safeParse(base).success, true);
  assert.equal(getConstructionTechnologyStages("house",houseTechnology).includes("foundationRingBeam"),true);
  for (const foundationRingBeam of [
    "foundation-ring-beam-yes", "foundation-ring-beam-no", "project", "foundation-ring-beam-not-applicable",
  ]) {
    assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:{
      ...houseTechnology, foundationRingBeam,
    }}).success,true);
  }
  assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:{
    ...houseTechnology, foundationRingBeam:null,
  }}).success,false);
  assert.equal(ConstructionInputSchema.safeParse({...base, technology_selections:{...houseTechnology,foundationType:["strip-footings","foundation-slab"]}}).success,true);
  assert.equal(ConstructionInputSchema.safeParse({...base, technology_selections:{...houseTechnology,foundationType:["strip-footings","strip-footings"]}}).success,false);

  const monolithic = {...houseTechnology, foundationWalls:"monolithic-foundation-wall", foundationFormwork:null};
  assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:monolithic}).success,false);
  assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:{...monolithic,foundationFormwork:"foundation-system-formwork"}}).success,true);
  const masonry = {...houseTechnology, foundationWalls:"concrete-block-24", foundationFormwork:null};
  assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:masonry}).success,true);
  assert.equal(getConstructionTechnologyStages("house",masonry).includes("foundationFormwork"),false);
});
test("house completion standard progressively reveals joinery, installations and finishes", () => {
  const stages = (completionStandard) => getConstructionTechnologyStages("house",{...houseTechnology,completionStandard});
  for (const completionStandard of ["shell-open", "shell-closed", "developer", "turnkey"]) {
    const required = (waterSewerInstallation) => ConstructionInputSchema.safeParse({
      ...construction,
      technology_selections: { ...houseTechnology, completionStandard, waterSewerInstallation },
    }).success;
    assert.equal(stages(completionStandard).includes("waterSewerInstallation"), true, `${completionStandard} shows water and sewer`);
    assert.equal(required(null), false, `${completionStandard} requires water and sewer selection`);
    assert.equal(required("project"), true, `${completionStandard} accepts water and sewer selection`);
  }
  assert.equal(stages("shell-open").includes("windowsSystem"),false);
  assert.equal(stages("shell-open").includes("wallInsulation"),false);
  assert.equal(stages("shell-open").includes("roofInsulation"),false);
  assert.equal(stages("shell-open").includes("waterSewerInstallation"),true);
  assert.equal(stages("shell-closed").includes("windowsSystem"),true);
  assert.equal(stages("shell-closed").includes("wallInsulation"),true);
  assert.equal(stages("shell-closed").includes("roofInsulation"),false);
  assert.equal(stages("shell-closed").includes("heatingSystem"),false);
  assert.equal(stages("developer").includes("heatingSystem"),true);
  assert.equal(stages("developer").includes("interiorFloorFinish"),false);
  assert.equal(stages("turnkey").includes("interiorFloorFinish"),true);
  assert.equal(stages("turnkey").includes("interiorWallFinish"),true);
  assert.equal(stages("turnkey").includes("exteriorFacadeFinish"),true);
  assert.equal(
    getConstructionTechnologyStages("house",{...houseTechnology,completionStandard:"turnkey",exteriorWallSystem:"single-layer-wall"}).includes("wallInsulation"),
    false,
  );
});
test("roof selection includes conditional metal profiles, chimney flashings and rainwater systems", () => {
  const base = {...construction, technology_selections:houseTechnology};
  assert.equal(getConstructionTechnologyStages("house",{...houseTechnology,roofStructure:"no-roof-work"}).includes("roofDecking"),false);
  assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:{...houseTechnology,roofDecking:"other-roof-decking"}}).success,false);
  assert.equal(ConstructionInputSchema.safeParse({...base,technology_selections:{...houseTechnology,roofDecking:"other-roof-decking",otherDescriptions:{roofDecking:"Płyta MFP"}}}).success,true);
  const metalTile = getConstructionTechnologyStages("house",{...houseTechnology,roofCovering:"metal-roof-tile"});
  assert.equal(metalTile.includes("roofMetalTileProfile"),true);
  assert.equal(metalTile.includes("roofStandingSeamSystem"),false);
  const trapezoid = getConstructionTechnologyStages("house",{...houseTechnology,roofCovering:"trapezoidal-sheet"});
  assert.equal(trapezoid.includes("roofTrapezoidalProfile"),true);
  const standingSeam = getConstructionTechnologyStages("house",{...houseTechnology,roofCovering:"standing-seam-sheet",roofChimneySystem:"chimney-ceramic-system"});
  assert.equal(standingSeam.includes("roofStandingSeamSystem"),true);
  assert.equal(standingSeam.includes("roofChimneyFlashing"),true);
  assert.equal(standingSeam.includes("roofChimneyFlashingMaterial"),true);
  assert.equal(standingSeam.includes("roofGutterSystem"),true);
  assert.equal(standingSeam.includes("roofDownspoutSystem"),true);
  assert.equal(
    getConstructionTechnologyStages("house",{...houseTechnology,roofChimneySystem:"no-chimney"}).includes("roofChimneyFlashing"),
    false,
  );
  assert.equal(ConstructionInputSchema.safeParse({
    ...construction,
    technology_selections:{...houseTechnology,roofCovering:"metal-roof-tile",roofMetalTileProfile:"metal-tile-modular"},
  }).success,true);
  assert.equal(ConstructionInputSchema.safeParse({
    ...construction,
    technology_selections:{...houseTechnology,roofCovering:"metal-roof-tile",roofMetalTileProfile:"other-metal-tile-profile"},
  }).success,false);
  assert.equal(ConstructionInputSchema.safeParse({
    ...construction,
    technology_selections:{
      ...houseTechnology,
      roofChimneySystem:"chimney-ceramic-system",
      roofChimneyFlashing:"chimney-flashing-system-kit",
      roofChimneyFlashingMaterial:"chimney-flashing-coated-steel",
    },
  }).success,true);
});
test("renovation scope reveals only matching repair and modernization stages", () => {
  const stages = (renovationScope) => getConstructionTechnologyStages("renovation",{...renovationTechnology,renovationScope});
  assert.equal(stages("refresh").includes("electricalInstallation"),false);
  assert.equal(stages("room-renovation").includes("renovationKitchenFitout"),true);
  assert.equal(stages("room-renovation").includes("renovationBathroomFitout"),true);
  assert.equal(stages("refresh").includes("renovationKitchenFitout"),false);
  assert.equal(stages("full-renovation").includes("electricalInstallation"),true);
  assert.equal(stages("full-renovation").includes("roofDecking"),false);
  assert.equal(stages("thermal-modernization").includes("roofDecking"),true);
});
test("other work reveals technology steps for fences, driveways and drainage", () => {
  const fence = {
    ...emptyConstructionTechnologySelections,
    otherWorkTechnology: ["fencing"],
    otherWorkPreparation: "site-excavation",
    otherFenceFoundation: "fence-strip-footing",
    otherFenceStructure: "fence-masonry-structure",
    otherFenceFinish: "fence-finish-plaster",
    otherFenceAccess: ["other-fence-wicket"],
  };
  const otherInput = {
    ...construction,
    building_type: "other",
    floors: null,
    basement: null,
    plot_area_m2: null,
    work_category: "Ogrodzenie",
    technology_selections: fence,
  };
  assert.equal(ConstructionInputSchema.safeParse(otherInput).success,true);
  assert.equal(ConstructionInputSchema.safeParse({...otherInput,description:" "}).success,false);
  assert.equal(ConstructionInputSchema.safeParse({...otherInput,technology_selections:{...fence,otherWorkTechnology:["project"]}}).success,false);
  assert.equal(getConstructionTechnologyStages("other",fence).includes("otherFenceFoundation"),true);
  assert.equal(getConstructionTechnologyStages("other",{...fence,otherWorkTechnology:["driveway-paving"]}).includes("otherDrivewayBase"),true);
  assert.equal(getConstructionTechnologyStages("other",{...fence,otherWorkTechnology:["site-drainage"]}).includes("otherDrainageOutfall"),true);
  const drivewayAndFacade = {
    ...emptyConstructionTechnologySelections,
    otherWorkTechnology:["driveway-paving","facade-work"],
    otherWorkPreparation:"site-excavation",
    otherDrivewayBase:"driveway-aggregate-base",
    otherDrivewaySurface:["paving-resin-gravel"],
    otherResinGravelSystem:"resin-bound-permeable",
    otherDrivewayEdging:["paving-edge-concrete-border"],
    otherDrivewayDrainage:"driveway-drain-linear",
    otherFacadePreparation:"facade-cleaning",
    otherFacadeInsulation:"other-facade-mineral-wool",
    otherFacadeFixing:["other-facade-combined-fixing"],
    otherFacadeReinforcement:["other-facade-mesh-standard"],
    otherFacadeCoating:"other-facade-silicone-render",
    otherFacadeColor:"other-facade-color-white",
    otherFacadeFinish:["facade-thin-coat-render"],
  };
  const drivewayAndFacadeStages = getConstructionTechnologyStages("other",drivewayAndFacade);
  for (const stage of [
    "otherResinGravelSystem",
    "otherFacadePreparation",
    "otherFacadeInsulation",
    "otherFacadeFixing",
    "otherFacadeReinforcement",
    "otherFacadeFinish",
  ]) {
    assert.equal(drivewayAndFacadeStages.includes(stage),true,`${stage} appears for selected resin driveway and facade`);
  }
  assert.equal(drivewayAndFacadeStages.includes("otherFacadeCoating"),true);
  assert.equal(drivewayAndFacadeStages.includes("otherFacadeColor"),true);
  assert.equal(getConstructionTechnologyStages("other",{
    ...drivewayAndFacade,
    otherFacadeFinish:["facade-ventilated-cladding"],
  }).includes("otherFacadeColor"),false);
  const otherJob = {
    ...construction,
    building_type:"other",
    floors:null,
    basement:null,
    plot_area_m2:null,
    work_category:"Nawierzchnia i fasada",
    technology_selections:drivewayAndFacade,
  };
  assert.equal(ConstructionInputSchema.safeParse(otherJob).success,true);
  assert.equal(ConstructionInputSchema.safeParse({
    ...otherJob,
    technology_selections:{...drivewayAndFacade,otherResinGravelSystem:null},
  }).success,false);
  const additionalWorkStages = getConstructionTechnologyStages("other",{
    ...emptyConstructionTechnologySelections,
    otherWorkTechnology:["terrace-construction","external-utility-connections","garden-landscaping","demolition-work"],
  });
  for (const stage of ["otherTerraceStructure","otherTerraceFinish","otherExternalConnections","otherGardenWork","otherDemolitionScope"]) {
    assert.equal(additionalWorkStages.includes(stage),true,`${stage} appears for the corresponding selected work`);
  }
  const mixedOutdoorWork = {
    ...emptyConstructionTechnologySelections,
    otherWorkTechnology:["driveway-paving","site-drainage"],
    otherWorkPreparation:"site-excavation",
    otherDrivewayBase:"driveway-aggregate-base",
    otherDrivewaySurface:["paving-concrete-block","paving-natural-stone"],
    otherDrivewayEdging:["paving-edge-concrete-border"],
    otherDrivewayDrainage:"driveway-drain-linear",
    otherDrainageTechnology:"drain-linear",
    otherDrainageOutfall:"outfall-soakaway",
  };
  const outdoorStages = getConstructionTechnologyStages("other",mixedOutdoorWork);
  assert.equal(outdoorStages.every((key) =>
    constructionTechnologyCatalog[key].options.every((option) => option.value !== "project"),
  ),true);
  assert.equal(outdoorStages.filter((key) => key === "otherWorkPreparation").length,1);
  assert.equal(outdoorStages.includes("otherDrivewaySurface"),true);
  assert.equal(outdoorStages.includes("otherDrainageOutfall"),true);
  assert.equal(ConstructionInputSchema.safeParse({...otherInput,technology_selections:mixedOutdoorWork}).success,true);
  const specialist = {
    ...fence,
    otherWorkTechnology:["other-specialist-work"],
    otherWorkPreparation:"site-excavation",
    otherPrimaryTechnology:"specialist-installation",
    otherFinishTechnology:"specialist-finish-ground",
  };
  assert.equal(ConstructionInputSchema.safeParse({...otherInput,technology_selections:specialist}).success,false);
  assert.equal(ConstructionInputSchema.safeParse({...otherInput,technology_selections:{...specialist,otherDescriptions:{otherWorkTechnology:"Prace montażowe instalacji"}}}).success,true);
  assert.equal(constructionTechnologyCatalog.otherWorkTechnology.options.some((option) => option.value === "project"),false);
  const generalWorkOptions = constructionTechnologyCatalog.otherWorkTechnology.options;
  assert.equal(generalWorkOptions.find((option) => option.value === "fencing")?.label, "Ogrodzenie");
  assert.equal(generalWorkOptions.find((option) => option.value === "driveway-paving")?.label, "Podjazd, ścieżki i nawierzchnie");
  assert.equal(generalWorkOptions.some((option) => /ogrodzenie (drewniane|stalowe|panelowe|murowane)|podjazd z kostki/i.test(option.label)),false);
  assert.equal(getConstructionTechnologyStages("other",{
    ...fence,
    otherWorkTechnology:["fencing"],
    otherFenceStructure:null,
  }).includes("otherFenceStructure"),true);
  assert.equal(otherWorkTechnologyKeys.every((key) =>
    constructionTechnologyCatalog[key].options.every((option) => option.value !== "project"),
  ),true);
});
test("other work includes detailed construction, roof, facade and installation surveys", () => {
  const work = {
    ...emptyConstructionTechnologySelections,
    otherWorkTechnology: [
      "foundation-construction",
      "reinforced-concrete-work",
      "masonry-work",
      "roof-structure",
      "roof-covering",
      "facade-work",
      "electrical-installation",
      "water-sewer-installation",
      "heating-installation",
      "ventilation-installation",
      "windows-doors",
      "well-septic-system",
      "photovoltaic-work",
      "garage-carport",
    ],
  };
  const stages = getConstructionTechnologyStages("other",work);
  for (const stage of [
    "otherFoundationScope",
    "otherFoundationType",
    "otherFoundationReinforcement",
    "otherFoundationFormwork",
    "otherFoundationConcrete",
    "otherConcreteWork",
    "otherConcreteReinforcement",
    "otherConcreteFormwork",
    "otherConcretePlacement",
    "otherMasonryStructure",
    "otherMasonryMortar",
    "otherMasonryDetails",
    "otherRoofStructure",
    "otherRoofCovering",
    "otherRoofUnderlayment",
    "otherRoofInsulation",
    "otherRoofDrainage",
    "otherFacadeInsulation",
    "otherFacadeFixing",
    "otherFacadeReinforcement",
    "otherElectricalWork",
    "otherWaterSewerWork",
    "otherHeatingWork",
    "otherVentilationWork",
    "otherWindowDoorWork",
    "otherWellSewageWork",
    "otherPhotovoltaicWork",
    "otherGarageStructure",
    "otherGarageElements",
  ]) assert.equal(stages.includes(stage),true,`${stage} appears for its selected work category`);
  assert.equal(stages.includes("otherFacadeCoating"),false);
  assert.equal(stages.includes("otherFacadeColor"),false);
  assert.equal(getConstructionTechnologyStages("other",{
    ...work,
    otherFacadeFinish:["facade-thin-coat-render"],
  }).includes("otherFacadeColor"),true);
  assert.equal(getConstructionTechnologyStages("other",{
    ...work,
    otherFacadeFinish:["facade-ventilated-cladding"],
  }).includes("otherFacadeColor"),false);
  assert.equal(stages.filter((key) => key === "otherWorkPreparation").length,1);
  assert.equal(stages.every((key) =>
    constructionTechnologyCatalog[key].options.every((option) => option.value !== "project"),
  ),true);
});
test("saved map pin is validated and can be restored from technology data", () => {
  assert.equal(ConstructionInputSchema.safeParse({
    ...construction,
    technology_selections: { ...houseTechnology, locationPin: { lat: 49.9876, lng: 20.1234 } },
  }).success,true);
  assert.equal(ConstructionInputSchema.safeParse({
    ...construction,
    technology_selections: { ...houseTechnology, locationPin: { lat: 91, lng: 20 } },
  }).success,false);
});
test("business requires valid NIP, location, industry and service area", () => {
  assert.equal(BusinessInputSchema.parse({...business,nip:"526-025-09-95"}).nip,"5260250995");
  for (const changes of [{nip:"1234567890"},{postal_code:"30001"},{service_area:" "},{industry:""},{radius_km:-1}]) {
    assert.equal(BusinessInputSchema.safeParse({...business,...changes}).success,false);
  }
});
test("employee input normalizes email and rejects incomplete identity", () => {
  const input = {business_id:"00000000-0000-4000-8000-000000000001",email:" Employee@example.test ",display_name:"Pracownik"};
  assert.equal(EmployeeInputSchema.parse(input).email,"employee@example.test");
  assert.equal(EmployeeInputSchema.safeParse({...input,email:"bad"}).success,false);
  assert.equal(EmployeeInputSchema.safeParse({...input,business_id:"bad"}).success,false);
});
test("employee must replace temporary password with a different long password", () => {
  assert.equal(EmployeePasswordSchema.safeParse({current_password:"temporary123456",password:"temporary123456"}).success,false);
  assert.equal(EmployeePasswordSchema.safeParse({current_password:"temporary123456",password:"short"}).success,false);
  assert.equal(EmployeePasswordSchema.safeParse({current_password:"temporary123456",password:"a-different-password"}).success,true);
});
