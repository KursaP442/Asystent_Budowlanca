"use client";

import { useEffect, useRef, useState } from "react";
import { getCadWallDefaults, getFoundationSupportOptions, type ConstructionTechnologySelections, type FoundationSettings } from "@asystent/schemas";
import { checkFoundationPlanCompleteness, configureFoundationWall, createCadElement, foundationSetupFromSettings,
  type FoundationPlanCheckIssue, type FoundationWallSetup } from "@asystent/domain";
import type { CadDocument, CadEntity } from "@asystent/schemas";
import { cadError } from "@/lib/cad-client";

function hasFoundationGeometryEntity(entity: CadEntity) {
  return entity.kind === "footing" || entity.kind === "slab"
    || entity.kind === "construction-line" && entity.attributes.role === "foundation-wall"
    || entity.kind === "construction-area" && ["pad", "column"].includes(entity.attributes.role);
}

export function initialFoundationSettings(technology: ConstructionTechnologySelections): FoundationSettings {
  const options = getFoundationSupportOptions(technology), defaults = getCadWallDefaults(technology, true);
  return { type: options.length === 1 ? options[0]!.value : "", side: "exterior", boundary: true,
    wallWidth: defaults.widthMm === null ? "" : String(defaults.widthMm), wallHeight: "", wallMaterial: defaults.material ?? "",
    reference: "", baseWidth: "", baseDepth: "", slabThickness: "", overhang: "", slabMaterial: "", thermal: "", waterproof: "" };
}

