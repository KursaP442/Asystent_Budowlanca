"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { applyReinforcementTemplate, beamResolvedCustomMainBars, beamStandardMainBarCorners, beamStirrupPlacements,
  buildReinforcementSchedule, createBentRebarEntity,
  createReinforcementHostChain, createReinforcementTemplate, developedLengthOfShape, splitReinforcementHostChain,
  groupCollinearReinforcementHosts, locateBeamHostStation, reinforcementPath3d, validateReinforcement } from "@asystent/domain";
import { CadDocumentSchema, CadEntitySchema, ReinforcementShapeLibraryItemSchema, type CadDocument, type CadEntity,
  type CadPoint, type ConstructionTechnologySelections, type ReinforcementBeamAssembly, type ReinforcementShape,
  type ReinforcementShapeLibraryItem } from "@asystent/schemas";
import { cadError, cadRequest } from "@/lib/cad-client";
import { demoReinforcementShapeLibraryStorageKey, readDemoValue, writeDemoValue } from "@/lib/demo-storage";
import { CadBeamSection } from "./cad-beam-section";
import { BeamReinforcementConstructor, type BeamCustomBarProjection } from "./beam-reinforcement-constructor";
import { Reinforcement3dView } from "./reinforcement-3d-view";
import { ReinforcementShapePreview } from "./reinforcement-shape-preview";
import { ReinforcementStagePlan, outlineOfEntity } from "./reinforcement-stage-plan";

type ReinforcementStage = { id: string; label: string; hosts: CadEntity[] };
type HostStatus = "none" | "partial" | "complete" | "review";
type CustomBendDraft = {
  lengthMm: string;
  angleDegrees: string;
  radiusMm: string;
  plane: "xy" | "xz" | "yz" | "spatial";
};

const statusLabels: Record<HostStatus, string> = {
  none: "Brak danych", partial: "W trakcie", complete: "Kompletne", review: "Wymaga weryfikacji",
};

function stageHostGroups(stage: ReinforcementStage | undefined): CadEntity[][] {
  if (!stage) return [];
  return groupCollinearReinforcementHosts(stage.hosts);
}

function hostSectionMm(entity: CadEntity) {
  if (entity.kind === "wall") return { widthMm: entity.attributes.thicknessMm, heightMm: entity.attributes.heightMm };
  if (entity.kind === "footing") return { widthMm: entity.attributes.widthMm, heightMm: entity.attributes.depthMm };
  if (entity.kind === "construction-line") return { widthMm: entity.attributes.widthMm, heightMm: entity.attributes.heightMm };
  if (entity.kind === "construction-area") return { widthMm: entity.attributes.thicknessMm, heightMm: entity.attributes.heightMm };
  if (entity.kind === "slab") return { widthMm: entity.attributes.thicknessMm, heightMm: entity.attributes.thicknessMm };
  return { widthMm: 0, heightMm: 0 };
}

function hostLengthMm(entity: CadEntity) {
  if (!("start" in entity.geometry)) return 0;
  return Math.hypot(entity.geometry.end.x - entity.geometry.start.x, entity.geometry.end.y - entity.geometry.start.y);
}

function getHostStage(entity: CadEntity): { id: string; label: string } | null {
  if (entity.kind === "footing") return { id: "strip-footings", label: "Ławy fundamentowe" };
  if (entity.kind === "slab") return { id: "slabs", label: "Płyty fundamentowe i denne" };
  if (entity.kind === "wall") return { id: "walls", label: "Ściany żelbetowe" };
  if (entity.kind === "construction-line") {
    if (entity.attributes.role === "foundation-wall") {
      return { id: "foundation-walls", label: "Ściany fundamentowe" };
    }
    if (entity.attributes.role === "ring-beam" && entity.relatedTo?.length) return null;
    if (entity.attributes.role === "beam") return { id: "beams", label: "Belki fundamentowe" };
    if (entity.attributes.role === "ring-beam") return { id: "ring-beams", label: "Wieńce żelbetowe" };
    if (entity.attributes.role === "lintel") return { id: "lintels", label: "Nadproża żelbetowe" };
  }
  if (entity.kind === "construction-area" && entity.attributes.role === "pad") return { id: "pads", label: "Stopy fundamentowe" };
  if (entity.kind === "construction-area" && entity.attributes.role === "column") return { id: "columns", label: "Słupy i trzpienie żelbetowe" };
  return null;
}

function isFoundationWall(entity: CadEntity): entity is Extract<CadEntity, { kind: "construction-line" }> {
  return entity.kind === "construction-line" && entity.attributes.role === "foundation-wall";
}

function foundationRingBeamFor(entities: CadEntity[], wallId: string) {
  return entities.find((entity): entity is Extract<CadEntity, { kind: "construction-line" }> =>
    entity.kind === "construction-line" && entity.attributes.role === "ring-beam"
    && entity.relatedTo?.includes(wallId) === true);
}

function entityPoints(entity: CadEntity) {
  if ("start" in entity.geometry) return [entity.geometry.start, entity.geometry.end];
  if ("vertices" in entity.geometry) return entity.geometry.vertices;
  return [entity.geometry.point];
}

function isLinearHost(entity: CadEntity): entity is Extract<CadEntity, { kind: "wall" | "footing" | "construction-line" }> {
  return entity.kind === "wall" || entity.kind === "footing" || entity.kind === "construction-line";
}

function lineLength(entity: Extract<CadEntity, { kind: "rebar-line" }>) {
  return Math.hypot(entity.geometry.end.x - entity.geometry.start.x, entity.geometry.end.y - entity.geometry.start.y);
}

function shapeSummary(item: ReinforcementShapeLibraryItem) {
  const geometry = item.shape.bends.map(({ lengthMm, angleDegrees }) =>
    `${Math.round(lengthMm) / 10} cm / ${angleDegrees}°`).join(" · ");
  return item.shape.diameterMm ? `Ø${item.shape.diameterMm} · ${geometry}` : geometry;
}

function minimumBendRadiusMm(diameterMm: number) {
  return diameterMm <= 16 ? 2 * diameterMm : 3.5 * diameterMm;
}

function workingBendRadiusMm(diameterMm: number) {
  return Math.max(20, Math.round(minimumBendRadiusMm(diameterMm)));
}

function shapeDevelopedLength(shape: ReinforcementShape) {
  const lengthMm = developedLengthOfShape(shape);
  return `${(Math.round(lengthMm) / 10).toFixed(1).replace(".", ",")} cm (${Math.round(lengthMm)} mm)`;
}

