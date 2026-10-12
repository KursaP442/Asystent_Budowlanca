"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CadDocumentSchema, CadEntitySchema, cadDrawingTools, cadEntityTool, getCadDrawingTools,
  type CadDrawingTool, type ProjectDocumentationKind, type CadDocument, type CadEntity, type CadPoint } from "@asystent/schemas";
import { calibrateCadSource, classifyCadTrace, copyCadGeometry, createCadElement, entityPoints, hasCadJunctions, moveCadJunction, projectCadWallElevations,
  projectPointOnSegment, snapCadEndpoint, translateCadEntity, translateConnectedCadEntity } from "@asystent/domain";
import { distanceBetweenPoints, drawingBounds, isSimplePolygon, polygonAreaMm2, viewportToWorld, zoomDrawingView } from "@asystent/geometry";
import { cadError, cadRequest } from "@/lib/cad-client";
import { getSupabaseClient } from "@/lib/supabase";
import { PlanScanDialog } from "./plan-scan-dialog";
import { CadReinforcementPanel } from "./cad-reinforcement-panel";

type Tool = "select" | "pan" | "calibrate" | CadDrawingTool;
const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Zaznacz / przesuń", icon: "↖" }, { id: "pan", label: "Przesuń widok", icon: "✥" },
  ...cadDrawingTools.map((item) => ({ ...item, icon: item.geometry === "area" ? "⬡" : item.geometry === "point" ? "T" : "╱" })),
  { id: "calibrate", label: "Ustaw skalę skanu", icon: "⤢" },
];
const attributeLabels: Record<string, string> = {
  thicknessMm: "Grubość (mm)", heightMm: "Wysokość (mm)", material: "Materiał", widthMm: "Szerokość (mm)",
  depthMm: "Głębokość (mm)", designReference: "Odniesienie do projektu", pitchDegrees: "Nachylenie (°)",
  measuredMm: "Wymiar referencyjny (mm)", label: "Opis elementu", text: "Treść opisu", diameterMm: "Średnica (mm)",
  count: "Liczba sztuk", steelGrade: "Klasa stali", coverMm: "Otulina (mm)",
  sillMm: "Wysokość parapetu (mm)", system: "System instalacji", type: "Rodzaj otworu",
};
const colors: Partial<Record<CadEntity["kind"], string>> = {
  wall: "#334155", footing: "#64748b", slab: "#94a3b8", "roof-plane": "#22a06b", "rebar-line": "#f97316",
  dimension: "#475569", "trace-line": "#2563eb", "trace-area": "#2563eb", annotation: "#7c3aed",
};
const entityLabels: Partial<Record<CadEntity["kind"], string>> = {
  "trace-line": "Rozpoznany odcinek", "trace-area": "Rozpoznany obrys", "rebar-annotation": "Opis zbrojenia",
  opening: "Otwór", pipe: "Przewód",
};
const layerLabels: Record<string, string> = {
  "rebar-longitudinal": "Pręty podłużne", "rebar-transverse": "Pręty poprzeczne",
  "rebar-stirrups-projection": "Położenie strzemion (rzut)",
};
const attributeOptions: Record<string, { value: string; label: string }[]> = {
  type: [{ value: "window", label: "Okno" }, { value: "door", label: "Drzwi" }, { value: "other", label: "Inny otwór" }],
  system: [{ value: "water", label: "Woda" }, { value: "sewer", label: "Kanalizacja" }, { value: "heating", label: "Ogrzewanie" },
    { value: "ventilation", label: "Wentylacja" }, { value: "electrical-conduit", label: "Elektryka / osłona" }],
};
const initialView = drawingBounds([]);

