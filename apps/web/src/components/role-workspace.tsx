"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { BusinessProfile, ConstructionJob, EmployeeAccount, MembershipRole, OrganizationKind } from "@asystent/api-client";
import { BusinessInputSchema, EmployeeInputSchema, EmployeePasswordSchema } from "@asystent/schemas";
import { getSupabaseClient } from "@/lib/supabase";
import { ConstructionForm } from "./construction-form";

type Business = { id: string; name: string; nip: string | null; kind: OrganizationKind; role: MembershipRole; profile: BusinessProfile | null };
type WorkspaceData = { jobs: ConstructionJob[]; marketJobs: ConstructionJob[]; businesses: Business[]; employee: EmployeeAccount | null };
const titles = { client: "Panel Klienta", contractor: "Panel Wykonawcy", store: "Panel Sklepu" };
const statusLabels = { draft: "Szkic", open: "Opublikowane", cancelled: "Anulowane" };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Nie udało się wykonać operacji. Spróbuj ponownie.";
}

async function loadWorkspace(userId: string, kind: OrganizationKind): Promise<WorkspaceData> {
  const db = getSupabaseClient();
  const { data: employee, error: employeeError } = await db.from("employee_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (employeeError) throw employeeError;
  if (employee?.password_change_required) return { jobs: [], marketJobs: [], businesses: [], employee };
  if (kind === "client" && !employee) {
    const { data, error } = await db.from("construction_jobs").select("*").eq("client_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return { jobs: data, marketJobs: [], businesses: [], employee: null };
  }
  const { data: memberships, error: membershipError } = await db.from("memberships")
    .select("organization_id,role").eq("user_id", userId).order("created_at");
  if (membershipError) throw membershipError;
  if (!memberships.length) return { jobs: [], marketJobs: [], businesses: [], employee };
  const ids = memberships.map((item) => item.organization_id);
  const [{ data: businesses, error: businessError }, { data: profiles, error: profileError }, { data: marketJobs, error: jobsError }] = await Promise.all([
    db.from("organizations").select("id,name,nip,kind").in("id", ids).eq("kind", kind).order("created_at"),
    db.from("business_profiles").select("*").in("organization_id", ids),
    db.from("construction_jobs").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(30),
  ]);
  if (businessError) throw businessError;
  if (profileError) throw profileError;
  if (jobsError) throw jobsError;
  return { jobs: [], marketJobs, employee, businesses: businesses.map((business) => {
    const membership = memberships.find((item) => item.organization_id === business.id);
    if (!membership) throw new Error("Brakuje uprawnień do profilu działalności.");
    return { ...business, role: membership.role, profile: profiles.find((p) => p.organization_id === business.id) ?? null };
  }) };
}

async function serverRequest(path: string, body: unknown) {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  const response = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body), cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error : "Nie udało się wykonać operacji serwerowej.",
    );
  }
  return result;
}

