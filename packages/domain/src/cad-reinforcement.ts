import { CadDocumentSchema, CadEntitySchema, ReinforcementBeamAssemblySchema, ReinforcementLayoutSchema, ReinforcementShapeSchema,
  ReinforcementTemplateSchema, type ReinforcementLayout, type CadEntity, type CadDocument,
  type ReinforcementShape, type CadPoint, type ReinforcementHostChain,
  type ReinforcementTemplate, type ReinforcementBeamAssembly } from "@asystent/schemas";
export { ReinforcementLayoutSchema, type ReinforcementLayout } from "@asystent/schemas";

export type ReinforcementScheduleRow = {
  position: number;
  diameterMm: number;
  steelGrade: string;
  layerId: string;
  shape: string;
  developedLengthMm: number;
  quantity: number;
  totalLengthM: number;
  unitMassKg: number;
  totalMassKg: number;
};

export type ReinforcementValidationIssue = {
  code: "missing-material" | "outside-cover" | "collision" | "placement-review" | "bend-radius" | "incomplete-lap";
  severity: "warning" | "error";
  message: string;
  entityIds: string[];
};

export type BeamStirrupPlacement = {
  stationMm: number;
  transverseOffsetMm: number;
  verticalOffsetMm: number;
  bundleIndex: number;
  bundleCount: number;
  zoneId: string;
  shapeName: string;
  shape: ReinforcementShape;
};

export type BeamHostStation = {
  hostId: string;
  lengthMm: number;
};

export function locateBeamHostStation(hosts: readonly BeamHostStation[], stationMm: number) {
  if (!Number.isFinite(stationMm) || stationMm < 0) {
    throw new Error("Pozycja strzemienia na belce musi być nieujemną liczbą.");
  }
  if (!hosts.length || hosts.some((host) => !host.hostId || !Number.isFinite(host.lengthMm) || host.lengthMm <= 0)) {
    throw new Error("Belka musi zawierać co najmniej jeden host o dodatniej długości.");
  }
  let offsetMm = 0;
  for (const [index, host] of hosts.entries()) {
    const isLast = index === hosts.length - 1;
    if (stationMm <= offsetMm + host.lengthMm + 0.001 || isLast) {
      if (stationMm > offsetMm + host.lengthMm + 0.001) {
        throw new Error("Pozycja strzemienia przekracza długość belki.");
      }
      return {
        hostId: host.hostId,
        stationOnHostMm: Math.max(0, Math.min(host.lengthMm, stationMm - offsetMm)),
      };
    }
    offsetMm += host.lengthMm;
  }
  throw new Error("Nie udało się przypisać pozycji strzemienia do hosta.");
}

function spacedStations(startMm: number, endMm: number, spacingMm: number): number[] {
  const stations: number[] = [];
  for (let station = startMm; station <= endMm + 0.001; station += spacingMm) {
    stations.push(Math.min(station, endMm));
  }
  return stations;
}

function bundledStations(stations: number[], count: number, gapMm: number,
  direction: "left" | "right" | "up" | "down") {
  return stations.flatMap((stationMm) => Array.from({ length: count }, (_, bundleIndex) => {
    const offsetMm = bundleIndex * gapMm;
    return {
      stationMm,
      transverseOffsetMm: direction === "left" ? -offsetMm : direction === "right" ? offsetMm : 0,
      verticalOffsetMm: direction === "down" ? -offsetMm : direction === "up" ? offsetMm : 0,
      bundleIndex,
      bundleCount: count,
    };
  }));
}

export function beamStirrupPlacements(assembly: ReinforcementBeamAssembly): BeamStirrupPlacement[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const dimensions = parsed.zones.map((zone) => reinforcementShapeOutline(zone.shape));
  const minimumWidthMm = Math.min(...dimensions.map((item) => item.widthMm));
  const minimumHeightMm = Math.min(...dimensions.map((item) => item.heightMm));
  const referenceVerticalMm = beamStirrupCenterVerticalMm(parsed.heightMm, minimumHeightMm);
  const placements = parsed.zones.flatMap((zone) => {
    const outline = reinforcementShapeOutline(zone.shape);
    const widthDeltaMm = Math.max(0, outline.widthMm - minimumWidthMm);
    const heightDeltaMm = Math.max(0, outline.heightMm - minimumHeightMm);
    const widthAlignment = zone.widthAlignment ?? "center";
    const heightAlignment = zone.heightAlignment
      ?? (outline.heightMm > parsed.heightMm + 0.001 ? "bottom" : "center");
    const transverseAlignmentMm = widthAlignment === "left" ? widthDeltaMm / 2
      : widthAlignment === "right" ? -widthDeltaMm / 2 : 0;
    const verticalAlignmentMm = heightAlignment === "top" ? -heightDeltaMm / 2
      : heightAlignment === "bottom" ? heightDeltaMm / 2 : 0;
    const base = spacedStations(zone.startMm, zone.endMm, zone.spacingMm)
      .filter((station) => !zone.concentrations.some((item) =>
        station >= item.startMm - 0.001 && station <= item.endMm + 0.001));
    const stations = [
      ...bundledStations(base, zone.bundleCount, zone.bundleGapMm, zone.bundleDirection ?? "right"),
      ...zone.concentrations.flatMap((item) => bundledStations(
        spacedStations(item.startMm, item.endMm, item.spacingMm),
        item.bundleCount,
        item.bundleGapMm,
        item.bundleDirection ?? zone.bundleDirection ?? "right",
      )),
    ];
    return stations.map((station) => ({
      ...station,
      stationMm: Math.round(station.stationMm * 1000) / 1000,
      transverseOffsetMm: Math.round((station.transverseOffsetMm + transverseAlignmentMm) * 1000) / 1000,
      verticalOffsetMm: Math.round((station.verticalOffsetMm + referenceVerticalMm + verticalAlignmentMm) * 1000) / 1000,
      zoneId: zone.id,
      shapeName: zone.shapeName,
      shape: zone.shape,
    }));
  });
  const unique = new Map<string, BeamStirrupPlacement[]>();
  for (const placement of placements) {
    const stationKey = placement.stationMm.toFixed(3);
    const existing = unique.get(stationKey);
    if (!existing || existing[0]?.zoneId !== placement.zoneId) {
      unique.set(stationKey, [placement]);
    } else {
      existing.push(placement);
    }
  }
  const result = [...unique.values()].flat().sort((left, right) =>
    left.stationMm - right.stationMm || left.bundleIndex - right.bundleIndex);
  if (result.length > 1000) throw new Error("Układ przekracza limit 1000 strzemion.");
  return result;
}

type LinearHost = Extract<CadEntity, { kind: "wall" | "footing" | "construction-line" }>;

function linearHost(entity: CadEntity | undefined): entity is LinearHost {
  return !!entity && (entity.kind === "wall" || entity.kind === "footing" || entity.kind === "construction-line");
}

function hostFingerprint(hosts: readonly LinearHost[]): string {
  return hosts.map((host) => [
    host.id,
    host.geometry.start.x, host.geometry.start.y,
    host.geometry.end.x, host.geometry.end.y,
    host.kind === "wall" ? host.attributes.thicknessMm
      : host.kind === "footing" ? host.attributes.widthMm : host.attributes.widthMm,
  ].join(":")).join("|");
}

