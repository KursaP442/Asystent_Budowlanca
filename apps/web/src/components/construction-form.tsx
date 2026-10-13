"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ConstructionJob } from "@asystent/api-client";
import {
  ConstructionInputSchema,
  ConstructionTechnologySchema,
  constructionTechnologyCatalog,
  emptyConstructionTechnologySelections,
  getConstructionTechnologyStages,
  multiSelectTechnologyKeys,
  otherWorkTechnologyKeys,
  requiresTechnologyOptionDescription,
  projectScopeFromConstruction,
  type ProjectScope,
  type ConstructionTechnologySelections,
} from "@asystent/schemas";
import { getSupabaseClient } from "@/lib/supabase";
import { demoConstructionStorageKey, writeDemoValue } from "@/lib/demo-storage";
import { TechnologyQuestionnaire } from "@/components/technology-questionnaire";
import { ConstructionLocationMap } from "@/components/construction-location-map";
import { ProjectDocumentationQuestionnaire } from "@/components/project-documentation-questionnaire";

type Photo = { path: string; url: string };
type PendingPhoto = Photo & { file: File };
const bucket = "job-photos";
const constructionRequirements = "Wszystkie roboty muszą być prowadzone zgodnie z aktualną dokumentacją projektową, obowiązującymi przepisami i zasadami wiedzy technicznej. Zmiany technologii wymagają uzgodnienia z projektantem.";
const constructionAcceptance = "Odbiór robót odbywa się zgodnie z dokumentacją projektową, właściwymi wymaganiami technicznymi i zasadami sztuki budowlanej; roboty zanikające należy zgłaszać do odbioru przed ich zakryciem.";

