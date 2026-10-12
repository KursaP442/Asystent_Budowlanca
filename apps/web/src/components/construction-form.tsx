"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ConstructionJob } from "@asystent/api-client";
import { ConstructionInputSchema } from "@asystent/schemas";
import { getSupabaseClient } from "@/lib/supabase";

type Photo = { path: string; url: string };
type PendingPhoto = Photo & { file: File };
const bucket = "job-photos";

export function ConstructionForm({ job, userId, onSaved, onCancel }: {
  job: ConstructionJob | null; userId: string; onSaved: () => void; onCancel?: () => void;
}) {
  const [id] = useState(() => job?.id ?? crypto.randomUUID());
  const [persisted, setPersisted] = useState(!!job);
  const [kind, setKind] = useState<ConstructionJob["building_type"]>(job?.building_type ?? "house");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(!!job);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [city, setCity] = useState(job?.city ?? "");
  const [postalCode, setPostalCode] = useState(job?.postal_code ?? "");
  const [address, setAddress] = useState(job?.address ?? "");
  const objectUrls = useRef<string[]>([]);
  const building = kind === "house" || kind === "extension";
  const prefix = `${userId}/${id}`;
  const mapQuery = useMemo(() => {
    const query = [address.trim(), postalCode.trim(), city.trim()].filter(Boolean).join(", ");
    return query || "Warszawa, Polska";
  }, [address, city, postalCode]);
  const typeGuidance = kind === "house"
    ? {
      steps: ["Zakres stanu surowego i fundamentów", "Instalacje i harmonogram ekip", "Kryteria odbioru i jakość materiałów"],
      placeholder: "Opisz kolejność robót: fundamenty, mury, strop, instalacje, wykończenie.",
    }
    : kind === "extension"
      ? {
        steps: ["Powiązanie z istniejącym budynkiem", "Zakres konstrukcyjny i instalacje", "Wymagania odbioru końcowego"],
        placeholder: "Opisz połączenie nowej części z istniejącą i wymagane przebudowy instalacji.",
      }
      : kind === "renovation"
        ? {
          steps: ["Demontaże i przygotowanie pomieszczeń", "Nowe wykończenia i ewentualne instalacje", "Kryteria odbioru estetyki i działania"],
          placeholder: "Opisz kolejność remontu pomieszczeń i standard wykończenia po odbiorze.",
        }
        : {
          steps: ["Przygotowanie miejsca robót", "Główne prace i zabezpieczenia", "Warunki odbioru oraz testy końcowe"],
          placeholder: "Opisz plan realizacji i sposób odbioru nietypowego zakresu.",
        };

  useEffect(() => {
    const urls = objectUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  useEffect(() => {
    if (!persisted) return;
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
  }, [prefix, persisted, photoRevision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string) => form.get(name) ? Number(form.get(name)) : null;
    const parsed = ConstructionInputSchema.safeParse({
      title: form.get("title"), city, address, postal_code: postalCode,
      building_type: kind, area_m2: number("area_m2"), description: form.get("description"),
      floors: building ? number("floors") : null, basement: building ? form.get("basement") === "on" : null,
      plot_area_m2: building ? number("plot_area_m2") : null,
      rooms: kind === "renovation" ? form.get("rooms") : "",
      existing_condition: kind === "renovation" ? form.get("existing_condition") : "",
      work_category: kind === "other" ? form.get("work_category") : "",
      site_access: form.get("site_access"), utilities: form.get("utilities"),
      requirements: form.get("requirements"), acceptance_criteria: form.get("acceptance_criteria"),
      materials: form.get("materials"), start_date: String(form.get("start_date") || ""), budget_pln: number("budget_pln"),
    });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setBusy(true); setError("");
    try {
      const db = getSupabaseClient();
      const payload = { ...parsed.data, report_summary: buildReport(parsed.data) };
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
      onSaved();
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

  return <form className="panel workflow-form form-stack" onSubmit={save}>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <fieldset disabled={busy}>
      <legend>Dane ogólne budowy</legend>
      <div className="form-grid">
        <label className="span-two">Nazwa budowy<input name="title" required maxLength={120} defaultValue={job?.title} placeholder="np. Budowa domu / remont mieszkania" /></label>
        <div><label htmlFor="job-kind">Rodzaj prac</label><select id="job-kind" name="building_type" value={kind} onChange={(e) => setKind(e.target.value as ConstructionJob["building_type"])}><option value="house">Budowa domu</option><option value="extension">Rozbudowa</option><option value="renovation">Remont</option><option value="other">Inne prace</option></select></div>
        <label>Kod pocztowy<input name="postal_code" required pattern="[0-9]{2}-[0-9]{3}" maxLength={6} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="00-000" /></label>
        <label>Miejscowość<input name="city" required maxLength={120} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></label>
        <label>Adres lub numer działki<input name="address" required maxLength={240} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        <div className="span-two location-preview">
          <h3>Lokalizacja na Google Maps</h3>
          <p>Podgląd jest aktualizowany automatycznie po zmianie kodu, miejscowości i adresu. Jeśli pola są puste, pokazujemy Warszawę.</p>
          <iframe title="Podgląd lokalizacji w Google Maps" src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} referrerPolicy="no-referrer" loading="lazy" />
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer">Otwórz Google Maps w nowej karcie</a>
        </div>
        <div><label htmlFor="job-area">Powierzchnia (m²)</label><input id="job-area" name="area_m2" aria-describedby="job-area-help" type="number" required min="0.01" max={100000} step="0.01" defaultValue={job?.area_m2} /><small id="job-area-help">{building ? "Powierzchnia planowanej budowy / rozbudowy." : "Powierzchnia objęta pracami, nie całego budynku."}</small></div>
        {building && <>
          <label>Powierzchnia działki (m², opcjonalnie)<input name="plot_area_m2" type="number" min="0.01" max={10000000} step="0.01" defaultValue={job?.plot_area_m2 ?? ""} /></label>
          <label>Liczba kondygnacji<input name="floors" type="number" required min={1} max={100} defaultValue={job?.floors ?? 1} /></label>
          <label className="checkbox-field"><input name="basement" type="checkbox" defaultChecked={job?.basement ?? false} /> Budynek z piwnicą</label>
        </>}
        {kind === "renovation" && <label className="span-two">Pomieszczenia do remontu<input name="rooms" required maxLength={500} defaultValue={job?.rooms} placeholder="np. Kuchnia, łazienka, dwa pokoje" /></label>}
        {kind === "renovation" && <label className="span-two">Stan istniejący<textarea name="existing_condition" required maxLength={2000} rows={3} defaultValue={job?.existing_condition} placeholder="Opisz stan ścian, podłóg, instalacji i elementów do naprawy." /></label>}
        {kind === "other" && <label className="span-two">Kategoria prac<input name="work_category" required maxLength={120} defaultValue={job?.work_category} placeholder="np. Ogrodzenie, podjazd, zagospodarowanie terenu" /></label>}
        <label className="span-two">Zakres prac<textarea name="description" required maxLength={4000} rows={4} defaultValue={job?.description} placeholder={building ? "Opisz zakres budowy i oczekiwany etap zakończenia." : "Opisz prace do wykonania i oczekiwany efekt."} /></label>
        <section className="span-two plan-section" aria-label="Plan realizacji">
          <h3>Plan realizacji i etapy wniosku</h3>
          <ol>{typeGuidance.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <label>Wymagania szczegółowe<textarea name="requirements" required maxLength={2000} rows={3} defaultValue={job?.requirements} placeholder={typeGuidance.placeholder} /></label>
          <label>Kryteria odbioru<textarea name="acceptance_criteria" required maxLength={2000} rows={3} defaultValue={job?.acceptance_criteria} placeholder="Opisz, po czym poznasz, że prace zostały wykonane poprawnie." /></label>
        </section>
        <label className="span-two">Dostęp i warunki prowadzenia prac<textarea name="site_access" maxLength={1000} rows={2} defaultValue={job?.site_access} placeholder={building ? "Dojazd, miejsce na sprzęt, składowanie materiałów." : "Piętro, winda, godziny prac, czy lokal będzie zamieszkany."} /></label>
        <label className="span-two">Media i instalacje<textarea name="utilities" maxLength={1000} rows={2} defaultValue={job?.utilities} placeholder="Dostęp do prądu, wody, kanalizacji; zakres zmian instalacji." /></label>
        <label className="span-two">Materiały i technologia (opcjonalnie)<textarea name="materials" maxLength={2000} rows={2} defaultValue={job?.materials} /></label>
        <label>Planowany termin<input name="start_date" required type="date" defaultValue={job?.start_date ?? ""} /></label>
        <label>Budżet w PLN (opcjonalnie)<input name="budget_pln" type="number" min="0.01" max={1000000000} step="0.01" defaultValue={job?.budget_pln ?? ""} /></label>
        <section className="span-two photo-section" aria-label="Zdjęcia miejsca prac">
          <h3>Zdjęcia {building ? "działki i budynku" : kind === "renovation" ? "pomieszczeń do remontu" : "miejsca prac"}</h3>
          <p>JPEG, PNG lub WebP, do 10 MB na zdjęcie. Do 10 zdjęć w formularzu. Zdjęcia są prywatne; oczekujące zostaną przesłane przy zapisie.</p>
          {loadingPhotos ? <p role="status">Wczytywanie zdjęć…</p> : photoLoadError
            ? <button type="button" className="quiet-button" onClick={() => { setError(""); setPhotoRevision((value) => value + 1); }}>Ponów wczytywanie zdjęć</button>
            : <label>Dodaj zdjęcia<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => {
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
    </fieldset>
    <div className="form-actions">{onCancel && <button type="button" className="quiet-button" disabled={busy} onClick={onCancel}>Wróć do panelu</button>}
      <button className="primary-button" disabled={busy || loadingPhotos || photoLoadError}>{busy ? "Zapisywanie…" : "Zapisz budowę i przejdź do panelu"}</button></div>
  </form>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Nie udało się wykonać operacji. Spróbuj ponownie.";
}

function buildReport(input: Pick<ConstructionJob, "title" | "building_type" | "city" | "postal_code" | "address" | "description" | "requirements" | "acceptance_criteria" | "area_m2" | "start_date" | "budget_pln" | "materials" | "site_access" | "utilities" | "rooms" | "existing_condition" | "work_category">) {
  const typeLabel = input.building_type === "house" ? "Budowa domu" : input.building_type === "extension" ? "Rozbudowa" : input.building_type === "renovation" ? "Remont" : "Inne prace";
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
Plan realizacji: ${input.requirements}
Kryteria odbioru: ${input.acceptance_criteria}
Materiały i technologia: ${input.materials || "nie określono"}
Dostęp i warunki: ${input.site_access || "nie określono"}
Media i instalacje: ${input.utilities || "nie określono"}
Szczegóły rodzaju prac: ${optional}`;
}
