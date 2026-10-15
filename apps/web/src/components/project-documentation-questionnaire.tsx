"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CadDocumentSchema,
  DocumentationDraftSchema,
  getProjectDocumentationRequirements,
  getCadTechnologyHints,
  type DocumentationDraft,
  type ProjectScope,
} from "@asystent/schemas";
import { getSupabaseClient } from "@/lib/supabase";
import { demoCadDrawingStorageKey, demoDocumentationStorageKey, readDemoValue, writeDemoValue } from "@/lib/demo-storage";
import { StageCadEditor } from "./stage-cad-editor";

function message(error: unknown) {
  return error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : "Nie udało się zapisać dokumentacji.";
}

export function ProjectDocumentationQuestionnaire({ jobId, scope, onBack, onSaved, demoMode = false }: {
  jobId: string; scope: ProjectScope; onBack: (tab?: "details" | "technology") => void; onSaved: () => void;
  demoMode?: boolean;
}) {
  const requirements = useMemo(() => getProjectDocumentationRequirements(scope), [scope]);
  const [draft, setDraft] = useState<DocumentationDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [drawingIndex, setDrawingIndex] = useState(0);
  const [showFoundationSections, setShowFoundationSections] = useState(false);
  const [cadPending, setCadPending] = useState(false);
  const [completion, setCompletion] = useState<Record<string, number>>({});
  const [completionLoaded, setCompletionLoaded] = useState(false);
  const onCadPending = useCallback((pending: boolean) => setCadPending(pending), []);
  const onSavedDrawing = useCallback((id: string, count: number) => setCompletion((current) => ({ ...current, [id]: count })), []);
  const drawingSteps = useMemo(() => requirements.flatMap((requirement) => requirement.drawings.map((label, index) => ({
    id: `${requirement.id}-drawing-${index}`, stageId: requirement.id, index, label: `${requirement.label} — ${label}`,
    title: label,
  }))), [requirements]);

  useEffect(() => {
    let active = true;
    async function load() {
      const first = requirements[0];
      if (!first) throw new Error("Wybrany zakres nie ma reguł dokumentacji. Wróć do technologii i wybierz zakres prac.");
      let storedPayload: unknown = null;
      let storedRevision = 0;
      let drawings: { requirement_id: string; payload: unknown }[];
      if (demoMode) {
        const saved = readDemoValue(demoDocumentationStorageKey(jobId));
        if (saved && typeof saved === "object" && "payload" in saved) {
          storedPayload = saved.payload;
          storedRevision = "revision" in saved && typeof saved.revision === "number" ? saved.revision : 0;
        }
        drawings = drawingSteps.flatMap(({ id }) => {
          const payload = readDemoValue(demoCadDrawingStorageKey(jobId, id));
          return payload ? [{ requirement_id: id, payload }] : [];
        });
      } else {
        const { data, error: loadError } = await getSupabaseClient()
          .from("construction_documentation_drafts").select("*").eq("job_id", jobId).maybeSingle();
        if (loadError) throw loadError;
        storedPayload = data?.payload ?? null;
        storedRevision = data?.revision ?? 0;
        const { data: storedDrawings, error: drawingsError } = await getSupabaseClient().from("cad_drawings")
          .select("requirement_id,payload").eq("job_id", jobId);
        if (drawingsError) throw drawingsError;
        drawings = storedDrawings;
      }
      const stored = storedPayload ? DocumentationDraftSchema.parse(storedPayload) : null;
      const counts = Object.fromEntries(drawings.map((item) => [item.requirement_id, CadDocumentSchema.parse(item.payload).entities.length]));
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
      if (active) { setDraft(next); setRevision(storedRevision); setCompletion(counts); setCompletionLoaded(true); setError(""); }
    }
    void load().catch((cause: unknown) => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [jobId, requirements, loadAttempt, demoMode, drawingSteps]);

  async function save(next: DocumentationDraft, destination: "stay" | "panel" | "back" | "technology" = "stay", nextDrawing?: number) {
    setBusy(true); setError(""); setNotice("");
    try {
      const parsed = DocumentationDraftSchema.parse(next);
      if (demoMode) {
        const nextRevision = revision + 1;
        writeDemoValue(demoDocumentationStorageKey(jobId), { revision: nextRevision, payload: parsed });
        setRevision(nextRevision);
      } else {
        const { data, error: saveError } = await getSupabaseClient().rpc("save_documentation_draft", {
          target_job_id: jobId, expected_revision: revision, draft_payload: parsed,
        });
        if (saveError) throw saveError;
        setRevision(data);
      }
      setDraft(parsed);
      setDrawingIndex(nextDrawing ?? (draft?.step !== parsed.step ? 0 : drawingIndex));
      setNotice(demoMode
        ? "Zapisano lokalny szkic dokumentacji w tej przeglądarce."
        : "Zapisano szkic dokumentacji i bieżący etap. Możesz wznowić pracę po odświeżeniu strony.");
      if (destination === "panel") onSaved();
      if (destination === "back") onBack("details");
      if (destination === "technology") onBack("technology");
    } catch (cause: unknown) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  const current = draft ? requirements.find(({ id }) => id === draft.step) : null;
  const currentDrawingId = current ? `${current.id}-drawing-${drawingIndex}` : "";
  const foundationSectionsIndex = current?.kind === "foundation"
    ? current.drawings.findIndex((label) => label.toLocaleLowerCase("pl-PL").includes("przekroje fundamentów"))
    : -1;
  const editorDrawingIndex = showFoundationSections ? 0 : drawingIndex;
  const editorDrawingId = current ? `${current.id}-drawing-${editorDrawingIndex}` : "";
  const flatIndex = drawingSteps.findIndex((item) => item.id === currentDrawingId);
  const technologyHints = useMemo(() => current
    ? getCadTechnologyHints(current.kind, scope.workType, scope.technology)
    : [], [current, scope.workType, scope.technology]);
  function navigateDrawing(position: number) {
    const next = drawingSteps[position];
    if (!next || !draft) return;
    setShowFoundationSections(false);
    void save({ ...draft, step: next.stageId }, "stay", next.index);
  }
  return <section className="panel workflow-form form-stack cad-survey" aria-label="Dokumentacja projektu">
    <nav className="cad-progress" aria-label="Kroki budowy">
      <button type="button" data-completion="saved" disabled={busy || cadPending} onClick={() => draft && void save(draft, "back")}><b>✓</b>Dane budowy</button>
      <button type="button" data-completion="saved" disabled={busy || cadPending} onClick={() => draft && void save(draft, "technology")}><b>✓</b>Materiały i technologia</button>
      <span aria-current="step"><b>3</b>Projekt</span>
    </nav>
    <h2>Dokumentacja projektu</h2>
    <p>Narysuj projekt lub zeskanuj gotowy rysunek. Dodaj elementy wybranego etapu i uzupełnij ich właściwości.</p>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!draft ? <><p role="status">{error ? "Nie wczytano dokumentacji." : "Wczytywanie dokumentacji…"}</p>
      {error && <button type="button" className="quiet-button" onClick={() => setLoadAttempt((value) => value + 1)}>Ponów wczytywanie dokumentacji</button>}
      <button type="button" className="quiet-button" onClick={() => onBack("details")}>Wróć do danych budowy</button></>
      : current && <>
        <nav className="cad-drawing-progress" aria-label="Etapy projektu">
          {requirements.map((item, i) => {
            const complete = item.drawings.every((_, j) => (completion[`${item.id}-drawing-${j}`] ?? 0) > 0);
            return <button type="button" key={item.id} disabled={busy || cadPending || !completionLoaded}
              aria-current={item.id === current.id ? "step" : undefined}
              data-completion={complete ? "saved" : "empty"}
              title={complete ? "Wszystkie rysunki zapisane — nie oznacza zatwierdzenia" : "Etap ma puste rysunki"}
              onClick={() => { setShowFoundationSections(false); void save({ ...draft, step: item.id }); }}><b>{complete ? "✓" : i + 1}</b><span>{item.label}</span>
              <small>{item.drawings.filter((_, j) => (completion[`${item.id}-drawing-${j}`] ?? 0) > 0).length}/{item.drawings.length} rysunków</small>
            </button>;
          })}
        </nav>
        <div className="cad-stage-tabs cad-drawing-tabs" role="tablist" aria-label="Rysunki etapu">
          {current.drawings.map((label, i) => <button key={label} type="button" role="tab" aria-label={label}
            aria-selected={i === foundationSectionsIndex ? showFoundationSections : !showFoundationSections && drawingIndex === i}
            data-completion={(completion[`${current.id}-drawing-${i}`] ?? 0) > 0 ? "saved" : "empty"}
            disabled={busy || cadPending} onClick={() => {
              if (i === foundationSectionsIndex) { setShowFoundationSections(true); return; }
              setShowFoundationSections(false);
              navigateDrawing(drawingSteps.findIndex((item) => item.id === `${current.id}-drawing-${i}`));
            }}>
            <span aria-hidden="true">{i + 1}. </span>{label}</button>)}
          {current.kind === "foundation" && foundationSectionsIndex < 0 && <button type="button" role="tab" aria-selected={showFoundationSections}
            aria-label="Przekroje fundamentów i poziomy posadowienia" disabled={busy || cadPending}
            onClick={() => setShowFoundationSections(true)}>
            Przekroje fundamentów i poziomy posadowienia</button>}
        </div>
        <StageCadEditor key={editorDrawingId} jobId={jobId} demoMode={demoMode}
          requirementId={editorDrawingId} title={current.drawings[editorDrawingIndex]} kind={current.kind}
          completionId={showFoundationSections && foundationSectionsIndex >= 0
            ? `${current.id}-drawing-${foundationSectionsIndex}` : undefined}
          technology={scope.technology} basement={scope.basement === true} disabled={busy}
          onOpenFoundationSections={() => setShowFoundationSections(true)}
          technologyHints={technologyHints} viewMode={showFoundationSections ? "foundation-sections" : "plan"}
          sources={drawingSteps.filter((item) => (completion[item.id] ?? 0) > 0)}
          onPendingChange={onCadPending} onSavedDrawing={onSavedDrawing} />
        <p className="cad-disclaimer">Zielony: zapisano obiekty. Czerwony: pusty rysunek. Kolory nie oznaczają zatwierdzenia ani kompletności przedmiaru.</p>
        <div className="form-actions">
          <button type="button" className="quiet-button" disabled={busy} onClick={() => void save(draft)}>Zapisz postęp</button>
          {flatIndex > 0 && <button type="button" className="quiet-button" disabled={busy || cadPending}
            onClick={() => navigateDrawing(flatIndex - 1)}>Poprzedni rysunek</button>}
          {flatIndex < drawingSteps.length - 1 && <button type="button" className="primary-button" disabled={busy || cadPending}
            onClick={() => navigateDrawing(flatIndex + 1)}>Przejdź dalej</button>}
          <button type="button" className="quiet-button" disabled={busy || cadPending} onClick={() => void save(draft, "panel")}>Zapisz szkic i wróć do panelu</button>
          <button type="button" className="quiet-button" disabled={busy || cadPending} onClick={() => void save(draft, "back")}>Wróć do danych budowy</button>
        </div>
      </>}
  </section>;
}