export function ConstructionForm({ job, userId, isAdministrator, onSaved, onCancel, demoMode = false }: {
  job: ConstructionJob | null; userId: string; isAdministrator: boolean; onSaved: () => void; onCancel?: () => void;
  demoMode?: boolean;
}) {
  const [id] = useState(() => job?.id ?? crypto.randomUUID());
  const [persisted, setPersisted] = useState(!!job);
  const [kind, setKind] = useState<ConstructionJob["building_type"]>(job?.building_type ?? "house");
  const [activeTab, setActiveTab] = useState<"details" | "technology">("details");
  const [documentationScope, setDocumentationScope] = useState<ProjectScope | null>(null);
  const [technologySelections, setTechnologySelections] = useState<ConstructionTechnologySelections>(
    () => readTechnologySelections(job?.materials, job?.building_type ?? "house"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(!!job && !demoMode);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [city, setCity] = useState(job?.city ?? "");
  const [postalCode, setPostalCode] = useState(job?.postal_code ?? "");
  const initialAddress = splitAddress(job?.address ?? "");
  const [address, setAddress] = useState(initialAddress.address);
  const [buildingNumber, setBuildingNumber] = useState(initialAddress.number);
  const objectUrls = useRef<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const building = kind === "house" || kind === "extension";
  const prefix = `${userId}/${id}`;
  const mapQuery = useMemo(() => {
    const streetAndNumber = [address.trim(), buildingNumber.trim()].filter(Boolean).join(" ");
    const locationParts = [streetAndNumber, city.trim(), postalCode.trim()].filter(Boolean);
    return locationParts.length ? [...locationParts, "Polska"].join(", ") : "Warszawa, Polska";
  }, [address, buildingNumber, city, postalCode]);
  const googleMapsQuery = technologySelections.locationPin
    ? `${technologySelections.locationPin.lat},${technologySelections.locationPin.lng}`
    : mapQuery;
  useEffect(() => {
    const urls = objectUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  useEffect(() => {
    if (!persisted || demoMode) return;
    let active = true;
    async function load() {
      setLoadingPhotos(true);
      setPhotoLoadError(false);
      const storage = getSupabaseClient().storage.from(bucket);
      const { data, error: listError } = await storage.list(prefix, { limit: 100 });
      if (listError) throw listError;
      const result = await Promise.all(data.map(async (item) => {
        const path = `${prefix}/${item.name}`;
        const { data: signed, error: signError } = await storage.createSignedUrl(path, 3600);
        if (signError) throw signError;
        return { path, url: signed.signedUrl };
      }));
      if (active) setPhotos(result);
    }
    void load().catch((cause: unknown) => {
      if (active) { setPhotoLoadError(true); setError(`Nie udało się wczytać zdjęć: ${errorMessage(cause)}`); }
    }).finally(() => { if (active) setLoadingPhotos(false); });
    return () => { active = false; };
  }, [prefix, persisted, photoRevision, demoMode]);

  function readFormInput(form: FormData) {
    const number = (name: string) => form.get(name) ? Number(form.get(name)) : null;
    return {
      title: form.get("title"), city, address: joinAddress(address, buildingNumber), postal_code: postalCode,
      building_type: kind, area_m2: number("area_m2"), description: form.get("description"),
      floors: building ? number("floors") : null, basement: building ? form.get("basement") === "on" : null,
      plot_area_m2: building ? number("plot_area_m2") : null,
      rooms: kind === "renovation" ? form.get("rooms") : "",
      existing_condition: kind === "renovation" ? form.get("existing_condition") : "",
      work_category: kind === "other" ? form.get("work_category") : "",
      site_access: form.get("site_access"), utilities: form.get("utilities"),
      technology_selections: technologySelections,
      start_date: String(form.get("start_date") || ""), budget_pln: number("budget_pln"),
    };
  }

  function continueToTechnology() {
    setError("");
    setActiveTab("technology");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ConstructionInputSchema.safeParse(readFormInput(new FormData(event.currentTarget)));
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === "technology_selections")) setActiveTab("technology");
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true); setError("");
    try {
      const { technology_selections, ...jobInput } = parsed.data;
      const materials = JSON.stringify(technology_selections);
      const payload = {
        ...jobInput,
        requirements: constructionRequirements,
        acceptance_criteria: constructionAcceptance,
        materials,
        report_summary: buildReport({ ...jobInput, materials, technology_selections }),
      };
      if (demoMode) {
        writeDemoValue(demoConstructionStorageKey(id), { id, ...payload });
        setDocumentationScope(projectScopeFromConstruction(parsed.data));
        return;
      }
      const db = getSupabaseClient();
      const { error: saveError } = await (persisted
        ? db.from("construction_jobs").update(payload).eq("id", id).select("id").single()
        : db.from("construction_jobs").insert({ ...payload, id }).select("id").single());
      if (saveError) throw saveError;
      setPersisted(true);
      for (const photo of pending) {
        const { error: uploadError } = await db.storage.from(bucket).upload(photo.path, photo.file, { contentType: photo.file.type });
        if (uploadError) throw new Error(`Dane zlecenia zapisano, ale zdjęcie „${photo.file.name}” nie zostało przesłane: ${uploadError.message}. Ponów zapis, aby przesłać pozostałe zdjęcia.`);
        setPending((items) => items.filter((item) => item.path !== photo.path));
      }
      setDocumentationScope(projectScopeFromConstruction(parsed.data));
    } catch (cause) { setError(errorMessage(cause)); setPhotoRevision((value) => value + 1); }
    finally { setBusy(false); }
  }

  async function removePhoto(photo: Photo) {
    setBusy(true); setError("");
    try {
      const { error: deleteError } = await getSupabaseClient().storage.from(bucket).remove([photo.path]);
      if (deleteError) throw deleteError;
      setPhotos((items) => items.filter((item) => item.path !== photo.path));
    } catch (cause) { setError(`Nie udało się usunąć zdjęcia: ${errorMessage(cause)}`); }
    finally { setBusy(false); }
  }

  return <div className="cad-survey construction-workspace"><form ref={formRef} hidden={documentationScope !== null} className="panel workflow-form form-stack" onSubmit={save}>
    <nav className="cad-progress" aria-label="Kroki budowy">
      <button type="button" aria-current={activeTab === "details" ? "step" : undefined} onClick={() => setActiveTab("details")}><b>1</b>Dane budowy</button>
      <button type="button" aria-current={activeTab === "technology" ? "step" : undefined} onClick={continueToTechnology}><b>2</b>Materiały i technologia</button>
      <span><b>3</b>Projekt</span>
    </nav>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <fieldset disabled={busy}>
      <legend>Dane ogólne budowy</legend>
      <div className="construction-tabs" role="tablist" aria-label="Sekcje wniosku">
        <button id="construction-details-tab" type="button" role="tab" aria-selected={activeTab === "details"} aria-controls="construction-details-panel" onClick={() => setActiveTab("details")}>Dane budowy</button>
        <button id="construction-technology-tab" type="button" role="tab" aria-selected={activeTab === "technology"} aria-controls="construction-technology-panel" onClick={continueToTechnology}>Materiały i technologia</button>
      </div>
      {isAdministrator && activeTab === "details" && (
        <button className="quiet-button admin-shortcut" type="button" onClick={() => setActiveTab("technology")}>
          Pomiń walidację i przejdź do materiałów i technologii
        </button>
      )}
      <section id="construction-details-panel" role="tabpanel" aria-labelledby="construction-details-tab" hidden={activeTab !== "details"}>
      <div className="form-grid">
        <label className="span-two">Nazwa budowy<input name="title" required={activeTab === "details"} maxLength={120} defaultValue={job?.title} placeholder="np. Budowa domu / remont mieszkania" /></label>
        <div><label htmlFor="job-kind">Rodzaj prac</label><select id="job-kind" name="building_type" value={kind} onChange={(e) => setKind(e.target.value as ConstructionJob["building_type"])}><option value="house">Budowa domu</option><option value="extension">Rozbudowa</option><option value="renovation">Remont</option><option value="other">Inne prace</option></select></div>
        <label>Kod pocztowy<input name="postal_code" required={activeTab === "details"} pattern="[0-9]{2}-[0-9]{3}" maxLength={6} value={postalCode} onChange={(e) => {
          setPostalCode(e.target.value);
          setTechnologySelections((current) => ({ ...current, locationPin: null }));
        }} placeholder="00-000" /></label>
        <label>Miejscowość<input name="city" required={activeTab === "details"} maxLength={120} value={city} onChange={(e) => {
          setCity(e.target.value);
          setTechnologySelections((current) => ({ ...current, locationPin: null }));
        }} autoComplete="address-level2" /></label>
        <label>Ulica lub nazwa miejsca<input name="address" required={activeTab === "details"} maxLength={200} value={address} onChange={(e) => {
          setAddress(e.target.value);
          setTechnologySelections((current) => ({ ...current, locationPin: null }));
        }} placeholder="np. Grabie" /></label>
        <label>Nr budynku / działki<input name="building_number" maxLength={32} value={buildingNumber} onChange={(e) => {
          setBuildingNumber(e.target.value);
          setTechnologySelections((current) => ({ ...current, locationPin: null }));
        }} placeholder="np. 156a" /></label>
        <div className="span-two location-preview">
          <h3>Podgląd lokalizacji na mapie</h3>
          <p>Adres wyszukujemy bezpośrednio w Google Maps. Sprawdź, czy mapa wskazuje właściwą miejscowość i numer budynku; możesz też otworzyć wynik w pełnej wersji Google Maps.</p>
          <ConstructionLocationMap
            query={mapQuery}
            locationPin={technologySelections.locationPin}
          />
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleMapsQuery)}`} target="_blank" rel="noopener noreferrer">Otwórz Google Maps w nowej karcie</a>
        </div>
        <div><label htmlFor="job-area">Powierzchnia (m²)</label><input id="job-area" name="area_m2" aria-describedby="job-area-help" type="number" required={activeTab === "details"} min="0.01" max={100000} step="0.01" defaultValue={job?.area_m2} /><small id="job-area-help">{building ? "Powierzchnia planowanej budowy / rozbudowy." : "Powierzchnia objęta pracami, nie całego budynku."}</small></div>
        {building && <>
          <label>Powierzchnia działki (m², opcjonalnie)<input name="plot_area_m2" type="number" min="0.01" max={10000000} step="0.01" defaultValue={job?.plot_area_m2 ?? ""} /></label>
          <label>Liczba kondygnacji<input name="floors" type="number" required={activeTab === "details"} min={1} max={100} defaultValue={job?.floors ?? 1} /></label>
          <label className="checkbox-field"><input name="basement" type="checkbox" defaultChecked={job?.basement ?? false} /> Budynek z piwnicą</label>
        </>}
        {kind === "renovation" && <label className="span-two">Pomieszczenia do remontu<input name="rooms" required={activeTab === "details"} maxLength={500} defaultValue={job?.rooms} placeholder="np. Kuchnia, łazienka, dwa pokoje" /></label>}
        {kind === "renovation" && <label className="span-two">Stan istniejący<textarea name="existing_condition" required={activeTab === "details"} maxLength={2000} rows={3} defaultValue={job?.existing_condition} placeholder="Opisz stan ścian, podłóg, instalacji i elementów do naprawy." /></label>}
        {kind === "other" && <label className="span-two">Kategoria prac<input name="work_category" required={activeTab === "details"} maxLength={120} defaultValue={job?.work_category} placeholder="np. Ogrodzenie, podjazd, zagospodarowanie terenu" /></label>}
        <label className="span-two">{kind === "other" ? "Opis prac do wykonania" : "Zakres prac"}<textarea name="description" required={activeTab === "details"} maxLength={4000} rows={4} defaultValue={job?.description} placeholder={building ? "Opisz zakres budowy i oczekiwany etap zakończenia." : kind === "other" ? "Konkretnie opisz, jakie prace mają zostać wykonane i gdzie." : "Opisz prace do wykonania i oczekiwany efekt."} /></label>
        <label className="span-two">Dostęp i warunki prowadzenia prac<textarea name="site_access" maxLength={1000} rows={2} defaultValue={job?.site_access} placeholder={building ? "Dojazd, miejsce na sprzęt, składowanie materiałów." : "Piętro, winda, godziny prac, czy lokal będzie zamieszkany."} /></label>
        <label className="span-two">Media i instalacje<textarea name="utilities" maxLength={1000} rows={2} defaultValue={job?.utilities} placeholder="Dostęp do prądu, wody, kanalizacji; zakres zmian instalacji." /></label>
        <label>Planowany termin<input name="start_date" required={activeTab === "details"} type="date" defaultValue={job?.start_date ?? ""} /></label>
        <label>Budżet w PLN (opcjonalnie)<input name="budget_pln" type="number" min="0.01" max={1000000000} step="0.01" defaultValue={job?.budget_pln ?? ""} /></label>
        <section className="span-two photo-section" aria-label="Zdjęcia miejsca prac">
          <h3>Zdjęcia {building ? "działki i budynku" : kind === "renovation" ? "pomieszczeń do remontu" : "miejsca prac"}</h3>
          <p>{demoMode
            ? "Dodawanie zdjęć wymaga połączenia z backendem i jest niedostępne w trybie testowym."
            : "JPEG, PNG lub WebP, do 10 MB na zdjęcie. Do 10 zdjęć w formularzu. Zdjęcia są prywatne; oczekujące zostaną przesłane przy zapisie."}</p>
          {loadingPhotos ? <p role="status">Wczytywanie zdjęć…</p> : photoLoadError
            ? <button type="button" className="quiet-button" onClick={() => { setError(""); setPhotoRevision((value) => value + 1); }}>Ponów wczytywanie zdjęć</button>
            : <label>Dodaj zdjęcia<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={demoMode} onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (photos.length + pending.length + files.length > 10) { setError("Możesz dodać maksymalnie 10 zdjęć."); return; }
            if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10485760 || file.size === 0)) {
              setError("Wybierz niepuste zdjęcia JPEG, PNG lub WebP do 10 MB."); return;
            }
            setError("");
            const selected = files.map((file) => {
              const url = URL.createObjectURL(file);
              objectUrls.current.push(url);
              return { file, path: `${prefix}/${crypto.randomUUID()}`, url };
            });
            setPending((items) => [...items, ...selected]);
          }} /></label>}
          <div className="photo-grid">{photos.map((photo, index) => <figure key={photo.path}>
            {/* Signed local Storage URLs are not compatible with the Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Zapisane zdjęcie miejsca prac ${index + 1}`} />
            <button type="button" className="quiet-button" onClick={() => void removePhoto(photo)}>Usuń zapisane zdjęcie {index + 1}</button>
          </figure>)}{pending.map((photo) => <figure key={photo.path}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.file.name} /><figcaption>{photo.file.name} — oczekuje na zapis</figcaption>
            <button type="button" className="quiet-button" onClick={() => setPending((items) => items.filter((item) => item.path !== photo.path))}>Usuń {photo.file.name}</button>
          </figure>)}</div>
        </section>
      </div>
      </section>
      <section id="construction-technology-panel" className="span-two technology-panel" role="tabpanel" aria-labelledby="construction-technology-tab" hidden={activeTab !== "technology"}>
        <h2>Materiały i technologia</h2>
        <TechnologyQuestionnaire
          workType={kind}
          selections={technologySelections}
          onChange={(key, value) => setTechnologySelections((current) => ({ ...current, [key]: value }))}
          onOtherDescriptionChange={(key, value) => setTechnologySelections((current) => ({
            ...current,
            otherDescriptions: { ...current.otherDescriptions, [key]: value },
          }))}
        />
        {technologySelections.legacyNotes && <p className="technology-legacy">
          Zachowano notatkę materiałową z poprzedniej wersji wniosku: {technologySelections.legacyNotes}
        </p>}
      </section>
    </fieldset>
    <div className="form-actions">{isAdministrator && activeTab === "technology" && <button type="button" className="quiet-button admin-shortcut" disabled={busy} onClick={() => setActiveTab("details")}>Wróć do danych bez walidacji</button>}{onCancel && <button type="button" className="quiet-button" disabled={busy} onClick={onCancel}>Wróć do panelu</button>}
      <button className="primary-button" disabled={busy || loadingPhotos || photoLoadError}>{busy ? "Zapisywanie…" : "Przejdź dalej"}</button></div>
  </form>
    {documentationScope && <ProjectDocumentationQuestionnaire jobId={id} scope={documentationScope} demoMode={demoMode}
      onBack={(tab = "details") => { setActiveTab(tab); setDocumentationScope(null); }} onSaved={onSaved} />}
  </div>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Nie udało się wykonać operacji. Spróbuj ponownie.";
}

