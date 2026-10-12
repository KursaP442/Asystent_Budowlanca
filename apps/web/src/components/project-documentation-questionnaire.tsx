"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DocumentationDraftSchema,
  getProjectDocumentationRequirements,
  type DocumentationDraft,
  type ProjectScope,
} from "@asystent/schemas";
import { getSupabaseClient } from "@/lib/supabase";
import { StageCadEditor } from "./stage-cad-editor";

function message(error: unknown) {
  return error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : "Nie udało się zapisać dokumentacji.";
}

export function ProjectDocumentationQuestionnaire({ jobId, scope, onBack, onSaved }: {
  jobId: string; scope: ProjectScope; onBack: () => void; onSaved: () => void;
}) {
  const requirements = useMemo(() => getProjectDocumentationRequirements(scope), [scope]);
  const [draft, setDraft] = useState<DocumentationDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [drawingIndex, setDrawingIndex] = useState(0);
  const [cadPending, setCadPending] = useState(false);
  const onCadPending = useCallback((pending: boolean) => setCadPending(pending), []);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: loadError } = await getSupabaseClient()
        .from("construction_documentation_drafts").select("*").eq("job_id", jobId).maybeSingle();
      if (loadError) throw loadError;
      const stored = data ? DocumentationDraftSchema.parse(data.payload) : null;
      const first = requirements[0];
      if (!first) throw new Error("Wybrany zakres nie ma reguł dokumentacji. Wróć do technologii i wybierz zakres prac.");
      const modules: DocumentationDraft["modules"] = {};
      for (const requirement of requirements) {
        const previous = stored?.modules[requirement.id];
        modules[requirement.id] = {
          measurements: requirement.measurements.map((_, index) => previous?.measurements[index] ?? ""),
          notes: previous?.notes ?? "",
        };
      }
      const next = DocumentationDraftSchema.parse({
        version: 1,
        step: stored && requirements.some(({ id }) => id === stored.step) ? stored.step : first.id,
        modules,
      });
      if (active) { setDraft(next); setRevision(data?.revision ?? 0); setError(""); }
    }
    void load().catch((cause: unknown) => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [jobId, requirements, loadAttempt]);

  async function save(next: DocumentationDraft, destination: "stay" | "panel" | "back" = "stay") {
    setBusy(true); setError(""); setNotice("");
    try {
      const parsed = DocumentationDraftSchema.parse(next);
      const { data, error: saveError } = await getSupabaseClient().rpc("save_documentation_draft", {
        target_job_id: jobId, expected_revision: revision, draft_payload: parsed,
      });
      if (saveError) throw saveError;
      setRevision(data); setDraft(parsed);
      if (draft?.step !== parsed.step) setDrawingIndex(0);
      setNotice("Zapisano szkic dokumentacji i bieżący etap. Możesz wznowić pracę po odświeżeniu strony.");
      if (destination === "panel") onSaved();
      if (destination === "back") onBack();
    } catch (cause: unknown) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  const current = draft ? requirements.find(({ id }) => id === draft.step) : null;
  const index = current ? requirements.indexOf(current) : -1;
  const answers = draft && current ? draft.modules[current.id] : null;
  function changeMeasurement(position: number, value: string) {
    if (!draft || !current || !answers) return;
    setNotice("");
    setDraft({ ...draft, modules: { ...draft.modules, [current.id]: {
      ...answers, measurements: answers.measurements.map((answer, i) => i === position ? value : answer),
    } } });
  }
  return <section className="panel workflow-form form-stack cad-survey" aria-label="Dokumentacja projektu">
    <div className="cad-progress"><span>✓ Dane budowy</span><span>✓ Materiały i technologia</span><strong>3. Projekt</strong><span>Weryfikacja dokumentacji</span></div>
    <h2>Dokumentacja projektu</h2>
    <p>Narysuj projekt lub zeskanuj gotowy rysunek. Dodaj elementy wybranego etapu i uzupełnij ich właściwości.</p>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!draft ? <><p role="status">{error ? "Nie wczytano dokumentacji." : "Wczytywanie dokumentacji…"}</p>
      {error && <button type="button" className="quiet-button" onClick={() => setLoadAttempt((value) => value + 1)}>Ponów wczytywanie dokumentacji</button>}
      <button type="button" className="quiet-button" onClick={onBack}>Wróć do danych budowy</button></>
      : current && answers && <>
        <div className="cad-stage-tabs" role="tablist" aria-label="Etapy projektu">
          {requirements.map(({ id, label }) => <button key={id} type="button" role="tab" aria-selected={draft.step === id}
            disabled={busy || cadPending} onClick={() => void save({ ...draft, step: id })}>{label}</button>)}
        </div>
        <div className="cad-stage-tabs cad-drawing-tabs" role="tablist" aria-label="Rysunki etapu">
          {current.drawings.map((label, i) => <button key={label} type="button" role="tab" aria-selected={drawingIndex === i}
            disabled={busy || cadPending} onClick={() => setDrawingIndex(i)}>{label}</button>)}
        </div>
        <StageCadEditor key={`${current.id}-drawing-${drawingIndex}`} jobId={jobId}
          requirementId={`${current.id}-drawing-${drawingIndex}`} title={current.drawings[drawingIndex]} onPendingChange={onCadPending} />
        <details className="cad-stage-notes">
        <summary>Dane szczegółowe etapu i źródła pomiarów</summary>
        <fieldset disabled={busy}>
          <legend>{current.label} — etap {index + 1} z {requirements.length}</legend>
          <label htmlFor="documentation-step">Etap dokumentacji</label>
          <select id="documentation-step" disabled={cadPending} value={draft.step} onChange={(event) => void save({ ...draft, step: event.target.value })}>
            {requirements.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          <h3>Rysunki wymagane w tym zakresie</h3>
          <ul>{current.drawings.map((drawing) => <li key={drawing}>{drawing}</li>)}</ul>
          <p>Wymiary podawaj z jednostkami, osobno dla każdego elementu. Dane zbrojenia i innych elementów
            konstrukcyjnych przepisuj wyłącznie z dokumentacji projektanta.</p>
          {current.measurements.map((measurement, position) => <div key={measurement}>
            <label htmlFor={`documentation-measurement-${position}`}>{measurement}</label>
            <textarea id={`documentation-measurement-${position}`} rows={3} maxLength={4000} value={answers.measurements[position]}
              onChange={(event) => changeMeasurement(position, event.target.value)} />
          </div>)}
          <label htmlFor="documentation-notes">Źródło danych, uwagi i brakujące informacje</label>
          <textarea id="documentation-notes" rows={3} maxLength={4000} value={answers.notes}
            onChange={(event) => {
              setNotice("");
              setDraft({ ...draft, modules: { ...draft.modules, [current.id]: { ...answers, notes: event.target.value } } });
            }} />
        </fieldset>
        </details>
        <div className="form-actions">
          <button type="button" className="quiet-button" disabled={busy} onClick={() => void save(draft)}>Zapisz postęp</button>
          {index > 0 && <button type="button" className="quiet-button" disabled={busy || cadPending}
            onClick={() => void save({ ...draft, step: requirements[index - 1].id })}>Poprzedni etap</button>}
          {index < requirements.length - 1 && <button type="button" className="primary-button" disabled={busy || cadPending}
            onClick={() => void save({ ...draft, step: requirements[index + 1].id })}>Przejdź dalej</button>}
          <button type="button" className="quiet-button" disabled={busy || cadPending} onClick={() => void save(draft, "panel")}>Zapisz szkic i wróć do panelu</button>
          <button type="button" className="quiet-button" disabled={busy || cadPending} onClick={() => void save(draft, "back")}>Wróć do danych budowy</button>
        </div>
      </>}
  </section>;
}
