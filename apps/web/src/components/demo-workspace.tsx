"use client";

import { useState } from "react";
import type { ConstructionJob, OrganizationKind } from "@asystent/api-client";
import { ConstructionTechnologySchema, emptyConstructionTechnologySelections } from "@asystent/schemas";
import { ConstructionForm } from "@/components/construction-form";

const roles: { kind: OrganizationKind; label: string }[] = [
  { kind: "client", label: "Zleceniodawca" },
  { kind: "contractor", label: "Wykonawca" },
  { kind: "store", label: "Sklep" },
];

const roleTitles: Record<OrganizationKind, string> = {
  client: "Panel Klienta",
  contractor: "Panel Wykonawcy",
  store: "Panel Sklepu",
};

function createDemoJob(): ConstructionJob {
  const technology = ConstructionTechnologySchema.parse({
    ...emptyConstructionTechnologySelections,
    completionStandard: "turnkey",
    foundationType: ["strip-footings"],
    foundationWalls: "concrete-block-24",
    foundationRingBeam: "foundation-ring-beam-yes",
    foundationBottomSlab: "bottom-slab-yes",
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
  });

  return {
    id: crypto.randomUUID(),
    client_id: "00000000-0000-4000-8000-000000000001",
    title: "Dom jednorodzinny z poddaszem",
    city: "Kraków",
    address: "Działkowa 42",
    description: "Budowa domu jednorodzinnego do stanu pod klucz.",
    building_type: "house",
    area_m2: 148,
    floors: 2,
    basement: true,
    postal_code: "30-001",
    plot_area_m2: 650,
    rooms: "",
    existing_condition: "",
    work_category: "",
    site_access: "Dojazd drogą gminną, miejsce na składowanie materiałów.",
    utilities: "Prąd i woda przy granicy działki.",
    requirements: "",
    acceptance_criteria: "",
    report_summary: "",
    roof: "pitched",
    materials: JSON.stringify(technology),
    start_date: "2027-04-01",
    budget_pln: 850000,
    status: "draft",
    created_at: new Date().toISOString(),
  };
}

export function DemoWorkspace({ onExit }: { onExit: () => void }) {
  const [kind, setKind] = useState<OrganizationKind>("client");
  const [completed, setCompleted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [demoJob, setDemoJob] = useState(createDemoJob);

  return (
    <section className="workspace role-workspace">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">TRYB TESTOWY · DANE PRZYKŁADOWE</p>
          <h1>{roleTitles[kind]}</h1>
          <p className="lead">Tryb testowy bez logowania. Dane budowy, dokumentacja i rysunki są zapisywane lokalnie.</p>
        </div>
        <button className="quiet-button" type="button" onClick={onExit}>Zamknij podgląd</button>
      </div>

      <nav className="panel-tabs" aria-label="Wybór panelu testowego">
        {roles.map((role) => (
          <button
            key={role.kind}
            type="button"
            aria-current={kind === role.kind ? "page" : undefined}
            onClick={() => setKind(role.kind)}
          >
            {role.label}
          </button>
        ))}
      </nav>

      <div className="alert alert-success" role="status">
        Ankieta jest wypełniona przykładowymi danymi i możesz je zmienić. Zapis pozostaje lokalny; zdjęcia, import skanów i rozpoznawanie AI wymagają backendu.
      </div>

      {kind === "client" ? (
        completed ? (
          <article className="panel organizations-panel">
            <p className="eyebrow">LOKALNY SZKIC</p>
            <h2>Przeszedłeś cały formularz zlecenia</h2>
            <p>Dane, wybrane technologie, szkic dokumentacji i rysunki pozostają w pamięci tej przeglądarki.</p>
            <button className="primary-button" type="button" onClick={() => {
              setCompleted(false);
              setFormKey((current) => current + 1);
              setDemoJob(createDemoJob());
            }}>Utwórz kolejne zlecenie testowe</button>
          </article>
        ) : (
          <ConstructionForm
            key={formKey}
            job={demoJob}
            userId="codespace-demo"
            isAdministrator={false}
            demoMode
            onSaved={() => setCompleted(true)}
          />
        )
      ) : kind === "contractor" ? (
        <div className="workspace-grid">
          <article className="panel organizations-panel">
            <p className="eyebrow">RYNEK · PRZYKŁAD</p>
            <h2>Nowy dom jednorodzinny</h2>
            <p>Kraków · 148 m² · planowany start: wiosna</p>
            <p>Przykładowe zlecenie widoczne w panelu wykonawcy.</p>
            <button className="quiet-button" type="button" disabled>Szczegóły oferty niedostępne w podglądzie</button>
          </article>
          <article className="panel organizations-panel">
            <p className="eyebrow">TWOJA FIRMA</p>
            <h2>Profil wykonawcy</h2>
            <p>W pełnej aplikacji profil firmy i oferty wymagają połączenia z bazą.</p>
          </article>
        </div>
      ) : (
        <div className="workspace-grid">
          <article className="panel organizations-panel">
            <p className="eyebrow">ZAPYTANIE · PRZYKŁAD</p>
            <h2>Materiały do stanu surowego</h2>
            <p>Kraków · beton, stal zbrojeniowa, bloczki</p>
            <button className="quiet-button" type="button" disabled>Oferta niedostępna w podglądzie</button>
          </article>
          <article className="panel organizations-panel">
            <p className="eyebrow">TWÓJ SKLEP</p>
            <h2>Katalog i zamówienia</h2>
            <p>Przykładowy widok sklepu. Dane i zamówienia wymagają połączenia z bazą.</p>
          </article>
        </div>
      )}
    </section>
  );
}