export function CadFoundationPanel({ technology, hints, values, drawing, title, onChange, onDrawingChange,
  onSaveDraft, onContinue, onOpenSections, onSelectEntity, onUpdate }: {
  technology: ConstructionTechnologySelections; hints: { material: string; thermal: boolean; label: string }[];
  values: FoundationSettings; drawing: CadDocument; title: string;
  onChange: (settings: FoundationSettings) => void; onDrawingChange: (drawing: CadDocument) => void;
  onSaveDraft: () => Promise<boolean>; onContinue: () => Promise<boolean>;
  onOpenSections: () => void; onSelectEntity: (id: string) => void;
  onUpdate?: (setup: FoundationWallSetup) => void;
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
  const setupComplete = !!setup;
  const hasFoundationGeometry = drawing.entities.some(hasFoundationGeometryEntity);
  const hasUnconfiguredFoundationWall = drawing.entities.some((entity) =>
    entity.kind === "construction-line" && entity.attributes.role === "foundation-wall" && !entity.foundationBase);
  const setupChecked = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  useEffect(() => {
    if (setupChecked.current) return;
    setupChecked.current = true;
    if (!setupComplete && (!hasFoundationGeometry || hasUnconfiguredFoundationWall)) setFirstRunOpen(true);
  }, [setupComplete, hasFoundationGeometry, hasUnconfiguredFoundationWall]);
  useEffect(() => {
    if (firstRunOpen) modalRef.current?.focus();
  }, [firstRunOpen]);

  const missingFields = new Set<keyof FoundationSettings>();
  const missingText = (value: string) =>
    !value.trim() || /do uzupełnienia|do potwierdzenia|zgodnie z projektem/i.test(value);
  if (!options.some((option) => option.value === values.type)) missingFields.add("type");
  const validPositiveMm = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000;
  if (!validPositiveMm(values.wallWidth)) missingFields.add("wallWidth");
  if (!validPositiveMm(values.wallHeight)) missingFields.add("wallHeight");
  if (missingText(values.wallMaterial)) missingFields.add("wallMaterial");
  if (values.type === "strip") {
    if (!validPositiveMm(values.baseWidth)) missingFields.add("baseWidth");
    if (!validPositiveMm(values.baseDepth)) missingFields.add("baseDepth");
  }
  if (values.type === "slab") {
    if (!validPositiveMm(values.slabThickness)) missingFields.add("slabThickness");
    if (!Number.isFinite(Number(values.overhang)) || Number(values.overhang) < 0 || Number(values.overhang) > 10000) missingFields.add("overhang");
    if (missingText(values.slabMaterial)) missingFields.add("slabMaterial");
  }
  if (thermal && !validPositiveMm(values.thermal)) missingFields.add("thermal");
  if (waterproof && !validPositiveMm(values.waterproof)) missingFields.add("waterproof");

  const completeness = checkFoundationPlanCompleteness(drawing);
  const issues: FoundationPlanCheckIssue[] = [
    ...(!setupComplete ? [{ code: "setup", status: /jest węższa|nieprawidł|przekracza zakres/i.test(error)
      ? "error" as const : "missing" as const, target: "cad-foundation-settings" as const,
      message: error || "Uzupełnij parametry geometryczne wymagane przez wybrany typ fundamentowania." }] : []),
    ...completeness.issues,
  ];
  const status = issues.some(({ status: itemStatus }) => itemStatus === "error") ? "error"
    : issues.some(({ status: itemStatus }) => itemStatus === "missing") ? "requires-completion"
      : issues.some(({ status: itemStatus }) => itemStatus === "review") ? "requires-review" : "complete";
  const statusLabel = status === "error" ? "Błąd geometrii"
    : status === "requires-completion" ? "Wymaga uzupełnienia"
      : status === "requires-review" ? "Wymaga weryfikacji projektanta" : "Kompletne dane rzutu";

  const input = (key: keyof Pick<FoundationSettings, "wallWidth" | "wallHeight" | "wallMaterial" | "reference"
    | "baseWidth" | "baseDepth" | "slabThickness" | "overhang" | "slabMaterial" | "thermal" | "waterproof">,
    label: string, text = false, required = false, idPrefix = "cad-foundation") =>
    <label htmlFor={`${idPrefix}-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}
      <input id={`${idPrefix}-${key}`} type={text ? "text" : "number"} step={text ? undefined : 1}
        min={text ? undefined : key === "overhang" ? 0 : 1} max={text ? undefined : key === "overhang" ? 10000 : 1000000}
        aria-required={required} value={values[key]}
        onChange={(event) => onChange({ ...values, [key]: event.target.value })} /></label>;
  const fieldFor = (key: keyof FoundationSettings, required = true) => {
    if (key === "type") return <label key={key} htmlFor="cad-first-foundation-base">Typ fundamentowania{required && <span aria-hidden="true"> *</span>}
      <select id="cad-first-foundation-base" aria-required={required} value={values.type} onChange={(event) => {
        const type = event.target.value;
        if (type === "" || type === "strip" || type === "slab" || type === "manual") onChange({ ...values, type });
      }}>
        <option value="">Wybierz z danych budowy</option>{options.map((option) =>
          <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>;
    if (key === "side" || key === "boundary") return null;
    const labels: Partial<Record<keyof FoundationSettings, { label: string; text?: boolean }>> = {
      wallWidth: { label: "Grubość ściany fundamentowej (mm)" },
      wallHeight: { label: "Wysokość ściany fundamentowej (mm)" },
      wallMaterial: { label: "Materiał ściany fundamentowej", text: true },
      baseWidth: { label: "Szerokość automatycznej ławy (mm)" },
      baseDepth: { label: "Wysokość automatycznej ławy (mm)" },
      slabThickness: { label: "Grubość automatycznej płyty (mm)" },
      overhang: { label: "Wysunięcie płyty poza lico ściany (mm)" },
      slabMaterial: { label: "Beton płyty według projektu", text: true },
      thermal: { label: "Grubość ocieplenia (mm)" },
      waterproof: { label: "Grubość hydroizolacji ściany (mm)" },
    };
    const field = labels[key];
    return field ? <span className="cad-foundation-setup-field" key={key}>
      {input(key, field.label, field.text, required, "cad-first-foundation")}
    </span> : null;
  };
  const closeAfterSave = async (save: () => Promise<boolean>) => {
    if (await save()) setFirstRunOpen(false);
  };
  const visitIssue = (issue: FoundationPlanCheckIssue) => {
    if (issue.target === "foundation-sections") { setFirstRunOpen(false); onOpenSections(); return; }
    setShowChecklist(true);
    const linkedId = ["support-", "material-", "reference-"].find((prefix) => issue.code.startsWith(prefix));
    const linkedEntity = linkedId
      ? drawing.entities.find(({ id }) => id === issue.code.slice(linkedId.length))
      : issue.code === "axis-labels" || issue.code === "axis-review"
        ? drawing.entities.find((entity) => entity.kind === "construction-line" && entity.attributes.role === "axis"
          && (issue.code !== "axis-labels" || !entity.mark?.trim()))
        : issue.code === "designer-review"
          ? drawing.entities.find((entity) => hasFoundationGeometryEntity(entity) && entity.reviewStatus !== "verified")
          : undefined;
    if (linkedEntity) onSelectEntity(linkedEntity.id);
    if (issue.target) window.document.getElementById(issue.target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (issue.target === "cad-foundation-settings") window.document.getElementById("cad-foundation-wallWidth")?.focus();
    if (issue.target === "cad-canvas") window.document.getElementById("cad-canvas")?.focus();
  };
  return <details className="cad-generator" id="cad-foundation-settings" open>
    <summary>Ściana fundamentowa i jej podparcie</summary>
    <button type="button" className={`cad-foundation-completeness is-${status}`} aria-expanded={showChecklist}
      onClick={() => setShowChecklist((open) => !open)}>{statusLabel} · {issues.length} pozycji do sprawdzenia</button>
    {showChecklist && <ul className="cad-foundation-checklist">
      {issues.length ? issues.map((issue) => <li key={issue.code} data-status={issue.status}>
        <button type="button" onClick={() => visitIssue(issue)}>{issue.message}</button>
      </li>) : <li>Nie wykryto braków. Kompletność danych nie stanowi zatwierdzenia konstrukcyjnego.</li>}
    </ul>}
    <p className="cad-settings-status">{setup ? "Parametry gotowe dla nowych ścian. Zmiany zapisują się automatycznie."
      : error}</p>
    <div className="cad-foundation-fields">
      <fieldset><legend>Ściana</legend>
        {defaults.material && <p>Materiał z ankiety: <strong>{defaults.material}</strong>
          {defaults.widthMm !== null && <> · {defaults.widthMm / 10} cm. Grubość możesz zmienić.</>}</p>}
        {input("wallWidth", "Grubość ściany fundamentowej (mm)", false, true)}
        {input("wallHeight", "Wysokość ściany fundamentowej (mm)", false, true)}
        {input("wallMaterial", "Materiał ściany fundamentowej", true, true)}
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
        {values.type === "strip" && <>{input("baseWidth", "Szerokość automatycznej ławy (mm)", false, true)}
          {input("baseDepth", "Wysokość automatycznej ławy (mm)", false, true)}</>}
        {values.type === "slab" && <>{input("slabThickness", "Grubość automatycznej płyty (mm)", false, true)}
          {input("overhang", "Wysunięcie płyty poza lico ściany (mm)", false, true)}
          {input("slabMaterial", "Beton płyty według projektu", true, true)}
          <label className="checkbox-field"><input type="checkbox" checked={values.boundary}
            onChange={(e) => onChange({ ...values, boundary: e.target.checked })} /> Ściana obwodowa płyty</label>
          <p>Płyta fundamentowa powstaje po zamknięciu obwodu. Płyta denna między ławami jest osobnym wyborem w ankiecie.</p></>}
        {values.type === "manual" && <p>Przenieś stopy lub pale z projektu. Nie dobieramy rozstawu ani nośności.</p>}
      </fieldset>
      {(thermal || waterproof) && <fieldset><legend>Izolacje</legend>
        <p>{waterproof?.material} {thermal?.material}</p>
        {waterproof && <>{input("waterproof", "Grubość hydroizolacji ściany (mm)", false, true)}
          <label htmlFor="cad-foundation-side">Strona hydroizolacji</label>
          <select id="cad-foundation-side" value={values.side} onChange={(e) => {
            const side = e.target.value;
            if (side === "interior" || side === "exterior" || side === "both") onChange({ ...values, side });
          }}><option value="interior">Od wewnątrz</option><option value="exterior">Od zewnątrz</option><option value="both">Obie strony</option></select></>}
        {thermal && <>{input("thermal", "Grubość ocieplenia ściany (mm)", false, true)}<p>Ocieplenie po zewnętrznym licu obrysu.
          Strony wewnętrzna/zewnętrzna są wyznaczane po zamknięciu obrysu. Dla ścian wewnętrznych wybierz stronę ręcznie we właściwościach.</p></>}
      </fieldset>}
    </div>
    <details className="cad-generator" id="cad-foundation-documents"><summary>Opcjonalne odniesienie do dokumentacji</summary>
      {input("reference", "Rysunek fundamentów / pozycja", true)}</details>
    {onUpdate && <button type="button" className="quiet-button" disabled={!setup}
      onClick={() => { if (setup) onUpdate(setup); }}>Zmień zaznaczoną ścianę</button>}
    {firstRunOpen && <div className="cad-foundation-setup-backdrop"><section ref={modalRef} tabIndex={-1}
      className="cad-foundation-setup-dialog form-stack" role="dialog" aria-modal="true"
      aria-labelledby="cad-foundation-setup-title" onKeyDown={(event) => {
        if (event.key === "Escape") setFirstRunOpen(false);
      }}>
      <header className="cad-heading"><div><h2 id="cad-foundation-setup-title">Dane do rzutu fundamentów</h2>
        <p>Pytamy tylko o brakujące wartości wymagane do przygotowania parametrów nowych elementów.</p></div>
        <button type="button" className="quiet-button" aria-label="Zamknij formularz" onClick={() => setFirstRunOpen(false)}>×</button>
      </header>
      {!setup && <p className="alert alert-error" role="alert">{error}</p>}
      <fieldset><legend>1. Informacje podstawowe</legend>
        {!options.some((option) => option.value === values.type) && fieldFor("type")}
        <p>Jednostki modelu: mm · skala arkusza: 1:{drawing.paperScale ?? 100} · rysunek: {title} · wersja zapisu: {drawing.revision}.</p>
      </fieldset>
      {(missingFields.has("wallWidth") || missingFields.has("wallHeight") || missingFields.has("baseWidth")
        || missingFields.has("baseDepth") || missingFields.has("slabThickness") || missingFields.has("overhang")) &&
        <fieldset><legend>2. Geometria fundamentów (z projektu konstrukcyjnego)</legend>
          {(["wallWidth", "wallHeight", "baseWidth", "baseDepth", "slabThickness", "overhang"] as const)
            .filter((key) => missingFields.has(key) || !setup).map((key) => fieldFor(key))}
        </fieldset>}
      {(missingFields.has("wallMaterial") || missingFields.has("slabMaterial") || missingFields.has("thermal")
        || missingFields.has("waterproof")) && <fieldset><legend>3. Materiały i izolacje</legend>
          {(["wallMaterial", "slabMaterial", "thermal", "waterproof"] as const)
            .filter((key) => missingFields.has(key) || !setup).map((key) => fieldFor(key))}
        </fieldset>}
      <fieldset><legend>4. Warunki posadowienia</legend>
        <p>Warunki gruntowo-wodne i poziomy pobieraj z dokumentacji geotechnicznej oraz przekrojów. Aplikacja nie zakłada ich wartości.</p>
        {drawing.documentReferences?.geotechnics?.trim()
          ? <p>Odwołanie geotechniczne zapisane: {drawing.documentReferences.geotechnics}</p>
          : <label htmlFor="cad-first-foundation-geotechnics">
            Odwołanie do dokumentacji geotechnicznej (opcjonalnie)
            <input id="cad-first-foundation-geotechnics" maxLength={240}
              value={drawing.documentReferences?.geotechnics ?? ""}
              onChange={(event) => onDrawingChange({ ...drawing, documentReferences: {
                ...drawing.documentReferences, geotechnics: event.target.value,
              } })} />
          </label>}
        <p>Rzędne poziomu ±0,00, terenu i posadowienia uzupełnia się w powiązanych przekrojach.</p>
      </fieldset>
      <fieldset><legend>5. Dane rysunkowe</legend>
        <p>{title} · identyfikator: {drawing.requirementId} · skala 1:{drawing.paperScale ?? 100} · wersja zapisu {drawing.revision}.
          Tytuł i numer wynikają z etapu projektu; skalę arkusza można zmienić w ustawieniach rysunku.</p>
      </fieldset>
      {!hasFoundationGeometry && <p className="cad-disclaimer">
        Nie ma geometrii fundamentów w projekcie. Zapis nie tworzy fikcyjnego obrysu; po przejściu do rzutu możesz narysować go albo zaimportować z dokumentacji.
      </p>}
      <footer className="form-actions">
        <button type="button" className="quiet-button" onClick={() => void closeAfterSave(onSaveDraft)}>Zapisz wersję roboczą</button>
        <button type="button" className="primary-button" disabled={!setup}
          onClick={() => void closeAfterSave(onContinue)}>Zapisz i przejdź do rzutu</button>
      </footer>
    </section></div>}
  </details>;
}