function pointsEqual(a: CadPoint, b: CadPoint, toleranceMm = 0.001): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= toleranceMm;
}

function collinearHosts(left: LinearHost, right: LinearHost, toleranceMm: number): boolean {
  const leftDx = left.geometry.end.x - left.geometry.start.x;
  const leftDy = left.geometry.end.y - left.geometry.start.y;
  const rightDx = right.geometry.end.x - right.geometry.start.x;
  const rightDy = right.geometry.end.y - right.geometry.start.y;
  const leftLength = Math.hypot(leftDx, leftDy);
  const rightLength = Math.hypot(rightDx, rightDy);
  if (leftLength <= toleranceMm || rightLength <= toleranceMm) return false;
  const parallelError = Math.abs(leftDx * rightDy - leftDy * rightDx) / (leftLength * rightLength);
  if (parallelError > 0.001) return false;
  return [left.geometry.start, left.geometry.end].some((leftPoint) =>
    [right.geometry.start, right.geometry.end].some((rightPoint) =>
      pointsEqual(leftPoint, rightPoint, toleranceMm)));
}

export function groupCollinearReinforcementHosts(
  entities: readonly CadEntity[],
  toleranceMm = 1,
): CadEntity[][] {
  const linear = entities.filter(linearHost);
  const linearIds = new Set(linear.map((entity) => entity.id));
  const groups: CadEntity[][] = [];
  const visited = new Set<string>();
  for (const start of linear) {
    if (visited.has(start.id)) continue;
    const group: LinearHost[] = [];
    const queue = [start];
    visited.add(start.id);
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      for (const candidate of linear) {
        if (visited.has(candidate.id) || !collinearHosts(current, candidate, toleranceMm)) continue;
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
    const direction = group[0]!.geometry;
    const dx = direction.end.x - direction.start.x;
    const dy = direction.end.y - direction.start.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    group.sort((left, right) => {
      const leftStation = ((left.geometry.start.x + left.geometry.end.x) / 2) * ux
        + ((left.geometry.start.y + left.geometry.end.y) / 2) * uy;
      const rightStation = ((right.geometry.start.x + right.geometry.end.x) / 2) * ux
        + ((right.geometry.start.y + right.geometry.end.y) / 2) * uy;
      return leftStation - rightStation;
    });
    groups.push(group);
  }
  groups.push(...entities.filter((entity) => !linearIds.has(entity.id)).map((entity) => [entity]));
  return groups;
}

export function createReinforcementHostChain(document: CadDocument, input: {
  id: string;
  name: string;
  elementType: ReinforcementHostChain["elementType"];
  hostIds: string[];
  mainPathHostIds?: string[];
}): CadDocument {
  if (input.hostIds.length < 2) throw new Error("Wybierz co najmniej dwa odcinki elementu zbrojeniowego.");
  const hosts = input.hostIds.map((id) => document.entities.find((entity) => entity.id === id));
  if (!hosts.every(linearHost)) throw new Error("Łączyć można wyłącznie liniowe ściany, ławy i belki z bieżącego rzutu.");
  for (let index = 1; index < hosts.length; index += 1) {
    const previous = hosts[index - 1]!;
    const current = hosts[index]!;
    const connected = [previous.geometry.start, previous.geometry.end].some((a) =>
      [current.geometry.start, current.geometry.end].some((b) => pointsEqual(a, b)));
    if (!connected) throw new Error("Wskazane odcinki nie tworzą ciągłej, uporządkowanej trasy. Zaznacz je kolejno od początku do końca.");
  }
  const chain: ReinforcementHostChain = {
    id: input.id,
    name: input.name,
    elementType: input.elementType,
    hostIds: input.hostIds,
    mainPathHostIds: input.mainPathHostIds ?? input.hostIds,
    status: "draft",
    geometryFingerprint: hostFingerprint(hosts),
  };
  return CadDocumentSchema.parse({
    ...document,
    status: "draft",
    reinforcementChains: [...(document.reinforcementChains ?? []), chain],
  });
}

export function splitReinforcementHostChain(document: CadDocument, chainId: string): CadDocument {
  if (!(document.reinforcementChains ?? []).some((chain) => chain.id === chainId)) {
    throw new Error("Nie znaleziono połączonego elementu zbrojeniowego.");
  }
  return CadDocumentSchema.parse({
    ...document,
    status: "draft",
    reinforcementChains: (document.reinforcementChains ?? []).filter((chain) => chain.id !== chainId),
  });
}

export function synchronizeReinforcementHostChains(document: CadDocument): CadDocument {
  if (!document.reinforcementChains?.length) return document;
  return {
    ...document,
    reinforcementChains: document.reinforcementChains.map((chain) => {
      const hosts = chain.hostIds.map((id) => document.entities.find((entity) => entity.id === id));
      if (!hosts.every(linearHost)) return { ...chain, status: "needs-review" as const };
      const fingerprint = hostFingerprint(hosts);
      return fingerprint === chain.geometryFingerprint ? chain : { ...chain, status: "needs-review" as const };
    }),
  };
}

export function createReinforcementTemplate(input: {
  id: string;
  name: string;
  elementType: ReinforcementTemplate["elementType"];
  entities: readonly CadEntity[];
  createdAt: string;
}): ReinforcementTemplate {
  const bars = input.entities.filter((entity): entity is Extract<CadEntity, { kind: "rebar-line" }> =>
    entity.kind === "rebar-line");
  if (!bars.length) throw new Error("Szablon musi zawierać co najmniej jeden pręt.");
  const origin = bars[0]!.geometry.start;
  return ReinforcementTemplateSchema.parse({
    id: input.id,
    name: input.name,
    elementType: input.elementType,
    bars: bars.map((bar) => ({
      layerId: bar.layerId,
      start: { x: bar.geometry.start.x - origin.x, y: bar.geometry.start.y - origin.y },
      end: { x: bar.geometry.end.x - origin.x, y: bar.geometry.end.y - origin.y },
      diameterMm: bar.attributes.diameterMm,
      count: bar.attributes.count,
      coverMm: bar.attributes.coverMm,
      steelGrade: bar.attributes.steelGrade,
      designReference: bar.attributes.designReference,
      representation: bar.attributes.representation,
      shape: bar.attributes.shape,
    })),
    createdAt: input.createdAt,
  });
}

export function applyReinforcementTemplate(template: ReinforcementTemplate, host: LinearHost,
  createId: () => string): CadEntity[] {
  const parsed = ReinforcementTemplateSchema.parse(template);
  const dx = host.geometry.end.x - host.geometry.start.x;
  const dy = host.geometry.end.y - host.geometry.start.y;
  const length = Math.hypot(dx, dy);
  if (!length) throw new Error("Element docelowy ma zerową długość.");
  const ux = dx / length, uy = dy / length;
  const point = (source: CadPoint) => ({
    x: host.geometry.start.x + ux * source.x - uy * source.y,
    y: host.geometry.start.y + uy * source.x + ux * source.y,
  });
  const groupId = createId();
  return parsed.bars.map((bar) => CadEntitySchema.parse({
    id: createId(),
    kind: "rebar-line",
    layerId: bar.layerId,
    units: "mm",
    reviewStatus: "draft",
    source: { origin: "manual", documentId: null, page: null, confidence: null },
    placement: { hostId: host.id, groupId, start: host.geometry.start, end: host.geometry.end, needsReview: false },
    geometry: { start: point(bar.start), end: point(bar.end) },
    attributes: {
      diameterMm: bar.diameterMm,
      count: bar.count,
      coverMm: bar.coverMm,
      steelGrade: bar.steelGrade,
      designReference: bar.designReference,
      specialistVerified: false,
      representation: bar.representation,
      shape: bar.shape,
    },
  }));
}

function distancePointToSegment(point: CadPoint, start: CadPoint, end: CadPoint): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function segmentsIntersect(a: Extract<CadEntity, { kind: "rebar-line" }>,
  b: Extract<CadEntity, { kind: "rebar-line" }>): boolean {
  const distance = Math.min(
    distancePointToSegment(a.geometry.start, b.geometry.start, b.geometry.end),
    distancePointToSegment(a.geometry.end, b.geometry.start, b.geometry.end),
    distancePointToSegment(b.geometry.start, a.geometry.start, a.geometry.end),
    distancePointToSegment(b.geometry.end, a.geometry.start, a.geometry.end),
  );
  return distance < (a.attributes.diameterMm + b.attributes.diameterMm) / 2;
}

export function validateReinforcement(document: CadDocument): ReinforcementValidationIssue[] {
  const issues: ReinforcementValidationIssue[] = [];
  const bars = document.entities.filter((entity): entity is Extract<CadEntity, { kind: "rebar-line" }> =>
    entity.kind === "rebar-line");
  for (const bar of bars) {
    if (!bar.attributes.steelGrade.trim() || /według projektu|do uzupełnienia/i.test(bar.attributes.steelGrade)) {
      issues.push({ code: "missing-material", severity: "warning", entityIds: [bar.id],
        message: "Pręt nie ma konkretnego gatunku stali." });
    }
    if (bar.placement?.needsReview) {
      issues.push({ code: "placement-review", severity: "error", entityIds: [bar.id],
        message: "Po zmianie geometrii podparcia położenie pręta wymaga ponownej weryfikacji." });
    }
    if (bar.attributes.shape?.bends.some((bend) => bend.radiusMm < bar.attributes.diameterMm * 2)) {
      issues.push({ code: "bend-radius", severity: "warning", entityIds: [bar.id],
        message: "Promień gięcia jest mniejszy niż 2× średnica pręta. Sprawdź technologię i wskazane zasady projektowe." });
    }
    const host = document.entities.find((entity) => entity.id === bar.placement?.hostId);
    if (linearHost(host) && bar.attributes.representation !== "projection") {
      const width = host.kind === "wall" ? host.attributes.thicknessMm
        : host.kind === "footing" ? host.attributes.widthMm : host.attributes.widthMm;
      const allowed = width / 2 - bar.attributes.coverMm - bar.attributes.diameterMm / 2;
      if (allowed < 0 || [bar.geometry.start, bar.geometry.end].some((point) =>
        distancePointToSegment(point, host.geometry.start, host.geometry.end) > allowed + 0.001)) {
        issues.push({ code: "outside-cover", severity: "error", entityIds: [bar.id],
          message: "Oś pręta wykracza poza obszar dostępny po uwzględnieniu otuliny." });
      }
    }
  }
  const physical = bars.filter((bar) => bar.attributes.representation !== "projection");
  for (let left = 0; left < physical.length; left += 1) {
    for (let right = left + 1; right < physical.length; right += 1) {
      const a = physical[left]!, b = physical[right]!;
      if (a.layerId !== b.layerId || a.placement?.hostId !== b.placement?.hostId) continue;
      if (segmentsIntersect(a, b)) {
        issues.push({ code: "collision", severity: "error", entityIds: [a.id, b.id],
          message: "Pręty w tej samej warstwie kolidują w rzucie. Sprawdź także ich rzeczywiste poziomy." });
      }
    }
  }
  return issues;
}

export function developedLengthOfShape(shape: ReinforcementShape): number {
  const parsed = ReinforcementShapeSchema.parse(shape);
  return parsed.bends.reduce((total, bend) =>
    total + bend.lengthMm + Math.abs(bend.angleDegrees) * Math.PI / 180 * bend.radiusMm, 0);
}

export function reinforcementPath3d(origin: { x: number; y: number; z?: number }, shape: ReinforcementShape): Array<{ x: number; y: number; z: number }> {
  const parsed = ReinforcementShapeSchema.parse(shape);
  const points = [{ x: origin.x, y: origin.y, z: origin.z ?? 0 }];
  const rotation = (parsed.rotationDegrees ?? 0) * Math.PI / 180;
  let heading = rotation;
  for (const bend of parsed.bends) {
    const previous = points[points.length - 1]!;
    const azimuth = (bend.azimuthDegrees ?? 0) * Math.PI / 180 + rotation;
    const elevation = (bend.elevationDegrees ?? 0) * Math.PI / 180;
    const length = bend.lengthMm;
    const next = bend.plane === "spatial" ? {
      x: previous.x + Math.cos(azimuth) * Math.cos(elevation) * length,
      y: previous.y + Math.sin(azimuth) * Math.cos(elevation) * length,
      z: previous.z + Math.sin(elevation) * length,
    } : bend.plane === "xz" ? {
      x: previous.x + Math.cos(heading) * length,
      y: previous.y,
      z: previous.z + Math.sin(heading) * length,
    } : bend.plane === "yz" ? {
      x: previous.x,
      y: previous.y + Math.cos(heading) * length,
      z: previous.z + Math.sin(heading) * length,
    } : {
      x: previous.x + Math.cos(heading) * length,
      y: previous.y + Math.sin(heading) * length,
      z: previous.z,
    };
    points.push(next);
    heading += bend.angleDegrees * Math.PI / 180;
  }
  return points;
}

export type ReinforcementShapeOutline = {
  points: Array<{ x: number; y: number }>;
  widthMm: number;
  heightMm: number;
};

export function reinforcementShapeOutline(shape: ReinforcementShape): ReinforcementShapeOutline {
  const path = reinforcementPath3d({ x: 0, y: 0, z: 0 }, shape);
  const candidates = [
    path.map(({ x, y }) => ({ x, y })),
    path.map(({ x, z }) => ({ x, y: z })),
    path.map(({ y, z }) => ({ x: y, y: z })),
  ];
  const span = (values: Array<{ x: number; y: number }>) => {
    const xs = values.map(({ x }) => x);
    const ys = values.map(({ y }) => y);
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  };
  const projected = [...candidates].sort((left, right) => span(right) - span(left))[0]!;
  const xs = projected.map(({ x }) => x);
  const ys = projected.map(({ y }) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    points: projected.map(({ x, y }) => ({ x: x - minX, y: y - minY })),
    widthMm: Math.max(...xs) - minX,
    heightMm: Math.max(...ys) - minY,
  };
}

export type BeamMainBarCorner = {
  id: string;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  bundleIndex: number;
  transverseOffsetMm: number;
  verticalOffsetMm: number;
};

export type BeamStandardMainBarBundle = {
  bundleIndex: number;
  transverseOffsetMm: number;
  verticalOffsetMm: number;
};

export function beamStandardMainBarBundles(
  assembly: ReinforcementBeamAssembly,
  reference?: BeamStandardMainBarReference | null,
): BeamStandardMainBarBundle[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const target = reference ?? beamStandardMainBarReference(parsed);
  if (!target) return [];
  const unique = new Map<string, BeamStandardMainBarBundle>();
  for (const placement of beamStirrupPlacements(parsed)) {
    const outline = reinforcementShapeOutline(placement.shape);
    if (Math.abs(outline.widthMm - target.widthMm) > 0.001
      || Math.abs(outline.heightMm - target.heightMm) > 0.001) continue;
    const key = `${placement.bundleIndex}:${placement.transverseOffsetMm}:${placement.verticalOffsetMm}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      bundleIndex: placement.bundleIndex,
      transverseOffsetMm: placement.transverseOffsetMm,
      verticalOffsetMm: placement.verticalOffsetMm,
    });
  }
  const bundles = [...unique.values()].sort((left, right) => left.bundleIndex - right.bundleIndex
    || left.transverseOffsetMm - right.transverseOffsetMm
    || left.verticalOffsetMm - right.verticalOffsetMm);
  return bundles.length ? bundles : [{ bundleIndex: 0, transverseOffsetMm: 0, verticalOffsetMm: 0 }];
}

export type BeamStandardMainBarReference = {
  widthMm: number;
  heightMm: number;
  stirrupDiameterMm: number;
};

export function beamStandardMainBarReference(
  assembly: ReinforcementBeamAssembly,
): BeamStandardMainBarReference | null {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  if (!parsed.standardMainBars) return null;
  const candidates = parsed.zones.map((zone) => ({
    outline: reinforcementShapeOutline(zone.shape),
    stirrupDiameterMm: zone.shape.diameterMm ?? 0,
  })).filter(({ outline }) => outline.widthMm > 0.001 && outline.heightMm > 0.001)
    .sort((left, right) => left.outline.widthMm * left.outline.heightMm
      - right.outline.widthMm * right.outline.heightMm
      || left.outline.widthMm + left.outline.heightMm
      - right.outline.widthMm - right.outline.heightMm);
  const smallest = candidates[0];
  if (!smallest) {
    throw new Error("Nie można wyznaczyć narożników standardowych drutów bez zamkniętego strzemienia.");
  }
  return {
    widthMm: smallest.outline.widthMm,
    heightMm: smallest.outline.heightMm,
    stirrupDiameterMm: smallest.stirrupDiameterMm,
  };
}

export function beamStandardMainBarCorners(assembly: ReinforcementBeamAssembly): BeamMainBarCorner[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  if (!parsed.standardMainBars) return [];
  const reference = beamStandardMainBarReference(parsed);
  if (!reference) return [];
  const centerInsetMm = (reference.stirrupDiameterMm + parsed.standardMainBars.diameterMm) / 2;
  const halfWidth = Math.round((reference.widthMm / 2 - centerInsetMm) * 1000) / 1000;
  const halfHeight = Math.round((reference.heightMm / 2 - centerInsetMm) * 1000) / 1000;
  if (halfWidth <= 0 || halfHeight <= 0) {
    throw new Error("Najmniejsze strzemię jest zbyt małe dla wybranej średnicy standardowych drutów.");
  }
  return beamStandardMainBarBundles(parsed, reference).flatMap((bundle, bundleIndex) => ([
    { corner: "top-left" as const, transverseOffsetMm: -halfWidth, verticalOffsetMm: halfHeight },
    { corner: "top-right" as const, transverseOffsetMm: halfWidth, verticalOffsetMm: halfHeight },
    { corner: "bottom-left" as const, transverseOffsetMm: -halfWidth, verticalOffsetMm: -halfHeight },
    { corner: "bottom-right" as const, transverseOffsetMm: halfWidth, verticalOffsetMm: -halfHeight },
  ].map(({ corner, transverseOffsetMm, verticalOffsetMm }) => ({
    id: `bundle-${bundleIndex}-${corner}`,
    corner,
    bundleIndex,
    transverseOffsetMm: Math.round((transverseOffsetMm + bundle.transverseOffsetMm) * 1000) / 1000,
    verticalOffsetMm: Math.round((verticalOffsetMm + bundle.verticalOffsetMm) * 1000) / 1000,
  }))));
}

/** Strzemię wyższe od betonu stoi na spodzie przekroju; pozostałe są wyśrodkowane na osi belki. */
export function beamStirrupCenterVerticalMm(beamHeightMm: number, stirrupHeightMm: number): number {
  return stirrupHeightMm > beamHeightMm + 0.001 ? (stirrupHeightMm - beamHeightMm) / 2 : 0;
}

export type BeamStirrupSlotSide = "top" | "right" | "bottom" | "left";

export type BeamStirrupFrame = {
  zoneId: string;
  bundleIndex: number;
  centerTransverseMm: number;
  centerVerticalMm: number;
  widthMm: number;
  heightMm: number;
  stirrupDiameterMm: number;
};

export function beamZoneStirrupFrames(assembly: ReinforcementBeamAssembly, zoneId: string): BeamStirrupFrame[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const zone = parsed.zones.find((item) => item.id === zoneId);
  if (!zone) return [];
  const outline = reinforcementShapeOutline(zone.shape);
  const frames = new Map<number, BeamStirrupFrame>();
  for (const placement of beamStirrupPlacements(parsed)) {
    if (placement.zoneId !== zoneId || frames.has(placement.bundleIndex)) continue;
    frames.set(placement.bundleIndex, {
      zoneId,
      bundleIndex: placement.bundleIndex,
      centerTransverseMm: placement.transverseOffsetMm,
      centerVerticalMm: placement.verticalOffsetMm,
      widthMm: outline.widthMm,
      heightMm: outline.heightMm,
      stirrupDiameterMm: zone.shape.diameterMm ?? 8,
    });
  }
  return [...frames.values()].sort((left, right) => left.bundleIndex - right.bundleIndex);
}

export type BeamConnectionIssue = {
  code: "no-clear-stirrup-opening" | "no-common-cross-section";
  zoneIndexes: number[];
  message: string;
};

/**
 * Detects only definite geometric disconnections: even the axis-aligned clear envelopes of adjacent
 * stirrup frames do not share a usable area inside the concrete section. This is not a structural check.
 */
export function beamStirrupConnectionIssues(assembly: ReinforcementBeamAssembly): BeamConnectionIssue[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const framesByZone = parsed.zones.map((zone) => beamZoneStirrupFrames(parsed, zone.id));
  const issues: BeamConnectionIssue[] = [];
  const unusableZoneIndexes = new Set<number>();
  const interiorBounds = (frame: BeamStirrupFrame) => {
    const halfWidth = (frame.widthMm - frame.stirrupDiameterMm) / 2;
    const halfHeight = (frame.heightMm - frame.stirrupDiameterMm) / 2;
    if (halfWidth <= 0 || halfHeight <= 0) return null;
    const left = Math.max(-parsed.widthMm / 2, frame.centerTransverseMm - halfWidth);
    const right = Math.min(parsed.widthMm / 2, frame.centerTransverseMm + halfWidth);
    const bottom = Math.max(-parsed.heightMm / 2, frame.centerVerticalMm - halfHeight);
    const top = Math.min(parsed.heightMm / 2, frame.centerVerticalMm + halfHeight);
    return right - left > 0.001 && top - bottom > 0.001 ? { left, right, bottom, top } : null;
  };
  const zoneBounds = framesByZone.map((frames, zoneIndex) => {
    const bounds = frames.flatMap((frame) => {
      const interior = interiorBounds(frame);
      return interior ? [interior] : [];
    });
    if (bounds.length) return bounds;
    unusableZoneIndexes.add(zoneIndex);
    issues.push({
      code: "no-clear-stirrup-opening",
      zoneIndexes: [zoneIndex],
      message: frames.length
        ? `Strefa ${zoneIndex + 1}: strzemię nie ma wolnego otworu wewnątrz przekroju betonu. `
          + "Nie można w niej poprowadzić pręta podłużnego."
        : `Strefa ${zoneIndex + 1}: nie powstaje żadne strzemię w zadanym zakresie. `
          + "Nie można przez nią poprowadzić pręta podłużnego.",
    });
    return bounds;
  });
  for (let index = 0; index < parsed.zones.length - 1; index += 1) {
    if (unusableZoneIndexes.has(index) || unusableZoneIndexes.has(index + 1)) continue;
    const connected = zoneBounds[index]!.some((left) => zoneBounds[index + 1]!.some((right) =>
      Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.001
      && Math.min(left.top, right.top) - Math.max(left.bottom, right.bottom) > 0.001));
    if (!connected) {
      issues.push({
        code: "no-common-cross-section",
        zoneIndexes: [index, index + 1],
        message: `Strefy ${index + 1} i ${index + 2} nie mają wspólnego pola wewnątrz betonu. `
          + "Nie da się poprowadzić między nimi prostego, ciągłego pręta podłużnego. Zmień wyrównanie lub "
          + "przesunięcie strzemion albo rozdziel belkę na osobne elementy. To ostrzeżenie dotyczy geometrii, "
          + "nie oblicza nośności ani możliwości wykonania połączenia przez projektanta.",
      });
    }
  }
  return issues;
}

function frameInnerHalfSize(frame: BeamStirrupFrame, barDiameterMm: number) {
  const insetMm = (frame.stirrupDiameterMm + barDiameterMm) / 2;
  return { halfWidthMm: frame.widthMm / 2 - insetMm, halfHeightMm: frame.heightMm / 2 - insetMm };
}

function slotLocalPosition(side: BeamStirrupSlotSide, ratio: number, halfWidthMm: number, halfHeightMm: number) {
  switch (side) {
    case "top": return { x: -halfWidthMm + 2 * halfWidthMm * ratio, y: halfHeightMm };
    case "right": return { x: halfWidthMm, y: halfHeightMm - 2 * halfHeightMm * ratio };
    case "bottom": return { x: halfWidthMm - 2 * halfWidthMm * ratio, y: -halfHeightMm };
    case "left": return { x: -halfWidthMm, y: -halfHeightMm + 2 * halfHeightMm * ratio };
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export type BeamStirrupSlot = {
  id: string;
  zoneId: string;
  bundleIndex: number;
  side: BeamStirrupSlotSide;
  ratio: number;
  kind: "corner" | "middle" | "edge";
  transverseMm: number;
  verticalMm: number;
};

/**
 * Sloty leżą wzdłuż wewnętrznego lica strzemienia, w którym pręt o danej średnicy jest styczny do drutu
 * strzemienia. Każdy bok ma parzystą liczbę podziałów ≈ co `stepMm`, więc zawsze zawiera narożnik i środek.
 */
export function beamStirrupSlots(assembly: ReinforcementBeamAssembly, zoneId: string,
  barDiameterMm: number, stepMm = 20): BeamStirrupSlot[] {
  return beamZoneStirrupFrames(assembly, zoneId).flatMap((frame) => {
    const { halfWidthMm, halfHeightMm } = frameInnerHalfSize(frame, barDiameterMm);
    if (halfWidthMm <= 0 || halfHeightMm <= 0) return [];
    return (["top", "right", "bottom", "left"] as const).flatMap((side) => {
      const sideLengthMm = side === "top" || side === "bottom" ? halfWidthMm * 2 : halfHeightMm * 2;
      const divisions = 2 * Math.max(1, Math.round(sideLengthMm / (stepMm * 2)));
      return Array.from({ length: divisions }, (_, index) => {
        const ratio = index / divisions;
        const local = slotLocalPosition(side, ratio, halfWidthMm, halfHeightMm);
        return {
          id: `${frame.bundleIndex}:${side}:${index}/${divisions}`,
          zoneId,
          bundleIndex: frame.bundleIndex,
          side,
          ratio,
          kind: index === 0 ? "corner" as const : index * 2 === divisions ? "middle" as const : "edge" as const,
          transverseMm: round3(frame.centerTransverseMm + local.x),
          verticalMm: round3(frame.centerVerticalMm + local.y),
        };
      });
    });
  });
}

type CustomBarSlotInput = {
  anchorZoneId: string;
  bundleIndex: number;
  slotSide: BeamStirrupSlotSide;
  slotRatio: number;
  diameterMm: number;
};

export function beamCustomMainBarSection(assembly: ReinforcementBeamAssembly, bar: CustomBarSlotInput) {
  const frame = beamZoneStirrupFrames(assembly, bar.anchorZoneId)
    .find((item) => item.bundleIndex === bar.bundleIndex);
  if (!frame) return null;
  const { halfWidthMm, halfHeightMm } = frameInnerHalfSize(frame, bar.diameterMm);
  if (halfWidthMm <= 0 || halfHeightMm <= 0) return null;
  const local = slotLocalPosition(bar.slotSide, bar.slotRatio, halfWidthMm, halfHeightMm);
  return {
    transverseMm: round3(frame.centerTransverseMm + local.x),
    verticalMm: round3(frame.centerVerticalMm + local.y),
  };
}

const slotToleranceMm = 1.5;

function frameHoldsBar(frame: BeamStirrupFrame, transverseMm: number, verticalMm: number, diameterMm: number) {
  const { halfWidthMm, halfHeightMm } = frameInnerHalfSize(frame, diameterMm);
  if (halfWidthMm <= 0 || halfHeightMm <= 0) return false;
  const dx = Math.abs(transverseMm - frame.centerTransverseMm);
  const dy = Math.abs(verticalMm - frame.centerVerticalMm);
  if (dx > halfWidthMm + slotToleranceMm || dy > halfHeightMm + slotToleranceMm) return false;
  return Math.abs(dx - halfWidthMm) <= slotToleranceMm || Math.abs(dy - halfHeightMm) <= slotToleranceMm;
}

/**
 * Zakres, przez który drut może biec: ciągły ciąg stref, których strzemię ma slot w tym samym miejscu
 * przekroju. Drut nie może przejść przez strzemię, do którego nie byłby przywiązany.
 */
export function beamCustomMainBarAllowedRange(assembly: ReinforcementBeamAssembly, bar: CustomBarSlotInput) {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const section = beamCustomMainBarSection(parsed, bar);
  const anchorIndex = parsed.zones.findIndex((zone) => zone.id === bar.anchorZoneId);
  if (!section || anchorIndex < 0) return null;
  const compatible = parsed.zones.map((zone) => beamZoneStirrupFrames(parsed, zone.id)
    .some((frame) => frameHoldsBar(frame, section.transverseMm, section.verticalMm, bar.diameterMm)));
  let first = anchorIndex;
  let last = anchorIndex;
  while (first > 0 && compatible[first - 1]) first -= 1;
  while (last < parsed.zones.length - 1 && compatible[last + 1]) last += 1;
  return {
    startMm: first === 0 ? 0 : parsed.zones[first]!.startMm,
    endMm: last === parsed.zones.length - 1 ? parsed.lengthMm : parsed.zones[last]!.endMm,
    firstZoneIndex: first,
    lastZoneIndex: last,
  };
}

export type BeamMainBarOccupant = {
  id: string;
  source: "standard" | "custom";
  transverseMm: number;
  verticalMm: number;
  diameterMm: number;
  startMm: number;
  endMm: number;
};

export type BeamResolvedCustomMainBar = BeamMainBarOccupant & {
  source: "custom";
  allowedStartMm: number;
  allowedEndMm: number;
  clamped: boolean;
  /** Rzeczywisty wypust poza zakres strzemion (po przycięciu do długości belki). */
  extensionStartMm: number;
  extensionEndMm: number;
  /** Użytkownik zażądał drutu przez całą belkę. */
  fullBeam: boolean;
  /** Indeksy stref, które uniemożliwiają drut przez całą belkę (puste, gdy żądanie jest spełnione). */
  fullBeamMissingZoneIndexes: number[];
  fullBeamOccupiedZoneIndexes: number[];
};

type ReinforcementBeamCustomMainBarInput = NonNullable<ReinforcementBeamAssembly["customMainBars"]>[number];

function resolveCustomBarGeometry(parsed: ReinforcementBeamAssembly, bar: ReinforcementBeamCustomMainBarInput) {
  const section = beamCustomMainBarSection(parsed, bar);
  const range = beamCustomMainBarAllowedRange(parsed, bar);
  if (!section || !range) return null;
  const allowedMm = range.endMm - range.startMm;
  const lengthMm = Math.min(bar.lengthMm, allowedMm);
  const baseStartMm = bar.fromSide === "start" ? range.startMm : range.endMm - lengthMm;
  const startMm = Math.max(0, baseStartMm - (bar.extensionStartMm ?? 0));
  const endMm = Math.min(parsed.lengthMm, baseStartMm + lengthMm + (bar.extensionEndMm ?? 0));
  return {
    id: bar.id,
    source: "custom" as const,
    ...section,
    diameterMm: bar.diameterMm,
    startMm: round3(startMm),
    endMm: round3(endMm),
    allowedStartMm: range.startMm,
    allowedEndMm: range.endMm,
    clamped: bar.lengthMm > allowedMm + 0.001,
    extensionStartMm: round3(baseStartMm - startMm),
    extensionEndMm: round3(endMm - baseStartMm - lengthMm),
  };
}

function standardMainBarOccupants(parsed: ReinforcementBeamAssembly): BeamMainBarOccupant[] {
  return parsed.standardMainBars
    ? beamStandardMainBarCorners(parsed).map((corner) => ({
      id: `standard:${corner.id}`,
      source: "standard" as const,
      transverseMm: corner.transverseOffsetMm,
      verticalMm: corner.verticalOffsetMm,
      diameterMm: parsed.standardMainBars!.diameterMm,
      startMm: 0,
      endMm: parsed.lengthMm,
    }))
    : [];
}

export type BeamCustomMainBarFullBeamZone = {
  zoneId: string;
  zoneIndex: number;
  /** Strzemię tej strefy ma slot w tym samym miejscu przekroju. */
  holdsBar: boolean;
  /** Inny drut zajmuje już ten slot w tej strefie. */
  occupiedBy: string | null;
};

export type BeamCustomMainBarFullBeamCheck = {
  available: boolean;
  zones: BeamCustomMainBarFullBeamZone[];
  missingZoneIndexes: number[];
  occupiedZoneIndexes: number[];
};

/**
 * Drut „przez całą belkę” jest dopuszczalny tylko wtedy, gdy KAŻDE strzemię belki ma slot w tym samym miejscu
 * przekroju i w żadnej strefie ten slot nie jest zajęty przez inny drut. Gdy choć jedna strefa nie spełnia
 * warunku, drut może być wyłącznie docinką dodawaną od wybranej strony.
 */
export function beamCustomMainBarFullBeamCheck(assembly: ReinforcementBeamAssembly,
  bar: CustomBarSlotInput & { id?: string }): BeamCustomMainBarFullBeamCheck {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const section = beamCustomMainBarSection(parsed, bar);
  if (!section || !parsed.zones.length) {
    return { available: false, zones: [], missingZoneIndexes: [], occupiedZoneIndexes: [] };
  }
  const occupants = [
    ...standardMainBarOccupants(parsed),
    ...(parsed.customMainBars ?? []).filter((other) => other.id !== bar.id)
      .flatMap((other) => resolveCustomBarGeometry(parsed, other) ?? []),
  ];
  const zones = parsed.zones.map((zone, zoneIndex) => {
    const holdsBar = beamZoneStirrupFrames(parsed, zone.id)
      .some((frame) => frameHoldsBar(frame, section.transverseMm, section.verticalMm, bar.diameterMm));
    const occupant = occupants.find((item) => item.startMm < zone.endMm - 0.001
      && item.endMm > zone.startMm + 0.001
      && Math.hypot(item.transverseMm - section.transverseMm, item.verticalMm - section.verticalMm)
        < (item.diameterMm + bar.diameterMm) / 2 - 0.01);
    return { zoneId: zone.id, zoneIndex, holdsBar, occupiedBy: occupant?.id ?? null };
  });
  const missingZoneIndexes = zones.filter((zone) => !zone.holdsBar).map((zone) => zone.zoneIndex);
  const occupiedZoneIndexes = zones.filter((zone) => zone.occupiedBy).map((zone) => zone.zoneIndex);
  return {
    available: !missingZoneIndexes.length && !occupiedZoneIndexes.length,
    zones,
    missingZoneIndexes,
    occupiedZoneIndexes,
  };
}

export function beamResolvedCustomMainBars(assembly: ReinforcementBeamAssembly): BeamResolvedCustomMainBar[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  return (parsed.customMainBars ?? []).flatMap((bar) => {
    const geometry = resolveCustomBarGeometry(parsed, bar);
    if (!geometry) return [];
    const check = bar.fullBeam ? beamCustomMainBarFullBeamCheck(parsed, bar) : null;
    if (check?.available) {
      return [{
        ...geometry,
        startMm: 0,
        endMm: parsed.lengthMm,
        clamped: false,
        extensionStartMm: 0,
        extensionEndMm: 0,
        fullBeam: true,
        fullBeamMissingZoneIndexes: [],
        fullBeamOccupiedZoneIndexes: [],
      }];
    }
    return [{
      ...geometry,
      fullBeam: Boolean(bar.fullBeam),
      fullBeamMissingZoneIndexes: check?.missingZoneIndexes ?? [],
      fullBeamOccupiedZoneIndexes: check?.occupiedZoneIndexes ?? [],
    }];
  });
}

/** Komunikaty blokujące zapis: drut oznaczony jako „cała belka”, który nie trafia w slot każdego strzemienia. */
export function beamCustomMainBarIssues(assembly: ReinforcementBeamAssembly): string[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const order = new Map((parsed.customMainBars ?? []).map((bar, index) => [bar.id, index + 1]));
  return beamResolvedCustomMainBars(parsed).flatMap((bar) => {
    if (!bar.fullBeam || (!bar.fullBeamMissingZoneIndexes.length && !bar.fullBeamOccupiedZoneIndexes.length)) {
      return [];
    }
    const parts = [
      bar.fullBeamMissingZoneIndexes.length
        ? `strzemię strefy ${bar.fullBeamMissingZoneIndexes.map((index) => index + 1).join(", ")} nie ma tego slotu`
        : "",
      bar.fullBeamOccupiedZoneIndexes.length
        ? `slot jest zajęty w strefie ${bar.fullBeamOccupiedZoneIndexes.map((index) => index + 1).join(", ")}`
        : "",
    ].filter(Boolean);
    return [`Drut niestandardowy ${order.get(bar.id)} ma biec przez całą belkę, ale ${parts.join(" i ")}. `
      + "Wybierz inny slot albo zamień go na docinkę dodawaną od wybranej strony."];
  });
}

export function beamMainBarOccupants(assembly: ReinforcementBeamAssembly): BeamMainBarOccupant[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  return [...standardMainBarOccupants(parsed), ...beamResolvedCustomMainBars(parsed)];
}

export type BeamStirrupSlotState = BeamStirrupSlot & { occupiedBy: string | null };

/** Slot jest zajęty, gdy w zakresie strefy biegnie drut, z którym nowy pręt by kolidował. */
export function beamStirrupSlotStates(assembly: ReinforcementBeamAssembly, zoneId: string,
  barDiameterMm: number, stepMm = 20): BeamStirrupSlotState[] {
  const parsed = ReinforcementBeamAssemblySchema.parse(assembly);
  const zone = parsed.zones.find((item) => item.id === zoneId);
  if (!zone) return [];
  const occupants = beamMainBarOccupants(parsed).filter((occupant) =>
    occupant.startMm < zone.endMm - 0.001 && occupant.endMm > zone.startMm + 0.001);
  return beamStirrupSlots(parsed, zoneId, barDiameterMm, stepMm).map((slot) => {
    const occupant = occupants.find((item) => Math.hypot(item.transverseMm - slot.transverseMm,
      item.verticalMm - slot.verticalMm) < (item.diameterMm + barDiameterMm) / 2 - 0.01);
    return { ...slot, occupiedBy: occupant?.id ?? null };
  });
}

export function createBentRebarEntity(input: {
  id: string;
  origin: CadPoint;
  diameterMm: number;
  coverMm: number;
  steelGrade: string;
  designReference: string;
  shape: ReinforcementShape;
  layerId?: string;
  count?: number;
  placement?: Extract<CadEntity, { kind: "rebar-line" }>["placement"];
}): Extract<CadEntity, { kind: "rebar-line" }> {
  const shape = ReinforcementShapeSchema.parse(input.shape);
  const path = reinforcementPath3d(input.origin, shape);
  const end = path[path.length - 1]!;
  const entity = CadEntitySchema.parse({
    id: input.id,
    kind: "rebar-line",
    layerId: input.layerId ?? "rebar-custom",
    units: "mm",
    reviewStatus: "draft",
    source: { origin: "manual", documentId: null, page: null, confidence: null },
    placement: input.placement,
    geometry: { start: input.origin, end: { x: end.x, y: end.y } },
    attributes: {
      diameterMm: input.diameterMm,
      count: input.count ?? 1,
      coverMm: input.coverMm,
      steelGrade: input.steelGrade,
      designReference: input.designReference,
      specialistVerified: false,
      shape,
    },
  });
  if (entity.kind !== "rebar-line") {
    throw new Error("Nie udało się utworzyć encji pręta.");
  }
  return entity;
}

export function buildReinforcementSchedule(entities: readonly CadEntity[]): ReinforcementScheduleRow[] {
  const grouped = new Map<string, Omit<ReinforcementScheduleRow, "position" | "totalLengthM" | "totalMassKg">>();
  for (const entity of entities) {
    if (entity.kind !== "rebar-line" || entity.attributes.representation === "projection") continue;
    const developedLengthMm = entity.attributes.shape
      ? developedLengthOfShape(entity.attributes.shape)
      : Math.hypot(
      entity.geometry.end.x - entity.geometry.start.x,
      entity.geometry.end.y - entity.geometry.start.y,
    );
    const unitMassKg = Math.PI * (entity.attributes.diameterMm / 2) ** 2 * 7850 / 1_000_000;
    const key = JSON.stringify([
      entity.attributes.diameterMm, entity.attributes.steelGrade, entity.layerId,
      Math.round(developedLengthMm * 1000) / 1000, entity.attributes.coverMm,
    ]);
    const existing = grouped.get(key);
    if (existing) existing.quantity += entity.attributes.count;
    else grouped.set(key, {
      diameterMm: entity.attributes.diameterMm,
      steelGrade: entity.attributes.steelGrade,
      layerId: entity.layerId,
      shape: entity.attributes.shape?.kind ?? "straight",
      developedLengthMm,
      quantity: entity.attributes.count,
      unitMassKg,
    });
  }

  return [...grouped.values()].map((row, index) => {
    const totalLengthM = row.developedLengthMm * row.quantity / 1000;
    return {
      ...row,
      position: index + 1,
      totalLengthM,
      totalMassKg: totalLengthM * row.unitMassKg,
    };
  });
}

export function createReinforcementLayout(input: ReinforcementLayout, createId: () => string): CadEntity[] {
  const p = ReinforcementLayoutSchema.parse(input);
  const entities: CadEntity[] = [];
  const c = p.coverMm + (p.mode === "beam" && p.heightMm ? p.transverseDiameterMm + p.diameterMm / 2
    : Math.max(p.diameterMm, p.transverseDiameterMm) / 2);
  const x1 = p.origin.x + c, x2 = p.origin.x + p.lengthMm - c;
  const y1 = p.origin.y + c, y2 = p.origin.y + p.widthMm - c;
  const line = (x: number, y: number, xx: number, yy: number, diameterMm: number, layerId: string) => {
    entities.push(CadEntitySchema.parse({ id: createId(), kind: "rebar-line", layerId, units: "mm", reviewStatus: "draft",
      source: { origin: "manual", documentId: null, page: null, confidence: null },
      geometry: { start: { x, y }, end: { x: xx, y: yy } },
      attributes: { diameterMm, count: 1, coverMm: p.coverMm, steelGrade: p.steelGrade,
        designReference: p.designReference, specialistVerified: false,
        representation: layerId === "rebar-stirrups-projection" ? "projection" : "physical" } }));
  };
  const positions = (a: number, b: number) => {
    const values: number[] = [];
    for (let position = a; position <= b + 0.001; position += p.spacingMm) values.push(Math.min(position, b));
    return values;
  };
  const rows = p.mode === "beam" ? Array.from({ length: p.longitudinalCount }, (_, i) =>
    y1 + i * (y2 - y1) / (p.longitudinalCount - 1)) : positions(y1, y2);
  if (p.mode === "beam" && p.heightMm) {
    const top = p.topBarCount ?? Math.floor(p.longitudinalCount / 2);
    for (const [count, layer] of [[top, "rebar-top"], [p.longitudinalCount - top, "rebar-bottom"]] as const) {
      Array.from({ length: count }, (_, i) => count === 1 ? (y1 + y2) / 2 : y1 + i * (y2 - y1) / (count - 1))
        .forEach((y) => line(x1, y, x2, y, p.diameterMm, layer));
    }
  } else rows.forEach((y) => line(x1, y, x2, y, p.diameterMm, "rebar-longitudinal"));
  const stirrupPositions = p.mode === "beam" && p.stirrupZones?.length
    ? [...new Set(p.stirrupZones.flatMap((zone) => {
      const positionsInZone: number[] = [];
      for (let offset = zone.startMm; offset <= zone.endMm + 0.001; offset += zone.spacingMm) {
        positionsInZone.push(Math.min(offset, zone.endMm));
      }
      return positionsInZone;
    }).map((offset) => Math.round((x1 + offset) * 1000) / 1000))]
    : positions(x1, x2);
  stirrupPositions.forEach((x) => line(x, y1, x, y2, p.transverseDiameterMm, p.mode === "beam" ? "rebar-stirrups-projection" : "rebar-transverse"));
  const common = { units: "mm", reviewStatus: "draft", source: { origin: "manual", documentId: null, page: null, confidence: null } };
  entities.push(CadEntitySchema.parse({ ...common, id: createId(), kind: "annotation", layerId: "annotation",
    geometry: { point: { x: p.origin.x, y: p.origin.y - 250 } },
    attributes: { text: `${p.mode === "beam" ? `Belka: ${p.longitudinalCount} prętów` : "Siatka"} Ø${p.diameterMm}; ${p.mode === "beam" ? "strzemiona w rzucie" : "kierunek poprzeczny"} Ø${p.transverseDiameterMm} co ${p.spacingMm} mm · ${p.designReference}` } }));
  for (const [end, measuredMm] of [[{ x: p.origin.x + p.lengthMm, y: p.origin.y }, p.lengthMm],
    [{ x: p.origin.x, y: p.origin.y + p.widthMm }, p.widthMm]] as const) {
    entities.push(CadEntitySchema.parse({ ...common, id: createId(), kind: "dimension", layerId: "dimension",
      geometry: { start: p.origin, end }, attributes: { measuredMm, label: "" } }));
  }
  if (p.mode === "beam" && p.heightMm) {
    const topCount = p.topBarCount ?? Math.floor(p.longitudinalCount / 2);
    entities.push(CadEntitySchema.parse({ ...common, id: createId(), kind: "rebar-annotation", layerId: "rebar-section",
      geometry: { point: { x: p.origin.x + p.lengthMm + p.widthMm, y: p.origin.y } },
      attributes: { label: `Przekrój belki ${p.widthMm}×${p.heightMm} mm · ${p.steelGrade} · ${p.designReference}`,
        designReference: p.designReference, diameterMm: p.diameterMm, lengthMm: p.lengthMm, count: p.longitudinalCount,
        specialistVerified: false, section: { widthMm: p.widthMm, heightMm: p.heightMm, coverMm: p.coverMm,
          topCount, bottomCount: p.longitudinalCount - topCount, stirrupDiameterMm: p.transverseDiameterMm } } }));
  }
  return entities;
}

export function placeReinforcementOnHost(entities: CadEntity[], host: CadEntity, offsetMm: number, createId: () => string): CadEntity[] {
  if (!("start" in host.geometry) || !Number.isFinite(offsetMm) || offsetMm < 0) throw new Error("Wybierz ścianę, ławę lub belkę i dodatnią odległość od jej początku.");
  const { start, end } = host.geometry;
  const length = Math.hypot(end.x - start.x, end.y - start.y), ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
  const dimensions = entities.filter((e) => e.kind === "dimension");
  const layoutLength = dimensions[0]?.kind === "dimension" ? dimensions[0].attributes.measuredMm : 0;
  const width = dimensions[1]?.kind === "dimension" ? dimensions[1].attributes.measuredMm : 0;
  if (!layoutLength || !width || layoutLength + offsetMm > length + .001) throw new Error("Układ zbrojenia wykracza poza długość wskazanego podparcia.");
  const groupId = createId();
  const point = (p: { x: number; y: number }) => ({ x: start.x + ux * (p.x + offsetMm) - uy * (p.y - width / 2),
    y: start.y + uy * (p.x + offsetMm) + ux * (p.y - width / 2) });
  return entities.map((e) => CadEntitySchema.parse({ ...e,
    placement: { hostId: host.id, groupId, start, end, needsReview: false },
    geometry: "start" in e.geometry ? { start: point(e.geometry.start), end: point(e.geometry.end) }
      : "vertices" in e.geometry ? { vertices: e.geometry.vertices.map(point) }
        : { point: e.kind === "rebar-annotation" && e.attributes.section
          ? point({ x: layoutLength / 2, y: width / 2 + e.attributes.section.heightMm * 2 }) : point(e.geometry.point) },
  }));
}

export function synchronizeReinforcementPlacement(document: CadDocument): CadDocument {
  return { ...document, entities: document.entities.map((e) => {
    const placement = e.placement;
    if (!placement) return e;
    const host = document.entities.find((candidate) => candidate.id === placement.hostId);
    if (!host || !("start" in host.geometry)) throw new Error("Zbrojenie straciło podparcie. Usuń układ lub przypisz go ponownie.");
    const oldLength = Math.hypot(placement.end.x - placement.start.x, placement.end.y - placement.start.y);
    const { start, end } = host.geometry;
    const newLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (!oldLength || !newLength) throw new Error("Podparcie zbrojenia ma zerową długość.");
    const ux = (end.x - start.x) / newLength, uy = (end.y - start.y) / newLength;
    const ox = (placement.end.x - placement.start.x) / oldLength, oy = (placement.end.y - placement.start.y) / oldLength;
    const point = (p: { x: number; y: number }) => {
      const x = p.x - placement.start.x, y = p.y - placement.start.y, along = x * ox + y * oy, across = -x * oy + y * ox;
      return { x: start.x + ux * along - uy * across, y: start.y + uy * along + ux * across };
    };
    return CadEntitySchema.parse({ ...e, reviewStatus: "draft",
      placement: { ...placement, start, end, needsReview: placement.needsReview || Math.abs(newLength - oldLength) > .001 },
      geometry: "start" in e.geometry ? { start: point(e.geometry.start), end: point(e.geometry.end) }
        : "vertices" in e.geometry ? { vertices: e.geometry.vertices.map(point) } : { point: point(e.geometry.point) },
    });
  }) };
}
