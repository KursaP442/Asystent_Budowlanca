"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CadDocumentSchema, CadEntitySchema, type CadDocument, type CadEntity, type CadPoint } from "@asystent/schemas";
import { calibrateCadSource, entityPoints, translateCadEntity } from "@asystent/domain";
import { distanceBetweenPoints, drawingBounds, isSimplePolygon, polygonAreaMm2, viewportToWorld } from "@asystent/geometry";
import { cadError, cadRequest } from "@/lib/cad-client";
import { getSupabaseClient } from "@/lib/supabase";
import { PlanScanDialog } from "./plan-scan-dialog";

type Tool = "select" | "pan" | "wall" | "footing" | "slab" | "roof-plane" | "dimension" | "rebar-line" | "annotation" | "calibrate";
const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Zaznacz / przesuń", icon: "↖" }, { id: "pan", label: "Przesuń widok", icon: "✥" },
  { id: "footing", label: "Ława fundamentowa", icon: "▰" }, { id: "wall", label: "Ściana", icon: "▥" },
  { id: "slab", label: "Obrys / płyta", icon: "⬡" }, { id: "roof-plane", label: "Połać dachu", icon: "⌂" },
  { id: "rebar-line", label: "Pręt zbrojeniowy", icon: "╱" }, { id: "dimension", label: "Wymiar", icon: "↔" },
  { id: "annotation", label: "Opis", icon: "T" }, { id: "calibrate", label: "Ustaw skalę skanu", icon: "⤢" },
];
const attributeLabels: Record<string, string> = {
  thicknessMm: "Grubość (mm)", heightMm: "Wysokość (mm)", material: "Materiał", widthMm: "Szerokość (mm)",
  depthMm: "Głębokość (mm)", designReference: "Odniesienie do projektu", pitchDegrees: "Nachylenie (°)",
  measuredMm: "Wymiar referencyjny (mm)", label: "Opis elementu", text: "Treść opisu", diameterMm: "Średnica (mm)",
  count: "Liczba sztuk", steelGrade: "Klasa stali", coverMm: "Otulina (mm)",
};
const colors: Partial<Record<CadEntity["kind"], string>> = {
  wall: "#334155", footing: "#64748b", slab: "#94a3b8", "roof-plane": "#22a06b", "rebar-line": "#f97316",
  dimension: "#475569", "trace-line": "#2563eb", "trace-area": "#2563eb", annotation: "#7c3aed",
};
const entityLabels: Partial<Record<CadEntity["kind"], string>> = {
  "trace-line": "Rozpoznany odcinek", "trace-area": "Rozpoznany obrys", "rebar-annotation": "Opis zbrojenia",
  opening: "Otwór", pipe: "Przewód",
};
const initialView = drawingBounds([]);

