"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { beamCustomMainBarAllowedRange, beamCustomMainBarFullBeamCheck, beamCustomMainBarIssues,
  beamResolvedCustomMainBars, beamStandardMainBarCorners, beamStandardMainBarReference,
  beamStirrupConnectionIssues, beamStirrupPlacements, beamStirrupSlotStates, beamZoneStirrupFrames,
  reinforcementShapeOutline, type BeamStirrupSlotState } from "@asystent/domain";
import { ReinforcementBeamAssemblySchema, type CadEntity, type ReinforcementBeamAssembly,
  type ReinforcementBeamCustomMainBar, type ReinforcementShapeLibraryItem,
  type ReinforcementStirrupZone } from "@asystent/schemas";
import { Reinforcement3dView } from "./reinforcement-3d-view";
import { ReinforcementShapePreview } from "./reinforcement-shape-preview";

type Rebar = Extract<CadEntity, { kind: "rebar-line" }>;
type BundleDirection = "left" | "right" | "up" | "down";

const bundleDirections: Array<{ value: BundleDirection; label: string }> = [
  { value: "left", label: "W lewo" },
  { value: "right", label: "W prawo" },
  { value: "up", label: "Do góry" },
  { value: "down", label: "W dół" },
];
// Kolory typów strzemion: ten sam kształt i pozycja w pakiecie mają ten sam kolor na każdym rzucie.
const stirrupTypeColors = ["#0f766e", "#7c3aed", "#be123c", "#0284c7", "#4d7c0f", "#a16207", "#db2777", "#334155"];
const frontStirrupStrokePx = 3;
const customBarColor = "#c2410c";
const frontLockedRotation = { x: 90, y: 0 };
const slotSideLabels = { top: "górny bok", right: "prawy bok", bottom: "dolny bok", left: "lewy bok" } as const;
const slotKindLabels = { corner: "narożnik", middle: "środek boku", edge: "przy drucie" } as const;

function slotLabel(slot: Pick<BeamStirrupSlotState, "side" | "kind" | "bundleIndex" | "ratio">, bundled: boolean) {
  const place = slot.kind === "edge" ? `${slotSideLabels[slot.side]} ${Math.round(slot.ratio * 100)}%`
    : `${slotKindLabels[slot.kind]}, ${slotSideLabels[slot.side]}`;
  return bundled ? `S${slot.bundleIndex + 1}: ${place}` : place;
}

function cm(mm: number) {
  return Math.round(mm / 10 * 100) / 100;
}

function cmLabel(mm: number) {
  return `${cm(mm).toLocaleString("pl-PL")} cm`;
}

function spacingRuns(stations: number[]) {
  const runs: Array<{ startMm: number; endMm: number; spacingMm: number; count: number }> = [];
  for (let index = 1; index < stations.length; index += 1) {
    const startMm = stations[index - 1]!;
    const endMm = stations[index]!;
    const spacingMm = Math.round((endMm - startMm) * 10) / 10;
    if (spacingMm <= 0) continue;
    const previous = runs.at(-1);
    if (previous && Math.abs(previous.spacingMm - spacingMm) < 0.05 && Math.abs(previous.endMm - startMm) < 0.05) {
      previous.endMm = endMm;
      previous.count += 1;
    } else {
      runs.push({ startMm, endMm, spacingMm, count: 1 });
    }
  }
  return runs;
}

function defaultAssembly(input: {
  name: string;
  hostIds: string[];
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}): ReinforcementBeamAssembly {
  const edgeOffset = Math.min(input.widthMm / 2, input.lengthMm / 2);
  return {
    id: crypto.randomUUID(),
    name: input.name,
    hostIds: input.hostIds,
    lengthMm: input.lengthMm,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    firstStirrupMm: edgeOffset,
    lastStirrupMm: input.lengthMm - edgeOffset,
    zones: [],
    status: "draft",
  };
}

function zoneLengths(zones: ReinforcementStirrupZone[]) {
  return zones.map((zone) => zone.endMm - zone.startMm);
}

function arrangeZones(assembly: ReinforcementBeamAssembly, lengths: number[]) {
  let startMm = assembly.firstStirrupMm;
  return assembly.zones.map((zone, index) => {
    const endMm = Math.min(assembly.lastStirrupMm, startMm + Math.max(1, lengths[index] ?? 1));
    const concentrations = zone.concentrations.flatMap((item) => {
      const duration = item.endMm - item.startMm;
      const concentrationStart = Math.max(startMm, Math.min(endMm - 1, item.startMm));
      const concentrationEnd = Math.min(endMm, concentrationStart + duration);
      return concentrationEnd > concentrationStart ? [{ ...item, startMm: concentrationStart, endMm: concentrationEnd }] : [];
    });
    const arranged = { ...zone, startMm, endMm, concentrations };
    startMm = endMm;
    return arranged;
  });
}

function withoutStandardMainBars(assembly: ReinforcementBeamAssembly): ReinforcementBeamAssembly {
  const next = { ...assembly };
  delete next.standardMainBars;
  return next;
}

function withCustomMainBars(assembly: ReinforcementBeamAssembly,
  bars: ReinforcementBeamCustomMainBar[]): ReinforcementBeamAssembly {
  const next = { ...assembly };
  if (bars.length) next.customMainBars = bars;
  else delete next.customMainBars;
  return next;
}

export type BeamCustomBarProjection = {
  id: string;
  label: string;
  diameterMm: number;
  points: Array<{ xMm: number; yMm: number }>;
};