function normalizeRotationDegrees(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function previewBar(shape: ReinforcementShape) {
  return createBentRebarEntity({
    id: "00000000-0000-4000-8000-000000000001",
    origin: { x: 0, y: 0 },
    diameterMm: shape.diameterMm ?? 12,
    coverMm: 40,
    steelGrade: "podgląd",
    designReference: "podgląd",
    shape,
  });
}

export function CadReinforcementPanel({ document, hosts, foundationRingBeam, onCreate, entities = hosts, onUpdate,
  onDocumentUpdate, demoMode = false }: {
  document: CadDocument;
  foundationRingBeam: ConstructionTechnologySelections["foundationRingBeam"];
  hosts: CadEntity[]; onCreate: (entities: CadEntity[]) => void;
  entities?: CadEntity[]; onUpdate: (entities: CadEntity[]) => void;
  onDocumentUpdate: (document: CadDocument) => void;
  demoMode?: boolean;
}) {
  const [error, setError] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [activeView, setActiveView] = useState<"plan" | "bars" | "3d" | "schedule">("plan");
  const [focusedHostIds, setFocusedHostIds] = useState<string[]>([]);
  const [focusedSourceHostIds, setFocusedSourceHostIds] = useState<string[]>([]);
  const [selectedChainHostIds, setSelectedChainHostIds] = useState<string[]>([]);
  const [chainPickId, setChainPickId] = useState("");
  const [chainName, setChainName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customShapeKind, setCustomShapeKind] = useState<"custom" | "L" | "U" | "Z" | "hook" | "stirrup">("custom");
  const [customDiameterMm, setCustomDiameterMm] = useState("12");
  const [customCoverMm, setCustomCoverMm] = useState("40");
  const [customSteelGrade, setCustomSteelGrade] = useState("");
  const [customDesignReference, setCustomDesignReference] = useState("");
  const [customRotationDegrees, setCustomRotationDegrees] = useState("0");
  const [ringBeamHeightMm, setRingBeamHeightMm] = useState("");
  const [ringBeamMaterial, setRingBeamMaterial] = useState("");
  const [ringBeamReference, setRingBeamReference] = useState("");
  const [customBends, setCustomBends] = useState<CustomBendDraft[]>([
    { lengthMm: "1000", angleDegrees: "0", radiusMm: "20", plane: "xy" },
  ]);
  const [barWizardStep, setBarWizardStep] = useState<1 | 2 | 3>(1);
  const [shapeLibrary, setShapeLibrary] = useState<ReinforcementShapeLibraryItem[]>([]);
  const [shapeLibraryLoading, setShapeLibraryLoading] = useState(true);
  const [shapeLibrarySaving, setShapeLibrarySaving] = useState(false);
  const [selectedShape, setSelectedShape] = useState<ReinforcementShapeLibraryItem | null>(null);
  const [libraryName, setLibraryName] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<"bend" | "stirrup">("bend");
  const [libraryDiameterMm, setLibraryDiameterMm] = useState("12");
  const [libraryRotationDegrees, setLibraryRotationDegrees] = useState("0");
  const [libraryBends, setLibraryBends] = useState([
    { lengthCm: "50", angleDegrees: "0" },
  ]);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const shapeDetailDialog = useRef<HTMLDialogElement>(null);
  const shapeEditorDialog = useRef<HTMLDialogElement>(null);
  const customBarDialog = useRef<HTMLDialogElement>(null);
  const shapeEditorId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const libraryDiameter = Math.min(100, Math.max(1, Number(libraryDiameterMm) || 12));
  const libraryPreviewShape = useMemo<ReinforcementShape>(() => ({
    kind: libraryCategory === "stirrup" ? "stirrup" : "custom",
    diameterMm: libraryDiameter,
    rotationDegrees: Number(libraryRotationDegrees) || 0,
    bends: libraryBends.map((bend) => ({
      lengthMm: (Number(bend.lengthCm) || 5) * 10,
      angleDegrees: Number(bend.angleDegrees) || 0,
      radiusMm: workingBendRadiusMm(libraryDiameter),
      plane: "xy" as const,
    })),
  }), [libraryBends, libraryCategory, libraryDiameter, libraryRotationDegrees]);
  const libraryPreviewBar = useMemo(() => previewBar(libraryPreviewShape), [libraryPreviewShape]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setShapeLibraryLoading(true);
      try {
        let items: ReinforcementShapeLibraryItem[];
        if (demoMode) {
          const stored = readDemoValue(demoReinforcementShapeLibraryStorageKey());
          items = Array.isArray(stored) ? stored.map((item) => ReinforcementShapeLibraryItemSchema.parse(item)) : [];
        } else {
          const response = await cadRequest("/api/reinforcement/shapes", undefined, "GET");
          if (!response || typeof response !== "object" || !("items" in response) || !Array.isArray(response.items)) {
            throw new Error("Serwer zwrócił nieprawidłową bibliotekę kształtów.");
          }
          items = response.items.map((item) => ReinforcementShapeLibraryItemSchema.parse(item));
        }
        if (active) {
          setShapeLibrary(items);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cadError(cause));
      } finally {
        if (active) setShapeLibraryLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [demoMode]);
  const openShapeEditor = () => {
    setLibraryName("");
    setLibraryCategory("bend");
    setLibraryDiameterMm("12");
    setLibraryRotationDegrees("0");
    setLibraryBends([{ lengthCm: "50", angleDegrees: "0" }]);
    shapeEditorDialog.current?.showModal();
  };
  const insertLibraryBend = (index: number) => {
    setLibraryBends((items) => [
      ...items.slice(0, index),
      { lengthCm: "50", angleDegrees: "0" },
      ...items.slice(index),
    ]);
  };
  const rotateLibraryShape = (degrees: number) => {
    setLibraryRotationDegrees((current) => String(normalizeRotationDegrees((Number(current) || 0) + degrees)));
  };
  const saveLibraryShape = async () => {
    setShapeLibrarySaving(true);
    try {
      const parsedCandidate = ReinforcementShapeLibraryItemSchema.safeParse({
        id: crypto.randomUUID(),
        name: libraryName,
        category: libraryCategory,
        shape: {
          kind: libraryCategory === "stirrup" ? "stirrup" : "custom",
          diameterMm: libraryDiameter,
          rotationDegrees: Number(libraryRotationDegrees) || 0,
          bends: libraryBends.map((bend) => ({
            lengthMm: Number(bend.lengthCm) * 10,
            angleDegrees: Number(bend.angleDegrees),
            radiusMm: workingBendRadiusMm(libraryDiameter),
            plane: "xy",
          })),
        },
        createdAt: new Date().toISOString(),
      });
      if (!parsedCandidate.success) {
        throw new Error(parsedCandidate.error.issues[0]?.message ?? "Uzupełnij poprawnie dane kształtu.");
      }
      const candidate = parsedCandidate.data;
      if (shapeLibrary.some((item) => item.name.localeCompare(candidate.name, "pl", { sensitivity: "base" }) === 0)) {
        throw new Error("Masz już kształt o tej nazwie.");
      }
      let saved = candidate;
      if (demoMode) {
        writeDemoValue(demoReinforcementShapeLibraryStorageKey(), [...shapeLibrary, candidate]);
      } else {
        const response = await cadRequest("/api/reinforcement/shapes", candidate);
        if (!response || typeof response !== "object" || !("item" in response)) {
          throw new Error("Serwer nie potwierdził zapisu kształtu.");
        }
        saved = ReinforcementShapeLibraryItemSchema.parse(response.item);
      }
      setShapeLibrary((items) => [...items, saved]);
      setSelectedShape(saved);
      setError("");
      shapeEditorDialog.current?.close();
      shapeDetailDialog.current?.showModal();
    } catch (cause) {
      setError(cadError(cause));
    } finally {
      setShapeLibrarySaving(false);
    }
  };
  const applyLibraryShape = (item: ReinforcementShapeLibraryItem) => {
    setCustomShapeKind(item.category === "stirrup" ? "stirrup" : "custom");
    setCustomRotationDegrees(String(item.shape.rotationDegrees ?? 0));
    if (item.shape.diameterMm) setCustomDiameterMm(String(item.shape.diameterMm));
    setCustomBends(item.shape.bends.map((bend) => ({
      lengthMm: String(bend.lengthMm),
      angleDegrees: String(bend.angleDegrees),
      radiusMm: String(bend.radiusMm),
      plane: bend.plane,
    })));
    setBarWizardStep(2);
    shapeDetailDialog.current?.close();
    customBarDialog.current?.showModal();
  };
  const candidates = useMemo(() => hosts.filter((entity) => getHostStage(entity) !== null), [hosts]);
  const stages = useMemo(() => {
    const grouped = new Map<string, ReinforcementStage>();
    for (const host of candidates) {
      const stage = getHostStage(host);
      if (!stage) continue;
      const existing = grouped.get(stage.id);
      if (existing) existing.hosts.push(host);
      else grouped.set(stage.id, { ...stage, hosts: [host] });
    }
    const foundationWalls = candidates.filter(isFoundationWall);
    const hasFoundationRingBeams = foundationWalls.some((wall) => foundationRingBeamFor(entities, wall.id));
    const showFoundationRingBeams = foundationRingBeam === null
      || foundationRingBeam === "foundation-ring-beam-yes"
      || foundationRingBeam === "project"
      || hasFoundationRingBeams;
    if (foundationWalls.length && showFoundationRingBeams) {
      grouped.set("foundation-ring-beams", {
        id: "foundation-ring-beams", label: "Wieńce fundamentowe", hosts: foundationWalls,
      });
    }
    const order = ["strip-footings", "foundation-walls", "foundation-ring-beams", "beams", "walls",
      "pads", "columns", "slabs", "ring-beams", "lintels"];
    return [...grouped.values()].sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  }, [candidates, entities, foundationRingBeam]);
  const activeStage = stages.find((stage) => stage.id === selectedStageId) ?? stages[0];
  const activeHostGroups = useMemo(() => stageHostGroups(activeStage), [activeStage]);
  const stageBackground = activeStage && ["pads", "columns"].includes(activeStage.id)
    ? candidates.filter((entity) => entity.kind === "footing"
      || entity.kind === "construction-line" && entity.attributes.role === "foundation-wall")
    : [];
  const focusedHosts = hosts.filter((entity) => focusedHostIds.includes(entity.id));
  const focusedHost = focusedHosts[0];
  const focusedFoundationWalls = entities.filter((entity): entity is Extract<CadEntity, { kind: "construction-line" }> =>
    focusedSourceHostIds.includes(entity.id) && isFoundationWall(entity));
  const focusedFoundationWall = focusedFoundationWalls[0] ?? null;
  const focusedRingBeams = focusedFoundationWalls.flatMap((wall) => {
    const ringBeam = foundationRingBeamFor(entities, wall.id);
    return ringBeam ? [ringBeam] : [];
  });
  const focusedRingBeam = focusedRingBeams[0] ?? null;
  const focusedRingBeamWall = focusedHost?.kind === "construction-line" && focusedHost.attributes.role === "ring-beam"
    ? focusedFoundationWall
    : null;
  const hostReinforcement = focusedHosts.length
    ? entities.filter((entity) => entity.placement && focusedHostIds.includes(entity.placement.hostId))
    : [];
  const rebarLines = hostReinforcement.filter((entity): entity is Extract<CadEntity, { kind: "rebar-line" }> => entity.kind === "rebar-line");
  const focusedSection = focusedHost ? hostSectionMm(focusedHost) : { widthMm: 0, heightMm: 0 };
  const focusedLength = focusedHosts.reduce((total, host) => total + hostLengthMm(host), 0);
  const hostOutlines = focusedHosts.map(outlineOfEntity);
  const topBars = rebarLines.filter((bar) => bar.layerId === "rebar-top");
  const bottomBars = rebarLines.filter((bar) => bar.layerId !== "rebar-top");
  const physicalBars = rebarLines.filter((bar) => bar.attributes.representation !== "projection");
  const sectionCover = Math.max(1, physicalBars[0]?.attributes.coverMm ?? rebarLines[0]?.attributes.coverMm ?? 40);
  const sectionDiameter = Math.max(1, physicalBars[0]?.attributes.diameterMm ?? rebarLines[0]?.attributes.diameterMm ?? 12);
  const stirrupDiameter = Math.max(1, rebarLines.find((bar) => bar.attributes.representation === "projection")
    ?.attributes.diameterMm ?? Math.round(sectionDiameter / 2));
  const longitudinalBars = physicalBars.map((bar) => ({
    bar,
    y: bar.layerId === "rebar-top" ? sectionCover + bar.attributes.diameterMm / 2
      : focusedSection.heightMm - sectionCover - bar.attributes.diameterMm / 2,
  })).filter(({ y }) => Number.isFinite(y) && y > 0 && y < focusedSection.heightMm);
  const schedule = buildReinforcementSchedule(hostReinforcement);
  const validationIssues = useMemo(() => validateReinforcement(document), [document]);
  const focusedIssues = focusedHost ? validationIssues.filter((issue) =>
    issue.entityIds.some((id) => hostReinforcement.some((entity) => entity.id === id))) : [];
  const focusedChains = focusedHost ? (document.reinforcementChains ?? []).filter((chain) =>
    chain.hostIds.some((id) => focusedHostIds.includes(id))) : [];
  const statusForHosts = (hostEntities: CadEntity[], ringBeamStage = false): HostStatus => {
    const relatedRingBeams = ringBeamStage ? hostEntities.flatMap((host) => {
      const ringBeam = foundationRingBeamFor(entities, host.id);
      return ringBeam ? [ringBeam] : [];
    }) : [];
    if (ringBeamStage && (foundationRingBeam === null
      || ["foundation-ring-beam-no", "foundation-ring-beam-not-applicable"].includes(foundationRingBeam)
      || relatedRingBeams.length !== hostEntities.length)) return "review";
    const statusHosts = ringBeamStage ? relatedRingBeams : hostEntities;
    const associated = entities.filter((entity) => entity.placement
      && statusHosts.some((host) => host.id === entity.placement?.hostId));
    if (!associated.length) return relatedRingBeams.length ? "partial" : "none";
    if (associated.some((entity) => entity.placement?.needsReview)) return "review";
    if (associated.every((entity) => entity.reviewStatus === "verified"
      && (entity.kind !== "rebar-line" && entity.kind !== "rebar-annotation" || entity.attributes.specialistVerified))) return "complete";
    return "partial";
  };
  const stageStatus = (stage: ReinforcementStage) =>
    statusLabels[statusForHosts(stage.hosts, stage.id === "foundation-ring-beams")];
  const hostLabel = useCallback((host: CadEntity, index: number) =>
    host.mark ?? `${activeStage?.label.replace(/\s*\w+$/u, "") ?? "Element"} ${index + 1}`,
    [activeStage?.label]);
  const groupLabel = useCallback((hostGroup: CadEntity[], index: number) => {
    const marked = [...new Set(hostGroup.flatMap((host) => host.mark ? [host.mark] : []))];
    if (marked.length === 1) return marked[0]!;
    const prefix = activeStage?.id === "strip-footings" ? "Ława"
      : activeStage?.id === "foundation-walls" ? "Ściana"
        : activeStage?.id === "foundation-ring-beams" ? "Wieniec" : "Element";
    return `${prefix} ${index + 1}`;
  }, [activeStage?.id]);
  const openDetail = (hostGroup: CadEntity[]) => {
    const ringBeams = activeStage?.id === "foundation-ring-beams"
      ? hostGroup.flatMap((item) => {
        const ringBeam = foundationRingBeamFor(entities, item.id);
        return ringBeam ? [ringBeam] : [];
      })
      : [];
    setFocusedSourceHostIds(hostGroup.map(({ id }) => id));
    setFocusedHostIds(ringBeams.length === hostGroup.length ? ringBeams.map(({ id }) => id) : hostGroup.map(({ id }) => id));
    setRingBeamHeightMm(ringBeams[0] ? String(ringBeams[0].attributes.heightMm) : "");
    setRingBeamMaterial(ringBeams[0]?.attributes.material ?? "");
    setRingBeamReference(ringBeams[0]?.attributes.designReference ?? "");
    setActiveView("plan");
    detailDialog.current?.showModal();
  };
  const previewBars = rebarLines.map((entity) => entity.geometry.start).concat(rebarLines.map((entity) => entity.geometry.end));
  const hostViewPoints = focusedHosts.flatMap(entityPoints);
  const viewPoints = [...previewBars, ...hostViewPoints];
  const viewBounds = viewPoints.length ? {
    minX: Math.min(...viewPoints.map((point) => point.x)),
    minY: Math.min(...viewPoints.map((point) => point.y)),
    maxX: Math.max(...viewPoints.map((point) => point.x)),
    maxY: Math.max(...viewPoints.map((point) => point.y)),
  } : { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const viewPadding = Math.max(viewBounds.maxX - viewBounds.minX, viewBounds.maxY - viewBounds.minY, 100) * 0.08;
  const drawingViewBox = `${viewBounds.minX - viewPadding} ${viewBounds.minY - viewPadding} ${Math.max(1, viewBounds.maxX - viewBounds.minX + viewPadding * 2)} ${Math.max(1, viewBounds.maxY - viewBounds.minY + viewPadding * 2)}`;
  const groupById = (id: string, update: (entity: Extract<CadEntity, { kind: "rebar-line" }>) => CadEntity) => {
    onUpdate(entities.map((entity) => entity.id === id && entity.kind === "rebar-line" ? update(entity) : entity));
  };
  const editBar = (entity: Extract<CadEntity, { kind: "rebar-line" }>, field: "length" | "diameter" | "count" | "steelGrade", value: string) => {
    if (field === "steelGrade") {
      groupById(entity.id, (current) => CadEntitySchema.parse({ ...current, attributes: { ...current.attributes, steelGrade: value } }));
      return;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return;
    groupById(entity.id, (current) => {
      if (field === "length") {
        const currentLength = lineLength(current);
        if (!currentLength) return current;
        const scale = numberValue / currentLength;
        return CadEntitySchema.parse({ ...current, geometry: {
          start: current.geometry.start,
          end: { x: current.geometry.start.x + (current.geometry.end.x - current.geometry.start.x) * scale,
            y: current.geometry.start.y + (current.geometry.end.y - current.geometry.start.y) * scale },
        } });
      }
      return CadEntitySchema.parse({ ...current, attributes: { ...current.attributes,
        ...(field === "diameter" ? { diameterMm: numberValue } : { count: Math.round(numberValue) }) } });
    });
  };
  const copyBar = (entity: Extract<CadEntity, { kind: "rebar-line" }>) => {
    const length = lineLength(entity);
    if (!length) return;
    const distance = Math.max(100, entity.attributes.diameterMm * 4);
    const dx = (entity.geometry.end.x - entity.geometry.start.x) / length;
    const dy = (entity.geometry.end.y - entity.geometry.start.y) / length;
    const offsetX = -dy * distance, offsetY = dx * distance;
    const copy = CadEntitySchema.parse({ ...entity, id: crypto.randomUUID(), geometry: {
      start: { x: entity.geometry.start.x + offsetX, y: entity.geometry.start.y + offsetY },
      end: { x: entity.geometry.end.x + offsetX, y: entity.geometry.end.y + offsetY },
    } });
    onUpdate([...entities, copy]);
  };
  const deleteBar = (id: string) => onUpdate(entities.filter((entity) => entity.id !== id));
  const download = (name: string, type: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const exportScheduleCsv = () => {
    const rows = [["Pozycja", "Warstwa", "Kształt", "Średnica mm", "Stal", "Długość mm", "Sztuki", "Łącznie m", "kg/m", "Masa kg"],
      ...schedule.map((row) => [row.position, row.layerId, row.shape, row.diameterMm, row.steelGrade,
        row.developedLengthMm.toFixed(1), row.quantity, row.totalLengthM.toFixed(3),
        row.unitMassKg.toFixed(3), row.totalMassKg.toFixed(3)])];
    download("zestawienie-zbrojenia.csv", "text/csv;charset=utf-8",
      `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(";")).join("\n")}`);
  };
  const reinforcementSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawingViewBox}">
<rect x="${viewBounds.minX - viewPadding}" y="${viewBounds.minY - viewPadding}" width="${Math.max(1, viewBounds.maxX - viewBounds.minX + viewPadding * 2)}" height="${Math.max(1, viewBounds.maxY - viewBounds.minY + viewPadding * 2)}" fill="white"/>
${rebarLines.map((bar) => `<line x1="${bar.geometry.start.x}" y1="${bar.geometry.start.y}" x2="${bar.geometry.end.x}" y2="${bar.geometry.end.y}" stroke="${bar.layerId === "rebar-top" ? "#d97706" : "#172554"}" stroke-width="${bar.attributes.diameterMm}" stroke-linecap="round"/>`).join("\n")}
</svg>`;
  const exportPlanPng = () => {
    const svg = reinforcementSvg();
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1000;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        setError("Przeglądarka nie udostępniła renderera PNG.");
        return;
      }
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const anchor = window.document.createElement("a");
      anchor.download = "rysunek-zbrojenia.png";
      anchor.href = canvas.toDataURL("image/png");
      anchor.click();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Nie udało się wygenerować eksportu PNG.");
    };
    image.src = url;
  };
  const joinSelectedHosts = () => {
    try {
      const next = createReinforcementHostChain(document, {
        id: crypto.randomUUID(),
        name: chainName.trim() || `Element ${String((document.reinforcementChains?.length ?? 0) + 1).padStart(2, "0")}`,
        elementType: activeStage?.id === "strip-footings" ? "strip-footing"
          : activeStage?.id === "ring-beams" ? "ring-beam"
            : activeStage?.id === "walls" || activeStage?.id === "foundation-walls" ? "wall"
              : activeStage?.id === "beams" ? "beam" : "custom",
        hostIds: selectedChainHostIds,
      });
      onDocumentUpdate(next);
      setSelectedChainHostIds([]);
      setChainName("");
      setError("");
    } catch (cause) {
      setError(cadError(cause));
    }
  };
  const saveTemplate = () => {
    try {
      const template = createReinforcementTemplate({
        id: crypto.randomUUID(),
        name: templateName.trim() || `Szablon ${String((document.reinforcementTemplates?.length ?? 0) + 1).padStart(2, "0")}`,
        elementType: activeStage?.id === "strip-footings" ? "strip-footing"
          : focusedHost?.kind === "construction-line" && focusedHost.attributes.role === "ring-beam" ? "beam"
            : activeStage?.id === "walls" || activeStage?.id === "foundation-walls" ? "wall" : activeStage?.id === "slabs" ? "slab"
            : activeStage?.id === "pads" ? "pad" : activeStage?.id === "columns" ? "column" : "beam",
        entities: hostReinforcement,
        createdAt: new Date().toISOString(),
      });
      onDocumentUpdate({ ...document, status: "draft",
        reinforcementTemplates: [...(document.reinforcementTemplates ?? []), template] });
      setSelectedTemplateId(template.id);
      setTemplateName("");
      setError("");
    } catch (cause) {
      setError(cadError(cause));
    }
  };
  const applyTemplate = () => {
    const template = document.reinforcementTemplates?.find((item) => item.id === selectedTemplateId);
    if (!template || !focusedHost || !isLinearHost(focusedHost)) {
      setError("Wybierz szablon i liniowy element docelowy.");
      return;
    }
    try {
      onCreate(applyReinforcementTemplate(template, focusedHost, () => crypto.randomUUID()));
      setError("");
    } catch (cause) {
      setError(cadError(cause));
    }
  };
  const saveFoundationRingBeam = () => {
    if (!focusedFoundationWalls.length) {
      setError("Wybierz ciąg ścian fundamentowych.");
      return;
    }
    if (foundationRingBeam !== "foundation-ring-beam-yes" && foundationRingBeam !== "project") {
      setError("Najpierw wybierz „Tak” lub „Zgodnie z projektem” przy pytaniu o wieniec w ankiecie Materiały i technologia.");
      return;
    }
    const heightMm = Number(ringBeamHeightMm);
    if (!Number.isFinite(heightMm) || heightMm <= 0 || !ringBeamMaterial.trim() || !ringBeamReference.trim()) {
      setError("Podaj wysokość, materiał i numer rysunku wieńca zgodnie z projektem konstrukcyjnym.");
      return;
    }
    try {
      const ringBeams = focusedFoundationWalls.map((wall) => {
        const current = foundationRingBeamFor(entities, wall.id);
        return CadEntitySchema.parse({
          ...(current ?? {
            id: crypto.randomUUID(),
            kind: "construction-line",
            layerId: "ring-beam",
            units: "mm",
            reviewStatus: "draft",
            source: wall.source,
            geometry: wall.geometry,
            relatedTo: [wall.id],
          }),
          geometry: wall.geometry,
          relatedTo: [wall.id],
          attributes: {
            role: "ring-beam",
            widthMm: wall.attributes.widthMm,
            heightMm,
            material: ringBeamMaterial.trim(),
            designReference: ringBeamReference.trim(),
          },
        });
      });
      const ringBeamById = new Map(ringBeams.map((ringBeam) => [ringBeam.id, ringBeam]));
      const existingIds = new Set(entities.map(({ id }) => id));
      onUpdate([
        ...entities.map((entity) => ringBeamById.get(entity.id) ?? entity),
        ...ringBeams.filter((ringBeam) => !existingIds.has(ringBeam.id)),
      ]);
      setError("");
    } catch (cause) {
      setError(cadError(cause));
    }
  };
  const addCustomBar = () => {
    if (!focusedHost || !isLinearHost(focusedHost)) {
      setError("Wybierz liniowe podparcie, aby przypisać pręt niestandardowy.");
      return;
    }
    if (!("start" in focusedHost.geometry)) {
      setError("Wybrany element nie ma geometrii liniowej.");
      return;
    }
    const hostGeometry = focusedHost.geometry;
    try {
      const shape = {
        kind: customShapeKind,
        rotationDegrees: Number(customRotationDegrees) || 0,
        bends: customBends.map((bend) => ({
          lengthMm: Number(bend.lengthMm), angleDegrees: Number(bend.angleDegrees),
          radiusMm: Number(bend.radiusMm), plane: bend.plane,
        })),
      } as const;
      const bar = createBentRebarEntity({
        id: crypto.randomUUID(), origin: hostGeometry.start, diameterMm: Number(customDiameterMm),
        coverMm: Number(customCoverMm), steelGrade: customSteelGrade.trim() || "według projektu",
        designReference: customDesignReference.trim() || "według projektu", shape,
        placement: { hostId: focusedHost.id, groupId: crypto.randomUUID(), start: hostGeometry.start,
          end: hostGeometry.end, needsReview: false },
      });
      onCreate([bar]);
      setError("");
      customBarDialog.current?.close();
      setActiveView("3d");
    } catch (cause) {
      setError(cadError(cause));
    }
  };
  const focusedHostTitle = focusedHost?.kind === "construction-line" && focusedHost.attributes.role === "ring-beam"
    ? groupLabel(focusedFoundationWalls, Math.max(0, activeHostGroups.findIndex((group) =>
      group.some((host) => focusedSourceHostIds.includes(host.id)))))
    : focusedHost ? groupLabel(focusedHosts, Math.max(0, activeHostGroups.findIndex((group) =>
      group.some((host) => focusedHostIds.includes(host.id))))) : "Element";
  const focusedBeamAssembly = (document.reinforcementBeams ?? []).find((beam) =>
    beam.hostIds.length === focusedHostIds.length && beam.hostIds.every((id) => focusedHostIds.includes(id)));
  const focusedCustomBarProjections = ((): BeamCustomBarProjection[] => {
    if (!focusedHost || focusedSection.heightMm <= 0) return [];
    const axes = new Map<string, { startMm: number; start: CadPoint; end: CadPoint; lengthMm: number }>();
    let cursorMm = 0;
    for (const host of focusedHosts) {
      const hostLength = hostLengthMm(host);
      if (isLinearHost(host) && "start" in host.geometry && hostLength > 0) {
        axes.set(host.id, { startMm: cursorMm, start: host.geometry.start, end: host.geometry.end, lengthMm: hostLength });
      }
      cursorMm += hostLength;
    }
    return physicalBars.flatMap((bar) => {
      if (focusedBeamAssembly && bar.placement?.groupId === focusedBeamAssembly.id) return [];
      const axis = axes.get(bar.placement?.hostId ?? "");
      if (!axis) return [];
      const ux = (axis.end.x - axis.start.x) / axis.lengthMm;
      const uy = (axis.end.y - axis.start.y) / axis.lengthMm;
      const shape = bar.attributes.shape;
      const path = shape
        ? reinforcementPath3d(bar.geometry.start, shape)
        : [{ ...bar.geometry.start, z: 0 }, { ...bar.geometry.end, z: 0 }];
      const topMm = bar.layerId === "rebar-top"
        ? bar.attributes.coverMm + bar.attributes.diameterMm / 2
        : focusedSection.heightMm - bar.attributes.coverMm - bar.attributes.diameterMm / 2;
      const points = path.map((point) => ({
        xMm: axis.startMm + (point.x - axis.start.x) * ux + (point.y - axis.start.y) * uy,
        yMm: topMm - point.z,
      }));
      if (!points.length) return [];
      return [{
        id: bar.id,
        label: `${bar.mark ?? "Pręt niestandardowy"} · Ø${bar.attributes.diameterMm} mm`,
        diameterMm: bar.attributes.diameterMm,
        points,
      }];
    });
  })();
  const saveBeamAssembly = (assembly: ReinforcementBeamAssembly) => {
    try {
      const placements = beamStirrupPlacements(assembly);
      const hostStations = focusedHosts.map((host) => ({ hostId: host.id, lengthMm: hostLengthMm(host) }));
      const generatedStirrups = placements.map((placement) => {
        const location = locateBeamHostStation(hostStations, placement.stationMm);
        const host = focusedHosts.find((candidate) => candidate.id === location.hostId);
        if (!host || !isLinearHost(host) || !("start" in host.geometry)) {
          throw new Error("Nie można przypisać strzemienia do geometrii wybranej belki.");
        }
        const hostLength = hostLengthMm(host);
        if (hostLength <= 0) {
          throw new Error("Segment belki musi mieć dodatnią długość.");
        }
        const ux = (host.geometry.end.x - host.geometry.start.x) / hostLength;
        const uy = (host.geometry.end.y - host.geometry.start.y) / hostLength;
        const center = {
          x: host.geometry.start.x + ux * location.stationOnHostMm - uy * placement.transverseOffsetMm,
          y: host.geometry.start.y + uy * location.stationOnHostMm + ux * placement.transverseOffsetMm,
        };
        const halfWidth = Math.max(1, hostSectionMm(host).widthMm / 2 - 40);
        return CadEntitySchema.parse({
          id: crypto.randomUUID(),
          kind: "rebar-line",
          layerId: "rebar-stirrups",
          units: "mm",
          reviewStatus: "draft",
          source: { origin: "manual", documentId: null, page: null, confidence: null },
          placement: {
            hostId: host.id,
            groupId: assembly.id,
            start: host.geometry.start,
            end: host.geometry.end,
            needsReview: false,
            transverseOffsetMm: placement.transverseOffsetMm,
            verticalOffsetMm: placement.verticalOffsetMm,
          },
          geometry: {
            start: { x: center.x - uy * halfWidth, y: center.y + ux * halfWidth },
            end: { x: center.x + uy * halfWidth, y: center.y - ux * halfWidth },
          },
          attributes: {
            diameterMm: placement.shape.diameterMm ?? 8,
            count: 1,
            coverMm: 40,
            steelGrade: customSteelGrade.trim() || "według projektu",
            designReference: customDesignReference.trim() || "według projektu",
            specialistVerified: false,
            shape: placement.shape,
          },
        });
      });
      const mainBarCorners = beamStandardMainBarCorners(assembly);
      const standardMainBars = assembly.standardMainBars;
      const generatedMainBars = standardMainBars ? focusedHosts.flatMap((host) => {
        if (!isLinearHost(host) || !("start" in host.geometry)) {
          throw new Error("Nie można przypisać standardowych drutów do geometrii wybranej belki.");
        }
        const hostLength = hostLengthMm(host);
        const ux = (host.geometry.end.x - host.geometry.start.x) / hostLength;
        const uy = (host.geometry.end.y - host.geometry.start.y) / hostLength;
        const rotationDegrees = Math.atan2(uy, ux) * 180 / Math.PI;
        return mainBarCorners.map((corner) => {
          const origin = {
            x: host.geometry.start.x - uy * corner.transverseOffsetMm,
            y: host.geometry.start.y + ux * corner.transverseOffsetMm,
          };
          return createBentRebarEntity({
            id: crypto.randomUUID(),
            origin,
            diameterMm: standardMainBars.diameterMm,
            coverMm: Number(customCoverMm) || 40,
            steelGrade: customSteelGrade.trim() || "według projektu",
            designReference: customDesignReference.trim() || "według projektu",
            layerId: corner.verticalOffsetMm > 0 ? "rebar-top" : "rebar-bottom",
            shape: {
              kind: "straight",
              diameterMm: standardMainBars.diameterMm,
              rotationDegrees,
              bends: [{
                lengthMm: hostLength,
                angleDegrees: 0,
                radiusMm: workingBendRadiusMm(standardMainBars.diameterMm),
                plane: "xy",
              }],
            },
            placement: {
              hostId: host.id,
              groupId: assembly.id,
              start: host.geometry.start,
              end: host.geometry.end,
              needsReview: false,
              transverseOffsetMm: corner.transverseOffsetMm,
              verticalOffsetMm: corner.verticalOffsetMm,
            },
          });
        });
      }) : [];
      const hostRanges = focusedHosts.reduce<{ host: CadEntity; startMm: number; endMm: number }[]>(
        (ranges, host) => {
          const startMm = ranges.at(-1)?.endMm ?? 0;
          return [...ranges, { host, startMm, endMm: startMm + hostLengthMm(host) }];
        }, []);
      const generatedCustomMainBars = beamResolvedCustomMainBars(assembly).flatMap((bar) =>
        hostRanges.flatMap(({ host, startMm, endMm }) => {
          const fromMm = Math.max(bar.startMm, startMm);
          const toMm = Math.min(bar.endMm, endMm);
          if (toMm - fromMm < 1) return [];
          if (!isLinearHost(host) || !("start" in host.geometry)) {
            throw new Error("Nie można przypisać drutów niestandardowych do geometrii wybranej belki.");
          }
          const hostLength = hostLengthMm(host);
          const ux = (host.geometry.end.x - host.geometry.start.x) / hostLength;
          const uy = (host.geometry.end.y - host.geometry.start.y) / hostLength;
          const stationMm = fromMm - startMm;
          return [createBentRebarEntity({
            id: crypto.randomUUID(),
            origin: {
              x: host.geometry.start.x + ux * stationMm - uy * bar.transverseMm,
              y: host.geometry.start.y + uy * stationMm + ux * bar.transverseMm,
            },
            diameterMm: bar.diameterMm,
            coverMm: Number(customCoverMm) || 40,
            steelGrade: customSteelGrade.trim() || "według projektu",
            designReference: customDesignReference.trim() || "według projektu",
            layerId: bar.verticalMm > 0 ? "rebar-top" : "rebar-bottom",
            shape: {
              kind: "straight",
              diameterMm: bar.diameterMm,
              rotationDegrees: Math.atan2(uy, ux) * 180 / Math.PI,
              bends: [{
                lengthMm: toMm - fromMm,
                angleDegrees: 0,
                radiusMm: workingBendRadiusMm(bar.diameterMm),
                plane: "xy",
              }],
            },
            placement: {
              hostId: host.id,
              groupId: assembly.id,
              start: host.geometry.start,
              end: host.geometry.end,
              needsReview: false,
              transverseOffsetMm: bar.transverseMm,
              verticalOffsetMm: bar.verticalMm,
            },
          })];
        }));
      const generated = [...generatedStirrups, ...generatedMainBars, ...generatedCustomMainBars];
      const beamIndex = (document.reinforcementBeams ?? []).findIndex((beam) => beam.id === assembly.id);
      const reinforcementBeams = [...(document.reinforcementBeams ?? [])];
      if (beamIndex >= 0) reinforcementBeams[beamIndex] = assembly;
      else reinforcementBeams.push(assembly);
      onDocumentUpdate(CadDocumentSchema.parse({
        ...document,
        status: "draft",
        reinforcementBeams,
        entities: [
          ...entities.filter((entity) => entity.placement?.groupId !== assembly.id),
          ...generated,
        ],
      }));
      setError("");
    } catch (cause) {
      setError(cadError(cause));
    }
  };
  return <div className="cad-reinforcement-workspace">
    <header className="cad-reinforcement-heading">
      <div><h3>Detale zbrojenia i zestawienie prętów</h3>
        <p>Wybierz etap, a następnie kliknij element na rzucie. Dane pozostają robocze; model nie ocenia nośności ani zgodności z normą.</p></div>
    </header>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {stages.length > 0 ? <>
      <nav className="cad-reinforcement-stages" aria-label="Etapy zbrojenia">
        {stages.map((stage) => <button key={stage.id} type="button"
          aria-pressed={activeStage?.id === stage.id}
          onClick={() => {
            setSelectedStageId(stage.id);
            setFocusedHostIds([]);
            setFocusedSourceHostIds([]);
            setSelectedChainHostIds([]);
            setChainPickId("");
          }}>
          <strong>{stage.label}</strong><span>{stageHostGroups(stage).length} elem.</span><small>{stageStatus(stage)}</small>
        </button>)}
      </nav>
      {activeStage?.id === "foundation-ring-beams" && foundationRingBeam === null &&
        <p role="status" className="alert alert-warning">Uzupełnij w ankiecie Materiały i technologia, czy projekt przewiduje wieniec górny na ścianach fundamentowych.</p>}
      {activeStage?.id === "foundation-ring-beams"
        && ["foundation-ring-beam-no", "foundation-ring-beam-not-applicable"].includes(foundationRingBeam ?? "")
        && <p role="status" className="alert alert-warning">Ankieta nie przewiduje wieńca, ale rysunek zawiera zapisane wieńce. Zweryfikuj dane projektu przed ich usunięciem lub edycją.</p>}
      {activeStage?.id !== "foundation-ring-beams" && <section className="cad-reinforcement-chain-tools" aria-label="Łączenie odcinków w element zbrojeniowy">
        <div>
          <strong>Połącz odcinki w jeden element</strong>
          <p>Wybieraj odcinki kolejno od początku do końca. W węźle T/X wybór określa ciąg główny; odgałęzienia pozostają osobne.</p>
        </div>
        <label>Nazwa elementu<input value={chainName} maxLength={120}
          onChange={(event) => setChainName(event.target.value)} placeholder="np. Ława Ł1" /></label>
        <label>Odcinek<select value={chainPickId} onChange={(event) => setChainPickId(event.target.value)}>
          <option value="">Wybierz odcinek etapu</option>
          {(activeStage?.hosts ?? []).filter(isLinearHost).map((host, index) =>
            <option key={host.id} value={host.id}>{hostLabel(host, index)}</option>)}
        </select></label>
        <button type="button" className="quiet-button" disabled={!chainPickId}
          onClick={() => setSelectedChainHostIds((ids) =>
            ids.includes(chainPickId) ? ids.filter((id) => id !== chainPickId) : [...ids, chainPickId])}>
          {chainPickId && selectedChainHostIds.includes(chainPickId) ? "Usuń odcinek z ciągu" : "Dodaj odcinek do ciągu"}
        </button>
        <span>{selectedChainHostIds.length
          ? `Kolejność: ${selectedChainHostIds.map((id) => candidates.find((host) => host.id === id)?.mark ?? id.slice(0, 8)).join(" → ")}`
          : "Nie wybrano odcinków."}</span>
        <button type="button" className="quiet-button" disabled={selectedChainHostIds.length < 2}
          onClick={joinSelectedHosts}>Połącz</button>
      </section>}
      {activeStage && <div className="cad-reinforcement-content">
        <ReinforcementStagePlan key={activeStage.id} document={document} stageLabel={activeStage.label}
          hostGroups={activeHostGroups} backgroundEntities={stageBackground} selectedIds={focusedHostIds}
          supportDimensionRole={activeStage.id === "pads" ? "pad" : activeStage.id === "columns" ? "column" : undefined}
          labelOf={groupLabel} statusOf={(group) => statusForHosts(group, activeStage.id === "foundation-ring-beams")}
          onOpen={openDetail} />
      </div>}
      <dialog ref={detailDialog} className="cad-reinforcement-detail-dialog" aria-label="Detale zbrojenia elementu">
        <div className="cad-dialog-heading">
          <h3>{focusedHostTitle} · detale zbrojenia</h3>
          <button type="button" className="quiet-button" onClick={() => detailDialog.current?.close()}>Zamknij detale</button>
        </div>
        <section className="cad-reinforcement-editor" aria-label="Edytor zbrojenia">
          {focusedHost ? <>
            <div className="cad-reinforcement-toolbar">
              <strong>{focusedHostTitle}</strong>
              <span>{hostReinforcement.length ? `${rebarLines.length} obiektów prętowych` : "Brak zapisanego układu"}</span>
              {focusedRingBeamWall && <button type="button" className="quiet-button" onClick={() => {
                setFocusedHostIds(focusedSourceHostIds);
                setActiveView("plan");
              }}>Wróć do ściany fundamentowej</button>}
              <button type="button" className="quiet-button" onClick={() => setActiveView("bars")}>Edytuj pręty</button>
            </div>
            {activeStage.id === "foundation-ring-beams" && focusedFoundationWall &&
              <section className="cad-foundation-ring-beam" aria-label="Wieniec górny ściany fundamentowej">
                <div>
                  <strong>Wieniec górny ściany fundamentowej</strong>
                  <p>Wieniec jest osobnym etapem i hostem zbrojenia. Szerokość pochodzi ze ściany; pozostałe dane
                    przepisz z projektu konstrukcyjnego. Aplikacja nie dobiera wymiarów ani zbrojenia.</p>
                </div>
                {foundationRingBeam === null && <p role="status" className="alert alert-warning">
                  Uzupełnij pytanie „Wieniec górny na ścianach fundamentowych” w ankiecie Materiały i technologia.
                </p>}
                {!focusedRingBeam && <p role="status" className="alert alert-warning">
                  Brak skonfigurowanego wieńca górnego — ten rysunek wymaga uzupełnienia.
                </p>}
                <div className="cad-foundation-ring-beam-fields">
                  <label>Szerokość wieńca (mm)<input readOnly value={
                    new Set(focusedFoundationWalls.map((wall) => wall.attributes.widthMm)).size === 1
                      ? focusedFoundationWall.attributes.widthMm : "różne według odcinków"
                  } /></label>
                  <label>Wysokość wieńca (mm)<input type="number" min={1} value={ringBeamHeightMm}
                    onChange={(event) => setRingBeamHeightMm(event.target.value)} /></label>
                  <label>Materiał / beton wieńca<input value={ringBeamMaterial}
                    onChange={(event) => setRingBeamMaterial(event.target.value)} placeholder="według projektu" /></label>
                  <label>Numer rysunku konstrukcyjnego<input value={ringBeamReference}
                    onChange={(event) => setRingBeamReference(event.target.value)} placeholder="według projektu" /></label>
                </div>
                <div className="cad-reinforcement-bar-actions">
                  <button type="button" className="quiet-button"
                    disabled={foundationRingBeam !== "foundation-ring-beam-yes" && foundationRingBeam !== "project"}
                    onClick={saveFoundationRingBeam}>
                    {focusedRingBeam ? "Zapisz parametry wieńca" : "Dodaj wieniec górny"}
                  </button>
                  {focusedRingBeams.length === focusedFoundationWalls.length && <button type="button" className="quiet-button" onClick={() => {
                    setFocusedHostIds(focusedRingBeams.map(({ id }) => id));
                    setActiveView("plan");
                  }}>Otwórz zbrojenie wieńca</button>}
                </div>
              </section>}
            {focusedChains.map((chain) => <div key={chain.id} className="cad-reinforcement-chain-status">
              <span><strong>{chain.name}</strong> · {chain.hostIds.length} odc. · {chain.status === "needs-review" ? "wymaga weryfikacji po zmianie geometrii" : "ciąg zapisany"}</span>
              <button type="button" className="quiet-button" onClick={() => {
                try {
                  onDocumentUpdate(splitReinforcementHostChain(document, chain.id));
                  setError("");
                } catch (cause) {
                  setError(cadError(cause));
                }
              }}>Rozdziel element</button>
            </div>)}
            <section className="cad-reinforcement-template-tools" aria-label="Biblioteka szablonów zbrojenia">
              <label>Nazwa nowego szablonu<input value={templateName} maxLength={120}
                onChange={(event) => setTemplateName(event.target.value)} placeholder="np. Belka 4Ø12" /></label>
              <button type="button" className="quiet-button" disabled={!rebarLines.length} onClick={saveTemplate}>Zapisz układ jako szablon</button>
              <label>Szablon<select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                <option value="">Wybierz zapisany szablon</option>
                {(document.reinforcementTemplates ?? []).map((template) =>
                  <option key={template.id} value={template.id}>{template.name} · {template.elementType}</option>)}
              </select></label>
              <button type="button" className="quiet-button" disabled={!selectedTemplateId || !isLinearHost(focusedHost)}
                onClick={applyTemplate}>Zastosuj do elementu</button>
            </section>
            <section className="cad-reinforcement-validation" aria-label="Walidacja techniczna zbrojenia">
              <strong>Spójność modelu</strong>
              {focusedIssues.length ? <ul>{focusedIssues.map((issue, index) =>
                <li key={`${issue.code}-${index}`} data-severity={issue.severity}>{issue.message}</li>)}</ul>
                : <p>Nie wykryto problemów obsługiwanych przez bieżący zestaw kontroli. Nie jest to sprawdzenie nośności ani zgodności normowej.</p>}
            </section>
            <div className="cad-reinforcement-view-tabs" role="tablist" aria-label="Widoki i zestawienie">
              <button type="button" role="tab" aria-selected={activeView === "plan"} onClick={() => setActiveView("plan")}>Rysunek 2D</button>
              <button type="button" role="tab" aria-selected={activeView === "bars"} onClick={() => setActiveView("bars")}>Pręty i edycja</button>
              <button type="button" role="tab" aria-selected={activeView === "3d"} onClick={() => setActiveView("3d")}>Widok 3D</button>
              <button type="button" role="tab" aria-selected={activeView === "schedule"} onClick={() => setActiveView("schedule")}>Zestawienie stali</button>
            </div>
            {activeView === "plan" && <div className="cad-reinforcement-canvas">
              <h5>Widok podłużny</h5>
              {focusedLength > 0 && focusedSection.heightMm > 0 ? <svg role="img"
                aria-label="Widok podłużny betonu i prętów elementu"
                viewBox={`${-focusedLength * .08} ${-focusedSection.heightMm * .35} ${focusedLength * 1.16} ${focusedSection.heightMm * 1.7}`}>
                <rect width={focusedLength} height={focusedSection.heightMm} fill="#e2e8f0" stroke="#0f172a"
                  strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                {longitudinalBars.map(({ bar, y }) => <line key={bar.id} data-rebar-id={bar.id}
                  x1={sectionCover} y1={y} x2={focusedLength - sectionCover} y2={y}
                  stroke={bar.layerId === "rebar-top" ? "#d97706" : "#172554"}
                  strokeWidth={Math.max(bar.attributes.diameterMm, focusedSection.heightMm / 60)} strokeLinecap="round">
                  <title>{bar.mark ?? "Pręt"} · Ø{bar.attributes.diameterMm} · {bar.attributes.count} szt.</title>
                </line>)}
                <text x={focusedLength / 2} y={focusedSection.heightMm * 1.22} textAnchor="middle"
                  fontSize={focusedSection.heightMm / 7}>{Math.round(focusedLength)} × {Math.round(focusedSection.heightMm)} mm</text>
              </svg> : <p>Element nie ma jeszcze kompletnej geometrii betonu pobranej z rzutu.</p>}
              <h5>Przekrój poprzeczny</h5>
              {focusedSection.widthMm > 0 && focusedSection.heightMm > 0 ? <svg role="img"
                aria-label="Przekrój poprzeczny elementu ze zbrojeniem"
                viewBox={`${-focusedSection.widthMm * .9} ${-focusedSection.heightMm * .45} ${focusedSection.widthMm * 3.2} ${focusedSection.heightMm * 1.95}`}>
                <CadBeamSection widthMm={focusedSection.widthMm} heightMm={focusedSection.heightMm}
                  coverMm={Math.min(sectionCover, focusedSection.widthMm / 4)} diameterMm={sectionDiameter}
                  stirrupDiameterMm={stirrupDiameter} topCount={Math.max(1, topBars.length)}
                  bottomCount={Math.max(1, bottomBars.length)} />
              </svg> : <p>Brak wymiarów przekroju w danych rzutu.</p>}
              <h5>Rzut prętów</h5>
              {rebarLines.length ? <svg role="img" aria-label="Rzut geometrii prętów zapisanych w elemencie" viewBox={drawingViewBox}>
                {hostOutlines.map((hostOutline, index) => hostOutline.length > 2 && <polygon key={focusedHosts[index]!.id}
                  points={hostOutline.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                {rebarLines.map((bar) => <line key={bar.id} data-rebar-id={bar.id}
                  x1={bar.geometry.start.x} y1={bar.geometry.start.y} x2={bar.geometry.end.x} y2={bar.geometry.end.y}
                  stroke={bar.layerId === "rebar-top" ? "#d97706" : "#172554"}
                  strokeWidth={Math.max(1, bar.attributes.diameterMm)} strokeLinecap="round" />)}
              </svg> : <p>Wybierz „Edytuj pręty”, aby wprowadzić dane z dokumentacji konstrukcyjnej.</p>}
              {focusedHost.placement?.needsReview && <p role="status" className="alert alert-warning">Geometria podparcia uległa zmianie. Sprawdź zbrojenie przed dalszym użyciem.</p>}
            </div>}
            {activeView === "3d" && <Reinforcement3dView bars={rebarLines}
              concreteWidthMm={focusedHost.kind === "wall" ? focusedHost.attributes.thicknessMm
                : focusedHost.kind === "footing" ? focusedHost.attributes.widthMm
                  : focusedHost.kind === "construction-line" ? focusedHost.attributes.widthMm : 400}
              concreteHeightMm={focusedHost.kind === "wall" ? focusedHost.attributes.heightMm
                : focusedHost.kind === "footing" ? focusedHost.attributes.depthMm
                  : focusedHost.kind === "construction-line" ? focusedHost.attributes.heightMm : 500} />}
            {activeView === "bars" && <div className="cad-reinforcement-bar-wizard">
              <nav className="cad-reinforcement-wizard-steps" aria-label="Etapy kreatora prętów">
                <button type="button" aria-current={barWizardStep === 1 ? "step" : undefined}
                  onClick={() => setBarWizardStep(1)}><span>1</span> Przygotowanie strzemion i podgięć</button>
                <button type="button" aria-current={barWizardStep === 2 ? "step" : undefined}
                  onClick={() => setBarWizardStep(2)}><span>2</span> Konstruktor belek</button>
                <button type="button" aria-current={barWizardStep === 3 ? "step" : undefined}
                  onClick={() => setBarWizardStep(3)}><span>3</span> Edycja zapisanych prętów</button>
              </nav>
              {barWizardStep === 1 && <section className="cad-reinforcement-shape-library"
                aria-label="Biblioteka podgięć i strzemion użytkownika">
                <div>
                  <h5>Twoje podgięcia i strzemiona</h5>
                  <p>Kształty są przypisane do konta i mogą być używane w kolejnych elementach. Nie stanowią
                    automatycznie zatwierdzonego rozwiązania konstrukcyjnego.</p>
                </div>
                {shapeLibraryLoading ? <p role="status">Wczytywanie biblioteki…</p> :
                  <div className="cad-reinforcement-shape-grid">
                    {shapeLibrary.map((item) => <button type="button" className="cad-reinforcement-shape-card"
                      key={item.id} onClick={() => {
                        setSelectedShape(item);
                        shapeDetailDialog.current?.showModal();
                      }}>
                      <ReinforcementShapePreview shape={item.shape} label={item.name} compact />
                      <strong>{item.name}</strong>
                      <span>{item.category === "stirrup" ? "Strzemię" : "Podgięcie"}</span>
                      <small>{shapeSummary(item)}</small>
                    </button>)}
                    <button type="button" className="cad-reinforcement-shape-card cad-reinforcement-shape-add"
                      onClick={openShapeEditor} aria-label="Dodaj nowe podgięcie lub strzemię">
                      <span aria-hidden="true">+</span><strong>Nowy kształt</strong>
                    </button>
                  </div>}
              </section>}
              {barWizardStep === 2 && <div className="cad-beam-constructor-step">
                {isLinearHost(focusedHost) && focusedLength > 0 && focusedSection.widthMm > 0
                  && focusedSection.heightMm > 0 ? <BeamReinforcementConstructor
                    key={`${focusedHostIds.join("-")}-${focusedLength}-${focusedSection.widthMm}-${focusedSection.heightMm}-${focusedBeamAssembly?.id ?? "new"}`}
                    name={focusedHostTitle}
                    hostIds={focusedHostIds}
                    lengthMm={focusedLength}
                    widthMm={focusedSection.widthMm}
                    heightMm={focusedSection.heightMm}
                    existing={focusedBeamAssembly}
                    shapeLibrary={shapeLibrary}
                    customBars={focusedCustomBarProjections}
                    onSave={saveBeamAssembly}
                  /> : <p className="alert alert-warning">Konstruktor belek wymaga liniowego elementu z długością
                    i kompletnym przekrojem pobranym z rzutu.</p>}
              </div>}
              {barWizardStep === 3 && <div className="cad-reinforcement-bar-list">
              {rebarLines.length ? rebarLines.map((bar, index) => <article key={bar.id} className="cad-reinforcement-bar">
                <strong>{bar.mark ?? `Pręt ${index + 1}`} · {bar.layerId === "rebar-top" ? "górny" : bar.layerId === "rebar-bottom" ? "dolny" : "zbrojenie"}</strong>
                <label>Długość osi (mm)<input type="number" min={1} step="any" defaultValue={lineLength(bar).toFixed(1)}
                  onBlur={(event) => editBar(bar, "length", event.currentTarget.value)} /></label>
                <label>Średnica (mm)<input type="number" min={1} step="any" defaultValue={bar.attributes.diameterMm}
                  onBlur={(event) => editBar(bar, "diameter", event.currentTarget.value)} /></label>
                <label>Liczba sztuk<input type="number" min={1} step={1} defaultValue={bar.attributes.count}
                  onBlur={(event) => editBar(bar, "count", event.currentTarget.value)} /></label>
                <label>Gatunek stali<input type="text" defaultValue={bar.attributes.steelGrade}
                  onBlur={(event) => editBar(bar, "steelGrade", event.currentTarget.value)} /></label>
                <div className="cad-reinforcement-bar-actions">
                  <button type="button" className="quiet-button" onClick={() => copyBar(bar)}>Kopiuj pręt</button>
                  <button type="button" className="quiet-button" onClick={() => deleteBar(bar.id)}>Usuń</button>
                </div>
              </article>) : <p>Brak pojedynczych prętów do edycji. Wróć do kroku 2 i dodaj pręt według dokumentacji.</p>}
              </div>}
            </div>}
            {activeView === "schedule" && <div className="cad-reinforcement-schedule">
              {schedule.length ? <div className="table-scroll"><table><thead><tr>
                <th>Poz.</th><th>Warstwa / kształt</th><th>Ø (mm)</th><th>Stal</th><th>Długość (mm)</th>
                <th>Szt.</th><th>Łącznie (m)</th><th>kg/m</th><th>Masa (kg)</th>
              </tr></thead><tbody>{schedule.map((row) => <tr key={`${row.position}-${row.layerId}`}>
                <td>{row.position}</td><td>{row.layerId} · {row.shape}</td><td>{row.diameterMm}</td><td>{row.steelGrade}</td>
                <td>{row.developedLengthMm.toFixed(1)}</td><td>{row.quantity}</td><td>{row.totalLengthM.toFixed(2)}</td>
                <td>{row.unitMassKg.toFixed(3)}</td><td>{row.totalMassKg.toFixed(2)}</td>
              </tr>)}</tbody></table></div> : <p>Zestawienie pojawi się po wprowadzeniu prętów o geometrii fizycznej. Linie strzemion w rzucie nie są długością rozwiniętą strzemienia.</p>}
              {schedule.length > 0 && <p>Razem: {schedule.reduce((total, row) => total + row.totalLengthM, 0).toFixed(2)} m ·
                {schedule.reduce((total, row) => total + row.totalMassKg, 0).toFixed(2)} kg</p>}
              <p>Masa jednostkowa jest szacunkiem geometrycznym dla stali o gęstości 7850 kg/m³; kształty gięte i strzemiona wymagają rzeczywistej geometrii osi pręta.</p>
              <div className="cad-reinforcement-export-actions">
                <button type="button" className="quiet-button" disabled={!schedule.length} onClick={exportScheduleCsv}>Eksport CSV</button>
                <button type="button" className="quiet-button" disabled={!rebarLines.length}
                  onClick={() => download("rysunek-zbrojenia.svg", "image/svg+xml;charset=utf-8", reinforcementSvg())}>Eksport SVG</button>
                <button type="button" className="quiet-button" disabled={!rebarLines.length} onClick={exportPlanPng}>Eksport PNG</button>
                <button type="button" className="quiet-button" disabled={!rebarLines.length} onClick={() => window.print()}>Druk / PDF</button>
              </div>
            </div>}
          </> : <p>Kliknij element na rzucie etapu, aby otworzyć jego detale zbrojenia.</p>}
        </section>
      </dialog>
      <dialog ref={customBarDialog} className="cad-reinforcement-shape-dialog cad-custom-bar-dialog">
        <header>
          <div><span>Drut niestandardowy</span><h4>Dodaj własny przebieg pręta</h4></div>
          <button type="button" className="quiet-button" onClick={() => customBarDialog.current?.close()}>
            Zamknij
          </button>
        </header>
        <div className="cad-reinforcement-shape-body">
          <fieldset className="cad-custom-bar-editor">
            <legend>Parametry drutu niestandardowego</legend>
            <p>Dodaj segmenty zgodnie z dokumentacją. Długość rozwinięta uwzględnia łuk o podanym promieniu.</p>
            <label>Kształt<select value={customShapeKind}
              onChange={(event) => setCustomShapeKind(event.target.value as typeof customShapeKind)}>
              <option value="custom">Niestandardowy</option><option value="L">L</option><option value="U">U</option>
              <option value="Z">Z</option><option value="hook">Hak</option><option value="stirrup">Strzemię</option>
            </select></label>
            <div className="cad-custom-bar-fields">
              <label>Ø (mm)<input type="number" min={1} value={customDiameterMm}
                onChange={(event) => setCustomDiameterMm(event.target.value)} /></label>
              <label>Otulina (mm)<input type="number" min={0} value={customCoverMm}
                onChange={(event) => setCustomCoverMm(event.target.value)} /></label>
              <label>Orientacja całego kształtu (°)<input type="number" min={-360} max={360} step={1}
                value={customRotationDegrees} onChange={(event) => setCustomRotationDegrees(event.target.value)} /></label>
              <label>Gatunek stali<input value={customSteelGrade}
                onChange={(event) => setCustomSteelGrade(event.target.value)} placeholder="według projektu" /></label>
              <label>Numer rysunku konstrukcyjnego<input value={customDesignReference}
                onChange={(event) => setCustomDesignReference(event.target.value)}
                placeholder="według projektu" /></label>
            </div>
            {customBends.map((bend, index) => <div className="cad-custom-bend" key={index}>
              <strong>Segment {index + 1}</strong>
              <label>Długość<input type="number" min={1} value={bend.lengthMm}
                onChange={(event) => setCustomBends((items) => items.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, lengthMm: event.target.value } : item))} /></label>
              <label>Kąt<input type="number" value={bend.angleDegrees}
                onChange={(event) => setCustomBends((items) => items.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, angleDegrees: event.target.value } : item))} /></label>
              <label>Promień<input type="number" min={1} value={bend.radiusMm}
                onChange={(event) => setCustomBends((items) => items.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, radiusMm: event.target.value } : item))} /></label>
              <label>Płaszczyzna<select value={bend.plane}
                onChange={(event) => setCustomBends((items) => items.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, plane: event.target.value as typeof bend.plane } : item))}>
                <option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option>
                <option value="spatial">3D</option>
              </select></label>
              <button type="button" className="quiet-button" disabled={customBends.length === 1}
                onClick={() => setCustomBends((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                Usuń
              </button>
            </div>)}
            <button type="button" className="quiet-button" onClick={() => setCustomBends((items) => [
              ...items,
              { lengthMm: "500", angleDegrees: "90", radiusMm: "20", plane: "xy" },
            ])}>Dodaj segment</button>
          </fieldset>
        </div>
        <footer>
          <button type="button" className="quiet-button" onClick={() => customBarDialog.current?.close()}>
            Anuluj
          </button>
          <button type="button" onClick={addCustomBar}>Dodaj pręt do elementu</button>
        </footer>
      </dialog>
      <dialog ref={shapeDetailDialog} className="cad-reinforcement-shape-dialog">
        {selectedShape && <>
          <header>
            <div>
              <span>{selectedShape.category === "stirrup" ? "Strzemię" : "Podgięcie"}</span>
              <h4>{selectedShape.name}</h4>
            </div>
            <button type="button" className="quiet-button" onClick={() => shapeDetailDialog.current?.close()}>Zamknij</button>
          </header>
          <div className="cad-reinforcement-shape-body">
            <div className="cad-reinforcement-shape-previews">
              <section><h5>Rysunek 2D z wymiarami</h5>
                <ReinforcementShapePreview shape={selectedShape.shape} label={`Podgląd 2D: ${selectedShape.name}`} />
                <p className="cad-reinforcement-shape-legend">
                  <span data-legend="bar"><i />oś pręta</span>
                  <span data-legend="length"><i />długości części</span>
                  <span data-legend="angle"><i />kąty gięcia</span>
                </p>
              </section>
              <section><h5>Podgląd 3D</h5>
                <Reinforcement3dView bars={[previewBar(selectedShape.shape)]} showConcreteInitially={false} />
              </section>
            </div>
            <dl className="cad-reinforcement-shape-data">
              <div><dt>Liczba części</dt><dd>{selectedShape.shape.bends.length}</dd></div>
              <div><dt>Średnica drutu</dt>
                <dd>{selectedShape.shape.diameterMm ? `Ø${selectedShape.shape.diameterMm} mm` : "nie podano"}</dd></div>
              <div><dt>Promień gięcia</dt><dd>{selectedShape.shape.bends[0]!.radiusMm} mm</dd></div>
              <div><dt>Orientacja kształtu</dt><dd>{selectedShape.shape.rotationDegrees ?? 0}°</dd></div>
              <div><dt>Długość rozwinięta</dt><dd>{shapeDevelopedLength(selectedShape.shape)}</dd></div>
              <div><dt>Wymiary i kąty</dt><dd>{shapeSummary(selectedShape)}</dd></div>
            </dl>
          </div>
          <footer>
            <button type="button" className="quiet-button" onClick={() => shapeDetailDialog.current?.close()}>Wróć</button>
            <button type="button" onClick={() => applyLibraryShape(selectedShape)}>Użyj w edytorze pręta</button>
          </footer>
        </>}
      </dialog>
      <dialog ref={shapeEditorDialog} className="cad-reinforcement-shape-dialog cad-reinforcement-shape-editor">
        <form onSubmit={(event) => { event.preventDefault(); void saveLibraryShape(); }}>
          <header>
            <div><span>Biblioteka użytkownika</span><h4>Nowe podgięcie lub strzemię</h4></div>
            <button type="button" className="quiet-button" onClick={() => shapeEditorDialog.current?.close()}>Zamknij</button>
          </header>
          <div className="cad-reinforcement-shape-body">
            <div className="cad-reinforcement-shape-previews">
              <section><h5>Rysunek 2D z wymiarami</h5>
                <ReinforcementShapePreview shape={libraryPreviewShape} label="Podgląd tworzonego kształtu 2D" />
                <p className="cad-reinforcement-shape-legend">
                  <span data-legend="bar"><i />oś pręta</span>
                  <span data-legend="length"><i />długości części</span>
                  <span data-legend="angle"><i />kąty gięcia</span>
                </p>
              </section>
              <section><h5>Podgląd 3D</h5>
                <Reinforcement3dView bars={[libraryPreviewBar]} showConcreteInitially={false} />
              </section>
            </div>
            <div className="cad-reinforcement-shape-main-fields">
              <label>Nazwa kształtu<input value={libraryName} required maxLength={120}
                onChange={(event) => setLibraryName(event.target.value)} placeholder="np. Podgięcie narożne 50/30" /></label>
              <label>Rodzaj<select value={libraryCategory}
                onChange={(event) => setLibraryCategory(event.target.value as "bend" | "stirrup")}>
                <option value="bend">Podgięcie</option><option value="stirrup">Strzemię</option>
              </select></label>
              <label>Średnica drutu Ø (mm)<input type="number" min={1} max={100} step="0.5" required
                list={`${shapeEditorId}-diameters`} value={libraryDiameterMm}
                onChange={(event) => setLibraryDiameterMm(event.target.value)} /></label>
            </div>
            <datalist id={`${shapeEditorId}-diameters`}>
              {[4.5, 5, 6, 6.5, 8, 10, 12, 14, 16, 20, 25, 28, 32].map((value) =>
                <option key={value} value={value}>{`Ø${value}`}</option>)}
            </datalist>
            <section className="cad-reinforcement-shape-rotation" aria-label="Orientacja całego kształtu">
              <div>
                <strong>Orientacja całego kształtu</strong>
                <small>Obrót nie zmienia długości części ani kątów gięcia.</small>
              </div>
              <div className="cad-reinforcement-shape-rotation-actions">
                <button type="button" className="quiet-button" onClick={() => rotateLibraryShape(-90)}>
                  Obróć w lewo o 90°
                </button>
                <button type="button" className="quiet-button" onClick={() => rotateLibraryShape(180)}>
                  Obróć o 180°
                </button>
                <button type="button" className="quiet-button" onClick={() => rotateLibraryShape(90)}>
                  Obróć w prawo o 90°
                </button>
                <button type="button" className="quiet-button" onClick={() => setLibraryRotationDegrees("0")}>
                  Ustaw 0°
                </button>
              </div>
              <label>Dokładny kąt obrotu (°)<input type="number" min={-360} max={360} step={1}
                value={libraryRotationDegrees} onChange={(event) => setLibraryRotationDegrees(event.target.value)} /></label>
            </section>
            <p className="cad-reinforcement-shape-hint">Kąt jest wykonywany po danym odcinku i wyznacza kierunek
              następnego. Kąt 0° jest dozwolony; pozostałe kąty muszą mieć co najmniej 1°. Minimalna długość części
              to 5 cm. Promień gięcia wynika z wybranej średnicy drutu i dla Ø{libraryDiameter} mm wynosi{" "}
              {workingBendRadiusMm(libraryDiameter)} mm. Przycisk między częściami pozwala wstawić
              pominięty odcinek w dowolnym miejscu bez usuwania dalszej geometrii.</p>
            <div className="cad-reinforcement-shape-segments">
              {libraryBends.map((bend, index) => <div className="cad-reinforcement-shape-segment-row" key={index}>
                <div className="cad-reinforcement-shape-insert-point">
                  <span aria-hidden="true" />
                  <button type="button" className="quiet-button" onClick={() => insertLibraryBend(index)}>
                    {index === 0 ? "+ Wstaw część na początku" : `+ Wstaw część między ${index} i ${index + 1}`}
                  </button>
                  <span aria-hidden="true" />
                </div>
                <fieldset>
                  <legend>Część {index + 1}</legend>
                  <label>Długość (cm)<input type="number" min={5} step="0.1" required value={bend.lengthCm}
                    onChange={(event) => setLibraryBends((items) => items.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, lengthCm: event.target.value } : item))} /></label>
                  <label>Kąt po odcinku (°)<input type="number" min={-360} max={360} step="1" required
                    value={bend.angleDegrees} onChange={(event) => setLibraryBends((items) => items.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, angleDegrees: event.target.value } : item))} /></label>
                  <button type="button" className="quiet-button" disabled={libraryBends.length === 1}
                    onClick={() => setLibraryBends((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                    Usuń część
                  </button>
                </fieldset>
              </div>)}
            </div>
            <button type="button" className="quiet-button cad-reinforcement-shape-add-part"
              onClick={() => setLibraryBends((items) => [...items, { lengthCm: "50", angleDegrees: "0" }])}>
              Dodaj dalszą część
            </button>
            {error && <p className="alert alert-error" role="alert">{error}</p>}
          </div>
          <footer>
            <button type="button" className="quiet-button" onClick={() => shapeEditorDialog.current?.close()}>Anuluj</button>
            <button type="submit" disabled={shapeLibrarySaving}>{shapeLibrarySaving ? "Zapisywanie…" : "Zapisz w mojej bibliotece"}</button>
          </footer>
        </form>
      </dialog>
    </> : <p>Brak rozpoznanych elementów konstrukcyjnych. Uzupełnij rzut źródłowy, a następnie wróć do etapów zbrojenia.</p>}
  </div>;
}