export function RoleWorkspace({ session, kind, isAdministrator, onChangeType }: {
  session: Session; kind: OrganizationKind; isAdministrator: boolean; onChangeType: () => Promise<void>;
}) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editingJob, setEditingJob] = useState<ConstructionJob | "new" | null>(null);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [businessId, setBusinessId] = useState("");
  const [tab, setTab] = useState<"overview" | "employees">("overview");

  useEffect(() => {
    let active = true;
    void loadWorkspace(session.user.id, kind).then((loaded) => {
      if (active) { setData(loaded); setError(""); }
    }).catch((cause: unknown) => { if (active) setError(`Nie udało się wczytać panelu: ${message(cause)}`); });
    return () => { active = false; };
  }, [session.user.id, kind, revision]);

  function reload() { setData(null); setRevision((value) => value + 1); }

  async function changeStatus(job: ConstructionJob, status: ConstructionJob["status"]) {
    setBusy(true); setError("");
    try {
      const { error: statusError } = await getSupabaseClient().from("construction_jobs").update({ status }).eq("id", job.id).select("id").single();
      if (statusError) throw statusError;
      setNotice(status === "open" ? "Zlecenie zostało opublikowane. Rynek ofert będzie dostępny w kolejnym etapie." : "Zmieniono status zlecenia."); reload();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function saveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = BusinessInputSchema.safeParse({
      name: form.get("name"), nip: form.get("nip"), city: form.get("city"), address: form.get("address"),
      postal_code: form.get("postal_code"), phone: form.get("phone"), industry: form.get("industry"),
      service_area: form.get("service_area"), radius_km: Number(form.get("radius_km")), description: form.get("description"),
    });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const input = parsed.data;
      const { data: savedId, error: saveError } = await getSupabaseClient().rpc("complete_business_profile", {
        business_name: input.name, business_nip: input.nip, business_city: input.city, business_address: input.address,
        business_postal_code: input.postal_code, business_phone: input.phone, business_industry: input.industry,
        business_service_area: input.service_area, business_radius_km: input.radius_km, business_description: input.description,
      });
      if (saveError) throw saveError;
      setBusinessId(savedId); setEditingBusiness(false); setNotice("Dane zostały zapisane. Możesz teraz zarządzać profilem i pracownikami."); reload();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  if (!data) return <section className="workspace" role="status">
    {error ? <><div className="alert alert-error" role="alert">{error}</div><button className="quiet-button" onClick={reload}>Spróbuj ponownie</button></> : <p>Wczytywanie panelu…</p>}
  </section>;
  if (data.employee?.password_change_required) return <EmployeePassword onComplete={reload} />;

  const business = data.businesses.find((item) => item.id === businessId) ?? data.businesses[0];
  const showJobForm = kind === "client" && (data.jobs.length === 0 || editingJob !== null);
  const showBusinessForm = kind !== "client" && !data.employee && (!business?.profile || editingBusiness);
  const job = editingJob && editingJob !== "new" ? editingJob : null;

  return <section className="workspace role-workspace">
    <div className="welcome-row">
      <div>
        <p className="eyebrow">{data.employee ? "PANEL PRACOWNIKA" : titles[kind].toUpperCase()}</p>
        <h1>{showJobForm ? (job ? "Edytuj dane budowy" : "Opowiedz nam o swojej budowie")
          : showBusinessForm ? (kind === "store" ? "Dane Twojego sklepu" : "Dane Twojej firmy")
          : data.employee ? `Witaj, ${data.employee.display_name}` : kind === "client" ? "Twoje budowy i zlecenia" : business?.name}</h1>
        <p className="lead">{showJobForm ? "Lokalizacja, zakres prac i oczekiwania — zacznij od najważniejszych informacji."
          : showBusinessForm ? "Przygotuj profil, określ branżę i obszar działania." : "Wszystko, czego potrzebujesz do codziennej pracy."}</p>
      </div>
      {kind === "client" && data.jobs.length > 0 && !showJobForm &&
        <button className="primary-button" onClick={() => { setEditingJob("new"); setError(""); }}>+ Nowe zlecenie</button>}
      {(showJobForm || showBusinessForm) && data.jobs.length === 0 && !business?.profile &&
        <button className="quiet-button" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await onChangeType(); } finally { setBusy(false); }
        }}>Zmień typ konta</button>}
    </div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {showJobForm ? <div className="workflow-layout">
      <aside className="workflow-guide"><p className="eyebrow light">TWOJA BUDOWA</p><h2>Dobry plan to<br />dobry początek.</h2>
        <p>Zapisz zakres prac. W panelu klienta wrócisz do danych budowy i przygotujesz kolejne zlecenia.</p>
        <ol><li>Lokalizacja inwestycji</li><li>Parametry budynku</li><li>Zakres i termin</li></ol>
        <small>Zapis nie wysyła danych do wykonawców. Publikację wybierzesz osobno.</small></aside>
      <ConstructionForm key={job?.id ?? "new"} job={job} userId={session.user.id} isAdministrator={isAdministrator}
        onCancel={data.jobs.length > 0 ? () => setEditingJob(null) : undefined}
        onSaved={() => { setEditingJob(null); setNotice("Dane zlecenia i zdjęcia zostały zapisane."); reload(); }} />
    </div> : showBusinessForm ? <div className="workflow-layout">
      <aside className="workflow-guide"><p className="eyebrow light">{kind === "store" ? "TWÓJ SKLEP" : "TWOJA FIRMA"}</p><h2>Przedstaw swoją<br />działalność.</h2>
        <p>Uzupełnij dane kontaktowe, branżę i obszar obsługi. Po zapisaniu profilu dodasz pracowników w swoim panelu.</p>
        <ol><li>Dane działalności</li><li>Branża i specjalizacja</li><li>Obszar działania</li></ol></aside>
      <form className="panel workflow-form form-stack" onSubmit={saveBusiness}>
        <fieldset disabled={busy}><legend>{kind === "store" ? "Profil sklepu" : "Profil firmy wykonawczej"}</legend>
          <div className="form-grid">
            <label className="span-two">{kind === "store" ? "Nazwa sklepu" : "Nazwa firmy"}<input name="name" required maxLength={120} defaultValue={business?.name} autoComplete="organization" /></label>
            <label>NIP<input name="nip" required maxLength={13} defaultValue={business?.nip ?? ""} inputMode="numeric" /></label>
            <label>Telefon<input name="phone" type="tel" required maxLength={20} defaultValue={business?.profile?.phone} autoComplete="tel" /></label>
            <label>Miejscowość<input name="city" required maxLength={120} defaultValue={business?.profile?.city} autoComplete="address-level2" /></label>
            <label>Kod pocztowy<input name="postal_code" required pattern="[0-9]{2}-[0-9]{3}" placeholder="00-000" defaultValue={business?.profile?.postal_code} autoComplete="postal-code" /></label>
            <label className="span-two">Adres<input name="address" required maxLength={240} defaultValue={business?.profile?.address} autoComplete="street-address" /></label>
            <label className="span-two">Branża i specjalizacja<input name="industry" required maxLength={120} defaultValue={business?.profile?.industry} placeholder={kind === "store" ? "np. Materiały budowlane, drewno, dachy" : "np. Budowa domów, fundamenty, instalacje"} /></label>
            <label>Obszar działania<input name="service_area" required maxLength={500} defaultValue={business?.profile?.service_area} placeholder="np. Kraków i woj. małopolskie" /></label>
            <label>Promień obsługi / dostawy (km)<input name="radius_km" type="number" required min={0} max={1000} defaultValue={business?.profile?.radius_km ?? 50} /></label>
            <label className="span-two">Opis działalności<textarea name="description" required maxLength={4000} rows={4} defaultValue={business?.profile?.description} /></label>
          </div>
        </fieldset><div className="form-actions">{business?.profile && <button type="button" className="quiet-button" onClick={() => setEditingBusiness(false)}>Anuluj</button>}
          <button className="primary-button" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz profil i przejdź do panelu"} <span aria-hidden="true">→</span></button></div>
      </form>
    </div> : kind === "client" ? <>
      <div className="dashboard-banner"><span className="dashboard-count">{data.jobs.length.toString().padStart(2, "0")}</span><div><h2>Twoje inwestycje</h2><p>Wróć do zapisanej budowy lub rozpocznij kolejne zlecenie.</p></div></div>
      <div className="job-grid">{data.jobs.map((item) => <article className="panel job-card" key={item.id}>
        <div className="panel-heading"><p className="eyebrow">BUDOWA · {item.city}</p><span className={`status-badge status-${item.status}`}>{statusLabels[item.status]}</span></div>
        <h2>{item.title}</h2><p className="job-address">{item.address}</p><p>{item.description}</p>
        <p className="job-address"><strong>Termin:</strong> {item.start_date}</p>
        <p className="job-address"><strong>Kod pocztowy:</strong> {item.postal_code}</p>
        <details><summary>Raport wygenerowany ze zlecenia</summary><p>{item.report_summary}</p></details>
        <div className="job-metrics"><span>{item.area_m2} m²</span>
          {(item.building_type === "house" || item.building_type === "extension")
            ? <><span>{item.floors} kondygn.</span><span>{item.basement ? "Z piwnicą" : "Bez piwnicy"}</span></>
            : <span>{item.building_type === "renovation" ? item.rooms || "Remont" : item.work_category || "Inne prace"}</span>}</div>
        <div className="job-actions"><button className="quiet-button" disabled={busy} onClick={() => { setEditingJob(item); setError(""); }}>Edytuj</button>
          {item.status === "draft" && <button className="primary-button" disabled={busy} onClick={() => void changeStatus(item, "open")}>Opublikuj</button>}
          {item.status === "open" && <button className="quiet-button" disabled={busy} onClick={() => void changeStatus(item, "cancelled")}>Anuluj publikację</button>}
          {item.status === "cancelled" && <button className="quiet-button" disabled={busy} onClick={() => void changeStatus(item, "draft")}>Przywróć szkic</button>}</div>
      </article>)}</div>
    </> : business?.profile ? <>
      <nav className="panel-tabs" aria-label="Menu panelu">
        <button aria-current={tab === "overview" ? "page" : undefined} onClick={() => setTab("overview")}>Przegląd</button>
        {business.role === "owner" && !data.employee && <button aria-current={tab === "employees" ? "page" : undefined} onClick={() => setTab("employees")}>Pracownicy</button>}
      </nav>
      {tab === "employees" && business.role === "owner" && !data.employee ? <Employees business={business} /> : <div className="workspace-grid">
        <article className="panel business-summary"><p className="eyebrow">{data.employee ? "TWOJE MIEJSCE PRACY" : "PROFIL DZIAŁALNOŚCI"}</p><h2>{business.name}</h2>
          <p>{business.profile.description}</p><dl><dt>Branża</dt><dd>{business.profile.industry}</dd><dt>Adres</dt><dd>{business.profile.address}, {business.profile.postal_code} {business.profile.city}</dd><dt>Obszar działania</dt><dd>{business.profile.service_area} · do {business.profile.radius_km} km</dd><dt>Telefon</dt><dd>{business.profile.phone}</dd></dl>
          {business.role === "owner" && !data.employee && <button className="quiet-button" onClick={() => setEditingBusiness(true)}>Edytuj dane {kind === "store" ? "sklepu" : "firmy"}</button>}
          <section className="market-jobs">
            <h3>Otwarte zlecenia klientów</h3>
            {data.marketJobs.length === 0 ? <p>Brak opublikowanych zleceń.</p> : <ul>{data.marketJobs.map((item) => <li key={item.id}>
              <strong>{item.title}</strong> · {item.city}, {item.postal_code}
              <span>Termin startu: {item.start_date}</span>
              <span>{item.report_summary}</span>
            </li>)}</ul>}
          </section>
        </article><aside className="workflow-guide"><p className="eyebrow light">{data.employee ? "PANEL PRACOWNIKA" : "ZESPÓŁ"}</p><h2>{data.employee ? "Pracuj razem ze swoim zespołem." : "Zbuduj swój zespół."}</h2>
          <p>{data.employee ? "Masz dostęp do profilu swojego pracodawcy. Zarządzanie kontami pracowników jest dostępne wyłącznie dla właściciela." : "Dodaj pracownika, podając jego e-mail. Otrzymasz hasło tymczasowe do przekazania tej osobie."}</p>
          {!data.employee && business.role === "owner" && <button className="primary-button" onClick={() => setTab("employees")}>Dodaj pracownika <span aria-hidden="true">→</span></button>}
          <small>{kind === "store" ? "Katalog produktów i obsługa zamówień będą rozwijane w kolejnym etapie." : "Wyszukiwanie zleceń i ofertowanie będą rozwijane w kolejnym etapie."}</small></aside>
      </div>}
    </> : <div className="alert alert-error" role="alert">Nie znaleziono kompletnego profilu pracodawcy. Skontaktuj się z właścicielem.</div>}
  </section>;
}