function splitAddress(value: string) {
  const match = value.trim().match(/^(.+?)\s+(\d+[a-z]?(?:\/\d+[a-z]?)?)$/i);
  return match ? { address: match[1], number: match[2] } : { address: value, number: "" };
}

function joinAddress(address: string, number: string) {
  return [address.trim(), number.trim()].filter(Boolean).join(" ");
}

function readTechnologySelections(materials: string | undefined, workType: ConstructionJob["building_type"]): ConstructionTechnologySelections {
  if (!materials) return { ...emptyConstructionTechnologySelections };
  try {
    const value: unknown = JSON.parse(materials);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...emptyConstructionTechnologySelections, legacyNotes: materials };
    }
    const saved = value as Record<string, unknown>;
    const normalized = {
      ...emptyConstructionTechnologySelections,
      ...saved,
      ...Object.fromEntries(multiSelectTechnologyKeys.map((key) => {
        const legacyValue = saved[key];
        return [key, Array.isArray(legacyValue)
          ? legacyValue
          : typeof legacyValue === "string" && legacyValue
            ? [legacyValue]
            : []];
      })),
    } as Record<string, unknown>;
    if (workType === "other") {
      const legacyCategories: Record<string, string> = {
        "fence-masonry": "fencing",
        "fence-panel": "fencing",
        "fence-wood": "fencing",
        "fence-wrought-iron": "fencing",
        "fence-concrete": "fencing",
        "driveway-pavers": "driveway-paving",
        "driveway-slabs": "driveway-paving",
        "driveway-asphalt": "driveway-paving",
        "driveway-resin-gravel": "driveway-paving",
        "paving-around-house": "driveway-paving",
        "facade-insulation": "facade-work",
        "external-insulation": "facade-work",
      };
      const categories = normalized.otherWorkTechnology;
      if (Array.isArray(categories)) {
        normalized.otherWorkTechnology = [...new Set(categories.map((category) =>
          typeof category === "string" ? legacyCategories[category] ?? category : category,
        ))];
      }
      for (const key of otherWorkTechnologyKeys) {
        const value = normalized[key];
        if (Array.isArray(value)) normalized[key] = value.filter((item) => item !== "project");
        else if (value === "project") normalized[key] = null;
      }
    }
    const parsed = ConstructionTechnologySchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
  } catch {
    return { ...emptyConstructionTechnologySelections, legacyNotes: materials };
  }
  return { ...emptyConstructionTechnologySelections, legacyNotes: materials };
}