export function StageCadEditor({ jobId, requirementId, title, kind, sources, technologyHints, onPendingChange, onSavedDrawing }: {
  jobId: string; requirementId: string; title: string; kind: ProjectDocumentationKind;
  sources: { id: string; label: string }[];
  technologyHints: { label: string; material: string; thermal: boolean }[];
  onPendingChange: (pending: boolean) => void; onSavedDrawing: (id: string, count: number) => void;
}) {
  const allowedTools = getCadDrawingTools(kind, title);
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
  const [cursor, setCursor] = useState<CadPoint | null>(null);
  const [sourceDrawing, setSourceDrawing] = useState("");
  const [copying, setCopying] = useState(false);
  const [layerMaterial, setLayerMaterial] = useState("");
  const [layerThickness, setLayerThickness] = useState("");
  const [layerPurpose, setLayerPurpose] = useState<"thermal" | "waterproofing" | "finish" | "bedding" | "structure">("thermal");
  const [layerSide, setLayerSide] = useState<"left" | "right" | "both">("both");
  const [gridMm, setGridMm] = useState(100);
  const gesture = useRef<{ start: CadPoint; entityId: string | null; junction: CadPoint | null; view: typeof initialView } | null>(null);
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
    if (bounds.width / bounds.height > ratio) {
      const height = bounds.width / ratio; bounds.y -= (height - bounds.height) / 2; bounds.height = height;
    } else {
      const width = bounds.height * ratio; bounds.x -= (width - bounds.width) / 2; bounds.width = width;
    }
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
    const svg = svgRef.current;
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current) return;
      const anchor = viewportToWorld({ x: event.clientX, y: event.clientY }, svg.getBoundingClientRect(), view);
      setView(zoomDrawingView(view, anchor, Math.exp(Math.max(-1, Math.min(1, event.deltaY / 500)))));
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [view, drawing?.id]);

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
        setError(""); fit(next); onPendingChange(false); onSavedDrawing(requirementId, next.entities.length);
      }
    }
    void load().catch((cause) => { if (active) { setError(cadError(cause)); onPendingChange(true); } });
    return () => { active = false; alive.current = false; };
  }, [jobId, requirementId, loadAttempt, fit, onPendingChange, onSavedDrawing]);

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
        onSavedDrawing(requirementId, snapshot.entities.length);
      }
    } catch (cause) {
      if (alive.current) { setError(cadError(cause)); setStatus("Zapis nie powiódł się. Rysunek pozostaje w tej karcie — ponów zapis."); }
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }, [onPendingChange, onSavedDrawing, requirementId]);

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
      if (parsed.entities.some((entity) => "vertices" in entity.geometry && !isSimplePolygon(entity.geometry.vertices))) {
        throw new Error("Obrys jest zdegenerowany lub przecina sam siebie. Popraw współrzędne.");
      }
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
  const polygonTool = cadDrawingTools.some((item) => item.id === tool && item.geometry === "area");
  function world(event: ReactPointerEvent<SVGSVGElement>, snap = true) {
    const point = viewportToWorld({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), view,
      snap && !drawing?.sourceImage ? gridMm : 0);
    return snap && drawing && !polygonTool && !["pan", "calibrate", "annotation"].includes(tool)
      ? snapCadEndpoint(drawing, point, view.width * 10 / Math.max(1, event.currentTarget.getBoundingClientRect().width)) : point;
  }
  function newEntity(start: CadPoint, end: CadPoint, vertices?: CadPoint[]): CadEntity {
    if (tool === "select" || tool === "pan" || tool === "calibrate") throw new Error("Wybierz narzędzie rysowania.");
    const wall = drawing?.entities.find((entity) => entity.id === selectedId && entity.kind === "wall");
    if (tool === "opening") {
      if (!wall || wall.kind !== "wall") throw new Error("Zaznacz ścianę na liście, a następnie wybierz otwór.");
      start = projectPointOnSegment(start, wall.geometry.start, wall.geometry.end);
      end = projectPointOnSegment(end, wall.geometry.start, wall.geometry.end);
    }
    return createCadElement(tool, vertices ?? [start, end], { id: crypto.randomUUID(), text: annotation,
      wall: wall?.kind === "wall" ? wall : undefined,
      pipeSystem: kind === "electrical" ? "electrical-conduit" : kind === "heating" ? "heating" : kind === "ventilation" ? "ventilation" : "water" });
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
    if (polygonTool || tool === "calibrate") {
      if (tool === "calibrate" && !drawing.sourceImage) { setError("Najpierw zaimportuj skan."); return; }
      setPoints((current) => tool === "calibrate" && current.length >= 2 ? [point] : [...current, point]); return;
    }
    const handle = event.target instanceof Element ? event.target.closest("[data-junction-index]") : null;
    const junctionIndex = handle?.getAttribute("data-junction-index");
    const entity = drawing.entities.find((item) => item.id === entityId);
    const junction = junctionIndex !== null && junctionIndex !== undefined && entity ? entityPoints(entity)[Number(junctionIndex)] : null;
    gesture.current = { start: point, entityId, junction, view };
    if (!["select", "pan"].includes(tool)) setPoints([point]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = world(event);
    setCursor(world(event, false));
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
      if (start.junction) {
        try { commit(moveCadJunction(drawing, start.junction, end)); }
        catch (cause) { setError(cadError(cause)); }
        return;
      }
      const delta = { x: end.x - start.start.x, y: end.y - start.start.y };
      if (Math.abs(delta.x) + Math.abs(delta.y) > 0.01) {
        const moving = drawing.entities.find((entity) => entity.id === start.entityId);
        try {
          let next = drawing;
          if (moving && hasCadJunctions(moving)) {
            next = translateConnectedCadEntity(drawing, moving.id, delta);
          } else if (moving?.kind === "opening") {
            const wall = drawing.entities.find((item) => item.id === moving.attributes.wallId);
            if (wall?.kind !== "wall") throw new Error("Otwór nie ma ściany źródłowej.");
            const moved = translateCadEntity(moving, delta);
            if (moved.kind !== "opening") throw new Error("Nieprawidłowy typ otworu.");
            next = { ...drawing, entities: drawing.entities.map((entity) => entity.id === moving.id ?
              CadEntitySchema.parse({ ...moved, geometry: {
                start: projectPointOnSegment(moved.geometry.start, wall.geometry.start, wall.geometry.end),
                end: projectPointOnSegment(moved.geometry.end, wall.geometry.start, wall.geometry.end),
              } }) : entity) };
          } else next = { ...drawing, entities: drawing.entities.map((entity) =>
            entity.id === start.entityId ? translateCadEntity(entity, delta) : entity) };
          commit(next);
        } catch (cause) { setError(cadError(cause)); }
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
  async function reuseDrawing(elevations: boolean) {
    if (!drawing || !sourceDrawing || dirty || copying) return;
    setCopying(true); onPendingChange(true);
    try {
      const { data, error: loadError } = await getSupabaseClient().from("cad_drawings").select("payload")
        .eq("job_id", jobId).eq("requirement_id", sourceDrawing).single();
      if (loadError) throw loadError;
      const source = CadDocumentSchema.parse(data.payload);
      const next = elevations ? projectCadWallElevations(source, drawing, () => crypto.randomUUID())
        : copyCadGeometry(source, drawing, () => crypto.randomUUID());
      commit(next); fit(next);
    } catch (cause) { setError(cadError(cause)); onPendingChange(false); }
    finally { setCopying(false); }
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
  const rulerStep = 10 ** Math.floor(Math.log10(view.width / 6));
  const xTicks = Array.from({ length: Math.min(30, Math.ceil(view.width / rulerStep)) }, (_, i) =>
    (Math.ceil(view.x / rulerStep) + i) * rulerStep).filter((x) => x <= view.x + view.width);
  const yTicks = Array.from({ length: Math.min(30, Math.ceil(view.height / rulerStep)) }, (_, i) =>
    (Math.ceil(view.y / rulerStep) + i) * rulerStep).filter((y) => y <= view.y + view.height);
  function dimensionShape(start: CadPoint, end: CadPoint, color: string, offset = textSize * 1.8) {
    const length = distanceBetweenPoints(start, end);
    if (!length) return null;
    const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
    const a = { x: start.x + nx * offset, y: start.y + ny * offset };
    const b = { x: end.x + nx * offset, y: end.y + ny * offset };
    const tick = textSize / 3;
    return <g className="cad-dimension" pointerEvents="none" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke">
      <line x1={start.x} y1={start.y} x2={a.x + nx * tick} y2={a.y + ny * tick} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <line x1={end.x} y1={end.y} x2={b.x + nx * tick} y2={b.y + ny * tick} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
      {[a, b].map((p, i) => <line key={i} x1={p.x - tick} y1={p.y - tick} x2={p.x + tick} y2={p.y + tick} vectorEffect="non-scaling-stroke" />)}
      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - textSize * .25} fill={color} stroke="none"
        fontSize={textSize * .8} textAnchor="middle">{length.toFixed(0)} mm</text>
    </g>;
  }
  function shape(entity: CadEntity) {
    const color = selectedId === entity.id ? "#ea580c" : colors[entity.kind] ?? "#475569";
    if ("start" in entity.geometry) {
      const { start, end } = entity.geometry;
      const width = entity.kind === "wall" ? entity.attributes.thicknessMm : entity.kind === "footing" ? entity.attributes.widthMm
        : entity.kind === "construction-line" && !["axis", "section-cut"].includes(entity.attributes.role) ? entity.attributes.widthMm : 0;
      const length = distanceBetweenPoints(start, end);
      const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
      let left = width / 2, right = width / 2;
      const buildUp = (entity.buildUp ?? []).flatMap((layer, index) => {
        const sides = layer.side === "both" ? ["left", "right"] : [layer.side];
        return sides.map((side) => {
          const position = (side === "left" ? left : -right) + (side === "left" ? 1 : -1) * layer.thicknessMm / 2;
          if (side === "left") left += layer.thicknessMm; else right += layer.thicknessMm;
          return <line key={`${index}-${side}`} x1={start.x + nx * position} y1={start.y + ny * position}
            x2={end.x + nx * position} y2={end.y + ny * position} stroke={`url(#cad-hatch-${requirementId}-${layer.purpose})`}
            strokeWidth={layer.thicknessMm}><title>{layer.material} · {layer.thicknessMm} mm</title></line>;
        });
      });
      const openingWall = entity.kind === "opening" ? drawing?.entities.find((wall) => wall.id === entity.attributes.wallId) : null;
      if (entity.kind === "dimension") return dimensionShape(start, end, color, textSize);
      return <g>
        {buildUp}
        {openingWall?.kind === "wall" && <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
          stroke="white" strokeWidth={openingWall.attributes.thicknessMm + 2} />}
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeLinecap={width ? "square" : "butt"}
          strokeWidth={width || view.width / 400} opacity={width ? 0.65 : 1} />
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color}
          strokeDasharray={entity.kind === "construction-line" && ["axis", "section-cut"].includes(entity.attributes.role) ? "12 4 2 4" : undefined}
          strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {width > 0 && dimensionShape(start, end, color, width / 2 + textSize * 2)}
        {width === 0 && (!entity.layerId.startsWith("rebar-") || selectedId === entity.id) && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - textSize / 2} fill={color} fontSize={textSize} textAnchor="middle">
          {Math.round(length)} mm{entity.kind === "rebar-line" ? ` · Ø${entity.attributes.diameterMm}` : ""}
        </text>}
      </g>;
    }
    if ("vertices" in entity.geometry) {
      const vertices = entity.geometry.vertices;
      const outline = vertices.map(({ x, y }) => `${x},${y}`).join(" ");
      const isVoid = entity.kind === "construction-area" && entity.attributes.role === "void";
      let thickness = 0;
      const bands = [...(entity.buildUp ?? [])].reverse().map((layer, i) => {
        thickness += 2 * layer.thicknessMm;
        return { layer, i, thickness };
      }).reverse();
      return <g>
        {bands.map(({ layer, i, thickness }) => <polygon key={i} points={outline} fill="none"
          stroke={`url(#cad-hatch-${requirementId}-${layer.purpose})`} strokeWidth={thickness}>
          <title>{layer.material} · {layer.thicknessMm} mm — pas obrysu, sprawdź przekrój</title></polygon>)}
        <polygon points={outline} fill={isVoid ? "white" : color} fillOpacity={isVoid ? 1 : 0.12} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {vertices.map((point, i) => dimensionShape(point, vertices[(i + 1) % vertices.length], color))}
      </g>;
    }
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
        {tools.filter((item) => ["select", "pan", "calibrate"].includes(item.id) || allowedTools.includes(item.id as CadDrawingTool)).map((item) => <button key={item.id} type="button" aria-pressed={tool === item.id}
          disabled={scanOpen || item.id === "calibrate" && !drawing.sourceImage} onClick={() => chooseTool(item.id)}>
          <span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
      </div>
      <div className="cad-workspace">
        <aside className="cad-tools-panel">
          <h4>Narzędzia etapu</h4><p>{tool === "select" ? "Kliknij element, aby go edytować. Przeciągnij, aby go przesunąć."
            : polygonTool ? "Klikaj kolejne narożniki, następnie zamknij obrys."
              : tool === "calibrate" ? "Kliknij dwa punkty skanu o znanej odległości."
                : tool === "annotation" ? "Kliknij miejsce opisu." : tool === "pan" ? "Przeciągnij płótno." : "Przeciągnij od początku do końca elementu."}</p>
          <label>Skok przyciągania (mm, 0 = bez siatki)<input type="number" min={0} max={10000} step="any" value={gridMm}
            onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 10000) setGridMm(value); }} /></label>
          {tool === "annotation" && <label>Tekst nowego opisu<input value={annotation} maxLength={1000} onChange={(event) => setAnnotation(event.target.value)} /></label>}
          {polygonTool && <button type="button" className="quiet-button" disabled={points.length < 3}
            onClick={() => add(points[0], points.at(-1)!, points)}>Zamknij obrys ({points.length})</button>}
          {tool === "calibrate" && <><label htmlFor="cad-reference">Znana odległość (mm)</label><input id="cad-reference" type="number" min={1} max={1000000}
            value={referenceMm} onChange={(event) => setReferenceMm(event.target.value)} />
            <button type="button" className="primary-button" disabled={points.length !== 2} onClick={calibrate}>Zastosuj skalę</button></>}
          <p className="cad-disclaimer">Początkowe parametry nowych obiektów są robocze. Uzupełnij je z projektu.
            Zbrojenie wymaga kontroli projektanta.</p>
          {technologyHints.length > 0 && <details className="cad-generator"><summary>Materiały wybrane w ankiecie</summary>
            {technologyHints.map((hint, i) => <p key={i}>{hint.label}: {hint.material}</p>)}
            <p>Przenieś materiał do właściwego elementu i podaj projektową grubość. Ankieta nie określa wymiarów konstrukcji.</p>
          </details>}
          {(allowedTools.includes("rebar-line") || /strop/i.test(title)) && <CadReinforcementPanel onCreate={(entities) => {
            const next = { ...drawing, entities: [...drawing.entities, ...entities] }; commit(next); fit(next);
          }} />}
          <details className="cad-generator"><summary>Wykorzystaj wcześniejszy rysunek</summary>
            <label htmlFor="cad-source-drawing">Rysunek źródłowy</label><select id="cad-source-drawing" value={sourceDrawing} onChange={(event) => setSourceDrawing(event.target.value)}>
              <option value="">Wybierz zapisany rysunek</option>
              {sources.filter((source) => source.id !== requirementId).map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
            </select>
            <p>Kopia jest podkładem odniesienia z numerem wersji, bez synchronizacji. Zachowuje ściany i otwory.
              Rysuj nowe elementy właściwe dla tego etapu. Nie powstaje automatycznie projekt konstrukcyjny.</p>
            <button type="button" className="quiet-button" disabled={!sourceDrawing || dirty || copying}
              onClick={() => void reuseDrawing(false)}>Dodaj kopię geometrii</button>
            {(/przekro|rozwinię|elewac/i.test(title) || kind === "facade") && <button type="button" className="quiet-button"
              disabled={!sourceDrawing || dirty || copying} onClick={() => void reuseDrawing(true)}>Rozwiń ściany z otworami</button>}
          </details>
          <h4>Elementy ({drawing.entities.length})</h4>
          <div className="cad-element-list">{drawing.entities.map((entity, i) => <button key={entity.id} type="button"
            aria-pressed={selectedId === entity.id} onClick={() => { setSelectedId(entity.id); chooseTool("select"); }}>
            {i + 1}. {tools.find(({ id }) => id === cadEntityTool(entity))?.label ?? ("label" in entity.attributes ? entity.attributes.label : entity.kind)}
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
              if (event.key === "Enter" && polygonTool && points.length >= 3) {
                event.preventDefault(); add(points[0], points.at(-1)!, points);
              }
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey); }
            }}>
            <defs><pattern id={`cad-grid-${requirementId}`} width={drawing.sourceImage ? view.width / 40 : 500}
              height={drawing.sourceImage ? view.width / 40 : 500} patternUnits="userSpaceOnUse">
              <path d={`M ${drawing.sourceImage ? view.width / 40 : 500} 0 L 0 0 0 ${drawing.sourceImage ? view.width / 40 : 500}`}
                fill="none" stroke="#dce3eb" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            </pattern>
              {(["thermal", "waterproofing", "finish", "bedding", "structure"] as const).map((purpose) => <pattern
                key={purpose} id={`cad-hatch-${requirementId}-${purpose}`} width={80} height={80} patternUnits="userSpaceOnUse">
                <rect width={80} height={80} fill={purpose === "thermal" ? "#fff5ce" : purpose === "waterproofing" ? "#c9eaf7" : "#e6e8ed"} />
                <path d={purpose === "thermal" ? "M0 40 L20 0 L40 80 L60 0 L80 40" : "M0 80 L80 0"}
                  stroke={purpose === "thermal" ? "#b98522" : "#64748b"} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </pattern>)}
            </defs>
            <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#fcfdff" />
            <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={`url(#cad-grid-${requirementId})`} />
            <g className="cad-coordinate-axes" pointerEvents="none" stroke="#9aa8bb" strokeWidth={1} vectorEffect="non-scaling-stroke">
              <line x1={0} y1={view.y} x2={0} y2={view.y + view.height} strokeDasharray="8 4" />
              <line x1={view.x} y1={0} x2={view.x + view.width} y2={0} strokeDasharray="8 4" />
            </g>
            {drawing.sourceImage && sourceUrl && showSource && <image href={sourceUrl} x={0} y={0} opacity={0.4}
              width={drawing.sourceImage.widthPx * drawing.sourceImage.mmPerPixel} height={drawing.sourceImage.heightPx * drawing.sourceImage.mmPerPixel} />}
            {drawing.entities.filter(({ layerId }) => !hiddenLayers.includes(layerId)).map((entity) => <g key={entity.id}
              data-entity-id={entity.id} className="cad-entity">{shape(entity)}</g>)}
            {selected && tool === "select" && hasCadJunctions(selected) && !hiddenLayers.includes(selected.layerId) &&
              entityPoints(selected).map((p, i) => <circle key={`handle-${i}`} className="cad-junction"
                data-entity-id={selected.id} data-junction-index={i} cx={p.x} cy={p.y} r={view.width / 130}
                fill="#fff" stroke="#ea580c" strokeWidth={2} vectorEffect="non-scaling-stroke">
                <title>Przeciągnij wspólny narożnik</title></circle>)}
            {points.length > 0 && <polyline points={[...points, ...(ghost ? [ghost] : [])].map(({ x, y }) => `${x},${y}`).join(" ")}
              fill="none" stroke="#f97316" strokeDasharray="6 4" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={view.width / 220} fill="#f97316" />)}
            <g className="cad-rulers" pointerEvents="none">
              <rect x={view.x} y={view.y} width={view.width} height={textSize * 1.15} fill="#f0f4f8" />
              <rect x={view.x} y={view.y} width={textSize * 2} height={view.height} fill="#f0f4f8" />
              {xTicks.map((x) => <text key={`x-${x}`} x={x} y={view.y + textSize * .8} fontSize={textSize * .5} fill="#475569">{x}</text>)}
              {yTicks.map((y) => <text key={`y-${y}`} x={view.x + textSize * .1} y={y} fontSize={textSize * .5} fill="#475569">{y}</text>)}
            </g>
            {!drawing.entities.length && !points.length && <text x={view.x + view.width / 2} y={view.y + view.height / 2}
              textAnchor="middle" fontSize={textSize} fill="#7b8798" pointerEvents="none">Wybierz narzędzie lub zaimportuj projekt</text>}
          </svg>
          <div className="cad-coordinates" aria-label="Współrzędne płótna">X: {(cursor?.x ?? 0).toFixed(1)} mm · Y: {(cursor?.y ?? 0).toFixed(1)} mm
            <span>Zakres X: {view.x.toFixed(0)}–{(view.x + view.width).toFixed(0)} · Y: {view.y.toFixed(0)}–{(view.y + view.height).toFixed(0)} mm</span>
            <span>Przybliżenie kółkiem myszy · (0, 0) przecięcie osi · Y w dół</span></div>
          <div className="cad-viewbar">
            <button type="button" className="quiet-button" disabled={!history.length} onClick={() => undo()}>Cofnij</button>
            <button type="button" className="quiet-button" disabled={!future.length} onClick={() => undo(true)}>Ponów</button>
            <button type="button" className="quiet-button" onClick={() => setView(zoomDrawingView(view, { x: view.x + view.width / 2, y: view.y + view.height / 2 }, 1 / 1.25))}>Powiększ</button>
            <button type="button" className="quiet-button" onClick={() => setView(zoomDrawingView(view, { x: view.x + view.width / 2, y: view.y + view.height / 2 }, 1.25))}>Pomniejsz</button>
            <button type="button" className="quiet-button" onClick={() => fit(drawing)}>Dopasuj widok</button>
            <button type="button" className="quiet-button" onClick={exportSvg}>Eksport SVG</button>
          </div>
          <p className="cad-save-status" role="status">{saving ? "Zapisywanie rysunku…" : status || "Szkic projektu · jednostki mm"}
            {drawing.sourceImage && !drawing.calibration ? " · Skan bez skali: ustaw kalibrację, wartości mm są tymczasowe!" : ""}</p>
        </div>
        <aside className="cad-inspector">
          <h4>Właściwości elementu</h4>
          {selected ? <div className="form-stack">
            <p>{tools.find(({ id }) => id === cadEntityTool(selected))?.label ?? entityLabels[selected.kind] ?? selected.kind} · {selected.source.origin === "openai"
              ? `AI: ${Math.round((selected.source.confidence ?? 0) * 100)}% pewności` : "Rysunek ręczny"}</p>
            {selected.derivedFrom && <p>Podkład z wcześniejszego rysunku · wersja {selected.derivedFrom.revision}. Nie wliczaj kopii drugi raz do przedmiaru.</p>}
            {(selected.kind === "trace-line" || selected.kind === "trace-area") && <div>
              <label htmlFor="cad-classify">Klasyfikacja rozpoznanego elementu</label>
              <select id="cad-classify" value="" disabled={!!drawing.sourceImage && !drawing.calibration} onChange={(event) => {
                const target = cadDrawingTools.find((item) => item.id === event.target.value);
                if (!target) return;
                try { updateSelected(classifyCadTrace(selected, target.id)); } catch (cause) { setError(cadError(cause)); }
              }}><option value="">Wybierz typ po kalibracji skanu</option>
                {cadDrawingTools.filter((item) => allowedTools.includes(item.id)
                  && item.geometry === (selected.kind === "trace-area" ? "area" : "line")
                  && !["opening", "dimension", "axis", "section-cut"].includes(item.id))
                  .map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <span>Parametry nowego typu są robocze — uzupełnij wszystkie z dokumentacji.</span>
            </div>}
            {selected.kind === "rebar-line" && selected.attributes.representation === "projection" && <p className="cad-disclaimer">
              Symbol położenia strzemienia. Ta kreska nie jest długością pręta do przedmiaru.</p>}
            {Object.entries(selected.attributes).filter(([name]) => !["specialistVerified", "wallId", "role", "representation"].includes(name)).map(([name, value]) => <div key={`${selected.id}-${name}-${String(value)}`}>
              <label htmlFor={`cad-attribute-${name}`}>{attributeLabels[name] ?? name}</label>
              {attributeOptions[name] ? <select id={`cad-attribute-${name}`} value={String(value)}
                onChange={(event) => updateSelected({ ...selected, attributes: { ...selected.attributes, [name]: event.target.value } })}>
                {attributeOptions[name].map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select> : <input id={`cad-attribute-${name}`} type={typeof value === "number" ? "number" : "text"} step="any" defaultValue={value === null ? "" : String(value)}
                onBlur={(event) => {
                  if (event.target.value === event.target.defaultValue) return;
                  updateSelected({ ...selected, attributes: { ...selected.attributes,
                    [name]: typeof value === "number" ? Number(event.target.value) : event.target.value } });
                }} />}
            </div>)}
            {entityPoints(selected).map((point, i) => <div className="cad-coordinate-row" key={`${selected.id}-point-${i}-${point.x}-${point.y}`}>
              {(["x", "y"] as const).map((axis) => <div key={axis}><label htmlFor={`cad-point-${i}-${axis}`}>Punkt {i + 1} {axis.toUpperCase()} (mm)</label>
                <input id={`cad-point-${i}-${axis}`} type="number" step="any" defaultValue={Number(point[axis].toFixed(3))} onBlur={(event) => {
                  if (event.target.value === event.target.defaultValue) return;
                  const updated = entityPoints(selected).map((p, j) => j === i ? { ...p, [axis]: Number(event.target.value) } : p);
                  const geometry = "vertices" in selected.geometry ? { vertices: updated } : "start" in selected.geometry
                    ? { start: updated[0], end: updated[1] } : { point: updated[0] };
                  if (hasCadJunctions(selected) && drawing) {
                    try { commit(moveCadJunction(drawing, point, updated[i])); }
                    catch (cause) { setError(cadError(cause)); }
                  } else updateSelected({ ...selected, geometry });
                }} /></div>)}
            </div>)}
            {"start" in selected.geometry && <p>Długość: {distanceBetweenPoints(selected.geometry.start, selected.geometry.end).toFixed(1)} mm</p>}
            {"vertices" in selected.geometry && <p>Pole rzutu roboczego: {(polygonAreaMm2(selected.geometry.vertices) / 1000000).toFixed(3)} m²</p>}
            {!["annotation", "dimension", "rebar-line", "rebar-annotation", "opening"].includes(selected.kind) &&
            <details className="cad-generator"><summary>Warstwy materiałowe / ocieplenie</summary>
              {(selected.buildUp ?? []).map((layer, i) => <div key={i}>{i + 1}. {layer.material} · {layer.thicknessMm} mm · {layer.side}
                <button type="button" className="quiet-button" aria-label={`Usuń warstwę ${i + 1}`}
                  onClick={() => updateSelected({ ...selected, buildUp: selected.buildUp?.filter((_, index) => index !== i) })}>Usuń</button></div>)}
              <label>Funkcja warstwy<select value={layerPurpose} onChange={(event) => {
                const value = event.target.value;
                if (value === "thermal" || value === "waterproofing" || value === "finish" || value === "bedding" || value === "structure") setLayerPurpose(value);
              }}><option value="thermal">Ocieplenie</option><option value="waterproofing">Hydroizolacja</option>
                <option value="finish">Wykończenie</option><option value="bedding">Podbudowa / podsypka</option><option value="structure">Konstrukcja</option></select></label>
              <label>Materiał warstwy<input value={layerMaterial} maxLength={160} onChange={(event) => setLayerMaterial(event.target.value)} /></label>
              {technologyHints.filter((hint) => hint.thermal).map((hint, i) => <button key={i} type="button" className="quiet-button"
                onClick={() => { setLayerMaterial(hint.material); setLayerPurpose("thermal"); }}>Użyj: {hint.material}</button>)}
              <label>Grubość warstwy (mm)<input type="number" value={layerThickness} onChange={(event) => setLayerThickness(event.target.value)} /></label>
              <label>Strona względem kierunku rysowania<select value={layerSide} onChange={(event) => {
                if (event.target.value === "left" || event.target.value === "right" || event.target.value === "both") setLayerSide(event.target.value);
              }}><option value="both">Obie strony</option><option value="left">Lewa</option><option value="right">Prawa</option></select></label>
              <p>Grubości z projektu, niezależnie od preferencji ankiety. Pas obrysu płyty nie zastępuje pionowego przekroju warstw.</p>
              <button type="button" className="quiet-button" onClick={() => updateSelected({ ...selected, buildUp: [
                ...(selected.buildUp ?? []), { purpose: layerPurpose, material: layerMaterial, thicknessMm: Number(layerThickness), side: layerSide },
              ] })}>Dodaj warstwę</button>
            </details>}
            <button type="button" className="quiet-button" onClick={removeSelected}>Usuń element</button>
          </div> : <p>Zaznacz element na płótnie lub na liście po lewej.</p>}
          <h4>Warstwy</h4>
          {drawing.sourceImage && <label className="checkbox-field"><input type="checkbox" checked={showSource} onChange={(event) => setShowSource(event.target.checked)} /> Podkład skanu</label>}
          {layers.map((layer) => <label className="checkbox-field" key={layer}><input type="checkbox" checked={!hiddenLayers.includes(layer)}
            onChange={(event) => setHiddenLayers(event.target.checked ? hiddenLayers.filter((id) => id !== layer) : [...hiddenLayers, layer])} />
            {tools.find(({ id }) => id === layer)?.label ?? layerLabels[layer] ?? "Rozpoznanie AI"}</label>)}
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