export function StageCadEditor({ jobId, requirementId, title, onPendingChange }: {
  jobId: string; requirementId: string; title: string; onPendingChange: (pending: boolean) => void;
}) {
  const [drawing, setDrawing] = useState<CadDocument | null>(null);
  const latest = useRef<CadDocument | null>(null);
  const savedRevision = useRef(0);
  const sequence = useRef(0);
  const savedSequence = useRef(0);
  const savingRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState(initialView);
  const [points, setPoints] = useState<CadPoint[]>([]);
  const [ghost, setGhost] = useState<CadPoint | null>(null);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [showSource, setShowSource] = useState(true);
  const [sourceUrl, setSourceUrl] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [history, setHistory] = useState<CadDocument[]>([]);
  const [future, setFuture] = useState<CadDocument[]>([]);
  const [referenceMm, setReferenceMm] = useState("1000");
  const [annotation, setAnnotation] = useState("Opis z projektu");
  const gesture = useRef<{ start: CadPoint; entityId: string | null; view: typeof initialView } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState("");

  const fit = useCallback((document: CadDocument) => {
    const all = document.entities.flatMap(entityPoints);
    if (document.sourceImage) all.push({ x: 0, y: 0 }, {
      x: document.sourceImage.widthPx * document.sourceImage.mmPerPixel,
      y: document.sourceImage.heightPx * document.sourceImage.mmPerPixel,
    });
    const bounds = drawingBounds(all);
    const rect = svgRef.current?.getBoundingClientRect();
    const ratio = rect?.width && rect.height ? rect.width / rect.height : 1.4;
    if (bounds.width / bounds.height > ratio) bounds.height = bounds.width / ratio;
    else bounds.width = bounds.height * ratio;
    setView(bounds);
  }, []);

  useEffect(() => {
    if (latest.current) fit(latest.current);
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => { if (latest.current) fit(latest.current); });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [drawing?.id, fit]);

  useEffect(() => {
    alive.current = true;
    let active = true;
    async function load() {
      onPendingChange(true);
      const { data, error: loadError } = await getSupabaseClient().from("cad_drawings").select("*")
        .eq("job_id", jobId).eq("requirement_id", requirementId).maybeSingle();
      if (loadError) throw loadError;
      const next = data ? CadDocumentSchema.parse(data.payload) : CadDocumentSchema.parse({
        schemaVersion: 1, id: crypto.randomUUID(), projectId: jobId, requirementId,
        revision: 0, status: "draft", calibration: null, sourceImage: null, entities: [],
      });
      if (active) {
        latest.current = next; savedRevision.current = data?.revision ?? 0; setDrawing(next);
        setError(""); fit(next); onPendingChange(false);
      }
    }
    void load().catch((cause) => { if (active) { setError(cadError(cause)); onPendingChange(true); } });
    return () => { active = false; alive.current = false; };
  }, [jobId, requirementId, loadAttempt, fit, onPendingChange]);

  const sourcePath = drawing?.sourceImage?.storagePath;
  useEffect(() => {
    let active = true;
    if (!sourcePath) return;
    void getSupabaseClient().storage.from("project-scans").createSignedUrl(sourcePath, 3600).then(({ data, error: signError }) => {
      if (signError) { if (active) setError(`Nie można wczytać podkładu: ${signError.message}`); }
      else if (active) setSourceUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [sourcePath]);

  const persist = useCallback(async () => {
    if (!latest.current || savingRef.current || sequence.current === savedSequence.current) return;
    savingRef.current = true; setSaving(true);
    const currentSequence = sequence.current;
    try {
      const snapshot = { ...latest.current, revision: savedRevision.current };
      const response = await cadRequest("/api/cad/drawings", snapshot);
      if (!response || typeof response !== "object" || !("revision" in response) || typeof response.revision !== "number"
        || response.revision !== savedRevision.current + 1) throw new Error("Serwer nie potwierdził wersji rysunku.");
      savedRevision.current = response.revision; savedSequence.current = currentSequence;
      if (alive.current) {
        const next = { ...latest.current, revision: response.revision };
        latest.current = next; setDrawing(next);
        const pending = sequence.current !== currentSequence;
        setDirty(pending); onPendingChange(pending); setError(""); setStatus("Rysunek zapisany automatycznie.");
      }
    } catch (cause) {
      if (alive.current) { setError(cadError(cause)); setStatus("Zapis nie powiódł się. Rysunek pozostaje w tej karcie — ponów zapis."); }
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }, [onPendingChange]);

  useEffect(() => {
    if (!dirty || saving || error) return;
    const timeout = setTimeout(() => void persist(), 900);
    return () => clearTimeout(timeout);
  }, [drawing, dirty, saving, error, persist]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  function commit(next: CadDocument, remember = true) {
    try {
      const parsed = CadDocumentSchema.parse({ ...next, status: "draft", revision: savedRevision.current });
      const previous = latest.current;
      if (remember && previous) { setHistory((items) => [...items.slice(-49), previous]); setFuture([]); }
      latest.current = parsed; setDrawing(parsed); sequence.current += 1; setDirty(true);
      setError(""); setStatus("Niezapisane zmiany…"); onPendingChange(true);
    } catch (cause) { setError(cadError(cause)); }
  }
  function undo(redo = false) {
    const stack = redo ? future : history;
    const next = stack.at(-1);
    if (!next || !drawing) return;
    if (redo) { setFuture(stack.slice(0, -1)); setHistory([...history, drawing]); }
    else { setHistory(stack.slice(0, -1)); setFuture([...future, drawing]); }
    commit(next, false); setSelectedId(null); fit(next);
  }
  function chooseTool(next: Tool) { setTool(next); setPoints([]); setGhost(null); gesture.current = null; setError(""); }
  function world(event: ReactPointerEvent<SVGSVGElement>, snap = true) {
    return viewportToWorld({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), view,
      snap && !drawing?.sourceImage ? 100 : 0);
  }
  function newEntity(start: CadPoint, end: CadPoint, vertices?: CadPoint[]): CadEntity {
    const common = {
      id: crypto.randomUUID(), layerId: tool, units: "mm", reviewStatus: "draft",
      source: { origin: "manual", documentId: null, page: null, confidence: null },
    };
    const geometry = { start, end };
    if (tool === "wall") return CadEntitySchema.parse({ ...common, kind: tool, geometry, attributes: { thicknessMm: 240, heightMm: 2800, material: "Do uzupełnienia z projektu" } });
    if (tool === "footing") return CadEntitySchema.parse({ ...common, kind: tool, geometry, attributes: { widthMm: 600, depthMm: 400, designReference: "Do uzupełnienia z projektu" } });
    if (tool === "dimension") return CadEntitySchema.parse({ ...common, kind: tool, geometry, attributes: { measuredMm: distanceBetweenPoints(start, end), label: "" } });
    if (tool === "rebar-line") return CadEntitySchema.parse({ ...common, kind: tool, geometry, attributes: { diameterMm: 12, count: 1, steelGrade: "Do uzupełnienia z projektu", coverMm: 50, designReference: "Do uzupełnienia z projektu", specialistVerified: false } });
    if (tool === "annotation") return CadEntitySchema.parse({ ...common, kind: tool, geometry: { point: start }, attributes: { text: annotation } });
    if (tool === "roof-plane") return CadEntitySchema.parse({ ...common, kind: tool, geometry: { vertices }, attributes: { pitchDegrees: 0, material: "Do uzupełnienia z projektu" } });
    return CadEntitySchema.parse({ ...common, kind: "slab", geometry: { vertices }, attributes: { thicknessMm: 200, material: "Do uzupełnienia z projektu" } });
  }
  function add(start: CadPoint, end: CadPoint, vertices?: CadPoint[]) {
    if (!drawing) return;
    try {
      if (vertices && !isSimplePolygon(vertices)) throw new Error("Obrys musi mieć co najmniej trzy punkty i nie może przecinać sam siebie.");
      const entity = newEntity(start, end, vertices);
      commit({ ...drawing, entities: [...drawing.entities, entity] });
      setSelectedId(entity.id); setPoints([]); setGhost(null);
    } catch (cause) { setError(cadError(cause)); }
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawing || scanOpen || event.button !== 0) return;
    const point = world(event);
    const target = event.target instanceof Element ? event.target.closest("[data-entity-id]") : null;
    const entityId = target?.getAttribute("data-entity-id") ?? null;
    if (tool === "select") setSelectedId(entityId);
    if (tool === "slab" || tool === "roof-plane" || tool === "calibrate") {
      if (tool === "calibrate" && !drawing.sourceImage) { setError("Najpierw zaimportuj skan."); return; }
      setPoints((current) => tool === "calibrate" && current.length >= 2 ? [point] : [...current, point]); return;
    }
    gesture.current = { start: point, entityId, view };
    if (!["select", "pan"].includes(tool)) setPoints([point]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = world(event);
    if (tool === "pan" && gesture.current) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const start = gesture.current;
      const previous = viewportToWorld({ x: event.clientX, y: event.clientY }, bounds, start.view);
      setView({ ...start.view, x: start.view.x - (previous.x - start.start.x), y: start.view.y - (previous.y - start.start.y) });
    } else setGhost(point);
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || !drawing) return;
    const end = world(event);
    if (tool === "select" && start.entityId) {
      const delta = { x: end.x - start.start.x, y: end.y - start.start.y };
      if (Math.abs(delta.x) + Math.abs(delta.y) > 0.01) {
        commit({ ...drawing, entities: drawing.entities.map((entity) => entity.id === start.entityId ? translateCadEntity(entity, delta) : entity) });
      }
    } else if (tool === "annotation") add(end, end);
    else if (!["select", "pan"].includes(tool)) {
      if (distanceBetweenPoints(start.start, end) > 0.01) add(start.start, end);
      else { setPoints([]); setError("Przeciągnij od początku do końca elementu."); }
    }
  }
  const selected = drawing?.entities.find(({ id }) => id === selectedId);
  function updateSelected(next: unknown) {
    if (!drawing || !selected) return;
    const result = CadEntitySchema.safeParse(next);
    if (!result.success) { setError(result.error.issues.map(({ message }) => message).join(" ")); return; }
    commit({ ...drawing, entities: drawing.entities.map((entity) => entity.id === selected.id ? { ...result.data, reviewStatus: "draft" } : entity) });
  }
  function removeSelected() {
    if (!drawing || !selected) return;
    commit({ ...drawing, entities: drawing.entities.filter((entity) => entity.id !== selected.id
      && !(entity.kind === "opening" && entity.attributes.wallId === selected.id)) }); setSelectedId(null);
  }
  function calibrate() {
    if (!drawing || points.length !== 2) return;
    try {
      const next = calibrateCadSource(drawing, points[0], points[1], Number(referenceMm));
      commit(next); fit(next); chooseTool("select");
    } catch (cause) { setError(cadError(cause)); }
  }
  function exportSvg() {
    if (!svgRef.current) return;
    const copy = svgRef.current.cloneNode(true);
    if (!(copy instanceof SVGSVGElement)) return;
    copy.querySelectorAll("image").forEach((element) => element.remove());
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${requirementId}.svg`; anchor.click();
    URL.revokeObjectURL(url);
  }
  const layers = [...new Set(drawing?.entities.map(({ layerId }) => layerId) ?? [])];
  const textSize = view.width / 70;
  function shape(entity: CadEntity) {
    const color = selectedId === entity.id ? "#ea580c" : colors[entity.kind] ?? "#475569";
    if ("start" in entity.geometry) {
      const { start, end } = entity.geometry;
      const width = entity.kind === "wall" ? entity.attributes.thicknessMm : entity.kind === "footing" ? entity.attributes.widthMm : 0;
      return <g>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={width || view.width / 400} opacity={width ? 0.65 : 1} />
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - textSize / 2} fill={color} fontSize={textSize} textAnchor="middle">
          {Math.round(distanceBetweenPoints(start, end))} mm{entity.kind === "rebar-line" ? ` · Ø${entity.attributes.diameterMm}` : ""}
        </text>
      </g>;
    }
    if ("vertices" in entity.geometry) return <polygon points={entity.geometry.vertices.map(({ x, y }) => `${x},${y}`).join(" ")}
      fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />;
    return <text x={entity.geometry.point.x} y={entity.geometry.point.y} fontSize={textSize} fill={color}>
      {entity.kind === "annotation" ? entity.attributes.text : entity.kind === "rebar-annotation" ? entity.attributes.label : ""}
    </text>;
  }

  return <div className="cad-editor">
    <div className="cad-heading"><div><h3>{title}</h3><p>Rysuj w mm lub odtwórz rysunek ze skanu. Wszystkie obiekty są szkicem do weryfikacji.</p></div>
      <button type="button" className="quiet-button" disabled={!drawing || saving || dirty} onClick={() => setScanOpen(true)}>▣ Skanuj lub importuj projekt</button></div>
    {error && <div className="alert alert-error" role="alert">{error}
      {drawing ? <button type="button" className="quiet-button" disabled={saving} onClick={() => { setError(""); void persist(); }}>Ponów zapis rysunku</button>
        : <button type="button" className="quiet-button" onClick={() => setLoadAttempt((value) => value + 1)}>Ponów wczytywanie rysunku</button>}</div>}
    {!drawing ? <p role="status">Wczytywanie rysunku…</p> : <>
      <div className="cad-toolbar" role="toolbar" aria-label="Narzędzia rysowania">
        {tools.map((item) => <button key={item.id} type="button" aria-pressed={tool === item.id}
          disabled={scanOpen || item.id === "calibrate" && !drawing.sourceImage} onClick={() => chooseTool(item.id)}>
          <span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
      </div>
      <div className="cad-workspace">
        <aside className="cad-tools-panel">
          <h4>Narzędzia etapu</h4><p>{tool === "select" ? "Kliknij element, aby go edytować. Przeciągnij, aby go przesunąć."
            : tool === "slab" || tool === "roof-plane" ? "Klikaj kolejne narożniki, następnie zamknij obrys."
              : tool === "calibrate" ? "Kliknij dwa punkty skanu o znanej odległości."
                : tool === "annotation" ? "Kliknij miejsce opisu." : tool === "pan" ? "Przeciągnij płótno." : "Przeciągnij od początku do końca elementu."}</p>
          {tool === "annotation" && <label>Tekst nowego opisu<input value={annotation} maxLength={1000} onChange={(event) => setAnnotation(event.target.value)} /></label>}
          {(tool === "slab" || tool === "roof-plane") && <button type="button" className="quiet-button" disabled={points.length < 3}
            onClick={() => add(points[0], points.at(-1)!, points)}>Zamknij obrys ({points.length})</button>}
          {tool === "calibrate" && <><label htmlFor="cad-reference">Znana odległość (mm)</label><input id="cad-reference" type="number" min={1} max={1000000}
            value={referenceMm} onChange={(event) => setReferenceMm(event.target.value)} />
            <button type="button" className="primary-button" disabled={points.length !== 2} onClick={calibrate}>Zastosuj skalę</button></>}
          <p className="cad-disclaimer">Początkowe parametry nowych obiektów są robocze. Uzupełnij je z projektu.
            Zbrojenie wymaga kontroli projektanta.</p>
          <h4>Elementy ({drawing.entities.length})</h4>
          <div className="cad-element-list">{drawing.entities.map((entity, i) => <button key={entity.id} type="button"
            aria-pressed={selectedId === entity.id} onClick={() => { setSelectedId(entity.id); chooseTool("select"); }}>
            {i + 1}. {tools.find(({ id }) => id === entity.kind)?.label ?? ("label" in entity.attributes ? entity.attributes.label : entity.kind)}
          </button>)}</div>
        </aside>
        <div className="cad-drawing-panel">
          <svg ref={svgRef} className="cad-canvas" role="img" aria-label={`Płótno projektu: ${title}`} tabIndex={0}
            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="none"
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
            onPointerCancel={() => { gesture.current = null; setPoints([]); setGhost(null); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") { setPoints([]); setGhost(null); gesture.current = null; }
              if (event.key === "Delete") { event.preventDefault(); removeSelected(); }
              if (event.key === "Enter" && (tool === "slab" || tool === "roof-plane") && points.length >= 3) {
                event.preventDefault(); add(points[0], points.at(-1)!, points);
              }
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
            }}>
            <defs><pattern id={`cad-grid-${requirementId}`} width={drawing.sourceImage ? view.width / 40 : 500}
              height={drawing.sourceImage ? view.width / 40 : 500} patternUnits="userSpaceOnUse">
              <path d={`M ${drawing.sourceImage ? view.width / 40 : 500} 0 L 0 0 0 ${drawing.sourceImage ? view.width / 40 : 500}`}
                fill="none" stroke="#dce3eb" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            </pattern></defs>
            <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#fcfdff" />
            <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={`url(#cad-grid-${requirementId})`} />
            {drawing.sourceImage && sourceUrl && showSource && <image href={sourceUrl} x={0} y={0} opacity={0.4}
              width={drawing.sourceImage.widthPx * drawing.sourceImage.mmPerPixel} height={drawing.sourceImage.heightPx * drawing.sourceImage.mmPerPixel} />}
            {drawing.entities.filter(({ layerId }) => !hiddenLayers.includes(layerId)).map((entity) => <g key={entity.id}
              data-entity-id={entity.id} className="cad-entity">{shape(entity)}</g>)}
            {points.length > 0 && <polyline points={[...points, ...(ghost ? [ghost] : [])].map(({ x, y }) => `${x},${y}`).join(" ")}
              fill="none" stroke="#f97316" strokeDasharray="6 4" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={view.width / 220} fill="#f97316" />)}
            {!drawing.entities.length && !points.length && <text x={view.x + view.width / 2} y={view.y + view.height / 2}
              textAnchor="middle" fontSize={textSize} fill="#7b8798" pointerEvents="none">Wybierz narzędzie lub zaimportuj projekt</text>}
          </svg>
          <div className="cad-viewbar">
            <button type="button" className="quiet-button" disabled={!history.length} onClick={() => undo()}>Cofnij</button>
            <button type="button" className="quiet-button" disabled={!future.length} onClick={() => undo(true)}>Ponów</button>
            <button type="button" className="quiet-button" onClick={() => setView({ ...view, width: view.width / 1.25, height: view.height / 1.25 })}>Powiększ</button>
            <button type="button" className="quiet-button" onClick={() => setView({ ...view, width: view.width * 1.25, height: view.height * 1.25 })}>Pomniejsz</button>
            <button type="button" className="quiet-button" onClick={() => fit(drawing)}>Dopasuj widok</button>
            <button type="button" className="quiet-button" onClick={exportSvg}>Eksport SVG</button>
          </div>
          <p className="cad-save-status" role="status">{saving ? "Zapisywanie rysunku…" : status || "Szkic projektu · jednostki mm"}
            {drawing.sourceImage && !drawing.calibration ? " · Skan bez skali: ustaw kalibrację, wartości mm są tymczasowe!" : ""}</p>
        </div>
        <aside className="cad-inspector">
          <h4>Właściwości elementu</h4>
          {selected ? <div className="form-stack">
            <p>{tools.find(({ id }) => id === selected.kind)?.label ?? entityLabels[selected.kind] ?? selected.kind} · {selected.source.origin === "openai"
              ? `AI: ${Math.round((selected.source.confidence ?? 0) * 100)}% pewności` : "Rysunek ręczny"}</p>
            {Object.entries(selected.attributes).filter(([name]) => name !== "specialistVerified" && name !== "wallId").map(([name, value]) => <div key={`${selected.id}-${name}-${String(value)}`}>
              <label htmlFor={`cad-attribute-${name}`}>{attributeLabels[name] ?? name}</label>
              <input id={`cad-attribute-${name}`} type={typeof value === "number" ? "number" : "text"} step="any" defaultValue={value === null ? "" : String(value)}
                onBlur={(event) => {
                  if (event.target.value === event.target.defaultValue) return;
                  updateSelected({ ...selected, attributes: { ...selected.attributes,
                    [name]: typeof value === "number" ? Number(event.target.value) : event.target.value } });
                }} />
            </div>)}
            {entityPoints(selected).map((point, i) => <div className="cad-coordinate-row" key={`${selected.id}-point-${i}-${point.x}-${point.y}`}>
              {(["x", "y"] as const).map((axis) => <div key={axis}><label htmlFor={`cad-point-${i}-${axis}`}>Punkt {i + 1} {axis.toUpperCase()} (mm)</label>
                <input id={`cad-point-${i}-${axis}`} type="number" step="any" defaultValue={Number(point[axis].toFixed(3))} onBlur={(event) => {
                  if (event.target.value === event.target.defaultValue) return;
                  const updated = entityPoints(selected).map((p, j) => j === i ? { ...p, [axis]: Number(event.target.value) } : p);
                  const geometry = "vertices" in selected.geometry ? { vertices: updated } : "start" in selected.geometry
                    ? { start: updated[0], end: updated[1] } : { point: updated[0] };
                  updateSelected({ ...selected, geometry });
                }} /></div>)}
            </div>)}
            {"start" in selected.geometry && <p>Długość: {distanceBetweenPoints(selected.geometry.start, selected.geometry.end).toFixed(1)} mm</p>}
            {"vertices" in selected.geometry && <p>Pole rzutu roboczego: {(polygonAreaMm2(selected.geometry.vertices) / 1000000).toFixed(3)} m²</p>}
            <button type="button" className="quiet-button" onClick={removeSelected}>Usuń element</button>
          </div> : <p>Zaznacz element na płótnie lub na liście po lewej.</p>}
          <h4>Warstwy</h4>
          {drawing.sourceImage && <label className="checkbox-field"><input type="checkbox" checked={showSource} onChange={(event) => setShowSource(event.target.checked)} /> Podkład skanu</label>}
          {layers.map((layer) => <label className="checkbox-field" key={layer}><input type="checkbox" checked={!hiddenLayers.includes(layer)}
            onChange={(event) => setHiddenLayers(event.target.checked ? hiddenLayers.filter((id) => id !== layer) : [...hiddenLayers, layer])} />
            {tools.find(({ id }) => id === layer)?.label ?? "Rozpoznanie AI"}</label>)}
          <h4>Informacje o etapie</h4><p>{drawing.entities.length} obiektów · wersja {drawing.revision}</p>
          {drawing.importWarnings?.map((warning, i) => <p className="cad-disclaimer" key={i}>{warning}</p>)}
          <p className="cad-disclaimer">Wymiary i pola są robocze. Import AI nie jest zweryfikowanym przedmiarem. Edytor nie zatwierdza projektu konstrukcyjnego.</p>
        </aside>
      </div>
    </>}
    {scanOpen && drawing && <PlanScanDialog drawing={drawing} onClose={() => setScanOpen(false)} onImport={(next) => {
      commit(next); fit(next); setSelectedId(null); setSourceUrl(""); chooseTool("select");
    }} />}
  </div>;
}
