import assert from "node:assert/strict";
import test from "node:test";
import { ConstructionInputSchema, BusinessInputSchema, EmployeeInputSchema, EmployeePasswordSchema } from "../dist/index.js";

const construction = {
  title: "Dom", city: "Krakow", address: "Dzialka 1", description: "Budowa domu",
  building_type: "house", area_m2: 120, floors: 2, basement: false, postal_code: "30-001",
  requirements: "Kierownik budowy", acceptance_criteria: "Brak usterek", site_access: "", utilities: "",
  materials: "", start_date: "2026-12-01", budget_pln: null,
};
const business = {
  name: "Firma", nip: "5260250995", city: "Krakow", address: "Budowlana 1",
  postal_code: "30-001", phone: "+48 123 456 789", industry: "Budowa domow",
  service_area: "Malopolskie", radius_km: 50, description: "Prace budowlane",
};
test("construction validates measurements, date and optional budget", () => {
  assert.equal(ConstructionInputSchema.parse(construction).title, "Dom");
  for (const changes of [{area_m2:0},{area_m2:Infinity},{floors:1.2},{start_date:"2026-02-30"},{budget_pln:-1},{description:" "},{postal_code:"123"},{start_date:""}]) {
    assert.equal(ConstructionInputSchema.safeParse({...construction,...changes}).success,false);
  }
});
test("construction details depend on work type and exclude roof from general data", () => {
  assert.equal("roof" in ConstructionInputSchema.parse(construction), false);
  const renovation = {...construction, building_type:"renovation", floors:null, basement:null, rooms:"Kitchen", existing_condition:"Old tiles"};
  assert.equal(ConstructionInputSchema.safeParse(renovation).success,true);
  for (const changes of [{rooms:""},{existing_condition:""},{floors:2},{plot_area_m2:100}]) {
    assert.equal(ConstructionInputSchema.safeParse({...renovation,...changes}).success,false);
  }
  assert.equal(ConstructionInputSchema.safeParse({...construction,building_type:"extension"}).success,true);
  assert.equal(ConstructionInputSchema.safeParse({...renovation,building_type:"other",rooms:"",existing_condition:"",work_category:"Fence"}).success,true);
});
test("construction validates mandatory report fields and additional measurements", () => {
  for (const changes of [{requirements:" "},{acceptance_criteria:" "},{postal_code:""},{plot_area_m2:-1}]) {
    assert.equal(ConstructionInputSchema.safeParse({...construction,...changes}).success,false);
  }
  assert.equal(ConstructionInputSchema.safeParse({...construction,postal_code:"30-001",plot_area_m2:800}).success,true);
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
