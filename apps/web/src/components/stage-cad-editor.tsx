"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { CadDocumentSchema, CadEntitySchema, cadDrawingTools, cadEntityTool, foundationDocumentChecklist, getCadDrawingTools, getCadWallDefaults, getFoundationSupportOptions,
  type ConstructionTechnologySelections, type CadDrawingTool, type ProjectDocumentationKind, type CadDocument, type CadEntity, type CadPoint } from "@asystent/schemas";
import { calibrateCadSource, classifyCadTrace, connectCadWallJunctions, copyCadGeometry, createCadElement, entityPoints, hasCadJunctions, moveCadJunction, projectCadWallElevations,
  projectPointOnSegment, snapCadConnection, translateCadEntity, translateConnectedCadEntity, updateConnectedCadEntity } from "@asystent/domain";
import { configureFoundationWall, foundationPlanExtents, resizeCadRectangle, resizeCadStrip, synchronizeFoundationSupports, synchronizeReinforcementPlacement } from "@asystent/domain";
import { assignCadMarks, attachCadElement, cadElementBounds, cadEntityColor as entityColor, cadLayerOutline, cadLayerSides, foundationSetupFromSettings,
  getCadPlanDimensions, getCadPlanFaces, pointInCadPolygon, polygonCenter, synchronizeCadAttachments, synchronizeCadInfill } from "@asystent/domain";
import { distanceBetweenPoints, drawingBounds, isSimplePolygon, polygonAreaMm2, rectangleFromCorners, rectangleSize,
  segmentRectangle, viewportToWorld, zoomDrawingView } from "@asystent/geometry";
import { cadError, cadRequest } from "@/lib/cad-client";
import { getSupabaseClient } from "@/lib/supabase";
import { PlanScanDialog } from "./plan-scan-dialog";
import { CadReinforcementPanel } from "./cad-reinforcement-panel";
import { CadFoundationPanel, initialFoundationSettings } from "./cad-foundation-panel";
import { CadBeamSection } from "./cad-beam-section";
import { CadPlanDimensions } from "./cad-plan-dimensions";

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
  fontSizeMm: "Rozmiar czcionki na arkuszu (mm)",
};
const entityLabels: Partial<Record<CadEntity["kind"], string>> = {
  "trace-line": "Rozpoznany odcinek", "trace-area": "Rozpoznany obrys", "rebar-annotation": "Opis zbrojenia",
  opening: "Otwór", pipe: "Przewód",
};
const layerLabels: Record<string, string> = {
  "rebar-longitudinal": "Pręty podłużne", "rebar-transverse": "Pręty poprzeczne",
  "rebar-stirrups-projection": "Położenie strzemion (rzut)",
  "rebar-top": "Pręty górne", "rebar-bottom": "Pręty dolne", "rebar-section": "Przekrój zbrojenia",
};
const attributeOptions: Record<string, { value: string; label: string }[]> = {
  type: [{ value: "window", label: "Okno" }, { value: "door", label: "Drzwi" }, { value: "other", label: "Inny otwór" }],
  system: [{ value: "water", label: "Woda" }, { value: "sewer", label: "Kanalizacja" }, { value: "heating", label: "Ogrzewanie" },
    { value: "ventilation", label: "Wentylacja" }, { value: "electrical-conduit", label: "Elektryka / osłona" }],
};
const initialView = drawingBounds([]);

