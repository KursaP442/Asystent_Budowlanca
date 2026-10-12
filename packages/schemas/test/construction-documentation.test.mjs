import assert from "node:assert/strict";
import test from "node:test";
import {
  constructionTechnologyCatalog,
  emptyConstructionTechnologySelections,
  getProjectDocumentationRequirements,
  otherWorkDocumentation,
  ProjectScopeSchema,
} from "../dist/index.js";

const technology = (changes = {}) => ({ ...structuredClone(emptyConstructionTechnologySelections), ...changes });
const scope = (workType, changes = {}) => ({
  workType, floors: ["house", "extension"].includes(workType) ? 1 : null,
  basement: ["house", "extension"].includes(workType) ? false : null,
  technology: technology(), ...changes,
});
const kinds = (input) => getProjectDocumentationRequirements(input).map(({ kind }) => kind);

test("every current other-work category has explicit drawings and measurement requirements", () => {
  const expected = {
    "foundation-construction": ["foundation"], "reinforced-concrete-work": ["concrete"], "masonry-work": ["masonry"],
    "roof-structure": ["roof", "roofStructure"], "roof-covering": ["roof"], "facade-work": ["facade"],
    fencing: ["fencing"], "garage-carport": ["garage"], "driveway-paving": ["paving"], "terrace-construction": ["terrace"],
    "site-drainage": ["drainage"], "external-utility-connections": ["connections"], "retaining-wall": ["retaining"],
    "windows-doors": ["joinery"], "electrical-installation": ["electrical"], "water-sewer-installation": ["plumbing"],
    "heating-installation": ["heating"], "ventilation-installation": ["ventilation"], "chimney-work": ["chimney"],
    "interior-plaster": ["interior"], "drywall-ceilings": ["interior"], "floors-screeds": ["interior"],
    "interior-finishing": ["interior", "joinery"], "well-septic-system": ["sewage"], "photovoltaic-work": ["energy"],
    "garden-landscaping": ["landscaping"], "demolition-work": ["demolition"], "other-specialist-work": ["specialist"],
  };
  assert.deepEqual(Object.keys(otherWorkDocumentation).sort(), constructionTechnologyCatalog.otherWorkTechnology.options.map(({ value }) => value).sort());
  for (const { value } of constructionTechnologyCatalog.otherWorkTechnology.options) {
    const requirements = getProjectDocumentationRequirements(scope("other", { technology: technology({ otherWorkTechnology: [value] }) }));
    assert.deepEqual(requirements.map(({ kind }) => kind), expected[value], value);
    for (const requirement of requirements) {
      assert.ok(requirement.drawings.length >= 2);
      assert.ok(requirement.measurements.length >= 3);
    }
  }
});

test("all pairs of other-work categories compose without duplicate or unrelated modules", () => {
  const categories = constructionTechnologyCatalog.otherWorkTechnology.options.map(({ value }) => value);
  for (const first of categories) {
    for (const second of categories) {
      if (first === second) continue;
      const requirements = getProjectDocumentationRequirements(scope("other", { technology: technology({ otherWorkTechnology: [first, second] }) }));
      const expected = [...new Set([...otherWorkDocumentation[first], ...otherWorkDocumentation[second]])];
      assert.deepEqual(requirements.map(({ kind }) => kind), expected);
      assert.equal(new Set(requirements.map(({ id }) => id)).size, requirements.length);
    }
  }
});

test("roof covering alone never requires whole-house or foundation drawings", () => {
  assert.deepEqual(kinds(scope("other", { technology: technology({ otherWorkTechnology: ["roof-covering"] }) })), ["roof"]);
  assert.deepEqual(kinds(scope("other", { technology: technology({ otherWorkTechnology: ["roof-structure"], otherRoofStructure: "other-roof-reinforced-concrete" }) })), ["roof", "roofStructure", "concrete"]);
});

test("every allowed floor count, basement choice and house standard produces identified storeys", () => {
  for (const workType of ["house", "extension"]) {
    for (let floors = 1; floors <= 100; floors += 1) {
      for (const basement of [false, true]) {
        for (const { value: completionStandard } of constructionTechnologyCatalog.completionStandard.options) {
          const requirements = getProjectDocumentationRequirements(scope(workType, { floors, basement, technology: technology({ completionStandard }) }));
          const storeys = requirements.filter(({ kind }) => kind === "storey");
          assert.equal(storeys.length, floors);
          assert.equal(storeys[0].label, "Parter");
          assert.equal(storeys.at(-1).id, `storey-${floors - 1}`);
          assert.equal(requirements.some(({ kind }) => kind === "basement"), basement);
          assert.equal(requirements.some(({ kind }) => kind === "existing"), workType === "extension");
        }
      }
    }
  }
});

test("excluded foundations, roof and installations do not produce corresponding documentation steps", () => {
  const excluded = technology({
    completionStandard: "developer", foundationType: ["no-foundation"],
    roofStructure: "no-roof-work", heatingSystem: "no-heating-work", ventilationSystem: "no-ventilation-work",
    electricalInstallation: "no-electrical-work", waterSewerInstallation: "no-water-sewer-work",
    windowsSystem: "windows-not-included", exteriorDoor: "exterior-door-not-included",
    exteriorFacadeFinish: ["facade-finish-no-work"],
  });
  assert.deepEqual(kinds(scope("extension", { technology: excluded })), ["existing", "storey"]);
  for (const { value: completionStandard } of constructionTechnologyCatalog.completionStandard.options) {
    const result = kinds(scope("house", { technology: technology({ ...excluded, completionStandard }) }));
    for (const kind of ["foundation", "roof", "roofStructure", "heating", "ventilation", "electrical", "plumbing", "facade", "joinery"]) {
      assert.equal(result.includes(kind), false, `${completionStandard}: ${kind}`);
    }
  }
});

test("all renovation standards support room documentation without house storeys", () => {
  for (const { value: renovationScope } of constructionTechnologyCatalog.renovationScope.options) {
    const result = kinds(scope("renovation", { technology: technology({ renovationScope }) }));
    assert.ok(result.includes("existing"));
    assert.ok(result.includes("interior"));
    assert.equal(result.includes("storey"), false);
    assert.equal(result.includes("basement"), false);
    assert.equal(result.includes("roof"), false);
  }
  const thermal = technology({
    renovationScope: "thermal-modernization",
  });
  const roofOption = constructionTechnologyCatalog.roofStructure.options.find(({ value }) => value !== "project" && value !== "no-roof-work");
  thermal.roofStructure = roofOption.value;
  assert.ok(kinds(scope("renovation", { technology: thermal })).includes("roof"));
});

test("invalid configuration does not silently produce a generic questionnaire", () => {
  assert.throws(() => getProjectDocumentationRequirements(scope("other", { technology: technology({ otherWorkTechnology: ["not-a-real-category"] }) })));
  assert.equal(ProjectScopeSchema.safeParse(scope("house", { floors: null })).success, false);
  assert.equal(ProjectScopeSchema.safeParse(scope("renovation", { floors: 2 })).success, false);
  assert.equal(ProjectScopeSchema.safeParse(scope("house", { floors: 101 })).success, false);
});
