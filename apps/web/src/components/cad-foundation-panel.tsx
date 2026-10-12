"use client";

import { useState } from "react";
import { FoundationBaseSchema, getCadWallDefaults, getFoundationSupportOptions, type ConstructionTechnologySelections } from "@asystent/schemas";
import type { FoundationWallSetup } from "@asystent/domain";
import { cadError } from "@/lib/cad-client";

export function CadFoundationPanel({ technology, hints, onConfigure, onUpdate }: {
  technology: ConstructionTechnologySelections; hints: { material: string; thermal: boolean; label: string }[];
  onConfigure: (setup: FoundationWallSetup) => void; onUpdate?: (setup: FoundationWallSetup) => void;
}) {
  const options = getFoundationSupportOptions(technology);
  const [type, setType] = useState(options.length === 1 ? options[0]!.value : "");
  const [side, setSide] = useState<"left" | "right" | "both">("left");
  const [boundary, setBoundary] = useState(true);
  const [error, setError] = useState("");
  const defaults = getCadWallDefaults(technology, true);
  const [values, setValues] = useState({ wallWidth: defaults.widthMm === null ? "" : String(defaults.widthMm),
    wallHeight: "", wallMaterial: defaults.material ?? "", reference: "",
    baseWidth: "", baseDepth: "", slabThickness: "", overhang: "", slabMaterial: "", thermal: "", waterproof: "" });
  const thermal = hints.find((hint) => hint.thermal);
  const waterproof = hints.find((hint) => /Izolacja przeciwwilgociowa|Hydroizolacja/i.test(hint.label));
  const input = (key: keyof typeof values, label: string, text = false) => <label>{label}<input
    type={text ? "text" : "number"} step="any" value={values[key]}
    onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>;
  function apply(update = false) {
    try {
      const required = ["wallWidth", "wallHeight", "wallMaterial",
        ...(type === "strip" ? ["baseWidth", "baseDepth"] : type === "slab" ? ["slabThickness", "overhang", "slabMaterial"] : []),
        ...(thermal ? ["thermal"] : []), ...(waterproof ? ["waterproof"] : [])];
      if (!type || required.some((key) => !values[key as keyof typeof values].trim())) throw new Error("Wybierz podparcie i uzupełnij parametry z projektu.");
      const reference = values.reference.trim() || "Do uzupełnienia z projektu";
      const base = FoundationBaseSchema.parse(type === "strip" ? { type, widthMm: Number(values.baseWidth), depthMm: Number(values.baseDepth), designReference: reference }
        : type === "slab" ? { type, thicknessMm: Number(values.slabThickness), overhangMm: Number(values.overhang),
          boundary, material: values.slabMaterial, designReference: reference }
          : { type, designReference: reference });
      const setup: FoundationWallSetup = { widthMm: Number(values.wallWidth), heightMm: Number(values.wallHeight),
        material: values.wallMaterial, base, buildUp: [
          ...(waterproof ? [{ purpose: "waterproofing" as const, material: waterproof.material, thicknessMm: Number(values.waterproof), side }] : []),
          ...(thermal ? [{ purpose: "thermal" as const, material: thermal.material, thicknessMm: Number(values.thermal), side }] : []),
        ] };
      if (update && onUpdate) onUpdate(setup); else onConfigure(setup);
      setError("");
    } catch (cause) { setError(cadError(cause)); }
  }
  return <details className="cad-generator" open>
    <summary>Ściana fundamentowa i jej podparcie</summary>
    <div className="cad-foundation-fields">
    <fieldset><legend>Ściana</legend>
    {defaults.material && <p>Materiał z ankiety: <strong>{defaults.material}</strong>
      {defaults.widthMm !== null && <> · ustawiono {defaults.widthMm / 10} cm. Możesz zmienić grubość.</>}</p>}
    {input("wallWidth", "Grubość ściany fundamentowej (mm)")}{input("wallHeight", "Wysokość ściany fundamentowej (mm)")}
    {input("wallMaterial", "Materiał ściany fundamentowej", true)}
    </fieldset><fieldset><legend>Podparcie z projektu</legend>
    <label htmlFor="cad-foundation-base">Podparcie rysowanej ściany</label><select id="cad-foundation-base" value={type} onChange={(event) => setType(event.target.value)}>
      <option value="">Wybierz z danych budowy</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {type === "strip" && <>{input("baseWidth", "Szerokość automatycznej ławy (mm)")}{input("baseDepth", "Wysokość automatycznej ławy (mm)")}</>}
    {type === "slab" && <>{input("slabThickness", "Grubość automatycznej płyty (mm)")}{input("overhang", "Wysunięcie płyty poza lico ściany (mm)")}
      {input("slabMaterial", "Beton płyty według projektu", true)}
      <label className="checkbox-field"><input type="checkbox" checked={boundary} onChange={(e) => setBoundary(e.target.checked)} /> Ściana obwodowa płyty</label>
      <p>Płyta powstanie po zamknięciu obwodu. Ściany wewnętrzne nie wyznaczają jej granicy. Bez ścian użyj narzędzia płyty.</p></>}
    {type === "manual" && <p>Nie dobieramy rozstawu stóp ani pali. Przenieś podparcie i jego wymiary z projektu odpowiednimi narzędziami.</p>}
    </fieldset>
    {(thermal || waterproof) && <fieldset><legend>Izolacje</legend><p>Warstwy wybrane w danych budowy: {waterproof?.material} {thermal?.material}</p>
      {waterproof && input("waterproof", "Grubość hydroizolacji ściany (mm)")}{thermal && input("thermal", "Grubość ocieplenia ściany (mm)")}
      <label htmlFor="cad-foundation-side">Strona izolacji względem kierunku ściany</label><select id="cad-foundation-side" value={side} onChange={(e) => {
        if (e.target.value === "left" || e.target.value === "right" || e.target.value === "both") setSide(e.target.value);
      }}><option value="left">Lewa</option><option value="right">Prawa</option><option value="both">Obie</option></select></fieldset>}
    </div>
    <details className="cad-generator"><summary>Opcjonalne odniesienie do dokumentacji</summary>
      {input("reference", "Rysunek fundamentów / pozycja", true)}</details>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    <button type="button" className="quiet-button" onClick={() => apply()}>Zastosuj do nowych ścian</button>
    {onUpdate && <button type="button" className="quiet-button" onClick={() => apply(true)}>Zmień zaznaczoną ścianę</button>}
  </details>;
}