export function StageCadEditor({ jobId, requirementId, title, kind, sources, technology, basement, disabled, technologyHints, onPendingChange, onSavedDrawing }: {
  jobId: string; requirementId: string; title: string; kind: ProjectDocumentationKind;
  sources: { id: string; label: string }[];
  technologyHints: { label: string; material: string; thermal: boolean }[];
  technology: ConstructionTechnologySelections;
  basement: boolean;
  disabled: boolean;
  onPendingChange: (pending: boolean) => void; onSavedDrawing: (id: string, count: number) => void;
}) {
  const allowedTools = getCadDrawingTools(kind, title, technology, basement);
  const [storedDrawing, setDrawing] = useState<CadDocument | null>(null);
  const [previewDrawing, setPreviewDrawing] = useState<CadDocument | null>(null);
  const drawing = previewDrawing ?? storedDrawing;
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
  const [editingAnnotation, setEditingAnnotation] = useState<{ id: string; text: string } | null>(null);
  const [cursor, setCursor] = useState<CadPoint | null>(null);
  const [sourceDrawing, setSourceDrawing] = useState("");
  const [copying, setCopying] = useState(false);
  const [layerMaterial, setLayerMaterial] = useState("");
  const [layerThickness, setLayerThickness] = useState("");
  const [layerPurpose, setLayerPurpose] = useState<"thermal" | "waterproofing" | "finish" | "bedding" | "structure">("thermal");
  const [layerSide, setLayerSide] = useState<"left" | "right" | "both">("both");
  const [gridMm, setGridMm] = useState(100);
  const [annotationFont, setAnnotationFont] = useState("2.5");
  const annotationInput = useRef<HTMLInputElement>(null);
  const [snapTarget, setSnapTarget] = useState<CadPoint | null>(null);
  const [connectWalls, setConnectWalls] = useState(true);
  const wallDefaults = getCadWallDefaults(technology, kind === "foundation");
  const [wallThickness, setWallThickness] = useState(String(wallDefaults.widthMm ?? 240));
  const gesture = useRef<{ start: CadPoint; entityId: string | null; junction: CadPoint | null;
    pointIndex: number | null; document: CadDocument; view: typeof initialView; pan?: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const alive = useRef(true);
  const [status, setStatus] = useState("");
  const [showLegend, setShowLegend] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(1300);
  const [exporting, setExporting] = useState(false);

  const fit = useCallback((document: CadDocument) => {
    const all = document.entities.flatMap(entityPoints);
    all.push(...foundationPlanExtents(document));
    for (const d of getCadPlanDimensions(document, 2.5 * (document.paperScale ?? 100))) {
      all.push({ x: d.box.x, y: d.box.y }, { x: d.box.x + d.box.width, y: d.box.y + d.box.height }, d.a, d.b);
    }
    for (const entity of document.entities) {
      if (entity.kind !== "rebar-annotation" || !entity.attributes.section) continue;
      const section = entity.attributes.section, p = entity.geometry.point;
      all.push({ x: p.x - section.widthMm, y: p.y - section.heightMm / 2 },
        { x: p.x + section.widthMm * 2.7, y: p.y + section.heightMm * 1.6 });
    }
    if (document.sourceImage) all.push({ x: 0, y: 0 }, {
      x: document.sourceImage.widthPx * document.sourceImage.mmPerPixel,
      y: document.sourceImage.heightPx * document.sourceImage.mmPerPixel,
    });
    const bounds = drawingBounds(all);
    bounds.x -= bounds.width * .12; bounds.y -= bounds.height * .12; bounds.width *= 1.24; bounds.height *= 1.24;
    bounds.width /= .68;
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
    const observer = new ResizeObserver(() => {
      setCanvasWidth(svg.getBoundingClientRect().width);
      if (latest.current) fit(latest.current);
    });
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
      let next = data ? CadDocumentSchema.parse(data.payload) : CadDocumentSchema.parse({
        schemaVersion: 1, id: crypto.randomUUID(), projectId: jobId, requirementId,
        revision: 0, status: "draft", calibration: null, sourceImage: null, entities: [],
      });
      if (!next.foundationSettings) {
        const { data: previous, error: settingsError } = await getSupabaseClient().from("cad_drawings").select("payload")
          .eq("job_id", jobId).like("requirement_id", "foundation%").not("payload->foundationSettings", "is", null)
          .order("requirement_id", { ascending: true }).limit(1).maybeSingle();
        if (settingsError) throw settingsError;
        if (previous) next = { ...next, foundationSettings: CadDocumentSchema.parse(previous.payload).foundationSettings };
      }
      const marked = assignCadMarks(next), missingMarks = marked.entities.some((e, i) => e.mark !== next.entities[i]?.mark);
      next = marked;
      if (active) {
        latest.current = next; savedRevision.current = data?.revision ?? 0; setDrawing(next);
        if (missingMarks) { sequence.current += 1; setDirty(true); setStatus("Zapisywanie oznaczeń istniejących elementów…"); }
        setError(""); fit(next); onPendingChange(missingMarks); onSavedDrawing(requirementId, next.entities.length);
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
        setDirty(pending); onPendingChange(pending || !!gesture.current); setError("");
        setStatus(pending ? "Niezapisane zmiany…" : "Rysunek zapisany automatycznie.");
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
    if (!dirty || saving || error || previewDrawing) return;
    const timeout = setTimeout(() => void persist(), 900);
    return () => clearTimeout(timeout);
  }, [drawing, dirty, saving, error, previewDrawing, persist]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  function commit(next: CadDocument, remember = true) {
    try {
      const parsed = CadDocumentSchema.parse(assignCadMarks(synchronizeCadInfill(synchronizeReinforcementPlacement(
        synchronizeFoundationSupports(connectCadWallJunctions(synchronizeCadAttachments({ ...next, status: "draft", revision: savedRevision.current }),
          () => crypto.randomUUID()), () => crypto.randomUUID())))));
      getCadPlanFaces(parsed);
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
  function chooseTool(next: Tool) {
    setEditingAnnotation(null);
    setTool(next); setPoints([]); setGhost(null); setSnapTarget(null); gesture.current = null; setPreviewDrawing(null); setError(""); onPendingChange(dirty || saving);
  }
  const infillTool = kind === "foundation" && (tool === "slab" || tool === "basement-area");
  const polygonTool = !infillTool && cadDrawingTools.some((item) => item.id === tool && item.geometry === "area");
  const rectangleTool = tool === "pad" || tool === "column";
  function cancelGesture() {
    gesture.current = null; setPreviewDrawing(null); setPoints([]); setGhost(null); setSnapTarget(null); onPendingChange(dirty || saving);
  }
  function world(event: ReactPointerEvent<SVGSVGElement>, snap = true) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const raw = viewportToWorld({ x: event.clientX, y: event.clientY }, bounds, view);
    const connection = snap && connectWalls && drawing && ["wall", "foundation-wall", "footing"].includes(tool)
      ? snapCadConnection(drawing, raw, view.width * 12 / Math.max(1, bounds.width)) : null;
    const point = viewportToWorld({ x: event.clientX, y: event.clientY }, bounds, view,
      snap && !drawing?.sourceImage ? gridMm : 0);
    return connection ?? point;
  }
  function newEntity(start: CadPoint, end: CadPoint, vertices?: CadPoint[]): CadEntity {
    if (tool === "select" || tool === "pan" || tool === "calibrate") throw new Error("Wybierz narzędzie rysowania.");
    const wall = drawing?.entities.find((entity) => entity.id === selectedId && entity.kind === "wall");
    if (tool === "opening") {
      if (!wall || wall.kind !== "wall") throw new Error("Zaznacz ścianę na liście, a następnie wybierz otwór.");
      start = projectPointOnSegment(start, wall.geometry.start, wall.geometry.end);
      end = projectPointOnSegment(end, wall.geometry.start, wall.geometry.end);
    }
    const entity = createCadElement(tool, vertices ?? [start, end], { id: crypto.randomUUID(), text: annotation,
      wall: wall?.kind === "wall" ? wall : undefined,
      pipeSystem: kind === "electrical" ? "electrical-conduit" : kind === "heating" ? "heating" : kind === "ventilation" ? "ventilation" : "water" });
    if (tool === "foundation-wall") {
      const settings = drawing?.foundationSettings ?? initialFoundationSettings(technology);
      if (!getFoundationSupportOptions(technology).some((option) => option.value === settings.type)) {
        throw new Error("Wybierz podparcie zgodne z aktualnymi danymi budowy.");
      }
      return configureFoundationWall(entity, foundationSetupFromSettings(settings, technologyHints));
    }
    if (entity.kind === "wall") return CadEntitySchema.parse({ ...entity,
      attributes: { ...entity.attributes, thicknessMm: Number(wallThickness), material: wallDefaults.material ?? entity.attributes.material } });
    if (entity.kind === "annotation") return attachCadElement(CadEntitySchema.parse({ ...entity, geometry: { point: end },
      attributes: { text: annotation, fontSizeMm: Number(annotationFont), leader: start } }), drawing!, 0);
    if (entity.kind === "construction-area" && ["pad", "column"].includes(entity.attributes.role)) {
      return attachCadElement(entity, drawing!, view.width * 12 / Math.max(1, svgRef.current?.getBoundingClientRect().width ?? 1));
    }
    return entity;
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
    if (!drawing || scanOpen || disabled) return;
    if (event.button === 2) {
      gesture.current = { start: world(event, false), entityId: null, junction: null, pointIndex: null, document: drawing, view, pan: true };
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    if (event.button !== 0) return;
    const point = world(event, tool !== "select");
    if (infillTool) {
      try {
        const face = getCadPlanFaces(drawing, "footings").find((f) => pointInCadPolygon(point, f.inner));
        if (!face) throw new Error("Kliknij zamknięte pole ław. Obwód musi być połączony.");
        const basementField = tool === "basement-area";
        if (drawing.entities.some((e) => (basementField ? e.kind === "construction-area" && e.attributes.role === "basement-area" : e.kind === "slab")
          && e.infillFor?.slice().sort().join() === face.ids.slice().sort().join())) {
          throw new Error("To pole jest już zaznaczone. Wybierz zaznaczanie, aby je edytować lub usunąć.");
        }
        if (basementField) {
          if (!basement) throw new Error("Najpierw zaznacz budynek z piwnicą w danych budowy.");
          const area = createCadElement("basement-area", face.inner, { id: crypto.randomUUID() });
          commit({ ...drawing, entities: [...drawing.entities, { ...area, infillFor: face.ids }] });
          return;
        }
        const settings = drawing.foundationSettings ?? initialFoundationSettings(technology);
        if (!settings.slabThickness.trim() || !settings.slabMaterial.trim()) throw new Error("Podaj grubość i beton płyty dennej w ustawieniach pod canvas.");
        const slab = createCadElement("slab", face.inner, { id: crypto.randomUUID() });
        commit({ ...drawing, entities: [...drawing.entities, CadEntitySchema.parse({ ...slab, infillFor: face.ids,
          attributes: { thicknessMm: Number(settings.slabThickness), material: settings.slabMaterial } })] });
      } catch (cause) { setError(cadError(cause)); }
      return;
    }
    const target = event.target instanceof Element ? event.target.closest("[data-entity-id]") : null;
    let entityId = target?.getAttribute("data-entity-id") ?? null;
    const support = drawing.entities.find((entity) => entity.id === entityId)?.supportFor;
    if (support?.length === 1) entityId = support[0]!;
    if (tool === "select") setSelectedId(entityId);
    if (polygonTool && !rectangleTool || tool === "calibrate") {
      if (tool === "calibrate" && !drawing.sourceImage) { setError("Najpierw zaimportuj skan."); return; }
      setPoints((current) => tool === "calibrate" && current.length >= 2 ? [point] : [...current, point]); return;
    }
    const handle = event.target instanceof Element ? event.target.closest("[data-junction-index]") : null;
    let junctionIndex = handle?.getAttribute("data-junction-index") ?? null;
    const entity = drawing.entities.find((item) => item.id === entityId);
    if (tool === "select" && entity && hasCadJunctions(entity) && !entity.supportFor && junctionIndex === null) {
      const tolerance = view.width * 12 / event.currentTarget.getBoundingClientRect().width;
      const index = entityPoints(entity).findIndex((p) => distanceBetweenPoints(p, point) <= tolerance);
      if (index >= 0) junctionIndex = String(index);
    }
    const junction = junctionIndex !== null && junctionIndex !== undefined && entity ? entityPoints(entity)[Number(junctionIndex)] : null;
    gesture.current = { start: point, entityId, junction, pointIndex: junctionIndex == null ? null : Number(junctionIndex), document: drawing, view };
    if (tool === "select" && entityId) onPendingChange(true);
    if (!["select", "pan"].includes(tool)) setPoints([point]);
    if (!(tool === "select" && entity?.kind === "annotation")) event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = world(event, tool !== "select");
    setCursor(world(event, false));
    if ((tool === "pan" || gesture.current?.pan) && gesture.current) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const start = gesture.current;
      const previous = viewportToWorld({ x: event.clientX, y: event.clientY }, bounds, start.view);
      setView({ ...start.view, x: start.view.x - (previous.x - start.start.x), y: start.view.y - (previous.y - start.start.y) });
    } else if (tool === "select" && gesture.current?.entityId) {
      if (distanceBetweenPoints(gesture.current.start, point) > view.width * 2 / event.currentTarget.getBoundingClientRect().width)
        event.currentTarget.setPointerCapture(event.pointerId);
      try { setPreviewDrawing(synchronizeCadInfill(synchronizeReinforcementPlacement(
        synchronizeFoundationSupports(synchronizeCadAttachments(dragSelection(gesture.current, point)), () => crypto.randomUUID())))); setError(""); }
      catch (cause) { setError(cadError(cause)); }
    } else {
      setGhost(point);
      const raw = world(event, false);
      setSnapTarget(connectWalls && ["wall", "foundation-wall", "footing"].includes(tool) && drawing
        ? snapCadConnection(drawing, raw, view.width * 12 / event.currentTarget.getBoundingClientRect().width) : null);
    }
  }
  function dragSelection(start: NonNullable<typeof gesture.current>, end: CadPoint): CadDocument {
    const document = start.document;
    const moving = document.entities.find((entity) => entity.id === start.entityId);
    if (!moving) return document;
    if (moving.infillFor) throw new Error("Pole podąża za ławami. Przesuń jego obwód lub usuń zaznaczenie i wybierz inne pole.");
    if (moving.supportFor && !moving.derivedFrom) throw new Error("Płyta podąża za ścianami obwodu. Zmień ich położenie lub parametry.");
    if (moving.placement && !(moving.kind === "rebar-annotation" && moving.attributes.section)) {
      throw new Error("Przesuń podparcie, aby przenieść przypisany układ zbrojenia; nie przesuwaj pojedynczych prętów.");
    }
    if (start.junction && start.pointIndex !== null) {
      const rawCorner = { x: start.junction.x + end.x - start.start.x, y: start.junction.y + end.y - start.start.y };
      const excludedIds = document.entities.filter((entity) => entity.id === moving.id || entity.supportFor
        || hasCadJunctions(entity) && entityPoints(entity).some((p) => distanceBetweenPoints(p, start.junction!) < .001)).map((e) => e.id);
      const target = connectWalls && hasCadJunctions(moving) ? snapCadConnection(document, rawCorner,
        view.width * 12 / Math.max(1, svgRef.current?.getBoundingClientRect().width ?? 1), excludedIds) : null;
      setSnapTarget(target);
      const corner = target ?? rawCorner;
      if (hasCadJunctions(moving)) return moveCadJunction(document, start.junction, corner);
      if (moving.kind === "construction-area" && ["pad", "column"].includes(moving.attributes.role)) {
        const opposite = entityPoints(moving)[(start.pointIndex + 2) % 4];
        if (!opposite) throw new Error("Brak przeciwległego narożnika.");
        return CadDocumentSchema.parse({ ...document, entities: document.entities.map((entity) => entity.id === moving.id
          ? { ...moving, geometry: { vertices: rectangleFromCorners(opposite, corner) } } : entity) });
      }
      const updated = entityPoints(moving).map((point, i) => i === start.pointIndex ? corner : point);
      const geometry = "vertices" in moving.geometry ? { vertices: updated } : "start" in moving.geometry
        ? { start: updated[0], end: updated[1] } : { point: updated[0] };
      return CadDocumentSchema.parse({ ...document, entities: document.entities.map((entity) =>
        entity.id === moving.id ? CadEntitySchema.parse({ ...moving, geometry }) : entity) });
    }
    const delta = { x: end.x - start.start.x, y: end.y - start.start.y };
    if (hasCadJunctions(moving)) return translateConnectedCadEntity(document, moving.id, delta);
    let moved = translateCadEntity(moving, delta);
    if (moved.kind === "opening") {
      const wall = document.entities.find((entity) => moved.kind === "opening" && entity.id === moved.attributes.wallId);
      if (wall?.kind !== "wall") throw new Error("Otwór nie ma ściany źródłowej.");
      moved = CadEntitySchema.parse({ ...moved, geometry: {
        start: projectPointOnSegment(moved.geometry.start, wall.geometry.start, wall.geometry.end),
        end: projectPointOnSegment(moved.geometry.end, wall.geometry.start, wall.geometry.end),
      } });
    }
    if (moved.kind === "construction-area" && ["pad", "column"].includes(moved.attributes.role)) {
      moved = attachCadElement(moved, document, view.width * 12 / Math.max(1, svgRef.current?.getBoundingClientRect().width ?? 1));
    }
    // Moving a label relocates its text, not the point it describes.
    return { ...document, entities: document.entities.map((entity) => entity.id === moving.id ? moved : entity) };
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const start = gesture.current;
    gesture.current = null;
    setPreviewDrawing(null);
    setSnapTarget(null);
    onPendingChange(dirty || saving);
    if (!start || !drawing) return;
    if (start.pan || tool === "pan") return;
    const end = world(event, tool !== "select");
    if (tool === "select" && start.entityId) {
      if (distanceBetweenPoints(start.start, end) > .01) {
        try { commit(dragSelection(start, end)); } catch (cause) { setError(cadError(cause)); }
      }
    } else if (tool === "annotation") { add(start.start, end); setTool("select"); annotationInput.current?.focus(); }
    else if (rectangleTool) {
      try { add(start.start, end, rectangleFromCorners(start.start, end)); }
      catch (cause) { setError(cadError(cause)); }
    }
    else if (!["select", "pan"].includes(tool)) {
      if (distanceBetweenPoints(start.start, end) > 0.01) add(start.start, end);
      else { setPoints([]); setError("Przeciągnij od początku do końca elementu."); }
    }
    setSnapTarget(null);
  }
  const selected = drawing?.entities.find(({ id }) => id === selectedId);
  const rectangularSelection = selected?.kind === "construction-area" && ["pad", "column"].includes(selected.attributes.role)
    ? rectangleSize(selected.geometry.vertices) : null;
  const exteriorLength = selected && (selected.kind === "wall" || selected.kind === "footing" || selected.kind === "construction-line")
    ? distanceBetweenPoints(selected.geometry.start, selected.geometry.end)
      + (selected.kind === "wall" ? selected.attributes.thicknessMm : selected.attributes.widthMm) : null;
  function updateSelected(next: unknown) {
    if (!drawing || !selected) return;
    if (selected.supportFor && !selected.derivedFrom) { setError("Podparcie jest generowane. Zmień parametry ściany fundamentowej."); return; }
    const result = CadEntitySchema.safeParse(next);
    if (!result.success) { setError(result.error.issues.map(({ message }) => message).join(" ")); return; }
    try { commit(updateConnectedCadEntity(drawing, { ...result.data, reviewStatus: "draft" })); }
    catch (cause) { setError(cadError(cause)); }
  }
  function saveAnnotation() {
    if (!drawing || !editingAnnotation) return;
    const entity = drawing.entities.find((e) => e.id === editingAnnotation.id);
    if (entity?.kind !== "annotation") return;
    const result = CadEntitySchema.safeParse({ ...entity, attributes: { ...entity.attributes, text: editingAnnotation.text } });
    if (!result.success) { setError("Opis nie może być pusty i może mieć maksymalnie 1000 znaków."); return; }
    if (result.data.kind === "annotation" && result.data.attributes.text !== entity.attributes.text)
      commit({ ...drawing, entities: drawing.entities.map((e) => e.id === entity.id ? result.data : e) });
    setEditingAnnotation(null);
  }
  function removeSelected() {
    if (!drawing || !selected) return;
    if (selected.supportFor && !selected.derivedFrom) { setError("Aby usunąć podparcie, zmień sposób posadowienia lub usuń ściany jego obwodu."); return; }
    const removed = new Set([selected.id, ...drawing.entities.filter((e) => e.supportFor?.includes(selected.id)).map((e) => e.id)]);
    commit({ ...drawing, entities: drawing.entities.filter((entity) => !removed.has(entity.id) && !entity.infillFor?.some((id) => removed.has(id))
      && !(entity.placement && removed.has(entity.placement.hostId))
      && !(selected.placement && entity.placement?.groupId === selected.placement.groupId)
      && !(entity.kind === "opening" && entity.attributes.wallId === selected.id))
      .map((entity) => entity.attachment && removed.has(entity.attachment.hostId)
        ? { ...entity, attachment: undefined } : entity) }); setSelectedId(null);
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
    // Paper-sized text needs its own collision layout, not the screen-sized label boxes.
    flushSync(() => setExporting(true));
    const copy = svgRef.current.cloneNode(true);
    flushSync(() => setExporting(false));
    if (!(copy instanceof SVGSVGElement)) return;
    copy.querySelectorAll("image, foreignObject").forEach((element) => element.remove());
    const scale = drawing?.paperScale ?? 100;
    copy.removeAttribute("class"); copy.removeAttribute("style");
    copy.setAttribute("width", `${view.width / scale}mm`); copy.setAttribute("height", `${view.height / scale}mm`);
    copy.setAttribute("data-paper-scale", String(scale));
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${requirementId}.svg`; anchor.click();
    URL.revokeObjectURL(url);
  }
  const layers = [...new Set(drawing?.entities.map(({ layerId }) => layerId) ?? [])];
  const materialLegend = [...new Map((drawing?.entities ?? []).flatMap((entity) => (entity.buildUp ?? []).map((layer) =>
    [JSON.stringify([layer.purpose, layer.material, layer.thicknessMm]), layer] as const))).values()];
  const dimensionFont = exporting ? 2.5 * (drawing?.paperScale ?? 100)
    : Math.max(2.5 * (drawing?.paperScale ?? 100), view.width * 13 / Math.max(1, canvasWidth));
  let faces: ReturnType<typeof getCadPlanFaces> = [], dimensions: ReturnType<typeof getCadPlanDimensions> = [], planError = "";
  try {
    if (drawing) faces = getCadPlanFaces(drawing);
    if (drawing) dimensions = getCadPlanDimensions(drawing, dimensionFont, hiddenLayers,
      exporting ? dimensionFont : view.width * 12 / Math.max(1, canvasWidth));
  } catch (cause) { planError = cadError(cause); }
  const legendEntries = [
    `Skala arkusza 1:${drawing?.paperScale ?? 100} · Wymiary w mm`,
    ...technologyHints.map((h) => `${h.label}: ${h.material}`),
    ...materialLegend.map((l, i) => `I${i + 1}: ${l.material} · ${l.thicknessMm} mm`),
    ...(drawing?.foundationSettings ? [`Ściana: ${drawing.foundationSettings.wallMaterial || "Do uzupełnienia"} · ${drawing.foundationSettings.wallWidth || "?"} mm × ${drawing.foundationSettings.wallHeight || "?"} mm`,
      drawing.foundationSettings.type === "strip" ? `Ława: ${drawing.foundationSettings.baseWidth || "?"} × ${drawing.foundationSettings.baseDepth || "?"} mm` : `Podparcie: ${drawing.foundationSettings.type || "do uzupełnienia"}`,
      ...(drawing.foundationSettings.waterproof ? [`Hydroizolacja: ${drawing.foundationSettings.side === "both" ? "obie strony" : drawing.foundationSettings.side === "interior" ? "od wewnątrz" : "od zewnątrz"}`] : []),
      `Odniesienie ścian: ${drawing.foundationSettings.reference || "Do uzupełnienia z projektu"}`,
      ...(technology.foundationBottomSlab === "bottom-slab-yes" ? [`Płyta denna: ${drawing.foundationSettings.slabThickness || "?"} mm · ${drawing.foundationSettings.slabMaterial || "Do uzupełnienia"}`] : [])] : []),
    ...Object.entries(foundationDocumentChecklist).filter(([key]) => kind === "foundation" || drawing?.documentReferences?.[key as keyof typeof foundationDocumentChecklist])
      .map(([key, label]) => `${label}: ${drawing?.documentReferences?.[key as keyof typeof foundationDocumentChecklist] || "Do uzupełnienia"}`),
  ];
  const legendLines = legendEntries.flatMap((entry) => {
    const lines: string[] = []; let line = "";
    for (const word of entry.split(" ")) {
      if ((line + " " + word).length > 62 && line) { lines.push(line); line = ""; }
      line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    return lines;
  });
  const textSize = view.width / 70;
  const legendStep = Math.min(textSize * .72, view.height * .7 / Math.max(1, legendLines.length + 2));
  const legendHeight = (legendLines.length + 2) * legendStep;
  const rulerStep = 10 ** Math.floor(Math.log10(view.width / 6));
  const xTicks = Array.from({ length: Math.min(30, Math.ceil(view.width / rulerStep)) }, (_, i) =>
    (Math.ceil(view.x / rulerStep) + i) * rulerStep).filter((x) => x <= view.x + view.width);
  const yTicks = Array.from({ length: Math.min(30, Math.ceil(view.height / rulerStep)) }, (_, i) =>
    (Math.ceil(view.y / rulerStep) + i) * rulerStep).filter((y) => y <= view.y + view.height);
  function shape(entity: CadEntity) {
    const color = entityColor(entity);
    if ("start" in entity.geometry) {
      const { start, end } = entity.geometry;
      const width = entity.kind === "wall" ? entity.attributes.thicknessMm : entity.kind === "footing" ? entity.attributes.widthMm
        : entity.kind === "construction-line" && !["axis", "section-cut"].includes(entity.attributes.role) ? entity.attributes.widthMm : 0;
      const length = distanceBetweenPoints(start, end);
      let left = width / 2, right = width / 2;
      const buildUp = (entity.buildUp ?? []).flatMap((layer, index) => {
        const sides = cadLayerSides(entity, layer.side, faces);
        if (!sides.length) return [<g key={index} className="cad-material-layer" data-purpose={layer.purpose}>
          <title>{layer.material} · {layer.thicknessMm} mm — zamknij obrys lub wybierz stronę ręcznie.</title></g>];
        return sides.map((side) => {
          const from = side === "left" ? left : right;
          if (side === "left") left += layer.thicknessMm; else right += layer.thicknessMm;
          const outline = cadLayerOutline(entity, side, from, from + layer.thicknessMm, faces);
          const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
          const clipId = `layer-${entity.id}-${index}-${side}`;
          return <g key={`${index}-${side}`} className="cad-material-layer" data-purpose={layer.purpose}>
            <title>{layer.material} · {layer.thicknessMm} mm</title>
            {layer.purpose === "thermal" && <defs><pattern id={clipId} width={layer.thicknessMm * 10} height={layer.thicknessMm}
              patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle} ${start.x} ${start.y})`}>
              <rect width={layer.thicknessMm * 10} height={layer.thicknessMm} fill="#fff5ce" />
              <path className="cad-insulation-symbol" d={`M0 0 L${layer.thicknessMm * 10} ${layer.thicknessMm} M0 ${layer.thicknessMm} L${layer.thicknessMm * 10} 0`}
                stroke="#b98522" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
            </pattern></defs>}
            <polygon points={outline.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={layer.purpose === "thermal" ? `url(#${clipId})` : "#c9eaf7"} stroke={layer.purpose === "thermal" ? "#b98522" : "#64748b"}
              strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>;
        });
      });
      const openingWall = entity.kind === "opening" ? drawing?.entities.find((wall) => wall.id === entity.attributes.wallId) : null;
      if (entity.kind === "dimension") return null;
      return <g>
        {buildUp}
        {openingWall?.kind === "wall" && <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
          stroke="white" strokeWidth={openingWall.attributes.thicknessMm + 2} />}
        {width > 0 ? <polygon className="cad-solid-outline" points={segmentRectangle(start, end, width).map((p) => `${p.x},${p.y}`).join(" ")}
          fill={color} fillOpacity={.35} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          : <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color}
            strokeWidth={entity.kind === "rebar-line" ? entity.attributes.diameterMm : view.width / 400}
            strokeDasharray={entity.layerId === "rebar-top" && entity.kind === "rebar-line"
              ? `${entity.attributes.diameterMm * 4} ${entity.attributes.diameterMm * 2}` : undefined} />}
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color}
          strokeDasharray={entity.kind === "construction-line" && ["axis", "section-cut"].includes(entity.attributes.role) ? "12 4 2 4" : undefined}
          strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {entity.mark && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2} fontSize={dimensionFont * .8}
          textAnchor="middle" fill={color} stroke="white" strokeWidth={dimensionFont / 8} paintOrder="stroke" pointerEvents="none">{entity.mark}</text>}
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
        <polygon className="cad-solid-outline" points={outline} fill={isVoid ? "white" : color} fillOpacity={isVoid ? 1 : 0.25} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {entity.kind === "construction-area" && entity.attributes.role === "basement-area" && <text
          x={polygonCenter(vertices).x} y={polygonCenter(vertices).y - dimensionFont * 1.8}
          fontSize={dimensionFont} textAnchor="middle" fill={color} pointerEvents="none">Piwnica</text>}
        {entity.mark && (() => {
          const center = polygonCenter(vertices), bounds = cadElementBounds(entity);
          const symbol = entity.kind === "construction-area" && ["pad", "column"].includes(entity.attributes.role);
          const size = rectangleSize(vertices);
          return <text className="cad-element-mark" x={center.x} y={center.y} fontSize={symbol ? Math.min(bounds.width / 8, bounds.height / 5) : dimensionFont}
            textAnchor="middle" fill={color} pointerEvents="none"><tspan x={center.x}>{entity.mark}</tspan>
            {symbol && size && <tspan x={center.x} dy="1.3em">{Math.round(size.length)} × {Math.round(size.width)}</tspan>}</text>;
        })()}
      </g>;
    }
    if (entity.kind === "rebar-annotation" && entity.attributes.section && entity.attributes.diameterMm) {
      const section = entity.attributes.section;
      return <g transform={`translate(${entity.geometry.point.x} ${entity.geometry.point.y})`}>
        <CadBeamSection {...section} diameterMm={entity.attributes.diameterMm} />
        <text y={section.heightMm + Math.max(section.widthMm, section.heightMm) / 3} fontSize={textSize * .65} fill={color}>
          {entity.attributes.label}</text>
      </g>;
    }
    return <g>
      {entity.kind === "annotation" && entity.attributes.leader && <g className="cad-annotation-leader">
        <line x1={entity.attributes.leader.x} y1={entity.attributes.leader.y} x2={entity.geometry.point.x} y2={entity.geometry.point.y}
          stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <circle cx={entity.attributes.leader.x} cy={entity.attributes.leader.y} r={dimensionFont / 5} fill={color} />
      </g>}
      <text x={entity.geometry.point.x} y={entity.geometry.point.y}
        onPointerDown={(event) => { if (entity.kind === "annotation" && tool !== "select" && event.button === 0) event.stopPropagation(); }}
        fontSize={entity.kind === "annotation" ? (entity.attributes.fontSizeMm ?? 2.5) * (drawing?.paperScale ?? 100) : textSize} fill={color}>
        {entity.kind === "annotation" ? entity.attributes.text : entity.kind === "rebar-annotation" ? entity.attributes.label : ""}
      </text>
    </g>;
  }

  return <div className="cad-editor" inert={disabled} aria-busy={disabled}>
    <div className="cad-heading"><div><h3>{title}</h3><p>Rysuj w mm lub odtwórz rysunek ze skanu. Wszystkie obiekty są szkicem do weryfikacji.</p></div>
      <button type="button" className="quiet-button" disabled={!drawing || saving || dirty} onClick={() => setScanOpen(true)}>▣ Skanuj lub importuj projekt</button></div>
    {error && <div className="alert alert-error" role="alert">{error}
      {drawing ? <button type="button" className="quiet-button" disabled={saving} onClick={() => { setError(""); void persist(); }}>Ponów zapis rysunku</button>
        : <button type="button" className="quiet-button" onClick={() => setLoadAttempt((value) => value + 1)}>Ponów wczytywanie rysunku</button>}</div>}
    {planError && <p role="alert" className="alert alert-error">{planError}</p>}
    {!drawing ? <p role="status">Wczytywanie rysunku…</p> : <>
      <div className="cad-toolbar" role="toolbar" aria-label="Narzędzia rysowania">
        {tools.filter((item) => ["select", "pan", "calibrate"].includes(item.id) || allowedTools.includes(item.id as CadDrawingTool)).map((item) => <button key={item.id} type="button" aria-pressed={tool === item.id}
          disabled={scanOpen || item.id === "calibrate" && !drawing.sourceImage} onClick={() => chooseTool(item.id)}>
          <span aria-hidden="true">{item.icon}</span>{item.id === "slab" && kind === "foundation" ? "Płyta fundamentowa / denna" : item.label}</button>)}
      </div>
      <div className="cad-workspace">
        <aside className="cad-tools-panel" aria-label="Ustawienia pod płótnem">
          <h4>Narzędzia etapu</h4><p>{infillTool ? tool === "basement-area" ? "Kliknij zamknięte pole ław, aby oznaczyć pomieszczenie z piwnicą."
            : "Kliknij zamknięte pole ław, aby wstawić płytę z parametrów poniżej."
            : tool === "select" ? "Kliknij element, aby go edytować. Przeciągnij, aby go przesunąć."
            : rectangleTool ? "Przeciągnij od jednego narożnika prostokąta do przeciwległego. Wymiary zmienisz po zaznaczeniu."
              : polygonTool ? "Klikaj kolejne narożniki, następnie zamknij obrys."
              : tool === "calibrate" ? "Kliknij dwa punkty skanu o znanej odległości."
                : tool === "annotation" ? "Kliknij opisywany element i przeciągnij do wolnego miejsca. Następnie wpisz tekst przy canvas." : tool === "pan" ? "Przeciągnij płótno." : "Przeciągnij od początku do końca elementu."}</p>
          <label>Skok przyciągania (mm, 0 = bez siatki)<input type="number" min={0} max={10000} step="any" value={gridMm}
            onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 10000) setGridMm(value); }} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={connectWalls}
            onChange={(event) => { setConnectWalls(event.target.checked); setSnapTarget(null); }} /> Przyciągaj i łącz ściany</label>
          <p>Końce przyciągają się do narożników i ścian w promieniu 12 px. Zielony znacznik pokazuje połączenie.
            Przeciągnij wspólny narożnik, aby zmienić obie ściany naraz.</p>
          {tool === "wall" && <label>Grubość nowej ściany (mm)<input type="number" min={1} max={1000000}
            value={wallThickness} onChange={(event) => setWallThickness(event.target.value)} /></label>}
          {tool === "annotation" && <><label>Tekst nowego opisu<input value={annotation} maxLength={1000} onChange={(event) => setAnnotation(event.target.value)} /></label>
            <label>Rozmiar nowego opisu na arkuszu (mm)<input type="number" min={.5} max={20} step={.5} value={annotationFont}
              onChange={(event) => setAnnotationFont(event.target.value)} /></label></>}
          {polygonTool && !rectangleTool && <button type="button" className="quiet-button" disabled={points.length < 3}
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
          {kind === "foundation" && <details className="cad-generator"><summary>Dokumenty do fundamentów</summary>
            <p>Wpisz numer arkusza / pliku źródłowego. Brak pozycji nie oznacza jej zatwierdzenia ani zastąpienia przez ankietę.</p>
            {Object.entries(foundationDocumentChecklist).map(([key, label]) => <label key={`${key}-${drawing.id}`}>
              {label}<input defaultValue={drawing.documentReferences?.[key as keyof typeof foundationDocumentChecklist] ?? ""} maxLength={240}
                onBlur={(event) => {
                  if (event.target.value !== event.target.defaultValue) commit({ ...drawing,
                    documentReferences: { ...drawing.documentReferences, [key]: event.target.value } });
                }} />
            </label>)}
          </details>}
          {allowedTools.includes("foundation-wall") &&
            <CadFoundationPanel technology={technology} hints={technologyHints}
              values={drawing.foundationSettings ?? initialFoundationSettings(technology)}
              onChange={(foundationSettings) => commit({ ...drawing, foundationSettings })}
              onUpdate={selected?.kind === "construction-line" && selected.attributes.role === "foundation-wall"
              ? (setup) => updateSelected(configureFoundationWall(selected, setup)) : undefined} />}
          {kind === "foundation" && allowedTools.includes("slab") && <fieldset>
            <legend>Płyta denna między ławami</legend>
            <label>Grubość płyty dennej (mm)<input type="number" min={1}
              value={drawing.foundationSettings?.slabThickness ?? ""} onChange={(e) => commit({ ...drawing,
                foundationSettings: { ...(drawing.foundationSettings ?? initialFoundationSettings(technology)), slabThickness: e.target.value } })} /></label>
            <label>Beton płyty dennej<input value={drawing.foundationSettings?.slabMaterial ?? ""} onChange={(e) => commit({ ...drawing,
              foundationSettings: { ...(drawing.foundationSettings ?? initialFoundationSettings(technology)), slabMaterial: e.target.value } })} /></label>
          </fieldset>}
          {(allowedTools.includes("rebar-line") || /strop/i.test(title)) && <CadReinforcementPanel hosts={drawing.entities} selectedHostId={selectedId} onCreate={(entities) => {
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
            aria-pressed={selectedId === entity.id} onClick={() => { setSelectedId(entity.supportFor?.length === 1 ? entity.supportFor[0]! : entity.id); chooseTool("select"); }}>
            {entity.mark ?? `${i + 1}.`} {tools.find(({ id }) => id === cadEntityTool(entity))?.label ?? ("label" in entity.attributes ? entity.attributes.label : entity.kind)}
          </button>)}</div>
        </aside>
        <div className="cad-drawing-panel">
          <div className="cad-color-legend" aria-label="Kolory elementów">
            {[...new Set(drawing.entities.map((entity) => cadEntityTool(entity)).filter((role) => role !== null))].map((role) => {
              const entity = drawing.entities.find((item) => cadEntityTool(item) === role)!;
              return <span key={role}><i style={{ backgroundColor: entityColor(entity) }} aria-hidden="true" />
                {tools.find((item) => item.id === role)?.label}</span>;
            })}
          </div>
          <div className="cad-inline-description">
            <label>Opis na rysunku<input ref={annotationInput} maxLength={1000}
              value={selected?.kind === "annotation" ? selected.attributes.text : annotation}
              onChange={(e) => selected?.kind === "annotation"
                ? updateSelected({ ...selected, attributes: { ...selected.attributes, text: e.target.value } }) : setAnnotation(e.target.value)} /></label>
            <label>Czcionka opisu na arkuszu (mm)<input type="number" min={.5} max={20} step={.5}
              value={selected?.kind === "annotation" ? selected.attributes.fontSizeMm ?? 2.5 : annotationFont}
              onChange={(e) => selected?.kind === "annotation" ? updateSelected({ ...selected,
                attributes: { ...selected.attributes, fontSizeMm: Number(e.target.value) } }) : setAnnotationFont(e.target.value)} /></label>
            <label>Skala arkusza 1:<select aria-label="Skala arkusza" value={drawing.paperScale ?? 100}
              onChange={(e) => commit({ ...drawing, paperScale: Number(e.target.value) })}>
              {[10, 20, 25, 50, 100, 200, 250, 500, 1000].map((scale) => <option key={scale} value={scale}>1:{scale}</option>)}
            </select></label>
            <button type="button" className="quiet-button" aria-pressed={showLegend} onClick={() => setShowLegend(!showLegend)}>
              {showLegend ? "Ukryj legendę" : "Pokaż legendę"}</button>
          </div>
          <svg ref={svgRef} className="cad-canvas" role="img" aria-label={`Płótno projektu: ${title}`} tabIndex={0}
            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="none"
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
            onPointerCancel={cancelGesture}
            onContextMenu={(event) => event.preventDefault()}
            onDoubleClick={(event) => {
              const target = event.target instanceof Element ? event.target.closest("[data-entity-id]") : null;
              const entity = drawing.entities.find((e) => e.id === target?.getAttribute("data-entity-id"));
              if (entity?.kind === "annotation") {
                cancelGesture(); setSelectedId(entity.id); setEditingAnnotation({ id: entity.id, text: entity.attributes.text });
              }
            }}
            onLostPointerCapture={() => { if (gesture.current) cancelGesture(); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelGesture();
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
              data-entity-id={entity.id} data-role={cadEntityTool(entity) ?? entity.kind}
              data-selected={selectedId === entity.id} className="cad-entity">{shape(entity)}</g>)}
            {editingAnnotation && (() => {
              const entity = drawing.entities.find((e) => e.id === editingAnnotation.id);
              if (entity?.kind !== "annotation") return null;
              const font = Math.max((entity.attributes.fontSizeMm ?? 2.5) * (drawing.paperScale ?? 100), dimensionFont);
              return <foreignObject x={entity.geometry.point.x} y={entity.geometry.point.y - font}
                width={Math.max(font * 24, view.width * .25)} height={font * 2.5} onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}>
                <input autoFocus aria-label="Edytuj opis na canvas" maxLength={1000}
                  style={{ width: "100%", fontSize: font, lineHeight: 1.3, background: "white", color: "#7c3aed", border: "1px solid #7c3aed" }}
                  value={editingAnnotation.text} onChange={(e) => setEditingAnnotation({ ...editingAnnotation, text: e.target.value })}
                  onBlur={saveAnnotation} onKeyDown={(e) => { e.stopPropagation();
                    if (e.key === "Enter") { e.preventDefault(); saveAnnotation(); }
                    if (e.key === "Escape") { e.preventDefault(); setEditingAnnotation(null); }
                  }} />
              </foreignObject>;
            })()}
            {faces.map((face, i) => <text key={i} className="cad-room-area" x={face.center.x} y={face.center.y}
              textAnchor="middle" fontSize={dimensionFont * 1.2} fill="#1e40af" pointerEvents="none"
              stroke="#fff" strokeWidth={dimensionFont / 6} paintOrder="stroke">
              <title>Pole w świetle ścian obwodu, bez odliczania stóp, słupów i otworów w podłodze. Nie jest zatwierdzonym przedmiarem.</title>
              {(face.areaMm2 / 1000000).toFixed(2)} m²</text>)}
            <CadPlanDimensions dimensions={dimensions} fontMm={dimensionFont} />
            {snapTarget && <g className="cad-snap-target" pointerEvents="none">
              <circle cx={snapTarget.x} cy={snapTarget.y} r={view.width / 100} fill="#dcfce7" stroke="#16a34a"
                strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <title>Połączenie ścian</title>
            </g>}
            {showLegend && <g className="cad-material-legend cad-project-legend" pointerEvents="none">
              <rect x={view.x + view.width * .68} y={view.y + view.height - legendHeight}
                width={view.width * .31} height={legendHeight - legendStep / 2}
                rx={textSize / 3} fill="#fff" fillOpacity={.96} stroke="#cbd5e1" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {legendLines.map((line, i) => <text key={i} x={view.x + view.width * .69}
                      y={view.y + view.height - legendHeight + (i + 1) * legendStep}
                      fontSize={legendStep * .72} fill="#334155">{line}</text>)}
            </g>}
            {selected && tool === "select" && !selected.infillFor && (hasCadJunctions(selected) || "vertices" in selected.geometry) && !hiddenLayers.includes(selected.layerId) &&
              entityPoints(selected).map((p, i) => <circle key={`handle-${i}`} className="cad-junction"
                data-entity-id={selected.id} data-junction-index={i} cx={p.x} cy={p.y} r={view.width / 130}
                fill="#fff" stroke="#ea580c" strokeWidth={2} vectorEffect="non-scaling-stroke">
                <title>Przeciągnij narożnik</title></circle>)}
            {rectangleTool && points[0] && ghost && points[0].x !== ghost.x && points[0].y !== ghost.y &&
              <polygon points={rectangleFromCorners(points[0], ghost).map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="#f97316" fillOpacity={.2} stroke="#ea580c" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {!rectangleTool && points.length > 0 && <polyline points={[...points, ...(ghost ? [ghost] : [])].map(({ x, y }) => `${x},${y}`).join(" ")}
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
            <button type="button" className="quiet-button" disabled={!!previewDrawing} onClick={exportSvg}>Eksport SVG</button>
            <button type="button" className="quiet-button" disabled={saving || !!previewDrawing || !drawing.entities.length && !drawing.sourceImage}
              onClick={() => {
                if (!window.confirm("Wyczyścić bieżący canvas: elementy i podkład skanu? Ustawienia pozostaną. Operację można cofnąć.")) return;
                cancelGesture(); setEditingAnnotation(null); setSelectedId(null); setHiddenLayers([]);
                commit({ ...drawing, entities: [], sourceImage: undefined, calibration: null });
              }}>Wyczyść canvas</button>
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
            {selected.supportFor && <p>Podparcie generowane z obwodu ścian. Zmieniaj parametry i geometrię ścian, nie tej kopii.</p>}
            {selected.placement && <p>Układ przypisany do podparcia. {selected.placement.needsReview
              ? "Długość podparcia zmieniona — usuń układ i utwórz ponownie według projektu." : "Położenie podąża za przesunięciem i obrotem podparcia."}</p>}
            {selected.mark && <label>Identyfikator elementu<input value={selected.mark} maxLength={40}
              onChange={(e) => updateSelected({ ...selected, mark: e.target.value })} /></label>}
            {selected.attachment && <p>Przyczepiony do {drawing.entities.find((e) => e.id === selected.attachment?.hostId)?.mark ?? "ściany"}.
              Przesunięcie i obrót ściany przenoszą element.</p>}
            {exteriorLength !== null && <label key={`${selected.id}-${exteriorLength}`}>Długość zewnętrzna (mm)
              <input type="number" step="any" defaultValue={exteriorLength} onBlur={(event) => {
                if (event.target.value === event.target.defaultValue) return;
                try { updateSelected(resizeCadStrip(selected, Number(event.target.value))); }
                catch (cause) { setError(cadError(cause)); }
              }} />
            </label>}
            {rectangularSelection && <label key={`${selected.id}-length-${rectangularSelection.length}`}>Długość prostokąta (mm)
              <input type="number" step="any" defaultValue={rectangularSelection.length} onBlur={(event) => {
                if (event.target.value === event.target.defaultValue) return;
                try { updateSelected(resizeCadRectangle(selected, Number(event.target.value), rectangularSelection.width)); }
                catch (cause) { setError(cadError(cause)); }
              }} />
            </label>}
            {rectangularSelection && <label key={`${selected.id}-width-${rectangularSelection.width}`}>Szerokość prostokąta (mm)
              <input type="number" step="any" defaultValue={rectangularSelection.width} onBlur={(event) => {
                if (event.target.value === event.target.defaultValue) return;
                try { updateSelected(resizeCadRectangle(selected, rectangularSelection.length, Number(event.target.value))); }
                catch (cause) { setError(cadError(cause)); }
              }} />
            </label>}
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
            {Object.entries(selected.attributes).filter(([name]) => !["specialistVerified", "wallId", "role", "representation", "section", "leader"].includes(name)).map(([name, value]) => <div key={`${selected.id}-${name}-${String(value)}`}>
              <label htmlFor={`cad-attribute-${name}`}>{name === "heightMm" && selected.kind === "construction-area"
                && selected.attributes.role === "excavation" || name === "heightMm" && selected.kind === "construction-line"
                && selected.attributes.role === "excavation" ? "Głębokość wykopu (mm)" : attributeLabels[name] ?? name}</label>
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
