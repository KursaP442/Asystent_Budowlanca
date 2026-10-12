"use client";

import { getCadWallDefaults, getFoundationSupportOptions, type ConstructionTechnologySelections, type FoundationSettings } from "@asystent/schemas";
import { configureFoundationWall, createCadElement, foundationSetupFromSettings, type FoundationWallSetup } from "@asystent/domain";
import { cadError } from "@/lib/cad-client";

export function initialFoundationSettings(technology: ConstructionTechnologySelections): FoundationSettings {
  const options = getFoundationSupportOptions(technology), defaults = getCadWallDefaults(technology, true);
  return { type: options.length === 1 ? options[0]!.value : "", side: "exterior", boundary: true,
    wallWidth: defaults.widthMm === null ? "" : String(defaults.widthMm), wallHeight: "", wallMaterial: defaults.material ?? "",
    reference: "", baseWidth: "", baseDepth: "", slabThickness: "", overhang: "", slabMaterial: "", thermal: "", waterproof: "" };
}

export function CadFoundationPanel({ technology, hints, values, onChange, onUpdate }: {
  technology: ConstructionTechnologySelections; hints: { material: string; thermal: boolean; label: string }[];
  values: FoundationSettings; onChange: (settings: FoundationSettings) => void; onUpdate?: (setup: FoundationWallSetup) => void;
}) {
  const options = getFoundationSupportOptions(technology), defaults = getCadWallDefaults(technology, true);
  const thermal = hints.find((hint) => hint.thermal);
  const waterproof = hints.find((hint) => /Izolacja przeciwwilgociowa|Hydroizolacja/i.test(hint.label));
  let setup: FoundationWallSetup | null = null, error = "";
  try {
    if (!options.some((option) => option.value === values.type)) throw new Error("Wybierz podparcie zgodne z aktualnymi danymi budowy.");
    setup = foundationSetupFromSettings(values, hints);
    configureFoundationWall(createCadElement("foundation-wall", [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
      { id: "00000000-0000-4000-8000-000000000001" }), setup);
  } catch (cause) { error = cadError(cause); setup = null; }
  const input = (key: keyof Pick<FoundationSettings, "wallWidth" | "wallHeight" | "wallMaterial" | "reference"
    | "baseWidth" | "baseDepth" | "slabThickness" | "overhang" | "slabMaterial" | "thermal" | "waterproof">, label: string, text = false) =>
    <label>{label}<input type={text ? "text" : "number"} step="any" value={values[key]}
      onChange={(event) => onChange({ ...values, [key]: event.target.value })} /></label>;
  return <details className="cad-generator" open>
    <summary>Ściana fundamentowa i jej podparcie</summary>
    <p className="cad-settings-status">{setup ? "Parametry gotowe dla nowych ścian. Zmiany zapisują się automatycznie."
      : error}</p>
    <div className="cad-foundation-fields">
      <fieldset><legend>Ściana</legend>
        {defaults.material && <p>Materiał z ankiety: <strong>{defaults.material}</strong>
          {defaults.widthMm !== null && <> · {defaults.widthMm / 10} cm. Grubość możesz zmienić.</>}</p>}
        {input("wallWidth", "Grubość ściany fundamentowej (mm)")}{input("wallHeight", "Wysokość ściany fundamentowej (mm)")}
        {input("wallMaterial", "Materiał ściany fundamentowej", true)}
      </fieldset>
      <fieldset><legend>Podparcie z projektu</legend>
        <label htmlFor="cad-foundation-base">Podparcie rysowanej ściany</label>
        <select id="cad-foundation-base" value={values.type} onChange={(event) => {
          const type = event.target.value;
          if (type === "" || type === "strip" || type === "slab" || type === "manual") onChange({ ...values, type });
        }}>
          <option value="">Wybierz z danych budowy</option>{options.map((option) =>
            <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {values.type === "strip" && <>{input("baseWidth", "Szerokość automatycznej ławy (mm)")}{input("baseDepth", "Wysokość automatycznej ławy (mm)")}</>}
        {values.type === "slab" && <>{input("slabThickness", "Grubość automatycznej płyty (mm)")}{input("overhang", "Wysunięcie płyty poza lico ściany (mm)")}
          {input("slabMaterial", "Beton płyty według projektu", true)}
          <label className="checkbox-field"><input type="checkbox" checked={values.boundary}
            onChange={(e) => onChange({ ...values, boundary: e.target.checked })} /> Ściana obwodowa płyty</label>
          <p>Płyta fundamentowa powstaje po zamknięciu obwodu. Płyta denna między ławami jest osobnym wyborem w ankiecie.</p></>}
        {values.type === "manual" && <p>Przenieś stopy lub pale z projektu. Nie dobieramy rozstawu ani nośności.</p>}
      </fieldset>
      {(thermal || waterproof) && <fieldset><legend>Izolacje</legend>
        <p>{waterproof?.material} {thermal?.material}</p>
        {waterproof && <>{input("waterproof", "Grubość hydroizolacji ściany (mm)")}
          <label htmlFor="cad-foundation-side">Strona hydroizolacji</label>
          <select id="cad-foundation-side" value={values.side} onChange={(e) => {
            const side = e.target.value;
            if (side === "interior" || side === "exterior" || side === "both") onChange({ ...values, side });
          }}><option value="interior">Od wewnątrz</option><option value="exterior">Od zewnątrz</option><option value="both">Obie strony</option></select></>}
        {thermal && <>{input("thermal", "Grubość ocieplenia ściany (mm)")}<p>Ocieplenie po zewnętrznym licu obrysu.
          Strony wewnętrzna/zewnętrzna są wyznaczane po zamknięciu obrysu. Dla ścian wewnętrznych wybierz stronę ręcznie we właściwościach.</p></>}
      </fieldset>}
    </div>
    <details className="cad-generator"><summary>Opcjonalne odniesienie do dokumentacji</summary>
      {input("reference", "Rysunek fundamentów / pozycja", true)}</details>
    {onUpdate && <button type="button" className="quiet-button" disabled={!setup}
      onClick={() => { if (setup) onUpdate(setup); }}>Zmień zaznaczoną ścianę</button>}
  </details>;
}