export function BeamReinforcementConstructor({ name, hostIds, lengthMm, widthMm, heightMm, existing,
  shapeLibrary, customBars = [], onSave }: {
  name: string;
  hostIds: string[];
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  existing?: ReinforcementBeamAssembly;
  shapeLibrary: ReinforcementShapeLibraryItem[];
  customBars?: BeamCustomBarProjection[];
  onSave: (assembly: ReinforcementBeamAssembly) => void;
}) {
  const [assembly, setAssembly] = useState(() => existing ?? defaultAssembly({ name, hostIds, lengthMm, widthMm, heightMm }));
  const [error, setError] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pendingOversize, setPendingOversize] = useState<ReinforcementShapeLibraryItem | null>(null);
  const [frontZoom, setFrontZoom] = useState(1);
  const [frontPan, setFrontPan] = useState({ x: 0, y: 0 });
  const [sectionZoom, setSectionZoom] = useState(1);
  const [sectionPan, setSectionPan] = useState({ x: 0, y: 0 });
  const frontSvg = useRef<SVGSVGElement>(null);
  const frontDrag = useRef<{ pointerId: number; x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const sectionSvg = useRef<SVGSVGElement>(null);
  const sectionDrag = useRef<{ pointerId: number; x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const pickerDialog = useRef<HTMLDialogElement>(null);
  const oversizeDialog = useRef<HTMLDialogElement>(null);
  const customBarsDialog = useRef<HTMLDialogElement>(null);
  const pickerTitleId = useId();
  const oversizeTitleId = useId();
  const customBarsTitleId = useId();
  const [customZoneId, setCustomZoneId] = useState<string | null>(null);
  const [customDiameterMm, setCustomDiameterMm] = useState(12);

  const stirrups = shapeLibrary.filter((item) => item.category === "stirrup");
  const filteredStirrups = useMemo(() => {
    const query = pickerQuery.trim().toLocaleLowerCase("pl");
    if (!query) return stirrups;
    return stirrups.filter((item) => {
      const diameter = item.shape.diameterMm ? `fi${item.shape.diameterMm} ø${item.shape.diameterMm}` : "";
      return `${item.name} ${diameter}`.toLocaleLowerCase("pl").includes(query);
    });
  }, [pickerQuery, stirrups]);
  const parsed = ReinforcementBeamAssemblySchema.safeParse(assembly);
  const stirrupConnectionIssues = useMemo(() =>
    parsed.success ? beamStirrupConnectionIssues(parsed.data) : [], [parsed]);
  const stirrupDimensionReferences = assembly.zones.length
    ? assembly.zones.map((zone) => reinforcementShapeOutline(zone.shape))
      .reduce((minimum, outline) => ({
        widthMm: Math.min(minimum.widthMm, outline.widthMm),
        heightMm: Math.min(minimum.heightMm, outline.heightMm),
      }), { widthMm: Infinity, heightMm: Infinity })
    : null;
  const placements = useMemo(() => {
    if (!parsed.success) return [];
    try {
      return beamStirrupPlacements(parsed.data);
    } catch {
      return [];
    }
  }, [parsed]);
  const mainBarCorners = useMemo(() => {
    if (!parsed.success) return [];
    try {
      return beamStandardMainBarCorners(parsed.data);
    } catch {
      return [];
    }
  }, [parsed]);
  const mainBarReference = useMemo(() => {
    if (!parsed.success) return null;
    try {
      return beamStandardMainBarReference(parsed.data);
    } catch {
      return null;
    }
  }, [parsed]);
  const frontMainBars = useMemo(() => {
    const seen = new Set<number>();
    return mainBarCorners.filter((corner) => {
      if (corner.corner !== "top-left" && corner.corner !== "bottom-left") return false;
      if (seen.has(corner.verticalOffsetMm)) return false;
      seen.add(corner.verticalOffsetMm);
      return true;
    });
  }, [mainBarCorners]);
  const mainBarBundles = useMemo(() => {
    const groups = new Map<number, { transverseOffsetMm: number; verticalOffsetMm: number }>();
    for (const corner of mainBarCorners) {
      if (groups.has(corner.bundleIndex)) continue;
      const members = mainBarCorners.filter((item) => item.bundleIndex === corner.bundleIndex);
      groups.set(corner.bundleIndex, {
        transverseOffsetMm: members.reduce((total, item) => total + item.transverseOffsetMm, 0) / members.length,
        verticalOffsetMm: members.reduce((total, item) => total + item.verticalOffsetMm, 0) / members.length,
      });
    }
    return [...groups.entries()].map(([bundleIndex, offsets]) => ({ bundleIndex, ...offsets }));
  }, [mainBarCorners]);
  const resolvedCustomBars = useMemo(() => {
    if (!parsed.success) return [];
    try {
      return beamResolvedCustomMainBars(parsed.data);
    } catch {
      return [];
    }
  }, [parsed]);
  const activeCustomZone = assembly.zones.find((zone) => zone.id === customZoneId) ?? assembly.zones[0] ?? null;
  const customFrames = useMemo(() => {
    if (!parsed.success || !activeCustomZone) return [];
    try {
      return beamZoneStirrupFrames(parsed.data, activeCustomZone.id);
    } catch {
      return [];
    }
  }, [activeCustomZone, parsed]);
  const customSlots = useMemo(() => {
    if (!parsed.success || !activeCustomZone || !(customDiameterMm > 0)) return [];
    try {
      const assemblyData = parsed.data;
      return beamStirrupSlotStates(assemblyData, activeCustomZone.id, customDiameterMm).map((slot) => ({
        ...slot,
        fullBeam: !slot.occupiedBy && beamCustomMainBarFullBeamCheck(assemblyData, {
          anchorZoneId: slot.zoneId,
          bundleIndex: slot.bundleIndex,
          slotSide: slot.side,
          slotRatio: slot.ratio,
          diameterMm: customDiameterMm,
        }).available,
      }));
    } catch {
      return [];
    }
  }, [activeCustomZone, customDiameterMm, parsed]);
  const cardView = useMemo(() => {
    const margin = Math.max(assembly.widthMm, assembly.heightMm) * .08;
    const xs = [0, assembly.widthMm, ...mainBarCorners.map((corner) => assembly.widthMm / 2 + corner.transverseOffsetMm)];
    const ys = [0, assembly.heightMm, ...mainBarCorners.map((corner) => assembly.heightMm / 2 - corner.verticalOffsetMm)];
    const minX = Math.min(...xs) - margin;
    const minY = Math.min(...ys) - margin;
    return {
      x: minX, y: minY,
      width: Math.max(...xs) - minX + margin,
      height: Math.max(...ys) - minY + margin,
    };
  }, [assembly.heightMm, assembly.widthMm, mainBarCorners]);
  const frontBarStrokePx = Math.max(
    (assembly.standardMainBars?.diameterMm ?? 0) / 6,
    ...customBars.map((bar) => bar.diameterMm / 6),
    ...resolvedCustomBars.map((bar) => bar.diameterMm / 6),
  );
  const frontHaloStrokePx = frontStirrupStrokePx + frontBarStrokePx * 2 + 2;
  const frontCustomBars = useMemo(() => customBars.flatMap((bar) => {
    const clamped = bar.points.map(({ xMm, yMm }) => ({
      xMm: Math.max(0, Math.min(assembly.lengthMm, xMm)),
      yMm: Math.max(0, Math.min(assembly.heightMm, yMm)),
    }));
    if (!clamped.length) return [];
    const xs = clamped.map(({ xMm }) => xMm);
    const spanMm = Math.max(...xs) - Math.min(...xs);
    const widened = spanMm >= bar.diameterMm ? clamped : (() => {
      const centerMm = (Math.max(...xs) + Math.min(...xs)) / 2;
      const halfMm = bar.diameterMm / 2;
      const ys = clamped.map(({ yMm }) => yMm);
      return [
        { xMm: Math.max(0, centerMm - halfMm), yMm: Math.min(...ys) },
        { xMm: Math.min(assembly.lengthMm, centerMm + halfMm), yMm: Math.max(...ys) },
      ];
    })();
    return [{
      id: bar.id,
      label: bar.label,
      diameterMm: bar.diameterMm,
      points: widened.map(({ xMm, yMm }) => `${xMm},${yMm}`).join(" "),
    }];
  }), [assembly.heightMm, assembly.lengthMm, customBars]);
  const stirrupPreviewBars = useMemo<Rebar[]>(() => placements.map((placement, index) => ({
    id: `00000000-0000-4000-${String(8000 + index).padStart(4, "0")}-${String(index + 1).padStart(12, "0")}`,
    kind: "rebar-line",
    layerId: "rebar-stirrups",
    units: "mm",
    reviewStatus: "draft",
    source: { origin: "manual", documentId: null, page: null, confidence: null },
    geometry: { start: { x: placement.stationMm, y: 0 }, end: { x: placement.stationMm + 1, y: 0 } },
    attributes: {
      diameterMm: placement.shape.diameterMm ?? 8,
      count: 1,
      coverMm: 40,
      steelGrade: "podgląd",
      designReference: "podgląd",
      specialistVerified: false,
      shape: {
        ...placement.shape,
        rotationDegrees: 0,
        bends: placement.shape.bends.map((bend) => ({ ...bend, plane: "yz" as const })),
      },
    },
  })), [placements]);
  const mainPreviewBars = useMemo<Rebar[]>(() => {
    const diameterMm = assembly.standardMainBars?.diameterMm;
    if (!diameterMm) return [];
    return mainBarCorners.map((corner, index) => ({
      id: `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`,
      kind: "rebar-line",
      layerId: corner.verticalOffsetMm > 0 ? "rebar-top" : "rebar-bottom",
      units: "mm",
      reviewStatus: "draft",
      source: { origin: "manual", documentId: null, page: null, confidence: null },
      geometry: { start: { x: 0, y: 0 }, end: { x: assembly.lengthMm, y: 0 } },
      attributes: {
        diameterMm,
        count: 1,
        coverMm: 40,
        steelGrade: "podgląd",
        designReference: "podgląd",
        specialistVerified: false,
        shape: {
          kind: "straight",
          diameterMm,
          rotationDegrees: 0,
          bends: [{
            lengthMm: assembly.lengthMm,
            angleDegrees: 0,
            radiusMm: Math.max(20, diameterMm * 2),
            plane: "xy",
          }],
        },
      },
    }));
  }, [assembly.lengthMm, assembly.standardMainBars?.diameterMm, mainBarCorners]);
  const customPreviewBars = useMemo<Rebar[]>(() => resolvedCustomBars.map((bar, index) => ({
    id: `00000000-0000-4000-9100-${String(index + 1).padStart(12, "0")}`,
    kind: "rebar-line",
    layerId: bar.verticalMm > 0 ? "rebar-top" : "rebar-bottom",
    units: "mm",
    reviewStatus: "draft",
    source: { origin: "manual", documentId: null, page: null, confidence: null },
    geometry: { start: { x: bar.startMm, y: 0 }, end: { x: bar.endMm, y: 0 } },
    attributes: {
      diameterMm: bar.diameterMm,
      count: 1,
      coverMm: 40,
      steelGrade: "podgląd",
      designReference: "podgląd",
      specialistVerified: false,
      shape: {
        kind: "straight",
        diameterMm: bar.diameterMm,
        rotationDegrees: 0,
        bends: [{
          lengthMm: Math.max(1, bar.endMm - bar.startMm),
          angleDegrees: 0,
          radiusMm: Math.max(20, bar.diameterMm * 2),
          plane: "xy",
        }],
      },
    },
  })), [resolvedCustomBars]);
  const previewBars = useMemo(() => [...mainPreviewBars, ...customPreviewBars, ...stirrupPreviewBars],
    [customPreviewBars, mainPreviewBars, stirrupPreviewBars]);
  const activeZoneStirrupIds = useMemo(() => new Set(stirrupPreviewBars
    .filter((_, index) => placements[index]?.zoneId === activeCustomZone?.id)
    .map((bar) => bar.id)), [activeCustomZone?.id, placements, stirrupPreviewBars]);
  const previewOffsets = useMemo(() => Object.fromEntries([
    ...stirrupPreviewBars.map((bar, index) => {
      const placement = placements[index];
      const outline = placement ? reinforcementShapeOutline(placement.shape) : null;
      return [bar.id, {
        y: (placement?.transverseOffsetMm ?? 0) - (outline?.widthMm ?? 0) / 2,
        z: (placement?.verticalOffsetMm ?? 0) - (outline?.heightMm ?? 0) / 2,
      }] as const;
    }),
    ...mainPreviewBars.map((bar, index) => [bar.id, {
      y: mainBarCorners[index]?.transverseOffsetMm ?? 0,
      z: mainBarCorners[index]?.verticalOffsetMm ?? 0,
    }] as const),
    ...customPreviewBars.map((bar, index) => [bar.id, {
      y: resolvedCustomBars[index]?.transverseMm ?? 0,
      z: resolvedCustomBars[index]?.verticalMm ?? 0,
    }] as const),
  ]), [customPreviewBars, mainBarCorners, mainPreviewBars, placements,
    resolvedCustomBars, stirrupPreviewBars]);

  const createZone = (item: ReinforcementShapeLibraryItem, oversizeAccepted: boolean) => {
    const startMm = assembly.zones.at(-1)?.endMm ?? assembly.firstStirrupMm;
    if (startMm >= assembly.lastStirrupMm) {
      setError("Strzemiona zajmują już cały dopuszczalny zakres belki.");
      return;
    }
    const zone: ReinforcementStirrupZone = {
      id: crypto.randomUUID(),
      shapeTemplateId: item.id,
      shapeName: item.name,
      shape: item.shape,
      startMm,
      endMm: Math.min(startMm + 1000, assembly.lastStirrupMm),
      spacingMm: 200,
      bundleCount: 1,
      bundleGapMm: 0,
      bundleDirection: "right",
      concentrations: [],
      ...(oversizeAccepted ? { oversizeAccepted: true } : {}),
    };
    setAssembly((current) => ({ ...current, zones: [...current.zones, zone] }));
    setError("");
  };
  const addZone = (item: ReinforcementShapeLibraryItem) => {
    pickerDialog.current?.close();
    if (reinforcementShapeOutline(item.shape).heightMm > assembly.heightMm + 0.001) {
      setPendingOversize(item);
      return;
    }
    createZone(item, false);
  };
  const updateZone = (index: number, update: Partial<ReinforcementStirrupZone>) => {
    setAssembly((current) => {
      const lengths = zoneLengths(current.zones);
      const zones = current.zones.map((zone, zoneIndex) => zoneIndex === index ? { ...zone, ...update } : zone);
      if (update.endMm !== undefined) lengths[index] = update.endMm - zones[index]!.startMm;
      return { ...current, zones: arrangeZones({ ...current, zones }, lengths) };
    });
  };
  const removeZone = (index: number) => setAssembly((current) => {
    const removedId = current.zones[index]?.id;
    const zones = current.zones.filter((_, zoneIndex) => zoneIndex !== index);
    const arranged = arrangeZones({ ...current, zones }, zoneLengths(zones));
    const kept = withCustomMainBars(current, (current.customMainBars ?? [])
      .filter((bar) => arranged.length && bar.anchorZoneId !== removedId));
    if (arranged.length) return { ...kept, zones: arranged };
    return { ...withoutStandardMainBars(kept), zones: arranged };
  });
  const openCustomBars = () => {
    if (!assembly.zones.length) {
      setError("Najpierw dodaj strzemię — druty niestandardowe wstawia się w sloty strzemion.");
      return;
    }
    if (!assembly.zones.some((zone) => zone.id === customZoneId)) setCustomZoneId(assembly.zones[0]!.id);
    setError("");
    customBarsDialog.current?.showModal();
  };
  const addCustomMainBar = (slot: BeamStirrupSlotState) => {
    if (slot.occupiedBy || !parsed.success) return;
    const draft = {
      anchorZoneId: slot.zoneId,
      bundleIndex: slot.bundleIndex,
      slotSide: slot.side,
      slotRatio: slot.ratio,
      diameterMm: customDiameterMm,
    };
    const range = beamCustomMainBarAllowedRange(parsed.data, draft);
    const fullBeam = beamCustomMainBarFullBeamCheck(parsed.data, draft).available;
    const bar: ReinforcementBeamCustomMainBar = {
      id: crypto.randomUUID(),
      ...draft,
      lengthMm: fullBeam ? assembly.lengthMm : range ? range.endMm - range.startMm : assembly.lengthMm,
      fromSide: "start",
      fullBeam,
    };
    setAssembly((current) => withCustomMainBars(current, [...(current.customMainBars ?? []), bar]));
    setError("");
  };
  const updateCustomMainBar = (id: string, update: Partial<ReinforcementBeamCustomMainBar>) =>
    setAssembly((current) => withCustomMainBars(current, (current.customMainBars ?? [])
      .map((bar) => bar.id === id ? { ...bar, ...update } : bar)));
  const removeCustomMainBar = (id: string) => setAssembly((current) =>
    withCustomMainBars(current, (current.customMainBars ?? []).filter((bar) => bar.id !== id)));
  const addStandardMainBars = () => {
    if (!assembly.zones.length) {
      setError("Najpierw dodaj co najmniej jedno strzemię, aby wyznaczyć narożniki standardowych drutów.");
      return;
    }
    setAssembly((current) => ({ ...current, standardMainBars: { diameterMm: 12 } }));
    setError("");
  };
  const removeStandardMainBars = () => setAssembly(withoutStandardMainBars);
  const addConcentration = (zoneIndex: number) => {
    const zone = assembly.zones[zoneIndex]!;
    const previousEnd = zone.concentrations.at(-1)?.endMm ?? zone.startMm;
    if (previousEnd >= zone.endMm) {
      setError("W tej strefie nie ma już miejsca na kolejne zagęszczenie.");
      return;
    }
    updateZone(zoneIndex, { concentrations: [...zone.concentrations, {
      id: crypto.randomUUID(),
      startMm: previousEnd,
      endMm: Math.min(previousEnd + 500, zone.endMm),
      spacingMm: Math.max(25, Math.round(zone.spacingMm / 2)),
      bundleCount: 1,
      bundleGapMm: 0,
      bundleDirection: zone.bundleDirection ?? "right",
    }] });
  };
  const updateConcentration = (zoneIndex: number, concentrationIndex: number,
    update: Partial<ReinforcementStirrupZone["concentrations"][number]>) => {
    const zone = assembly.zones[zoneIndex]!;
    updateZone(zoneIndex, { concentrations: zone.concentrations.map((item, index) =>
      index === concentrationIndex ? { ...item, ...update } : item) });
  };
  const save = () => {
    const oversize = assembly.zones.some((zone) => zone.oversizeAccepted);
    const result = ReinforcementBeamAssemblySchema.safeParse({
      ...assembly,
      status: oversize ? "needs-review" : "draft",
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Sprawdź dane konstruktora belki.");
      return;
    }
    try {
      beamStirrupPlacements(result.data);
      const connectionIssues = beamStirrupConnectionIssues(result.data);
      if (connectionIssues.length) {
        setError(connectionIssues[0]!.message);
        return;
      }
      const customIssues = beamCustomMainBarIssues(result.data);
      if (customIssues.length) {
        setError(customIssues[0]!);
        return;
      }
      onSave(result.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nie udało się zapisać układu strzemion.");
    }
  };
  const fillZoneToBeamEnd = (zoneIndex: number) => {
    setAssembly((current) => {
      const zones = current.zones.slice(0, zoneIndex + 1);
      const zone = zones[zoneIndex]!;
      zones[zoneIndex] = {
        ...zone,
        endMm: current.lastStirrupMm,
        concentrations: zone.concentrations.filter((item) => item.startMm < current.lastStirrupMm)
          .map((item) => ({ ...item, endMm: Math.min(item.endMm, current.lastStirrupMm) })),
      };
      return { ...current, zones };
    });
    setError("");
  };
  const zoneStirrups = useMemo(() => placements.filter((placement, index, items) =>
    items.findIndex((candidate) => candidate.zoneId === placement.zoneId
      && candidate.bundleIndex === placement.bundleIndex) === index)
    .map((placement) => {
      const outline = reinforcementShapeOutline(placement.shape);
      const left = (assembly.widthMm - outline.widthMm) / 2 + placement.transverseOffsetMm;
      const top = assembly.heightMm / 2 - outline.heightMm / 2 - placement.verticalOffsetMm;
      return {
        key: `${placement.zoneId}-${placement.bundleIndex}`,
        zoneId: placement.zoneId,
        bundleIndex: placement.bundleIndex,
        diameterMm: placement.shape.diameterMm ?? 8,
        transverseOffsetMm: placement.transverseOffsetMm,
        verticalOffsetMm: placement.verticalOffsetMm,
        outline,
        left,
        top,
        points: outline.points.map(({ x, y }) => `${left + x},${top + outline.heightMm - y}`).join(" "),
        typeKey: `${outline.widthMm.toFixed(1)}x${outline.heightMm.toFixed(1)}|${placement.shape.diameterMm ?? 8}`
          + `|${placement.bundleIndex}|${placement.transverseOffsetMm.toFixed(1)}|${placement.verticalOffsetMm.toFixed(1)}`,
      };
    }).map((item, _index, items) => {
      const typeKeys = [...new Set(items.map((candidate) => candidate.typeKey))];
      const typeIndex = typeKeys.indexOf(item.typeKey);
      return {
        ...item,
        typeIndex,
        color: stirrupTypeColors[typeIndex % stirrupTypeColors.length]!,
        zoneIndex: assembly.zones.findIndex((zone) => zone.id === item.zoneId),
      };
    }), [assembly.heightMm, assembly.widthMm, assembly.zones, placements]);
  const stirrupTypeOf = (zoneId: string, bundleIndex: number) =>
    zoneStirrups.find((item) => item.zoneId === zoneId && item.bundleIndex === bundleIndex);
  // Rzut boczny pokazuje każdy typ strzemienia raz, z listą stref, w których występuje.
  const sectionStirrups = useMemo(() => zoneStirrups
    .filter((item, index, items) => items.findIndex((candidate) => candidate.typeKey === item.typeKey) === index)
    .map((item) => ({
      ...item,
      key: item.typeKey,
      zoneIndexes: zoneStirrups.filter((candidate) => candidate.typeKey === item.typeKey)
        .map((candidate) => candidate.zoneIndex),
    })), [zoneStirrups]);
  const resolvedById = new Map(resolvedCustomBars.map((bar) => [bar.id, bar]));
  const sectionPointX = (transverseMm: number) => assembly.widthMm / 2 + transverseMm;
  const sectionPointY = (verticalMm: number) => assembly.heightMm / 2 - verticalMm;
  const renderCustomMainBarCard = (bar: ReinforcementBeamCustomMainBar, barIndex: number) => {
    const resolved = resolvedById.get(bar.id);
    const zoneIndex = assembly.zones.findIndex((zone) => zone.id === bar.anchorZoneId);
    const zone = assembly.zones[zoneIndex];
    const bundled = (zone?.bundleCount ?? 1) > 1;
    const kind = bar.slotRatio === 0 ? "corner" as const : Math.abs(bar.slotRatio - .5) < 1e-6
      ? "middle" as const : "edge" as const;
    const allowedMm = resolved ? resolved.allowedEndMm - resolved.allowedStartMm : 0;
    const fullBeamCheck = parsed.success ? (() => {
      try {
        return beamCustomMainBarFullBeamCheck(parsed.data, bar);
      } catch {
        return null;
      }
    })() : null;
    const zoneList = (indexes: number[]) => indexes.map((index) => index + 1).join(", ");
    const fullBeamReason = fullBeamCheck && !fullBeamCheck.available ? [
      fullBeamCheck.missingZoneIndexes.length
        ? `strzemię strefy ${zoneList(fullBeamCheck.missingZoneIndexes)} nie ma tego slotu` : "",
      fullBeamCheck.occupiedZoneIndexes.length
        ? `slot jest zajęty w strefie ${zoneList(fullBeamCheck.occupiedZoneIndexes)}` : "",
    ].filter(Boolean).join(" i ") : "";
    const fullBeamActive = Boolean(bar.fullBeam && fullBeamCheck?.available);
    const fullBeamBroken = Boolean(bar.fullBeam && !fullBeamCheck?.available);
    const anchorStirrups = zoneStirrups.filter((item) => item.zoneId === bar.anchorZoneId);
    const cardMargin = Math.max(assembly.widthMm, assembly.heightMm) * .08;
    const cardMinX = Math.min(cardView.x, ...anchorStirrups.map((item) => item.left - cardMargin));
    const cardMinY = Math.min(cardView.y, ...anchorStirrups.map((item) => item.top - cardMargin));
    const cardMaxX = Math.max(cardView.x + cardView.width,
      ...anchorStirrups.map((item) => item.left + item.outline.widthMm + cardMargin));
    const cardMaxY = Math.max(cardView.y + cardView.height,
      ...anchorStirrups.map((item) => item.top + item.outline.heightMm + cardMargin));
    const extensionStartMm = bar.extensionStartMm ?? 0;
    const extensionEndMm = bar.extensionEndMm ?? 0;
    const extensionMode = extensionStartMm > 0 && extensionEndMm > 0 ? "both"
      : extensionStartMm > 0 ? "start" : extensionEndMm > 0 ? "end" : "none";
    const defaultExtensionMm = 100;
    const setExtensionMode = (mode: string) => updateCustomMainBar(bar.id, {
      extensionStartMm: mode === "start" || mode === "both" ? extensionStartMm || defaultExtensionMm : 0,
      extensionEndMm: mode === "end" || mode === "both" ? extensionEndMm || defaultExtensionMm : 0,
    });
    return <article className="beam-constructor-main-bar-card beam-constructor-custom-main-bar-card" key={bar.id}
      data-custom-main-bar-card={bar.id}>
      <svg role="img" aria-label={`Położenie drutu niestandardowego ${barIndex + 1} w przekroju`}
        viewBox={`${cardMinX} ${cardMinY} ${cardMaxX - cardMinX} ${cardMaxY - cardMinY}`}>
        <rect width={assembly.widthMm} height={assembly.heightMm} rx={Math.min(40, assembly.widthMm * .08)}
          className="beam-constructor-concrete" />
        {anchorStirrups.map((item) => <polyline key={item.key} points={item.points} fill="none"
          data-custom-card-stirrup={item.typeIndex + 1}
          stroke={item.color} strokeWidth={2.5} vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />)}
        {mainBarCorners.map((corner) => <circle key={corner.id} opacity={.35}
          cx={sectionPointX(corner.transverseOffsetMm)} cy={sectionPointY(corner.verticalOffsetMm)}
          r={(assembly.standardMainBars?.diameterMm ?? 0) / 2} className="beam-constructor-main-bar-section" />)}
        {resolved && <circle cx={sectionPointX(resolved.transverseMm)} cy={sectionPointY(resolved.verticalMm)}
          r={bar.diameterMm / 2} fill={customBarColor} />}
      </svg>
      <div>
        <strong>Drut niestandardowy {barIndex + 1}</strong>
        <span>Strefa {zoneIndex + 1} · {slotLabel({ side: bar.slotSide, kind, bundleIndex: bar.bundleIndex,
          ratio: bar.slotRatio }, bundled)}</span>
      </div>
      <div className="beam-constructor-zone-length">
        <label>Długość (cm)<input type="number" min={0.1} step={0.1} max={cm(allowedMm || assembly.lengthMm)}
          value={cm(bar.lengthMm)} aria-label={`Długość drutu niestandardowego ${barIndex + 1} (cm)`}
          onChange={(event) => updateCustomMainBar(bar.id,
            { lengthMm: Number(event.target.value) * 10, fullBeam: false })} /></label>
        <button type="button" className="quiet-button" disabled={!fullBeamCheck?.available}
          aria-pressed={fullBeamActive}
          title={fullBeamCheck?.available
            ? "Poprowadź drut przez całą belkę — zajmie ten slot w każdym strzemieniu"
            : `Cała belka niemożliwa: ${fullBeamReason || "slot nie mieści drutu"}`}
          onClick={() => updateCustomMainBar(bar.id,
            { lengthMm: assembly.lengthMm, fromSide: "start", fullBeam: true })}>Cała belka</button>
      </div>
      <label>Grubość drutu Ø (mm)<input type="number" min={1} max={100} step={0.5} value={bar.diameterMm}
        aria-label={`Grubość drutu niestandardowego ${barIndex + 1} (mm)`}
        onChange={(event) => updateCustomMainBar(bar.id, { diameterMm: Number(event.target.value) })} /></label>
      <label>Dodaj od strony<select value={bar.fromSide} disabled={fullBeamActive}
        aria-label={`Strona dodawania drutu niestandardowego ${barIndex + 1}`}
        onChange={(event) => updateCustomMainBar(bar.id, { fromSide: event.target.value as "start" | "end" })}>
        <option value="start">Od początku zakresu (lewa strona)</option>
        <option value="end">Od końca zakresu (prawa strona)</option>
      </select></label>
      <fieldset className="beam-constructor-custom-bar-extension" disabled={fullBeamActive}
        data-extension-mode={extensionMode}>
        <legend>Wypust poza strzemiona</legend>
        <label>Wypust<select value={extensionMode}
          aria-label={`Wypust drutu niestandardowego ${barIndex + 1}`}
          onChange={(event) => setExtensionMode(event.target.value)}>
          <option value="none">Bez wypustu (drut kończy się z zakresem)</option>
          <option value="start">Z jednej strony — lewej (początek)</option>
          <option value="end">Z jednej strony — prawej (koniec)</option>
          <option value="both">Z obu stron</option>
        </select></label>
        {(extensionMode === "start" || extensionMode === "both") && <label>Wypust z lewej (cm)
          <input type="number" min={0} step={0.5} value={cm(extensionStartMm)}
            aria-label={`Wypust z lewej drutu niestandardowego ${barIndex + 1} (cm)`}
            onChange={(event) => updateCustomMainBar(bar.id,
              { extensionStartMm: Math.max(0, Number(event.target.value) * 10) })} /></label>}
        {(extensionMode === "end" || extensionMode === "both") && <label>Wypust z prawej (cm)
          <input type="number" min={0} step={0.5} value={cm(extensionEndMm)}
            aria-label={`Wypust z prawej drutu niestandardowego ${barIndex + 1} (cm)`}
            onChange={(event) => updateCustomMainBar(bar.id,
              { extensionEndMm: Math.max(0, Number(event.target.value) * 10) })} /></label>}
        {fullBeamActive && <small>Drut przez całą belkę biegnie od czoła do czoła — wypust nie dotyczy.</small>}
      </fieldset>
      {fullBeamBroken && <p role="alert" className="beam-constructor-custom-bar-error"
        data-full-beam-state="blocked">
        Cała belka niemożliwa: {fullBeamReason || "slot nie mieści drutu"}. Drut nie zajmie tego slotu w każdym
        strzemieniu, więc belki nie da się zapisać. Wybierz inny slot albo zmień długość i stronę, aby zrobić docinkę.
      </p>}
      {resolved ? <p data-custom-bar-range={`${resolved.startMm}-${resolved.endMm}`}
        data-full-beam-state={fullBeamActive ? "active" : fullBeamCheck?.available ? "available" : "unavailable"}>
        Drut biegnie {cm(resolved.startMm)}–{cm(resolved.endMm)} cm.{" "}
        {fullBeamActive
          ? `Cała belka: drut zajmuje ten slot w każdym strzemieniu (strefy 1–${assembly.zones.length}).`
          : fullBeamCheck?.available
            ? "Slot jest wolny we wszystkich strzemionach — „Cała belka” poprowadzi drut przez każde z nich."
            : `Docinka: ${fullBeamReason || "slot nie istnieje w każdym strzemieniu"}, dlatego drut może biec `
              + `tylko w zakresie ${cm(resolved.allowedStartMm)}–${cm(resolved.allowedEndMm)} cm `
              + "i jest dodawany od wybranej strony."}
        {resolved.clamped && !bar.fullBeam && " Długość przycięto do dozwolonego zakresu."}
        {!fullBeamActive && (resolved.extensionStartMm > 0 || resolved.extensionEndMm > 0)
          && ` Wypust: ${[resolved.extensionStartMm > 0 ? `z lewej ${cm(resolved.extensionStartMm)} cm` : "",
            resolved.extensionEndMm > 0 ? `z prawej ${cm(resolved.extensionEndMm)} cm` : ""]
            .filter(Boolean).join(", ")}.`}
        {!fullBeamActive && extensionStartMm + extensionEndMm
          > resolved.extensionStartMm + resolved.extensionEndMm + .5
          && " Wypust przycięto do długości belki."}
      </p> : <p role="status">Slot nie mieści drutu o tej grubości w wybranym strzemieniu.</p>}
      <button type="button" className="quiet-button" onClick={() => removeCustomMainBar(bar.id)}>
        Usuń drut
      </button>
    </article>;
  };
  const customSectionView = (() => {
    const xs = [0, assembly.widthMm, ...customFrames.flatMap((frame) => [
      sectionPointX(frame.centerTransverseMm - frame.widthMm / 2),
      sectionPointX(frame.centerTransverseMm + frame.widthMm / 2)])];
    const ys = [0, assembly.heightMm, ...customFrames.flatMap((frame) => [
      sectionPointY(frame.centerVerticalMm + frame.heightMm / 2),
      sectionPointY(frame.centerVerticalMm - frame.heightMm / 2)])];
    const margin = Math.max(assembly.widthMm, assembly.heightMm) * .1;
    const minX = Math.min(...xs) - margin;
    const minY = Math.min(...ys) - margin;
    return { x: minX, y: minY, width: Math.max(...xs) - minX + margin, height: Math.max(...ys) - minY + margin };
  })();
  const slotRadiusMm = Math.max(3, Math.min(7, customDiameterMm / 2));
  const activeZoneIndex = activeCustomZone ? assembly.zones.indexOf(activeCustomZone) : -1;
  const activeZoneBundled = (activeCustomZone?.bundleCount ?? 1) > 1;
  const freeSlotCount = customSlots.filter((slot) => !slot.occupiedBy).length;
  const remainingMm = assembly.lastStirrupMm - (assembly.zones.at(-1)?.endMm ?? assembly.firstStirrupMm);
  const previewWidth = Math.max(1, assembly.lengthMm);
  const previewHeight = Math.max(1, assembly.heightMm);
  const frontMarginX = Math.max(previewWidth * .035, previewHeight * .25);
  const frontMarginY = Math.max(previewHeight * .78, previewWidth * .04);
  const frontFont = Math.max(previewHeight * .105, previewWidth * .012);
  const spacingChain = useMemo(() => spacingRuns(
    [...new Set(placements.map((placement) => placement.stationMm))].sort((left, right) => left - right),
  ), [placements]);
  // Wysokość każdego typu strzemienia wymiarowana tuż przed pierwszym strzemieniem strefy.
  const frontStirrupHeights = zoneStirrups.flatMap((item) => {
    const zone = assembly.zones.find((candidate) => candidate.id === item.zoneId);
    const firstStation = placements.find((placement) => placement.zoneId === item.zoneId)?.stationMm;
    if (!zone || firstStation === undefined) return [];
    const bottom = item.top + item.outline.heightMm;
    const sameHeightBefore = zoneStirrups.filter((candidate) => candidate.zoneId === item.zoneId)
      .findIndex((candidate) => Math.abs(candidate.top - item.top) < .5
        && Math.abs(candidate.outline.heightMm - item.outline.heightMm) < .5);
    const own = zoneStirrups.filter((candidate) => candidate.zoneId === item.zoneId).indexOf(item);
    if (sameHeightBefore !== own) return [];
    return [{ key: item.key, typeIndex: item.typeIndex, color: item.color, top: item.top, bottom,
      lineX: Math.max(0, firstStation - frontFont * 1.3 * (1 + own)) }];
  });
  const sectionBundleEnvelopes = useMemo(() => {
    const groups = new Map<string, typeof zoneStirrups>();
    for (const item of zoneStirrups) {
      const list = groups.get(item.zoneId);
      if (list) list.push(item);
      else groups.set(item.zoneId, [item]);
    }
    return [...groups.entries()].flatMap(([zoneId, items]) => {
      if (items.length < 2) return [];
      const lefts = items.map((item) => item.left);
      const rights = items.map((item) => item.left + item.outline.widthMm);
      const tops = items.map((item) => item.top);
      const bottoms = items.map((item) => item.top + item.outline.heightMm);
      const left = Math.min(...lefts);
      const top = Math.min(...tops);
      return [{
        zoneId,
        zoneIndex: assembly.zones.findIndex((zone) => zone.id === zoneId),
        count: items.length,
        left,
        top,
        widthMm: Math.max(...rights) - left,
        heightMm: Math.max(...bottoms) - top,
        spansWidth: new Set(lefts.map((value) => Math.round(value * 1000))).size > 1,
        spansHeight: new Set(tops.map((value) => Math.round(value * 1000))).size > 1,
      }];
    });
  }, [assembly.zones, zoneStirrups]);
  // Położenia drutów z domeny są liczone względem osi belki, z uwzględnieniem strzemion wyższych od betonu.
  const sectionMainBarAnchor = { x: assembly.widthMm / 2, y: previewHeight / 2 };
  const sectionBase = useMemo(() => {
    const margin = Math.max(assembly.widthMm, assembly.heightMm)
      * (.48 + Math.min(4, sectionStirrups.length) * .16);
    const minX = Math.min(0, ...sectionStirrups.map((item) => item.left));
    const maxX = Math.max(assembly.widthMm, ...sectionStirrups.map((item) => item.left + item.outline.widthMm));
    const minY = Math.min(0, ...sectionStirrups.map((item) => item.top));
    const maxY = Math.max(previewHeight, ...sectionStirrups.map((item) => item.top + item.outline.heightMm));
    return {
      margin,
      x: minX - margin,
      y: minY - margin,
      width: maxX - minX + margin * 2,
      height: maxY - minY + margin * 2,
    };
  }, [assembly.heightMm, assembly.widthMm, previewHeight, sectionStirrups]);
  const sectionMargin = sectionBase.margin;  const sectionFont = Math.max(assembly.widthMm, assembly.heightMm) * .075;
  const frontBase = useMemo(() => ({
    x: -frontMarginX,
    y: -frontMarginY,
    width: previewWidth + frontMarginX * 2,
    height: previewHeight + frontMarginY * 2,
  }), [frontMarginX, frontMarginY, previewHeight, previewWidth]);
  const frontView = useMemo(() => {
    const width = frontBase.width / frontZoom;
    const height = frontBase.height / frontZoom;
    return {
      width,
      height,
      x: frontBase.x + (frontBase.width - width) / 2 + frontPan.x,
      y: frontBase.y + (frontBase.height - height) / 2 + frontPan.y,
    };
  }, [frontBase, frontPan, frontZoom]);
  const sectionView = useMemo(() => {
    const width = sectionBase.width / sectionZoom;
    const height = sectionBase.height / sectionZoom;
    return {
      width,
      height,
      x: sectionBase.x + (sectionBase.width - width) / 2 + sectionPan.x,
      y: sectionBase.y + (sectionBase.height - height) / 2 + sectionPan.y,
    };
  }, [sectionBase, sectionPan, sectionZoom]);
  const resetSectionView = () => {
    setSectionZoom(1);
    setSectionPan({ x: 0, y: 0 });
  };
  const resetFrontView = () => {
    setFrontZoom(1);
    setFrontPan({ x: 0, y: 0 });
  };
  const zoomFront = useCallback((factor: number) => {
    setFrontZoom((current) => Math.min(12, Math.max(.4, current * factor)));
  }, []);
  const zoomSection = useCallback((factor: number) => {
    setSectionZoom((current) => Math.min(12, Math.max(.4, current * factor)));
  }, []);
  useEffect(() => {
    const element = frontSvg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomFront(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomFront]);
  useEffect(() => {
    const element = sectionSvg.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomSection(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomSection]);
  useEffect(() => {
    if (pendingOversize && !oversizeDialog.current?.open) {
      oversizeDialog.current?.showModal();
    }
  }, [pendingOversize]);
  const startFrontPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    frontDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan: frontPan };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveFrontPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = frontDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setFrontPan({
      x: drag.pan.x - (event.clientX - drag.x) * (frontView.width / rect.width),
      y: drag.pan.y - (event.clientY - drag.y) * (frontView.height / rect.height),
    });
  };
  const endFrontPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (frontDrag.current?.pointerId !== event.pointerId) return;
    frontDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const startSectionPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    sectionDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan: sectionPan };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSectionPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = sectionDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setSectionPan({
      x: drag.pan.x - (event.clientX - drag.x) * (sectionView.width / rect.width),
      y: drag.pan.y - (event.clientY - drag.y) * (sectionView.height / rect.height),
    });
  };
  const endSectionPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (sectionDrag.current?.pointerId !== event.pointerId) return;
    sectionDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const pendingOversizeHeightMm = pendingOversize ? reinforcementShapeOutline(pendingOversize.shape).heightMm : 0;
  const openPicker = () => {
    setPickerQuery("");
    pickerDialog.current?.showModal();
  };

  return <section className="beam-constructor" aria-label="Konstruktor belek">
    <header className="beam-constructor-heading">
      <div><span>Konstruktor belek</span><h5>{assembly.name}</h5></div>
      <dl>
        <div><dt>Długość z rzutu</dt><dd>{cmLabel(assembly.lengthMm)}</dd></div>
        <div><dt>Przekrój</dt><dd>{cm(assembly.widthMm)} × {cm(assembly.heightMm)} cm</dd></div>
        <div><dt>Pierwsze / ostatnie strzemię</dt>
          <dd>{cm(assembly.firstStirrupMm)} / {cm(assembly.lastStirrupMm)} cm</dd></div>
      </dl>
    </header>
    <p className="beam-constructor-note">Długość prętów pochodzi z wybranego elementu rzutu. Dopuszczalny zakres
      strzemion zaczyna i kończy się o połowę szerokości elementu od jego końców. Te wartości opisują geometrię,
      a nie dobór konstrukcyjny.</p>
    <div className="beam-constructor-previews">
      <section className="beam-constructor-front-view">
        <div className="beam-constructor-view-bar">
          <h6>Rzut 2D od frontu belki</h6>
          <div className="beam-constructor-view-tools">
            <button type="button" className="quiet-button" onClick={() => zoomFront(1 / 1.25)}
              aria-label="Oddal rzut frontowy">−</button>
            <span>{Math.round(frontZoom * 100)}%</span>
            <button type="button" className="quiet-button" onClick={() => zoomFront(1.25)}
              aria-label="Przybliż rzut frontowy">+</button>
            <button type="button" className="quiet-button" onClick={resetFrontView}>Dopasuj widok</button>
          </div>
        </div>
        <svg ref={frontSvg} className="beam-constructor-drawing beam-constructor-drawing-pannable"
          role="img" aria-label="Rzut 2D od frontu belki"
          viewBox={`${frontView.x} ${frontView.y} ${frontView.width} ${frontView.height}`}
          onPointerDown={startFrontPan} onPointerMove={moveFrontPan}
          onPointerUp={endFrontPan} onPointerCancel={endFrontPan}>
          <rect width={previewWidth} height={previewHeight} rx={Math.min(40, previewHeight * .08)}
            className="beam-constructor-concrete" fill="#e0f2fe" stroke="#475569" />
          <g className="beam-constructor-material-label" pointerEvents="none">
            <line x1={-frontMarginX * .54} y1={previewHeight * .18} x2={0} y2={previewHeight * .18} />
            <text x={-frontMarginX * .6} y={previewHeight * .18}
              fontSize={frontFont * .82} textAnchor="end" dominantBaseline="middle">BETON</text>
          </g>
          <g className="beam-constructor-front-bar-layer" data-front-layer="bars">
            {frontMainBars.map((corner) => <line key={corner.id}
              className="beam-constructor-main-bar"
              data-main-bar-projection={corner.verticalOffsetMm > 0 ? "top" : "bottom"}
              x1={0} y1={previewHeight / 2 - corner.verticalOffsetMm}
              x2={previewWidth} y2={previewHeight / 2 - corner.verticalOffsetMm}
              strokeWidth={(assembly.standardMainBars?.diameterMm ?? 0) / 6} />)}
            {resolvedCustomBars.map((bar) => <line key={bar.id}
              className="beam-constructor-custom-main-bar" data-custom-main-bar={bar.id}
              x1={bar.startMm} x2={bar.endMm}
              y1={previewHeight / 2 - bar.verticalMm} y2={previewHeight / 2 - bar.verticalMm}
              stroke={customBarColor} strokeWidth={bar.diameterMm / 6} strokeLinecap="butt" />)}
            {frontCustomBars.map((bar) => <polyline key={bar.id}
              className="beam-constructor-custom-bar" data-custom-bar={bar.id}
              points={bar.points} strokeWidth={bar.diameterMm / 6}>
              <title>{bar.label}</title>
            </polyline>)}
          </g>
          <g className="beam-constructor-front-stirrup-layer" data-front-layer="stirrups">
            {placements.map((placement, index) => {
              const type = stirrupTypeOf(placement.zoneId, placement.bundleIndex);
              const top = type?.top ?? previewHeight * .1 - placement.verticalOffsetMm;
              const bottom = type ? type.top + type.outline.heightMm : previewHeight * .9 - placement.verticalOffsetMm;
              const color = type?.color ?? stirrupTypeColors[0]!;
              return <g key={`${placement.zoneId}-${placement.stationMm}-${index}`}
                data-stirrup-type={type ? type.typeIndex + 1 : undefined}
                data-stirrup-zone-id={placement.zoneId}>
                <line className="beam-constructor-stirrup-halo"
                  stroke="#e0f2fe" strokeWidth={frontHaloStrokePx} vectorEffect="non-scaling-stroke"
                  x1={placement.stationMm} x2={placement.stationMm} y1={top} y2={bottom} />
                <line className="beam-constructor-stirrup" x1={placement.stationMm} x2={placement.stationMm}
                  y1={top} y2={bottom} data-stirrup-color={color}
                  stroke={color} strokeWidth={frontStirrupStrokePx} vectorEffect="non-scaling-stroke" />
              </g>;
            })}
          </g>
          {frontStirrupHeights.map((item) => {
            const tick = frontFont * .24;
            const textX = item.lineX + frontFont * .98;
            return <g key={`front-height-${item.key}`} style={{ color: item.color }}
              className="beam-constructor-dimension beam-constructor-bundle-dimension"
              data-dimension="front-stirrup-height" data-stirrup-type={item.typeIndex + 1}>
              <line x1={item.lineX} y1={item.top} x2={item.lineX} y2={item.bottom} />
              <line x1={item.lineX - tick} y1={item.top} x2={item.lineX + tick} y2={item.top} />
              <line x1={item.lineX - tick} y1={item.bottom} x2={item.lineX + tick} y2={item.bottom} />
              <text x={textX} y={(item.top + item.bottom) / 2} fontSize={frontFont * .78} textAnchor="middle"
                transform={`rotate(-90 ${textX} ${(item.top + item.bottom) / 2})`}>
                S{item.typeIndex + 1}: {cmLabel(item.bottom - item.top)}
              </text>
            </g>;
          })}
          {assembly.zones.map((zone) => {
            const lineY = -frontMarginY * .58;
            const tick = frontFont * .28;
            return <g className="beam-constructor-dimension" data-dimension="zone" key={`dimension-${zone.id}`}>
              <line x1={zone.startMm} y1={0} x2={zone.startMm} y2={lineY} />
              <line x1={zone.endMm} y1={0} x2={zone.endMm} y2={lineY} />
              <line x1={zone.startMm} y1={lineY} x2={zone.endMm} y2={lineY} />
              <line x1={zone.startMm} y1={lineY - tick} x2={zone.startMm} y2={lineY + tick} />
              <line x1={zone.endMm} y1={lineY - tick} x2={zone.endMm} y2={lineY + tick} />
              <text x={(zone.startMm + zone.endMm) / 2} y={lineY - frontFont * .22}
                fontSize={frontFont} textAnchor="middle">{cmLabel(zone.endMm - zone.startMm)}</text>
            </g>;
          })}
          {spacingChain.map((run) => {
            const lineY = -frontMarginY * .22;
            const tick = frontFont * .24;
            const ticks = Array.from({ length: run.count + 1 }, (_, index) => run.startMm + index * run.spacingMm);
            return <g className="beam-constructor-dimension" data-dimension="spacing"
              key={`spacing-${run.startMm}-${run.spacingMm}`}>
              <line x1={run.startMm} y1={lineY} x2={run.endMm} y2={lineY} />
              {ticks.map((station) => <line key={station} x1={station} y1={lineY - tick}
                x2={station} y2={lineY + tick} />)}
              <text x={(run.startMm + run.endMm) / 2} y={lineY - frontFont * .22}
                fontSize={frontFont * .86} textAnchor="middle">
                {run.count > 1 ? `${run.count} × ${cmLabel(run.spacingMm)}` : cmLabel(run.spacingMm)}
              </text>
            </g>;
          })}
          <g className="beam-constructor-dimension" data-dimension="length">
            <line x1={0} y1={previewHeight} x2={0} y2={previewHeight + frontMarginY * .45} />
            <line x1={previewWidth} y1={previewHeight} x2={previewWidth} y2={previewHeight + frontMarginY * .45} />
            <line x1={0} y1={previewHeight + frontMarginY * .45}
              x2={previewWidth} y2={previewHeight + frontMarginY * .45} />
            <line x1={0} y1={previewHeight + frontMarginY * .45 - frontFont * .28}
              x2={0} y2={previewHeight + frontMarginY * .45 + frontFont * .28} />
            <line x1={previewWidth} y1={previewHeight + frontMarginY * .45 - frontFont * .28}
              x2={previewWidth} y2={previewHeight + frontMarginY * .45 + frontFont * .28} />
            <text x={previewWidth / 2} y={previewHeight + frontMarginY * .45 - frontFont * .22}
              fontSize={frontFont} textAnchor="middle">{cmLabel(previewWidth)}</text>
          </g>
          <g className="beam-constructor-dimension" data-dimension="height">
            <line x1={previewWidth} y1={0} x2={previewWidth + frontMarginX * .45} y2={0} />
            <line x1={previewWidth} y1={previewHeight} x2={previewWidth + frontMarginX * .45} y2={previewHeight} />
            <line x1={previewWidth + frontMarginX * .45} y1={0}
              x2={previewWidth + frontMarginX * .45} y2={previewHeight} />
            <text x={previewWidth + frontMarginX * .63} y={previewHeight / 2}
              fontSize={frontFont} textAnchor="middle"
              transform={`rotate(90 ${previewWidth + frontMarginX * .63} ${previewHeight / 2})`}>
              {cmLabel(previewHeight)}
            </text>
          </g>
        </svg>
        <p className="beam-constructor-view-hint">Kółko myszy przybliża i oddala, przeciąganie przesuwa rzut.</p>
      </section>
      <section className="beam-constructor-section-view">
        <div className="beam-constructor-view-bar">
          <h6>Rzut 2D od boku belki</h6>
          <div className="beam-constructor-view-tools">
            <button type="button" className="quiet-button" onClick={() => zoomSection(1 / 1.25)}
              aria-label="Oddal rzut boczny">−</button>
            <span>{Math.round(sectionZoom * 100)}%</span>
            <button type="button" className="quiet-button" onClick={() => zoomSection(1.25)}
              aria-label="Przybliż rzut boczny">+</button>
            <button type="button" className="quiet-button" onClick={resetSectionView}>Dopasuj widok</button>
          </div>
        </div>
        <svg ref={sectionSvg} className="beam-constructor-drawing beam-constructor-drawing-pannable"
          role="img" aria-label="Rzut 2D od boku belki"
          viewBox={`${sectionView.x} ${sectionView.y} ${sectionView.width} ${sectionView.height}`}
          onPointerDown={startSectionPan} onPointerMove={moveSectionPan}
          onPointerUp={endSectionPan} onPointerCancel={endSectionPan}>
          <rect width={assembly.widthMm} height={previewHeight} rx={Math.min(40, assembly.widthMm * .08)}
            className="beam-constructor-concrete" fill="#e0f2fe" stroke="#475569" />
          <g className="beam-constructor-material-label" pointerEvents="none">
            <line x1={assembly.widthMm * .12} y1={previewHeight}
              x2={assembly.widthMm * .12} y2={previewHeight + sectionMargin * .72} />
            <text x={assembly.widthMm * .12} y={previewHeight + sectionMargin * .82}
              fontSize={sectionFont * .82} textAnchor="middle">BETON</text>
          </g>
          {mainBarCorners.map((corner) => <circle key={corner.id}
            className="beam-constructor-main-bar-section" data-main-bar-corner={corner.id}
            data-bundle-index={corner.bundleIndex}
            cx={sectionMainBarAnchor.x + corner.transverseOffsetMm}
            cy={sectionMainBarAnchor.y - corner.verticalOffsetMm}
            r={(assembly.standardMainBars?.diameterMm ?? 0) / 2} />)}
          {resolvedCustomBars.map((bar) => <circle key={bar.id}
            className="beam-constructor-custom-main-bar-section" data-custom-main-bar={bar.id}
            cx={sectionMainBarAnchor.x + bar.transverseMm} cy={sectionMainBarAnchor.y - bar.verticalMm}
            r={bar.diameterMm / 2} fill={customBarColor} />)}
          {sectionStirrups.map((item) => <polyline key={item.key} points={item.points}
            data-bundle-index={item.bundleIndex} data-stirrup-type={item.typeIndex + 1}
            data-stirrup-color={item.color} data-stirrup-zone-indexes={item.zoneIndexes.join(",")}
            className="beam-constructor-stirrup-outline" fill="none" stroke={item.color}
            strokeWidth={item.diameterMm} strokeLinejoin="round" strokeLinecap="round" />)}
          {sectionStirrups.map((item, dimensionIndex) => {
            const lineY = Math.min(item.top, 0) - sectionMargin * (.2 + dimensionIndex * .18);
            const lineX = Math.min(item.left, 0) - sectionMargin * (.2 + dimensionIndex * .18);
            const tick = sectionFont * .26;
            const zonesLabel = item.zoneIndexes.length === assembly.zones.length && assembly.zones.length > 1
              ? "wszystkie strefy" : `${item.zoneIndexes.length > 1 ? "strefy" : "strefa"} `
                + item.zoneIndexes.map((index) => index + 1).join(", ");
            const label = `S${item.typeIndex + 1} (${zonesLabel})`;
            return <g key={`stirrup-dimension-${item.key}`} style={{ color: item.color }}
              data-bundle-index={item.bundleIndex} data-stirrup-type={item.typeIndex + 1}>
              <g className="beam-constructor-dimension beam-constructor-bundle-dimension"
                data-dimension="stirrup-width">
                <line x1={item.left} y1={lineY} x2={item.left + item.outline.widthMm} y2={lineY} />
                <line x1={item.left} y1={lineY - tick} x2={item.left} y2={lineY + tick} />
                <line x1={item.left + item.outline.widthMm} y1={lineY - tick}
                  x2={item.left + item.outline.widthMm} y2={lineY + tick} />
                <text x={item.left + item.outline.widthMm / 2} y={lineY - sectionFont * .24}
                  fontSize={sectionFont * .86} textAnchor="middle">
                  {label}: {cmLabel(item.outline.widthMm)}
                </text>
              </g>
              <g className="beam-constructor-dimension beam-constructor-bundle-dimension"
                data-dimension="stirrup-height">
                <line x1={lineX} y1={item.top} x2={lineX} y2={item.top + item.outline.heightMm} />
                <line x1={lineX - tick} y1={item.top} x2={lineX + tick} y2={item.top} />
                <line x1={lineX - tick} y1={item.top + item.outline.heightMm}
                  x2={lineX + tick} y2={item.top + item.outline.heightMm} />
                <text x={lineX - sectionFont * .24} y={item.top + item.outline.heightMm / 2}
                  fontSize={sectionFont * .86} textAnchor="middle"
                  transform={`rotate(-90 ${lineX - sectionFont * .24} ${item.top + item.outline.heightMm / 2})`}>
                  {label}: {cmLabel(item.outline.heightMm)}
                </text>
              </g>
            </g>;
          })}
          {sectionBundleEnvelopes.map((envelope) => {
            const step = sectionStirrups.length;
            const lineY = Math.min(envelope.top, 0) - sectionMargin * (.2 + step * .18);
            const lineX = Math.min(envelope.left, 0) - sectionMargin * (.2 + step * .18);
            const tick = sectionFont * .26;
            const label = `Pakiet ${envelope.count} × strzemię`;
            return <g key={`bundle-envelope-${envelope.zoneId}`} style={{ color: "#1d4ed8" }}
              data-bundle-envelope={envelope.zoneId}>
              {envelope.spansWidth && <g className="beam-constructor-dimension beam-constructor-bundle-dimension"
                data-dimension="bundle-width">
                <line x1={envelope.left} y1={lineY} x2={envelope.left + envelope.widthMm} y2={lineY} />
                <line x1={envelope.left} y1={lineY - tick} x2={envelope.left} y2={lineY + tick} />
                <line x1={envelope.left + envelope.widthMm} y1={lineY - tick}
                  x2={envelope.left + envelope.widthMm} y2={lineY + tick} />
                <text x={envelope.left + envelope.widthMm / 2} y={lineY - sectionFont * .24}
                  fontSize={sectionFont * .86} textAnchor="middle">
                  {label}: {cmLabel(envelope.widthMm)}
                </text>
              </g>}
              {envelope.spansHeight && <g className="beam-constructor-dimension beam-constructor-bundle-dimension"
                data-dimension="bundle-height">
                <line x1={lineX} y1={envelope.top} x2={lineX} y2={envelope.top + envelope.heightMm} />
                <line x1={lineX - tick} y1={envelope.top} x2={lineX + tick} y2={envelope.top} />
                <line x1={lineX - tick} y1={envelope.top + envelope.heightMm}
                  x2={lineX + tick} y2={envelope.top + envelope.heightMm} />
                <text x={lineX - sectionFont * .24} y={envelope.top + envelope.heightMm / 2}
                  fontSize={sectionFont * .86} textAnchor="middle"
                  transform={`rotate(-90 ${lineX - sectionFont * .24} ${envelope.top + envelope.heightMm / 2})`}>
                  {label}: {cmLabel(envelope.heightMm)}
                </text>
              </g>}
            </g>;
          })}
          <g className="beam-constructor-dimension" data-dimension="width">
            <line x1={0} y1={previewHeight} x2={0} y2={previewHeight + sectionMargin * .42} />
            <line x1={assembly.widthMm} y1={previewHeight}
              x2={assembly.widthMm} y2={previewHeight + sectionMargin * .42} />
            <line x1={0} y1={previewHeight + sectionMargin * .42}
              x2={assembly.widthMm} y2={previewHeight + sectionMargin * .42} />
            <text x={assembly.widthMm / 2} y={previewHeight + sectionMargin * .42 - sectionFont * .28}
              fontSize={sectionFont} textAnchor="middle">{cmLabel(assembly.widthMm)}</text>
          </g>
          <g className="beam-constructor-dimension" data-dimension="section-height">
            <line x1={assembly.widthMm} y1={0} x2={assembly.widthMm + sectionMargin * .42} y2={0} />
            <line x1={assembly.widthMm} y1={previewHeight}
              x2={assembly.widthMm + sectionMargin * .42} y2={previewHeight} />
            <line x1={assembly.widthMm + sectionMargin * .42} y1={0}
              x2={assembly.widthMm + sectionMargin * .42} y2={previewHeight} />
            <text x={assembly.widthMm + sectionMargin * .64} y={previewHeight / 2}
              fontSize={sectionFont} textAnchor="middle"
              transform={`rotate(90 ${assembly.widthMm + sectionMargin * .64} ${previewHeight / 2})`}>
              {cmLabel(previewHeight)}
            </text>
          </g>
        </svg>
        <p className="beam-constructor-view-hint">Kółko myszy przybliża i oddala, przeciąganie przesuwa rzut.
          Strzemiona są rysowane w rzeczywistej skali swojego kształtu.</p>
      </section>
      <section><h6>Interaktywny podgląd 3D</h6>
        <Reinforcement3dView bars={previewBars} concreteWidthMm={assembly.widthMm}
          concreteHeightMm={assembly.heightMm} offsetsByBarId={previewOffsets} />
      </section>
    </div>
    <section className="beam-constructor-zones" aria-label="Strefy strzemion">
      <div className="beam-constructor-section-heading">
        <div><h6>1. Strzemiona</h6><p>Kolejna strefa rozpoczyna się automatycznie tam, gdzie kończy się poprzednia.</p></div>
        <span>Pozostało {cmLabel(Math.max(0, remainingMm))}</span>
      </div>
      {stirrupConnectionIssues.map((issue) => <p key={`${issue.code}-${issue.zoneIndexes.join("-")}`}
        role="alert" className="beam-constructor-connection-error" data-connection-issue={issue.code}>
        <strong>Błąd ciągłości geometrii:</strong> {issue.message}
      </p>)}
      <div className="beam-constructor-zone-grid">
        {assembly.zones.map((zone, zoneIndex) => <article className="beam-constructor-zone" key={zone.id}
          data-zone-id={zone.id}>
          <ReinforcementShapePreview shape={zone.shape} label={zone.shapeName} compact />
          <div className="beam-constructor-zone-title">
            <strong>Strefa {zoneIndex + 1}: {zone.shapeName}</strong>
            <span>{cm(zone.startMm)}–{cm(zone.endMm)} cm</span>
            {zone.oversizeAccepted && <em className="beam-constructor-oversize-badge">Strzemię wystaje ponad beton</em>}
          </div>
          <div className="beam-constructor-fields">
            <div className="beam-constructor-zone-length">
              <label>Długość strefy (cm)<input type="number" min={0.1} step={0.1}
                max={cm(assembly.lastStirrupMm - zone.startMm)} value={cm(zone.endMm - zone.startMm)}
                onChange={(event) => updateZone(zoneIndex,
                  { endMm: zone.startMm + Number(event.target.value) * 10 })} /></label>
              <button type="button" className="quiet-button" onClick={() => fillZoneToBeamEnd(zoneIndex)}
                title="Wypełnij tą strefą cały pozostały dostępny zakres belki">Cała belka</button>
            </div>
            <label>Rozstaw podstawowy (cm)<input type="number" min={0.1} step={0.1} value={cm(zone.spacingMm)}
              onChange={(event) => updateZone(zoneIndex, { spacingMm: Number(event.target.value) * 10 })} /></label>
            <label>Strzemiona obok siebie<select value={zone.bundleCount}
              onChange={(event) => updateZone(zoneIndex, { bundleCount: Number(event.target.value) })}>
              {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
            </select></label>
            <label>Kierunek kolejnych strzemion<select disabled={zone.bundleCount === 1}
              value={zone.bundleDirection ?? "right"}
              onChange={(event) => updateZone(zoneIndex, { bundleDirection: event.target.value as BundleDirection })}>
              {bundleDirections.map((direction) =>
                <option key={direction.value} value={direction.value}>{direction.label}</option>)}
            </select></label>
            <label>Przesunięcie kolejnego (cm)<input type="number" min={0} step={0.1}
              disabled={zone.bundleCount === 1} value={cm(zone.bundleGapMm)}
              onChange={(event) => updateZone(zoneIndex, { bundleGapMm: Number(event.target.value) * 10 })} /></label>
            {stirrupDimensionReferences
              && reinforcementShapeOutline(zone.shape).widthMm > stirrupDimensionReferences.widthMm + 0.001
              && <label>Wyrównanie szerszego strzemienia
                <select aria-label={`Wyrównanie szerokości strefy ${zoneIndex + 1}`}
                  value={zone.widthAlignment ?? "center"}
                  onChange={(event) => updateZone(zoneIndex, {
                    widthAlignment: event.target.value as ReinforcementStirrupZone["widthAlignment"],
                  })}>
                  <option value="center">Pośrodku osi belki</option>
                  <option value="left">Lewą krawędzią do najmniejszego strzemienia</option>
                  <option value="right">Prawą krawędzią do najmniejszego strzemienia</option>
                </select>
              </label>}
            {stirrupDimensionReferences
              && reinforcementShapeOutline(zone.shape).heightMm > stirrupDimensionReferences.heightMm + 0.001
              && <label>Wyrównanie wyższego strzemienia
                <select aria-label={`Wyrównanie wysokości strefy ${zoneIndex + 1}`}
                  value={zone.heightAlignment
                    ?? (reinforcementShapeOutline(zone.shape).heightMm > assembly.heightMm + 0.001
                      ? "bottom" : "center")}
                  onChange={(event) => updateZone(zoneIndex, {
                    heightAlignment: event.target.value as ReinforcementStirrupZone["heightAlignment"],
                  })}>
                  <option value="center">Pośrodku wysokości najmniejszego</option>
                  <option value="top">Górną krawędzią do najmniejszego strzemienia</option>
                  <option value="bottom">Dolną krawędzią do najmniejszego strzemienia</option>
                </select>
              </label>}
          </div>
          {stirrupDimensionReferences && <p className="beam-constructor-bundle-note">
            Wyrównanie dotyczy osobno szerokości i wysokości względem najmniejszego obrysu strzemienia
            ({cmLabel(stirrupDimensionReferences.widthMm)} × {cmLabel(stirrupDimensionReferences.heightMm)}).
            Przy większym strzemieniu możesz zmienić obie osie niezależnie. Pakiet zachowuje dodatkowe
            przesunięcie ustawione kierunkiem i odstępem.
          </p>}
          {zone.bundleCount > 1 && <p className="beam-constructor-bundle-note">
            Wszystkie {zone.bundleCount} strzemiona mają ten sam rozstaw wzdłuż belki. Każde kolejne jest
            przesunięte {cmLabel(zone.bundleGapMm)} {bundleDirections.find((item) =>
              item.value === (zone.bundleDirection ?? "right"))?.label.toLocaleLowerCase("pl")}.
          </p>}
          <div className="beam-constructor-concentrations">
            {zone.concentrations.map((item, concentrationIndex) => <fieldset key={item.id}>
              <legend>Zagęszczenie {concentrationIndex + 1}</legend>
              <label>Początek od strefy (cm)<input type="number" min={0} step={0.1}
                max={cm(zone.endMm - zone.startMm - 1)} value={cm(item.startMm - zone.startMm)}
                onChange={(event) => {
                  const startMm = zone.startMm + Number(event.target.value) * 10;
                  updateConcentration(zoneIndex, concentrationIndex, {
                    startMm,
                    endMm: Math.min(zone.endMm, startMm + (item.endMm - item.startMm)),
                  });
                }} /></label>
              <label>Długość (cm)<input type="number" min={0.1} step={0.1}
                max={cm(zone.endMm - item.startMm)} value={cm(item.endMm - item.startMm)}
                onChange={(event) => updateConcentration(zoneIndex, concentrationIndex,
                  { endMm: item.startMm + Number(event.target.value) * 10 })} /></label>
              <label>Rozstaw (cm)<input type="number" min={0.1} step={0.1} value={cm(item.spacingMm)}
                onChange={(event) => updateConcentration(zoneIndex, concentrationIndex,
                  { spacingMm: Number(event.target.value) * 10 })} /></label>
              <label>Pakiet<select value={item.bundleCount}
                onChange={(event) => updateConcentration(zoneIndex, concentrationIndex,
                  { bundleCount: Number(event.target.value) })}>
                {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} szt.</option>)}
              </select></label>
              <label>Kierunek pakietu<select disabled={item.bundleCount === 1}
                value={item.bundleDirection ?? zone.bundleDirection ?? "right"}
                onChange={(event) => updateConcentration(zoneIndex, concentrationIndex,
                  { bundleDirection: event.target.value as BundleDirection })}>
                {bundleDirections.map((direction) =>
                  <option key={direction.value} value={direction.value}>{direction.label}</option>)}
              </select></label>
              <label>Przesunięcie pakietu (cm)<input type="number" min={0} step={0.1}
                disabled={item.bundleCount === 1} value={cm(item.bundleGapMm)}
                onChange={(event) => updateConcentration(zoneIndex, concentrationIndex,
                  { bundleGapMm: Number(event.target.value) * 10 })} /></label>
              <button type="button" className="quiet-button" onClick={() => updateZone(zoneIndex, {
                concentrations: zone.concentrations.filter((_, index) => index !== concentrationIndex),
              })}>Usuń zagęszczenie</button>
            </fieldset>)}
          </div>
          <div className="cad-reinforcement-bar-actions">
            <button type="button" className="quiet-button" onClick={() => addConcentration(zoneIndex)}>
              Dodaj zagęszczenie w dowolnym miejscu
            </button>
            <button type="button" className="quiet-button" onClick={() => removeZone(zoneIndex)}>Usuń strefę</button>
          </div>
        </article>)}
        <button type="button" className="beam-constructor-add-zone"
          disabled={remainingMm <= 0} onClick={openPicker}>
          <span aria-hidden="true">+</span><strong>Dodaj strzemiona</strong>
          <small>Wybierz kształt z Twojej biblioteki</small>
        </button>
      </div>
    </section>
    <section className="beam-constructor-main-bars" aria-label="Druty główne belki">
      <div className="beam-constructor-section-heading">
        <div><h6>2. Druty główne</h6>
          <p>Standardowy układ prowadzi cztery druty przez narożniki najmniejszego strzemienia. Gdy strzemiona
            stoją obok siebie w pakiecie, komplet czterech drutów powstaje w każdym strzemieniu pakietu.</p>
        </div>
        <span>{mainBarCorners.length + resolvedCustomBars.length
          ? `${mainBarCorners.length + resolvedCustomBars.length} szt.` : "Brak drutów"}</span>
      </div>
      {!assembly.zones.length && <p className="beam-constructor-view-hint">
        Najpierw dodaj strzemię. Jego najmniejszy zapisany obrys wyznaczy cztery narożniki drutów.
      </p>}
      <div className="beam-constructor-main-bar-grid">
        {!assembly.standardMainBars && <button type="button"
          className="beam-constructor-add-zone beam-constructor-add-standard-bars"
          disabled={!assembly.zones.length} onClick={addStandardMainBars}
          aria-label="Dodaj standardowe druty">
          <span aria-hidden="true">4</span><strong>Dodaj standardowe druty</strong>
          <small>Cztery pręty w narożnikach każdego najmniejszego strzemienia.</small>
        </button>}
        {assembly.standardMainBars && <article className="beam-constructor-main-bar-card"
          aria-label="Standardowe druty narożne">
          <svg role="img"
            aria-label="Standardowe druty w narożnikach każdego najmniejszego strzemienia"
            viewBox={`${cardView.x} ${cardView.y} ${cardView.width} ${cardView.height}`}>
            <rect width={assembly.widthMm} height={assembly.heightMm} rx={Math.min(40, assembly.widthMm * .08)}
              className="beam-constructor-concrete" />
            {mainBarCorners.map((corner) => <circle key={corner.id}
              data-main-bar-corner={corner.id} data-bundle-index={corner.bundleIndex}
              cx={assembly.widthMm / 2 + corner.transverseOffsetMm}
              cy={assembly.heightMm / 2 - corner.verticalOffsetMm}
              r={assembly.standardMainBars!.diameterMm / 2}
              className="beam-constructor-main-bar-section" />)}
            {mainBarReference && mainBarBundles.map((bundle) => <rect key={bundle.bundleIndex}
              data-bundle-index={bundle.bundleIndex}
              x={(assembly.widthMm - mainBarReference.widthMm) / 2 + bundle.transverseOffsetMm}
              y={(assembly.heightMm - mainBarReference.heightMm) / 2 - bundle.verticalOffsetMm}
              width={mainBarReference.widthMm}
              height={mainBarReference.heightMm}
              strokeWidth={Math.max(1, mainBarReference.stirrupDiameterMm)}
              className="beam-constructor-smallest-stirrup" />)}
          </svg>
          <div>
            <strong>Standardowe druty narożne</strong>
            <span>{mainBarCorners.length} szt. · długość {cmLabel(assembly.lengthMm)}</span>
          </div>
          <label>Grubość drutu Ø (mm)<input type="number" min={1} max={100} step={0.5}
            value={assembly.standardMainBars.diameterMm}
            onChange={(event) => setAssembly((current) => ({
              ...current,
              standardMainBars: { diameterMm: Number(event.target.value) },
            }))} /></label>
          <p>Położenie aktualizuje się automatycznie według najmniejszego strzemienia w tej belce.</p>
          <button type="button" className="quiet-button" onClick={removeStandardMainBars}>
            Usuń standardowe druty
          </button>
        </article>}
        {(assembly.customMainBars ?? []).map(renderCustomMainBarCard)}
        <button type="button" className="beam-constructor-add-zone beam-constructor-add-custom-bars"
          disabled={!assembly.zones.length} onClick={openCustomBars} aria-label="Dodaj niestandardowe druty">
          <span aria-hidden="true">+</span><strong>Druty niestandardowe</strong>
          <small>Wstaw drut w wolny slot strzemienia — narożnik, środek boku lub co ok. 2 cm.</small>
        </button>
      </div>
    </section>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {!parsed.success && !error && <p role="status" className="alert alert-warning">
      {parsed.error.issues[0]?.message}
    </p>}
    <div className="cad-reinforcement-bar-actions">
      <button type="button" onClick={save} disabled={!assembly.zones.length}>Zapisz konstrukcję belki</button>
      <span>{placements.length} szt. strzemion · {mainBarCorners.length + resolvedCustomBars.length} szt. drutów
        głównych w podglądzie</span>
    </div>
    <dialog ref={oversizeDialog} className="beam-constructor-picker beam-constructor-oversize-dialog"
      aria-labelledby={oversizeTitleId} onCancel={(event) => event.preventDefault()}>
      <header>
        <div><span>Wymaga potwierdzenia</span>
          <h5 id={oversizeTitleId}>Strzemię jest wyższe niż zalewany etap</h5>
          <p>Sprawdź geometrię przed przypisaniem kształtu do belki.</p>
        </div>
      </header>
      {pendingOversize && <div className="beam-constructor-oversize-dialog-body" role="alert">
        <ReinforcementShapePreview shape={pendingOversize.shape} label={pendingOversize.name} compact />
        <div className="beam-constructor-oversize-summary">
          <strong>{pendingOversize.name}</strong>
          <dl>
            <div><dt>Wysokość strzemienia</dt><dd>{cmLabel(pendingOversizeHeightMm)}</dd></div>
            <div><dt>Wysokość betonu</dt><dd>{cmLabel(assembly.heightMm)}</dd></div>
            <div><dt>Wystawanie ponad beton</dt>
              <dd>{cmLabel(pendingOversizeHeightMm - assembly.heightMm)}</dd></div>
          </dl>
          <p>Po potwierdzeniu strzemię zostanie narysowane jako wystające ponad beton, a belka otrzyma status
            „do weryfikacji”. Nie jest to potwierdzenie poprawności konstrukcyjnej.</p>
        </div>
      </div>}
      <footer>
        <button type="button" className="quiet-button" onClick={() => {
          oversizeDialog.current?.close();
          setPendingOversize(null);
          openPicker();
        }}>Wybierz inne</button>
        <button type="button" onClick={() => {
          if (!pendingOversize) return;
          createZone(pendingOversize, true);
          oversizeDialog.current?.close();
          setPendingOversize(null);
        }}>Potwierdź i oznacz do weryfikacji</button>
      </footer>
    </dialog>
    <dialog ref={customBarsDialog} className="beam-constructor-picker beam-constructor-custom-bars-dialog"
      aria-labelledby={customBarsTitleId}>
      <header><div><span>Druty niestandardowe</span><h5 id={customBarsTitleId}>Wstaw drut w slot strzemienia</h5>
        <p>Wybierz strefę strzemion, a potem wolny slot. Czerwone sloty są zajęte przez istniejące druty.</p></div>
        <button type="button" className="quiet-button" onClick={() => customBarsDialog.current?.close()}>Zamknij</button>
      </header>
      <div className="beam-constructor-custom-bars-body">
        <section className="beam-constructor-custom-3d" aria-label="Model 3D belki od frontu">
          <Reinforcement3dView bars={previewBars} concreteWidthMm={assembly.widthMm}
            concreteHeightMm={assembly.heightMm} offsetsByBarId={previewOffsets}
            lockedRotation={frontLockedRotation} highlightedBarIds={activeZoneStirrupIds}
            label="Model 3D belki od frontu — widok zablokowany" />
        </section>
        <div className="beam-constructor-custom-zones" role="group" aria-label="Strefy strzemion belki">
          {assembly.zones.map((zone, zoneIndex) => <button type="button" key={zone.id}
            className="beam-constructor-custom-zone" aria-pressed={zone.id === activeCustomZone?.id}
            data-custom-zone={zone.id} onClick={() => setCustomZoneId(zone.id)}>
            <ReinforcementShapePreview shape={zone.shape} label={zone.shapeName} compact />
            <strong>Strefa {zoneIndex + 1}: {zone.shapeName}</strong>
            <small>{cm(zone.startMm)}–{cm(zone.endMm)} cm{zone.bundleCount > 1 ? ` · ${zone.bundleCount} obok siebie` : ""}</small>
          </button>)}
        </div>
        <div className="beam-constructor-custom-workspace">
          <section className="beam-constructor-slot-view">
            <h6>Strefa {activeZoneIndex + 1}: sloty wzdłuż drutu strzemienia</h6>
            <svg role="img" aria-label="Sloty na druty w przekroju strzemienia"
              viewBox={`${customSectionView.x} ${customSectionView.y} ${customSectionView.width} ${customSectionView.height}`}>
              <rect width={assembly.widthMm} height={assembly.heightMm} rx={Math.min(40, assembly.widthMm * .08)}
                fill="#e0f2fe" stroke="#94a3b8" />
              {zoneStirrups.filter((item) => item.zoneId === activeCustomZone?.id).map((item) => <polyline
                key={item.key} points={item.points} fill="none" stroke={item.color} strokeWidth={item.diameterMm}
                strokeLinejoin="round" strokeLinecap="round" />)}
              {mainBarCorners.map((corner) => <circle key={corner.id} fill="#475569"
                cx={sectionPointX(corner.transverseOffsetMm)} cy={sectionPointY(corner.verticalOffsetMm)}
                r={(assembly.standardMainBars?.diameterMm ?? 0) / 2} />)}
              {resolvedCustomBars.filter((bar) => activeCustomZone && bar.startMm < activeCustomZone.endMm
                && bar.endMm > activeCustomZone.startMm).map((bar) => <circle key={bar.id} fill={customBarColor}
                cx={sectionPointX(bar.transverseMm)} cy={sectionPointY(bar.verticalMm)} r={bar.diameterMm / 2} />)}
              {customSlots.map((slot) => {
                const occupied = Boolean(slot.occupiedBy);
                const label = `${occupied ? "Zajęty" : slot.fullBeam ? "Wolny" : "Wolny (tylko docinka)"} slot: `
                  + slotLabel(slot, activeZoneBundled);
                return <circle key={slot.id} className="beam-constructor-slot" role="button"
                  tabIndex={occupied ? -1 : 0} aria-label={label} aria-disabled={occupied || undefined}
                  data-slot-id={slot.id} data-slot-kind={slot.kind}
                  data-slot-state={occupied ? "occupied" : "free"}
                  data-full-beam={occupied ? undefined : slot.fullBeam ? "yes" : "no"}
                  cx={sectionPointX(slot.transverseMm)} cy={sectionPointY(slot.verticalMm)}
                  r={slot.kind === "edge" ? slotRadiusMm * .8 : slotRadiusMm}
                  fill={occupied ? "#dc2626" : !slot.fullBeam ? "#fde68a" : slot.kind === "edge" ? "#ffffff" : "#bbf7d0"}
                  fillOpacity={occupied ? .85 : 1}
                  stroke={occupied ? "#7f1d1d" : slot.fullBeam ? "#15803d" : "#b45309"}
                  strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  onClick={() => addCustomMainBar(slot)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    addCustomMainBar(slot);
                  }}><title>{label}</title></circle>;
              })}
            </svg>
            <ul className="beam-constructor-slot-legend">
              <li><i data-legend="corner" />Narożnik / środek boku</li>
              <li><i data-legend="edge" />Slot co ok. 2 cm</li>
              <li><i data-legend="cut" />Wolny tylko jako docinka — nie istnieje lub jest zajęty w innym strzemieniu</li>
              <li><i data-legend="occupied" />Zajęty — nie można wybrać</li>
            </ul>
          </section>
          <aside className="beam-constructor-custom-side">
            <label>Grubość nowego drutu Ø (mm)<input type="number" min={1} max={100} step={0.5}
              value={customDiameterMm} onChange={(event) => setCustomDiameterMm(Number(event.target.value))} /></label>
            <p>{freeSlotCount} wolnych slotów z {customSlots.length}. Drut „przez całą belkę” jest możliwy tylko
              w slocie, który istnieje i jest wolny w <strong>każdym</strong> strzemieniu belki (zielone sloty) —
              wtedy zajmuje go w każdym z nich. Bursztynowe sloty istnieją tylko w części strzemion
              (np. 30 / 50 / 30 cm): taki drut jest docinką, a w kafelku wybierasz stronę, od której go dodajesz.</p>
            <div className="beam-constructor-custom-list">
              {(assembly.customMainBars ?? []).map(renderCustomMainBarCard)}
            </div>
          </aside>
        </div>
      </div>
    </dialog>
    <dialog ref={pickerDialog} className="beam-constructor-picker" aria-labelledby={pickerTitleId}>
      <header><div><span>Biblioteka użytkownika</span><h5 id={pickerTitleId}>Wybierz strzemię do kolejnej strefy</h5>
        <p>Kliknij kafelek, aby przypisać kształt do belki.</p></div>
        <button type="button" className="quiet-button" onClick={() => pickerDialog.current?.close()}>Zamknij</button>
      </header>
      <div className="beam-constructor-picker-toolbar">
        <label>
          <span>Wyszukaj po nazwie lub średnicy</span>
          <input type="search" value={pickerQuery} autoFocus placeholder="np. prostokątne, Ø8 lub fi10"
            onChange={(event) => setPickerQuery(event.target.value)} />
        </label>
        <strong>{filteredStirrups.length} z {stirrups.length} strzemion</strong>
      </div>
      <div className="beam-constructor-picker-content">
        {filteredStirrups.length ? <div className="cad-reinforcement-shape-grid beam-constructor-picker-grid">
          {filteredStirrups.map((item) => <button type="button"
            className="cad-reinforcement-shape-card beam-constructor-picker-card"
            key={item.id} onClick={() => addZone(item)}>
            <ReinforcementShapePreview shape={item.shape} label={item.name} compact />
            <div><strong>{item.name}</strong><span>Strzemię · Ø{item.shape.diameterMm ?? "—"} mm</span></div>
            <small>{item.shape.bends.length} {item.shape.bends.length === 1 ? "część" : "części"}</small>
          </button>)}
        </div> : <div className="beam-constructor-picker-empty">
          <span aria-hidden="true">⌕</span>
          <strong>{stirrups.length ? "Brak pasujących strzemion" : "Biblioteka nie zawiera jeszcze strzemion"}</strong>
          <p>{stirrups.length ? "Zmień wyszukiwaną nazwę lub średnicę."
            : "Dodaj kształty w kroku 1 „Przygotowanie strzemion i podgięć”."}</p>
        </div>}
      </div>
    </dialog>
  </section>;
}