function EmployeePassword({ onComplete }: { onComplete: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) { setError("Hasła nie są takie same."); return; }
    const parsed = EmployeePasswordSchema.safeParse({ current_password: form.get("current_password"), password: form.get("password") });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setBusy(true); setError("");
    try { await serverRequest("/api/employees/password", parsed.data); onComplete(); }
    catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <section className="workspace"><form className="panel password-panel form-stack" onSubmit={submit}>
    <p className="eyebrow">PIERWSZE LOGOWANIE PRACOWNIKA</p><h1>Ustaw własne hasło</h1>
    <p className="panel-intro">Przed wejściem do panelu zastąp hasło od właściciela swoim hasłem. Dane firmy są do tego czasu chronione.</p>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <label>Hasło tymczasowe<input name="current_password" type="password" required autoComplete="current-password" /></label>
    <label>Nowe hasło<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    <label>Powtórz nowe hasło<input name="confirm" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    <button className="primary-button" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz hasło i otwórz panel"}</button>
  </form></section>;
}

function Employees({ business }: { business: Business }) {
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const reload = useCallback(async () => {
    const { data, error: queryError } = await getSupabaseClient().from("employee_accounts").select("*").eq("business_id", business.id).order("created_at");
    if (queryError) throw queryError;
    return data;
  }, [business.id]);
  useEffect(() => {
    let active = true;
    void reload().then((loaded) => { if (active) setEmployees(loaded); })
      .catch((cause: unknown) => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [reload]);
  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const parsed = EmployeeInputSchema.safeParse({ business_id: business.id, email: form.get("email"), display_name: form.get("display_name") });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setBusy(true); setError(""); setCredentials(null);
    try {
      const result = await serverRequest("/api/employees", parsed.data);
      if (!result || typeof result !== "object" || !("email" in result) || !("password" in result) ||
        typeof result.email !== "string" || typeof result.password !== "string") throw new Error("Serwer nie zwrócił danych logowania.");
      setCredentials({ email: result.email, password: result.password }); element.reset();
      setEmployees(await reload());
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  return <div className="workspace-grid">
    <article className="panel business-summary"><p className="eyebrow">TWOI PRACOWNICY</p><h2>Zespół · {business.name}</h2>
      {employees.length ? <ul className="employee-list">{employees.map((item) => <li key={item.user_id}><strong>{item.display_name}</strong><span>{item.email}</span><small>{item.password_change_required ? "Oczekuje na pierwsze logowanie" : "Konto aktywne"}</small></li>)}</ul> : <p className="panel-intro">Nie dodano jeszcze pracowników.</p>}
    </article><form className="panel workflow-form form-stack" onSubmit={addEmployee}>
      <h2>Dodaj pracownika</h2><p className="panel-intro">Wprowadź e-mail pracownika. Wygenerujemy losowe hasło tymczasowe; przekaż je pracownikowi bezpiecznym kanałem.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <label>Imię i nazwisko<input name="display_name" required maxLength={120} autoComplete="off" /></label>
      <label>E-mail pracownika<input name="email" required type="email" maxLength={254} autoComplete="off" /></label>
      <button className="primary-button" disabled={busy}>{busy ? "Tworzenie konta…" : "Utwórz konto i wygeneruj hasło"}</button>
      {credentials && <div className="credentials-box" role="status"><strong>Konto pracownika utworzone</strong><p>{credentials.email}</p>
        <label>Hasło tymczasowe<input readOnly value={credentials.password} aria-label="Wygenerowane hasło tymczasowe" /></label>
        <small>Hasło jest wyświetlane tylko teraz. Nie zapisujemy go w profilu firmy. Pracownik ustawi własne hasło przy pierwszym logowaniu.</small>
        <button className="quiet-button" type="button" onClick={() => setCredentials(null)}>Zamknij dane logowania</button></div>}
    </form>
  </div>;
}