function buildReport(input: Pick<ConstructionJob, "title" | "building_type" | "city" | "postal_code" | "address" | "description" | "area_m2" | "start_date" | "budget_pln" | "materials" | "site_access" | "utilities" | "rooms" | "existing_condition" | "work_category"> & {
  technology_selections: ConstructionTechnologySelections;
}) {
  const typeLabel = input.building_type === "house" ? "Budowa domu" : input.building_type === "extension" ? "Rozbudowa" : input.building_type === "renovation" ? "Remont" : "Inne prace";
  const technologyReport = getConstructionTechnologyStages(input.building_type, input.technology_selections)
    .map((key) => {
      const stage = constructionTechnologyCatalog[key];
      const values = input.technology_selections[key];
      const selectedValues = Array.isArray(values) ? values : values ? [values] : [];
      const choices = selectedValues.map((value) => {
        const choice = stage.options.find((option) => option.value === value);
        const description = input.technology_selections.otherDescriptions[key];
        return `${choice?.label ?? "nie wybrano"}${requiresTechnologyOptionDescription(key, value) && description ? ` — ${description}` : ""}`;
      });
      return `${stage.label}: ${choices.length ? choices.join("; ") : "nie wybrano"}`;
    })
    .join("\n");
  const optional = input.building_type === "renovation"
    ? `Pomieszczenia: ${input.rooms || "nie podano"}\nStan istniejący: ${input.existing_condition || "nie podano"}`
    : input.building_type === "other"
      ? `Kategoria: ${input.work_category || "nie podano"}`
      : "Zakres dotyczy budynku i otoczenia.";
  return `Raport wniosku: ${input.title}
Typ prac: ${typeLabel}
Lokalizacja: ${input.postal_code} ${input.city}, ${input.address}
Termin rozpoczęcia: ${input.start_date}
Powierzchnia: ${input.area_m2} m²
Budżet: ${input.budget_pln ? `${input.budget_pln} PLN` : "nie określono"}
Zakres: ${input.description}
Dane techniczne: zgodność z dokumentacją projektową, obowiązującymi przepisami i zasadami wiedzy technicznej.
Materiały i technologie:
${technologyReport}
${input.technology_selections.legacyNotes ? `Notatka materiałowa z poprzedniej wersji: ${input.technology_selections.legacyNotes}` : ""}
Dostęp i warunki: ${input.site_access || "nie określono"}
Media i instalacje: ${input.utilities || "nie określono"}
Szczegóły rodzaju prac: ${optional}`;
}
