"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode,
  type WheelEvent as ReactWheelEvent } from "react";
import { CadEntitySchema, type CadDocument, type CadEntity, type FoundationSection, type FoundationSectionField } from "@asystent/schemas";
import { addDetectedFoundationSections, calculateFoundationSectionMaterials, cadLayerOutline, cadLayerSides,
  detectFoundationSectionProposals, foundationPlanExtents, foundationSectionMissingFields, foundationSectionState,
  foundationSectionFingerprint,
  getCadPlanDimensions, getCadPlanFaces, getFoundationSectionConflicts, getFoundationSectionIntersections,
  polygonCenter, resolveFoundationSectionValues } from "@asystent/domain";
import { cadEntityColor } from "@asystent/domain";
import { segmentRectangle } from "@asystent/geometry";
import { CadPlanDimensions } from "./cad-plan-dimensions";

const fields: { id: FoundationSectionField; label: string; unit: "mm" | "cm" | "m" | "tekst"; numeric: boolean }[] = [
  { id: "footing_width_cm", label: "Szerokość ławy", unit: "cm", numeric: true },
  { id: "footing_height_cm", label: "Wysokość ławy", unit: "cm", numeric: true },
  { id: "wall_thickness_cm", label: "Grubość ściany", unit: "cm", numeric: true },
  { id: "wall_height_cm", label: "Wysokość ściany", unit: "cm", numeric: true },
  { id: "pad_length_cm", label: "Długość stopy", unit: "cm", numeric: true },
  { id: "pad_width_cm", label: "Szerokość stopy", unit: "cm", numeric: true },
  { id: "pad_height_cm", label: "Wysokość stopy", unit: "cm", numeric: true },
  { id: "column_width_cm", label: "Szerokość słupa", unit: "cm", numeric: true },
  { id: "column_length_cm", label: "Długość słupa", unit: "cm", numeric: true },
  { id: "beam_width_cm", label: "Szerokość belki", unit: "cm", numeric: true },
  { id: "beam_height_cm", label: "Wysokość belki", unit: "cm", numeric: true },
  { id: "foundation_bottom_elevation_m", label: "Rzędna spodu fundamentu", unit: "m", numeric: true },
  { id: "ground_elevation_m", label: "Rzędna terenu", unit: "m", numeric: true },
  { id: "zero_level_elevation_m", label: "Rzędna poziomu ±0,00", unit: "m", numeric: true },
  { id: "footing_material", label: "Materiał ławy", unit: "tekst", numeric: false },
  { id: "pad_material", label: "Materiał stopy", unit: "tekst", numeric: false },
  { id: "column_material", label: "Materiał słupa", unit: "tekst", numeric: false },
  { id: "beam_material", label: "Materiał belki", unit: "tekst", numeric: false },
  { id: "wall_material", label: "Materiał ściany", unit: "tekst", numeric: false },
  { id: "concrete_class", label: "Klasa betonu", unit: "tekst", numeric: false },
  { id: "xps_thickness_cm", label: "Grubość XPS", unit: "cm", numeric: true },
  { id: "waterproofing_type", label: "Typ hydroizolacji", unit: "tekst", numeric: false },
  { id: "blinding_concrete_thickness_cm", label: "Grubość betonu podkładowego", unit: "cm", numeric: true },
  { id: "floor_layers", label: "Warstwy podłogi (opis)", unit: "tekst", numeric: false },
  { id: "additional_components", label: "Dodatkowe elementy (opis)", unit: "tekst", numeric: false },
];
const sourceLabels = {
  section_override: "nadpisanie przekroju",
  element_instance: "element rzutu",
  project_technology: "Materiały i technologia",
  document_settings: "ustawienia projektu",
} as const;
type ViewBox = { x: number; y: number; width: number; height: number };

function labelAt(index: number) {
  let value = index + 1, text = "";
  while (value) { value -= 1; text = String.fromCharCode(65 + value % 26) + text; value = Math.floor(value / 26); }
  return `${text}-${text}`;
}
function svgBounds(document: CadDocument): ViewBox {
  const points = document.entities.flatMap((entity) => "start" in entity.geometry
    ? [entity.geometry.start, entity.geometry.end] : "vertices" in entity.geometry
      ? entity.geometry.vertices : [entity.geometry.point]);
  points.push(...foundationPlanExtents(document));
  if (document.sourceImage) points.push({ x: 0, y: 0 }, {
    x: document.sourceImage.widthPx * document.sourceImage.mmPerPixel,
    y: document.sourceImage.heightPx * document.sourceImage.mmPerPixel,
  });
  if (!points.length) return { x: -1000, y: -1000, width: 12000, height: 8000 };
  const xs = points.map(({ x }) => x), ys = points.map(({ y }) => y);
  let x = Math.min(...xs), y = Math.min(...ys), width = Math.max(100, Math.max(...xs) - x), height = Math.max(100, Math.max(...ys) - y);
  const margin = Math.max(width, height) * .1;
  x -= margin; y -= margin; width += 2 * margin; height += 2 * margin;
  const ratio = 2.1;
  if (width / height > ratio) { const next = width / ratio; y -= (next - height) / 2; height = next; }
  else { const next = height * ratio; x -= (next - width) / 2; width = next; }
  return { x, y, width, height };
}

function PlanEntity({ entity, faces, selected, fontMm, onClick }: {
  entity: CadEntity; faces: ReturnType<typeof getCadPlanFaces>; selected: boolean; fontMm: number; onClick?: () => void;
}) {
  const color = cadEntityColor(entity);
  if ("start" in entity.geometry) {
    const width = entity.kind === "construction-line" && !["axis", "section-cut"].includes(entity.attributes.role)
      ? entity.attributes.widthMm : entity.kind === "wall" ? entity.attributes.thicknessMm
        : entity.kind === "footing" ? entity.attributes.widthMm : 0;
    const shape = width > 0
      ? <polygon points={segmentRectangle(entity.geometry.start, entity.geometry.end, width).map(({ x, y }) => `${x},${y}`).join(" ")}
        fill={color} fillOpacity=".32" stroke={selected ? "#ea580c" : color} strokeWidth={selected ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
      : <line x1={entity.geometry.start.x} y1={entity.geometry.start.y} x2={entity.geometry.end.x} y2={entity.geometry.end.y}
        stroke={selected ? "#ea580c" : color} strokeWidth={entity.kind === "construction-line" && entity.attributes.role === "section-cut" ? 2 : selected ? 3 : 1.5}
        strokeDasharray={entity.kind === "construction-line" && entity.attributes.role === "section-cut" ? "12 4 2 4" : undefined}
        vectorEffect="non-scaling-stroke" />;
    const overlays: ReactNode[] = [];
    if (width > 0) {
      let left = width / 2, right = width / 2;
      for (const [index, layer] of (entity.buildUp ?? []).entries()) {
        const sides = cadLayerSides(entity, layer.side, faces);
        for (const side of sides) {
          const from = side === "left" ? left : right;
          if (side === "left") left += layer.thicknessMm; else right += layer.thicknessMm;
          const outline = cadLayerOutline(entity, side, from, from + layer.thicknessMm, faces);
          overlays.push(<polygon key={`${index}-${side}`} points={outline.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill={layer.purpose === "thermal" ? `url(#section-plan-hatch-thermal)` : `url(#section-plan-hatch-${layer.purpose})`}
            stroke={layer.purpose === "thermal" ? "#b98522" : "#64748b"} strokeWidth="1" vectorEffect="non-scaling-stroke">
            <title>{layer.material} · {layer.thicknessMm} mm</title></polygon>);
        }
      }
    }
    return <g data-entity-id={entity.id} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick} onKeyDown={onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } } : undefined}
      style={onClick ? { cursor: "pointer" } : undefined}>
      <title>{entity.mark ?? entity.kind} · {entity.id}</title>{overlays}{shape}
      {entity.kind === "dimension" && <text x={(entity.geometry.start.x + entity.geometry.end.x) / 2}
        y={(entity.geometry.start.y + entity.geometry.end.y) / 2} fill={color} fontSize={fontMm} textAnchor="middle"
        paintOrder="stroke" stroke="white" strokeWidth={fontMm / 6}>{entity.attributes.label || `${entity.attributes.measuredMm} mm`}</text>}
      {entity.kind === "annotation" && <><line x1={entity.attributes.leader?.x ?? entity.geometry.point.x}
        y1={entity.attributes.leader?.y ?? entity.geometry.point.y} x2={entity.geometry.point.x} y2={entity.geometry.point.y}
        stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <text x={entity.geometry.point.x} y={entity.geometry.point.y} fill={color}
          fontSize={fontMm}>{entity.attributes.text}</text></>}
      {entity.mark && <text x={(entity.geometry.start.x + entity.geometry.end.x) / 2} y={(entity.geometry.start.y + entity.geometry.end.y) / 2}
        fill="#0f172a" fontSize={fontMm} textAnchor="middle" paintOrder="stroke" stroke="white" strokeWidth={fontMm / 6}>{entity.mark}</text>}
      {selected && <circle cx={(entity.geometry.start.x + entity.geometry.end.x) / 2} cy={(entity.geometry.start.y + entity.geometry.end.y) / 2}
        r={fontMm} fill="none" stroke="#ea580c" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    </g>;
  }
  if ("vertices" in entity.geometry) return <g data-entity-id={entity.id}>
    <title>{entity.mark ?? entity.kind} · {entity.id}</title>
    <polygon points={entity.geometry.vertices.map(({ x, y }) => `${x},${y}`).join(" ")} fill={color} fillOpacity=".28"
      stroke={selected ? "#ea580c" : color} strokeWidth={selected ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
    {entity.mark && <text x={polygonCenter(entity.geometry.vertices).x} y={polygonCenter(entity.geometry.vertices).y}
      fontSize={fontMm} textAnchor="middle" fill="#0f172a">{entity.mark}</text>}
  </g>;
  return <g data-entity-id={entity.id}><title>{entity.id}</title><circle cx={entity.geometry.point.x} cy={entity.geometry.point.y} r="70" fill={color} /></g>;
}

function SectionElevation({ document, section, selectedId, onSelect }: {
  document: CadDocument; section: FoundationSection; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hits = useMemo(() => getFoundationSectionIntersections(document, section), [document, section]);
  const resolved = useMemo(() => resolveFoundationSectionValues(document, section), [document, section]);
  const quantities = useMemo(() => calculateFoundationSectionMaterials(document, section), [document, section]);
  const bottom = Number(section.overrides.foundation_bottom_elevation_m?.value);
  const hasBottom = Number.isFinite(bottom);
  const baseY = hasBottom ? -bottom * 1000 : 0;
  const ground = Number(section.overrides.ground_elevation_m?.value);
  const zero = Number(section.overrides.zero_level_elevation_m?.value);
  const hasGround = hasBottom && Number.isFinite(ground);
  const hasZero = hasBottom && Number.isFinite(zero);
  const scale = section.paperScale ?? document.paperScale ?? 50;
  const fieldValue = (field: FoundationSectionField) => {
    const value = Number(resolved[field]?.value);
    return Number.isFinite(value) ? value * 10 : null;
  };
  const padHeight = Math.max(0, ...hits.map((hit) => {
    const entity = document.entities.find(({ id }) => id === hit.elementId);
    return entity?.kind === "construction-area" && entity.attributes.role === "pad"
      ? fieldValue("pad_height_cm") ?? hit.heightMm ?? 0 : 0;
  }));
  const maxHeight = Math.max(1000, ...hits.map((hit) => {
    const entity = document.entities.find(({ id }) => id === hit.elementId);
    const supportOffset = entity?.kind === "construction-area" && entity.attributes.role === "column"
      ? padHeight : hit.verticalOffsetMm;
    return (hit.heightMm ?? 0) + supportOffset;
  }));
  const textSize = Math.max(100, Math.min(180, maxHeight / 16));
  const yBottom = baseY + Math.max(1100, hits.length * 240 + 500);
  const cut = document.entities.find((entity) => entity.id === section.cutEntityId);
  const dx = cut?.kind === "construction-line" ? cut.geometry.end.x - cut.geometry.start.x : 0;
  const dy = cut?.kind === "construction-line" ? cut.geometry.end.y - cut.geometry.start.y : 0;
  const sectionMargin = Math.max(900, maxHeight * .75);
  const materialReserve = Math.max(1400, Math.max(0, ...hits.map(({ material }) => material?.length ?? 0)) * 105);
  const totalRange = sectionMargin * 2 + Math.max(section.visibilityRangeMm,
    hits.length ? Math.max(...hits.map(({ endMm }) => endMm)) + materialReserve : 1000);
  const elevationCandidates = [
    baseY - maxHeight - 500,
    ...(hasGround ? [-(ground - bottom) * 1000] : []),
    ...(hasZero ? [-(zero - bottom) * 1000] : []),
  ];
  const yTop = Math.min(...elevationCandidates) - 500;
  const viewBox = { x: 0, y: yTop, width: totalRange, height: yBottom - yTop };
  const sectionX = (distance: number) => section.viewDirection === "left"
    ? sectionMargin + distance : totalRange - sectionMargin - distance;
  const concretePattern = `section-concrete-${section.id}`;
  const masonryPattern = `section-masonry-${section.id}`;
  const blindingPattern = `section-blinding-${section.id}`;
  const groundPattern = `section-ground-${section.id}`;
  const xpsPattern = `section-xps-${section.id}`;
  const arrowMarker = `section-arrow-${section.id}`;
  const isMasonry = (material: string | null) => /bloc|pustak|ceg|muro|silik|beton komór/i.test(material ?? "");
  const elevationY = (elevation: number) => -(elevation - bottom) * 1000;
  const levelSymbol = (y: number, label: string, color: string, key: string) => <g key={key}>
    <line x1={totalRange - 820} y1={y} x2={totalRange - 120} y2={y} stroke={color} strokeWidth="1.25"
      vectorEffect="non-scaling-stroke" />
    <path d={`M${totalRange - 820} ${y} l120 -90 l120 90 Z`} fill="white" stroke={color} strokeWidth="1.25"
      vectorEffect="non-scaling-stroke" />
    <text x={totalRange - 540} y={y - 45} fontSize={textSize} fill={color}>{label}</text>
  </g>;
  const drawing = <svg ref={svgRef} className="cad-section-svg" role="img" aria-label={`Rysunek przekroju ${section.label}`}
    width={`${totalRange / scale}mm`} height={`${(yBottom - yTop) / scale}mm`}
    viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern id={concretePattern} width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="180" height="180" fill="#f8fafc" />
          <path d="M0 0 V180 M90 0 V180" stroke="#64748b" strokeWidth="7" />
      </pattern>
      <pattern id={masonryPattern} width="360" height="180" patternUnits="userSpaceOnUse">
          <rect width="360" height="180" fill="#f8fafc" />
          <path d="M0 0 H360 M0 90 H360 M0 180 H360 M90 0 V90 M270 0 V90 M0 90 V180 M180 90 V180"
            fill="none" stroke="#64748b" strokeWidth="7" />
      </pattern>
      <pattern id={blindingPattern} width="260" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="260" height="220" fill="#f1f5f9" />
          <path d="M0 0 V220" stroke="#94a3b8" strokeWidth="6" />
      </pattern>
      <pattern id={groundPattern} width="260" height="210" patternUnits="userSpaceOnUse">
          <rect width="260" height="210" fill="#faf7f0" />
          <path d="M20 35 l65 -18 M135 62 l82 -25 M5 142 l48 -14 M105 174 l70 -20 M215 120 l35 -10"
            stroke="#8b7355" strokeWidth="6" />
          <circle cx="105" cy="82" r="7" fill="#8b7355" /><circle cx="215" cy="175" r="6" fill="#8b7355" />
      </pattern>
      <pattern id={xpsPattern} width="140" height="160" patternUnits="userSpaceOnUse">
          <rect width="140" height="160" fill="#fff8d6" />
          <path d="M0 80 L35 15 L70 145 L105 15 L140 80" fill="none" stroke="#a16207" strokeWidth="8" />
      </pattern>
      <marker id={arrowMarker} markerUnits="userSpaceOnUse" markerWidth="90" markerHeight="90"
          viewBox="-45 -45 90 90" refX="0" refY="0" orient="auto">
          <path d="M-32 32 L32 -32" fill="none" stroke="#334155" strokeWidth="9" />
      </marker>
    </defs>
    <rect x={0} y={yTop} width={totalRange} height={yBottom - yTop} fill="#fff" />
    {hasGround && <g aria-label="Grunt">
      <path d={`M0 ${elevationY(ground)} q180 -65 360 0 t360 0 t360 0 t360 0 t360 0 t360 0 t360 0 t360 0
          L${totalRange} ${yBottom} H0 Z`} fill={`url(#${groundPattern})`} opacity=".72" />
      <path d={`M0 ${elevationY(ground)} q180 -65 360 0 t360 0 t360 0 t360 0 t360 0 t360 0 t360 0 t360 0`}
          fill="none" stroke="#5b4630" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </g>}
    {!hasBottom && <text x={totalRange / 2} y={yTop + 620} textAnchor="middle" fontSize={textSize} fill="#9a3412">
      Rzędna spodu fundamentu niepodana — położenie pionowe nieustalone
    </text>}
    {hits.map((hit, index) => {
      const entity = document.entities.find(({ id }) => id === hit.elementId)!;
      const height = entity.kind === "construction-area" && entity.attributes.role === "pad"
          ? fieldValue("pad_height_cm") ?? hit.heightMm
          : entity.kind === "construction-area" && entity.attributes.role === "column"
            ? hit.heightMm
          : entity.kind === "construction-line" && entity.attributes.role === "foundation-wall"
            ? fieldValue("wall_height_cm") ?? hit.heightMm
          : entity.kind === "footing" ? fieldValue("footing_height_cm") ?? hit.heightMm
            : entity.kind === "construction-line" && entity.attributes.role === "beam"
              ? fieldValue("beam_height_cm") ?? hit.heightMm : hit.heightMm;
      if (height === null) return <g key={`${hit.elementId}-${index}`} data-section-element={hit.elementId}
        role="button" tabIndex={0} onClick={() => onSelect(hit.elementId)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(hit.elementId); } }}>
        <line x1={Math.min(sectionX(hit.startMm), sectionX(hit.endMm))} y1={baseY}
          x2={Math.max(sectionX(hit.startMm), sectionX(hit.endMm))} y2={baseY}
          stroke="#dc2626" strokeWidth="3" strokeDasharray="12 6" vectorEffect="non-scaling-stroke" />
        <title>{entity.mark ?? hit.elementType}: wysokość nieznana; ID {hit.elementId}</title>
      </g>;
      const overrideWidth = entity.kind === "construction-area" && entity.attributes.role === "pad"
        ? fieldValue("pad_length_cm")
        : entity.kind === "construction-area" && entity.attributes.role === "column"
          ? fieldValue("column_length_cm")
          : entity.kind === "construction-line" && entity.attributes.role === "foundation-wall"
            ? fieldValue("wall_thickness_cm")
            : entity.kind === "footing" ? fieldValue("footing_width_cm")
              : entity.kind === "construction-line" && entity.attributes.role === "beam"
                ? fieldValue("beam_width_cm") : null;
      const hitCenter = (hit.startMm + hit.endMm) / 2;
      const shownStart = overrideWidth ? hitCenter - overrideWidth / 2 : hit.startMm;
      const shownEnd = overrideWidth ? hitCenter + overrideWidth / 2 : hit.endMm;
      const xStart = sectionX(shownStart), xEnd = sectionX(shownEnd);
      const xLeft = Math.min(xStart, xEnd), xRight = Math.max(xStart, xEnd);
      const xCenter = (xStart + xEnd) / 2;
      const isWall = (entity.kind === "construction-line" && entity.attributes.role === "foundation-wall")
        || entity.kind === "wall";
      const isFooting = entity.kind === "footing";
      const isPad = entity.kind === "construction-area" && entity.attributes.role === "pad";
      const isColumn = entity.kind === "construction-area" && entity.attributes.role === "column";
      const isBeam = entity.kind === "construction-line" && entity.attributes.role === "beam";
      const verticalOffset = isColumn && padHeight > 0 ? padHeight : hit.verticalOffsetMm;
      const elementBottom = baseY - verticalOffset;
      const elementTop = elementBottom - height;
      const resolvedMaterial = isFooting
        ? resolved.footing_material?.value ?? resolved.concrete_class?.value
        : isPad ? resolved.pad_material?.value ?? resolved.concrete_class?.value
          : isColumn ? resolved.column_material?.value ?? resolved.concrete_class?.value
            : isBeam ? resolved.beam_material?.value ?? resolved.concrete_class?.value
              : isWall ? resolved.wall_material?.value : undefined;
      const material = hit.material ?? String(resolvedMaterial ?? "");
      const fillPattern = isMasonry(material) ? masonryPattern : concretePattern;
      const xpsValue = Number(resolved.xps_thickness_cm?.value) * 10;
      const xps = Number.isFinite(xpsValue) && xpsValue > 0 ? xpsValue : 0;
      const waterproofing = String(resolved.waterproofing_type?.value ?? "");
      const blindingValue = Number(resolved.blinding_concrete_thickness_cm?.value) * 10;
      const blinding = Number.isFinite(blindingValue) && blindingValue > 0 ? blindingValue : 0;
      const exteriorX = section.viewDirection === "left" ? xRight : xLeft;
      const xpsX = section.viewDirection === "left" ? xRight : xLeft - xps;
      const labelX = section.viewDirection === "left" ? xRight + Math.max(420, xps + 220) : xLeft - Math.max(420, xps + 220);
      const dimensionY = baseY + 300 + index * 220;
      const selected = selectedId === hit.elementId;
      return <g key={`${hit.elementId}-${index}`} data-section-element={hit.elementId} role="button" tabIndex={0}
        aria-label={`${entity.mark ?? hit.elementType}, ${hit.endMm - hit.startMm} milimetrów`}
        onClick={() => onSelect(hit.elementId)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(hit.elementId); } }}
        style={{ cursor: "pointer" }}>
        <title>{entity.mark ?? hit.elementType} · {entity.id}{hit.material ? ` · ${hit.material}` : ""}</title>
        {(isColumn || isWall) && <line x1={xCenter} y1={elementTop - 350} x2={xCenter} y2={baseY + 220}
          stroke="#475569" strokeWidth="1.2" strokeDasharray="14 5 2 5" vectorEffect="non-scaling-stroke" />}
        <rect x={xLeft} y={elementTop}
          width={shownEnd - shownStart} height={height}
          fill={`url(#${fillPattern})`} stroke={selected ? "#ea580c" : "#111827"}
          strokeWidth={selected ? 4 : 2.5} vectorEffect="non-scaling-stroke" />
        {isWall && xps > 0 &&
          <rect x={xpsX} y={elementTop} width={xps} height={height}
            fill={`url(#${xpsPattern})`} stroke="#a16207" strokeWidth="1.25" vectorEffect="non-scaling-stroke">
            <title>XPS {xps} mm</title>
          </rect>}
        {isWall && waterproofing && <g>
          <line x1={section.viewDirection === "left" ? exteriorX + xps : exteriorX - xps} y1={elementTop}
            x2={section.viewDirection === "left" ? exteriorX + xps : exteriorX - xps} y2={elementBottom}
            stroke="#0369a1" strokeWidth="3.5" vectorEffect="non-scaling-stroke"><title>{waterproofing}</title></line>
          <line x1={xLeft - 80} y1={elementBottom - 18} x2={xRight + 80} y2={elementBottom - 18}
            stroke="#0369a1" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </g>}
        {(isFooting || isPad) && blinding > 0 &&
          <rect x={xLeft - 120} y={baseY} width={shownEnd - shownStart + 240}
            height={blinding} fill={`url(#${blindingPattern})`} stroke="#64748b" strokeWidth="1.25"
            vectorEffect="non-scaling-stroke">
            <title>Podkład betonowy {blinding} mm</title>
          </rect>}
        <line x1={xLeft} y1={elementBottom + 35} x2={xLeft} y2={dimensionY + 45}
          stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={xRight} y1={elementBottom + 35} x2={xRight} y2={dimensionY + 45}
          stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={xLeft} y1={dimensionY} x2={xRight} y2={dimensionY} stroke="#334155" strokeWidth="1.2"
          vectorEffect="non-scaling-stroke" markerStart={`url(#${arrowMarker})`} markerEnd={`url(#${arrowMarker})`} />
        <text x={xCenter} y={dimensionY - 55} textAnchor="middle" fontSize={textSize} fill="#0f172a">
          {Math.round(shownEnd - shownStart)} mm
        </text>
        <line x1={xLeft - 180} y1={elementTop} x2={xLeft - 180} y2={elementBottom} stroke="#334155" strokeWidth="1.2"
          vectorEffect="non-scaling-stroke" markerStart={`url(#${arrowMarker})`} markerEnd={`url(#${arrowMarker})`} />
        <line x1={xLeft - 210} y1={elementTop} x2={xLeft + 15} y2={elementTop}
          stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={xLeft - 210} y1={elementBottom} x2={xLeft + 15} y2={elementBottom}
          stroke="#64748b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <text x={xLeft - 245} y={(elementTop + elementBottom) / 2} textAnchor="middle"
          transform={`rotate(-90 ${xLeft - 245} ${(elementTop + elementBottom) / 2})`}
          fontSize={textSize} fill="#334155">{Math.round(height)} mm</text>
        <path d={`M${xCenter} ${(elementTop + elementBottom) / 2} L${labelX} ${(elementTop + elementBottom) / 2 - 150}
          H${section.viewDirection === "left" ? labelX + 420 : labelX - 420}`}
          fill="none" stroke="#334155" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <text x={section.viewDirection === "left" ? labelX + 20 : labelX - 20}
          y={(elementTop + elementBottom) / 2 - 195} textAnchor={section.viewDirection === "left" ? "start" : "end"}
          fontSize={textSize} fontWeight="700" fill="#0f172a">{entity.mark ?? hit.elementType}</text>
        <text x={section.viewDirection === "left" ? labelX + 20 : labelX - 20}
          y={(elementTop + elementBottom) / 2 - 45} textAnchor={section.viewDirection === "left" ? "start" : "end"}
          fontSize={textSize * .85} fill="#334155">{material || "materiał do uzupełnienia"}</text>
      </g>;
    })}
    {hasBottom && levelSymbol(baseY, `spód fundamentu ${bottom.toFixed(2)} m`, "#111827", "foundation-bottom")}
    {hasGround && levelSymbol(elevationY(ground), `teren ${ground.toFixed(2)} m`, "#5b4630", "ground")}
    {hasZero && levelSymbol(elevationY(zero), `±0,00 = ${zero.toFixed(2)} m`, "#1d4ed8", "zero")}
    <line x1={sectionMargin * .35} y1={yBottom - 260} x2={totalRange - sectionMargin * .35} y2={yBottom - 260}
      stroke="#111827" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <text x={sectionMargin * .35} y={yBottom - 90} fontSize={textSize * 1.12} fontWeight="700">
      PRZEKRÓJ {section.label}
    </text>
    <text x={totalRange - sectionMargin * .35} y={yBottom - 90} textAnchor="end" fontSize={textSize}>
      SKALA 1:{scale} · RYSUNEK ROBOCZY
    </text>
    <text x={totalRange / 2} y={yTop + 300} textAnchor="middle" fontSize={textSize * .9} fill="#475569">
      {Math.hypot(dx, dy).toFixed(0)} mm — zakres widoczności {section.visibilityRangeMm} mm
    </text>
    {resolved.floor_layers && <text x={100} y={yTop + 520} fontSize={textSize * .82} fill="#334155">
      Warstwy podłogi: {String(resolved.floor_layers.value)}
    </text>}
    {resolved.additional_components && <text x={100} y={yTop + 700} fontSize={textSize * .82} fill="#334155">
      Dodatkowe elementy: {String(resolved.additional_components.value)}
    </text>}
  </svg>;
  return <div className="cad-section-drawing">
    {drawing}
    <ul className="cad-section-objects" aria-label="Elementy przecięte przez linię przekroju">
      {hits.map((hit, index) => {
        const entity = document.entities.find(({ id }) => id === hit.elementId)!;
        return <li key={`${hit.elementId}-${index}`}>
          <button type="button" className="quiet-button" onClick={() => onSelect(hit.elementId)}>
            {entity.mark ?? hit.elementType} · {hit.endMm - hit.startMm} mm w rzucie
          </button>
          <span>ID {hit.elementId} · {hit.material ?? "materiał nieznany"} · {hit.dataSource === "element_instance" ? "element rzutu" : hit.dataSource}</span>
          <span>{hit.heightMm === null ? "wysokość nieznana" : `${hit.heightMm} mm`}
            {entity.reviewStatus === "verified" ? " · zweryfikowane" : " · robocze"}
            {" · ilość nieobliczona — brak pełnych danych geometrycznych i warstw."}</span>
        </li>;
      })}
    </ul>
    <section className="cad-section-quantities" aria-label="Zestawienie materiałów przekroju">
      <h4>Materiały z rzeczywistej geometrii rzutu</h4>
      {!quantities.length && <p>Brak kompletnych danych geometrycznych do obliczeń.</p>}
      {quantities.map((quantity) => <article key={quantity.key}>
        <strong>{quantity.label}</strong>
        <span>{quantity.material ?? "materiał nieokreślony"}</span>
        <span>netto {quantity.net.toFixed(3)} {quantity.unit} · z zapasem {quantity.wastePercent}%: {quantity.gross.toFixed(3)} {quantity.unit}</span>
        {quantity.warning && <small>{quantity.warning}</small>}
      </article>)}
    </section>
    <div className="cad-section-export">
      <button type="button" className="quiet-button" onClick={() => {
        if (!svgRef.current) return;
        const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", `${totalRange / scale}mm`);
        clone.setAttribute("height", `${(yBottom - yTop) / scale}mm`);
        const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob), anchor = window.document.createElement("a");
        anchor.href = url; anchor.download = `${section.label}.svg`; anchor.click(); URL.revokeObjectURL(url);
      }}>Pobierz przekrój SVG</button>
      <button type="button" className="quiet-button" onClick={() => {
        if (!svgRef.current) return;
        const serialized = new XMLSerializer().serializeToString(svgRef.current);
        const image = new Image(), url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml" }));
        image.onload = () => {
          const canvas = window.document.createElement("canvas");
          const scaleFactor = 2;
          canvas.width = Math.max(1, Math.ceil(image.width * scaleFactor));
          canvas.height = Math.max(1, Math.ceil(image.height * scaleFactor));
          const context = canvas.getContext("2d");
          if (!context) { URL.revokeObjectURL(url); return; }
          context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (!blob) return;
            const downloadUrl = URL.createObjectURL(blob), anchor = window.document.createElement("a");
            anchor.href = downloadUrl; anchor.download = `${section.label}.png`; anchor.click();
            URL.revokeObjectURL(downloadUrl);
          }, "image/png");
        };
        image.src = url;
      }}>Pobierz PNG</button>
      <button type="button" className="quiet-button" onClick={() => {
        if (!svgRef.current) return;
        const popup = window.open("", "_blank");
        if (!popup) return;
        popup.opener = null;
        const format = section.printFormat ?? "A4";
        popup.document.write(`<!doctype html><html><head><title>${section.label}</title><style>@page{size:${format} landscape;margin:10mm}body{margin:0}svg{width:100%;height:auto}</style></head><body>${new XMLSerializer().serializeToString(svgRef.current)}<script>addEventListener("load",()=>print())<\/script></body></html>`);
        popup.document.close();
      }}>Drukuj / zapisz PDF</button>
      <span>{hits.length} rzeczywistych przecięć · skala rysunku 1:{scale}</span>
    </div>
    {!hits.length && <p role="status">Linia nie przecina obecnej geometrii konstrukcyjnej. Rysunek pozostaje pusty — nie dodano elementów.</p>}
    {!hasBottom && <p className="cad-disclaimer">Bez podanej rzędnej fundamentu rysunek nie przypisuje elementom poziomu ±0,00 ani terenu.</p>}
  </div>;
}

export function CadFoundationSections({ drawing, sourceUrl, selectedEntityId, technologyHints, canUndo, canRedo,
  onUndo, onRedo, onSelectEntity, onChange }: {
  drawing: CadDocument; sourceUrl: string; selectedEntityId: string | null;
  technologyHints: { label: string; material: string; thermal: boolean }[];
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  onSelectEntity: (id: string) => void; onChange: (next: CadDocument) => void;
}) {
  const [activeId, setActiveId] = useState("");
  const [cutId, setCutId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [addMode, setAddMode] = useState<null | "element" | "line">(null);
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [miniView, setMiniView] = useState<ViewBox>(() => svgBounds(drawing));
  const [canvasWidth, setCanvasWidth] = useState(1300);
  const planSvgRef = useRef<SVGSVGElement>(null);
  const miniGesture = useRef<{ pointer: number; point: { x: number; y: number }; view: ViewBox } | null>(null);
  const miniPointers = useRef(new Map<number, { x: number; y: number }>());
  const miniPinch = useRef<{ distance: number; center: { x: number; y: number }; view: ViewBox } | null>(null);
  const automaticSignature = useRef("");
  const sections = drawing.sections ?? [];
  const active = sections.find(({ id }) => id === activeId);
  const cutLines = drawing.entities.filter((entity) => entity.kind === "construction-line" && entity.attributes.role === "section-cut");
  const values = active ? resolveFoundationSectionValues(drawing, active) : {};
  const conflicts = active ? getFoundationSectionConflicts(drawing, active) : [];
  const planCopyLayout = useMemo(() => {
    try { return { dimensions: getCadPlanDimensions(drawing, 2.5 * (drawing.paperScale ?? 100), [], undefined, false),
      faces: getCadPlanFaces(drawing), error: "" }; }
    catch (cause) { return { dimensions: [], faces: [], error: cause instanceof Error ? cause.message : "Nie udało się wyznaczyć wymiarów rzutu." }; }
  }, [drawing]);
  const planFontMm = miniView.width * (canvasWidth <= 700 ? 6 : 7) / Math.max(1, canvasWidth);
  const missing = fields.filter(({ id }) => !values[id]);
  const incompleteSections = sections.filter((section) => foundationSectionMissingFields(drawing, section).length > 0 && !section.skipped);
  const wizardSection = sections.find(({ id }) => id === activeId && incompleteSections.some((item) => item.id === id))
    ?? incompleteSections[0];
  const wizardIndex = wizardSection ? incompleteSections.findIndex(({ id }) => id === wizardSection.id) : -1;

  function openWorkspace() {
    setActiveId("");
    setEditorOpen(false);
    setWizardOpen(false);
    setAddMode(null);
    setLineStart(null);
    setMiniView(svgBounds(drawing));
    setWorkspaceOpen(true);
  }

  function closeWorkspace() {
    setActiveId("");
    setEditorOpen(false);
    setWizardOpen(false);
    setAddMode(null);
    setLineStart(null);
    setWorkspaceOpen(false);
  }

  useEffect(() => {
    const proposals = detectFoundationSectionProposals(drawing);
    const signature = JSON.stringify({
      proposals: proposals.map(({ key, fingerprint }) => [key, fingerprint]),
      hints: technologyHints,
    });
    if (automaticSignature.current === signature) return;
    automaticSignature.current = signature;
    const detected = addDetectedFoundationSections(drawing);
    const wallMaterial = technologyHints.find(({ label }) => label.toLocaleLowerCase("pl-PL").includes("ścian"))?.material;
    const waterproofing = technologyHints.find(({ label }) => label.toLocaleLowerCase("pl-PL").includes("przeciwwilgoci"))?.material;
    const next = !detected.sections?.length ? detected : {
      ...detected,
      sections: detected.sections.map((section) => {
        const resolved = resolveFoundationSectionValues(detected, section);
        return {
          ...section,
          overrides: {
            ...section.overrides,
            ...(!resolved.wall_material && wallMaterial ? {
              wall_material: { value: wallMaterial, unit: "tekst" as const, validated: false,
                source: "project_technology" as const },
            } : {}),
            ...(!resolved.waterproofing_type && waterproofing ? {
              waterproofing_type: { value: waterproofing, unit: "tekst" as const, validated: false,
                source: "project_technology" as const },
            } : {}),
          },
        };
      }),
    };
    if (JSON.stringify(next.sections ?? []) !== JSON.stringify(drawing.sections ?? [])
      || next.entities.length !== drawing.entities.length) onChange(next);
  }, [drawing, onChange, technologyHints]);
  useEffect(() => {
    const svg = planSvgRef.current;
    if (!svg) return;
    const update = () => setCanvasWidth(Math.max(1, svg.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [workspaceOpen]);

  function addSection() {
    const cut = drawing.entities.find((entity) => entity.id === (cutId || selectedEntityId));
    if (cut?.kind !== "construction-line" || cut.attributes.role !== "section-cut") return;
    const labels = new Set([...sections.map(({ label }) => label), ...drawing.entities.flatMap((entity) => entity.mark ? [entity.mark] : [])]);
    let index = 0, label = labelAt(index);
    while (labels.has(label)) label = labelAt(++index);
    const next: FoundationSection = { id: crypto.randomUUID(), label, cutEntityId: cut.id, viewDirection: "left",
      visibilityRangeMm: Math.max(1000, Math.hypot(cut.geometry.end.x - cut.geometry.start.x, cut.geometry.end.y - cut.geometry.start.y)),
      paperScale: drawing.paperScale === 10 || drawing.paperScale === 20 || drawing.paperScale === 25 || drawing.paperScale === 50
        ? drawing.paperScale : 50,
      linkedElementIds: [], overrides: {} };
    const marked = CadEntitySchema.parse({ ...cut, mark: label });
    onChange({ ...drawing, entities: drawing.entities.map((entity) => entity.id === cut.id ? marked : entity),
      sections: [...sections, next] });
    setActiveId(next.id);
  }

  function patchSection(patch: Partial<FoundationSection>) {
    if (!active) return;
    onChange({ ...drawing, sections: sections.map((section) => section.id === active.id ? { ...section, ...patch } : section) });
  }

  function createManualSection(start: { x: number; y: number }, end: { x: number; y: number }, linkedElementIds: string[] = []) {
    if (start.x === end.x && start.y === end.y) return;
    const cutEntityId = crypto.randomUUID(), id = crypto.randomUUID();
    const label = labelAt(sections.length);
    const cut = CadEntitySchema.parse({
      id: cutEntityId, layerId: "section-cut", units: "mm", kind: "construction-line", reviewStatus: "draft",
      source: { documentId: null, page: null, origin: "manual", confidence: null },
      geometry: { start, end }, attributes: { role: "section-cut", widthMm: 1, heightMm: 1,
        material: "Linia cięcia", designReference: "Przekrój dodany ręcznie" },
    });
    const section: FoundationSection = {
      id, label, cutEntityId, viewDirection: "left", visibilityRangeMm: Math.hypot(end.x - start.x, end.y - start.y),
      paperScale: 20, linkedElementIds, marker: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      kind: linkedElementIds.length ? "custom" : "linear", state: "incomplete", printFormat: "A4",
      wastePercent: 0, overrides: {},
    };
    onChange({ ...drawing, entities: [...drawing.entities, cut], sections: [...sections, section] });
    setActiveId(id); setEditorOpen(true); setAddMode(null); setLineStart(null);
  }

  function addForEntity(entity: CadEntity) {
    const existing = sections.find((section) => section.linkedElementIds?.includes(entity.id));
    if (existing) { setActiveId(existing.id); setEditorOpen(true); setAddMode(null); return; }
    const proposal = detectFoundationSectionProposals(drawing).find(({ linkedElementIds }) => linkedElementIds.includes(entity.id));
    if (proposal) {
      createManualSection(proposal.cutStart, proposal.cutEnd, proposal.linkedElementIds);
      return;
    }
    const center = "start" in entity.geometry
      ? { x: (entity.geometry.start.x + entity.geometry.end.x) / 2, y: (entity.geometry.start.y + entity.geometry.end.y) / 2 }
      : "vertices" in entity.geometry ? polygonCenter(entity.geometry.vertices) : entity.geometry.point;
    createManualSection({ x: center.x - 1000, y: center.y }, { x: center.x + 1000, y: center.y }, [entity.id]);
  }

  function saveWizardSection(skip = false) {
    if (!wizardSection) return;
    if (skip) {
      onChange({ ...drawing, sections: sections.map((section) => section.id === wizardSection.id
        ? { ...section, skipped: true, state: "incomplete" } : section) });
    } else {
      const nextOverrides = { ...wizardSection.overrides };
      const errors: Record<string, string> = {};
      for (const fieldId of foundationSectionMissingFields(drawing, wizardSection)) {
        const field = fields.find(({ id }) => id === fieldId)!;
        const key = `${wizardSection.id}:${field.id}`, raw = drafts[key]?.trim();
        if (!raw) { errors[key] = "To pole jest wymagane do ukończenia przekroju."; continue; }
        const value = field.numeric ? Number(raw) : raw;
        if (field.numeric && (!Number.isFinite(value) || field.unit === "cm" && Number(value) <= 0)) {
          errors[key] = "Wpisz poprawną wartość."; continue;
        }
        nextOverrides[field.id] = { value, unit: field.unit, validated: true };
      }
      if (Object.keys(errors).length) { setFieldErrors((current) => ({ ...current, ...errors })); return; }
      onChange({ ...drawing, sections: sections.map((section) => section.id === wizardSection.id
        ? { ...section, overrides: nextOverrides, skipped: false, state: "needs-review" } : section) });
    }
    const next = incompleteSections[wizardIndex + 1];
    if (next) setActiveId(next.id); else setWizardOpen(false);
  }

  function removeSection(section: FoundationSection) {
    const cut = drawing.entities.find((entity) => entity.id === section.cutEntityId);
    onChange({ ...drawing, entities: drawing.entities.map((entity) => entity.id === cut?.id && entity.mark === section.label
      ? CadEntitySchema.parse({ ...entity, mark: undefined }) : entity),
      sections: sections.filter(({ id }) => id !== section.id) });
    setActiveId(sections.find(({ id }) => id !== section.id)?.id ?? "");
  }

  function saveOverride(field: typeof fields[number], raw: string) {
    if (!active || !raw.trim()) return;
    const draftKey = `${active.id}:${field.id}`;
    const value = field.numeric ? Number(raw) : raw.trim();
    if (field.numeric && (typeof value !== "number" || !Number.isFinite(value) || (field.unit === "cm" && value <= 0))) {
      setFieldErrors((current) => ({ ...current, [draftKey]: field.unit === "cm" ? "Wpisz dodatni wymiar w centymetrach." : "Wpisz poprawną, skończoną rzędną w metrach." }));
      return;
    }
    patchSection({ overrides: { ...active.overrides, [field.id]: { value, unit: field.unit, validated: true } } });
    setDrafts((current) => { const next = { ...current }; delete next[draftKey]; return next; });
    setFieldErrors((current) => { const next = { ...current }; delete next[draftKey]; return next; });
  }

  function miniPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
    const point = svg.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: transformed.x, y: transformed.y };
  }
  function startMiniPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.target instanceof Element && event.target.closest("[data-section-marker]")) return;
    if (addMode === "line") {
      const point = miniPoint(event.currentTarget, event.clientX, event.clientY);
      if (!lineStart) setLineStart(point);
      else createManualSection(lineStart, point);
      return;
    }
    if (event.pointerType === "touch") {
      miniPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (miniPointers.current.size === 2) {
        const [first, second] = [...miniPointers.current.values()];
        miniPinch.current = {
          distance: Math.hypot(second!.x - first!.x, second!.y - first!.y),
          center: miniPoint(event.currentTarget, (first!.x + second!.x) / 2, (first!.y + second!.y) / 2),
          view: miniView,
        };
        miniGesture.current = null;
        return;
      }
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    miniGesture.current = { pointer: event.pointerId, point: miniPoint(event.currentTarget, event.clientX, event.clientY), view: miniView };
  }
  function moveMiniPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "touch" && miniPointers.current.has(event.pointerId)) {
      miniPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (miniPinch.current && miniPointers.current.size >= 2) {
        const [first, second] = [...miniPointers.current.values()];
        const distance = Math.max(1, Math.hypot(second!.x - first!.x, second!.y - first!.y));
        const factor = miniPinch.current.distance / distance, initial = miniPinch.current.view;
        const width = Math.max(100, Math.min(100_000_000, initial.width * factor));
        const ratio = width / initial.width, anchor = miniPinch.current.center;
        setMiniView({ x: anchor.x - (anchor.x - initial.x) * ratio, y: anchor.y - (anchor.y - initial.y) * ratio,
          width, height: initial.height * ratio });
        return;
      }
    }
    const gesture = miniGesture.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const point = miniPoint(event.currentTarget, event.clientX, event.clientY), dx = point.x - gesture.point.x, dy = point.y - gesture.point.y;
    setMiniView({ ...gesture.view, x: gesture.view.x - dx, y: gesture.view.y - dy });
  }
  function zoomMini(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15, anchor = miniPoint(event.currentTarget, event.clientX, event.clientY);
    setMiniView((view) => {
      const width = Math.max(100, Math.min(100_000_000, view.width * factor)), ratio = width / view.width;
      return { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio,
        width, height: view.height * ratio };
    });
  }
  function endMiniGesture(pointerId: number) {
    miniPointers.current.delete(pointerId);
    if (miniPointers.current.size < 2) miniPinch.current = null;
    miniGesture.current = null;
  }

  return <section className={`cad-foundation-sections${workspaceOpen ? " cad-foundation-sections-workspace" : ""}`}
    aria-labelledby="foundation-sections-heading" role={workspaceOpen ? "dialog" : undefined}
    aria-modal={workspaceOpen ? true : undefined}>
    {workspaceOpen && <div className="cad-foundation-sections-heading">
      <div>
        <h3 id="foundation-sections-heading">Przekroje fundamentów i poziomy posadowienia</h3>
        <p>Wybierz znacznik na rzucie, aby otworzyć rysunek i właściwości przekroju.</p>
      </div>
      <button type="button" className="quiet-button" onClick={closeWorkspace}>Zamknij edytor przekrojów</button>
    </div>}
    {workspaceOpen && <p className="cad-disclaimer">Przekrój jest rysunkiem roboczym, nie projektem konstrukcyjnym. Nie dobiera zbrojenia, nośności gruntu, klas materiałów ani zgodności normowej; dane do realizacji wymaga weryfikacji uprawnionego projektanta.</p>}
    <div className="cad-canvas-frame cad-section-canvas-frame">
    <svg ref={planSvgRef} className="cad-canvas cad-section-plan" role="img" tabIndex={workspaceOpen ? 0 : -1}
      aria-label={workspaceOpen ? "Rzut fundamentów w trybie tylko do odczytu" : "Otwórz pełnoekranowy edytor przekrojów"}
      viewBox={`${miniView.x} ${miniView.y} ${miniView.width} ${miniView.height}`} preserveAspectRatio="xMidYMid meet"
      data-paper-scale={drawing.paperScale ?? 100}
      onPointerDown={workspaceOpen ? startMiniPan : undefined}
      onPointerMove={workspaceOpen ? moveMiniPan : undefined}
      onPointerUp={workspaceOpen ? () => { miniGesture.current = null; } : undefined}
      onPointerUpCapture={workspaceOpen ? (event) => endMiniGesture(event.pointerId) : undefined}
      onPointerCancel={workspaceOpen ? (event) => endMiniGesture(event.pointerId) : undefined}
      onWheel={workspaceOpen ? zoomMini : undefined}>
      <defs>
        <pattern id="section-plan-grid" width={drawing.sourceImage ? miniView.width / 40 : 500}
          height={drawing.sourceImage ? miniView.width / 40 : 500} patternUnits="userSpaceOnUse">
          <path d={`M ${drawing.sourceImage ? miniView.width / 40 : 500} 0 L 0 0 0 ${drawing.sourceImage ? miniView.width / 40 : 500}`}
            fill="none" stroke="#dce3eb" strokeWidth=".5" vectorEffect="non-scaling-stroke" />
        </pattern>
        {["thermal", "waterproofing", "finish", "bedding", "structure"].map((purpose) => <pattern
          key={purpose} id={`section-plan-hatch-${purpose}`} width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="80" height="80" fill={purpose === "thermal" ? "#fff5ce" : purpose === "waterproofing" ? "#c9eaf7" : "#e6e8ed"} />
          <path d={purpose === "thermal" ? "M0 40 L20 0 L40 80 L60 0 L80 40" : "M0 80 L80 0"}
            stroke={purpose === "thermal" ? "#b98522" : "#64748b"} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </pattern>)}
      </defs>
      <rect x={miniView.x - miniView.width} y={miniView.y - miniView.height} width={miniView.width * 3} height={miniView.height * 3} fill="#fff" />
      <rect x={miniView.x - miniView.width} y={miniView.y - miniView.height} width={miniView.width * 3} height={miniView.height * 3} fill="url(#section-plan-grid)" />
      <g className="cad-coordinate-axes" pointerEvents="none" stroke="#9aa8bb" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <line x1="0" y1={miniView.y} x2="0" y2={miniView.y + miniView.height} strokeDasharray="8 4" />
        <line x1={miniView.x} y1="0" x2={miniView.x + miniView.width} y2="0" strokeDasharray="8 4" />
      </g>
      {drawing.sourceImage && sourceUrl && <image href={sourceUrl} x={0} y={0}
        width={drawing.sourceImage.widthPx * drawing.sourceImage.mmPerPixel}
        height={drawing.sourceImage.heightPx * drawing.sourceImage.mmPerPixel} opacity=".4" />}
      {drawing.entities.filter((entity) => workspaceOpen
        || entity.kind !== "construction-line" || entity.attributes.role !== "section-cut")
        .map((entity) => <PlanEntity key={entity.id} entity={entity} faces={planCopyLayout.faces}
        fontMm={planFontMm}
        selected={workspaceOpen && (entity.id === selectedEntityId || sections.some((section) => section.cutEntityId === entity.id && section.id === active?.id))}
        onClick={workspaceOpen ? () => {
          if (addMode === "element") { addForEntity(entity); return; }
          onSelectEntity(entity.id);
          const section = sections.find(({ cutEntityId }) => cutEntityId === entity.id);
          if (section) { setActiveId(section.id); setEditorOpen(true); }
        } : undefined} />)}
      <CadPlanDimensions dimensions={planCopyLayout.dimensions} fontMm={planFontMm}
        onDimensionClick={workspaceOpen ? (dimension) => { if (dimension.entityId) onSelectEntity(dimension.entityId); } : undefined} />
      {workspaceOpen && sections.map((section) => {
        const line = drawing.entities.find((entity) => entity.id === section.cutEntityId);
        if (line?.kind !== "construction-line") return null;
        const { start, end } = line.geometry, middle = section.marker ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const norm = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        const direction = section.viewDirection === "left" ? -1 : 1;
        const viewEnd = { x: middle.x + direction * (end.y - start.y) / norm * 900,
          y: middle.y + direction * -(end.x - start.x) / norm * 900 };
        const state = foundationSectionState(drawing, section);
        const markerSize = Math.max(planFontMm * 6, Math.max(320, Math.min(800, miniView.width / 16)));
        const stateColor = state === "complete" ? "#15803d" : state === "outdated" ? "#b91c1c"
          : state === "needs-review" ? "#c2410c" : "#ca8a04";
        return <g key={section.id} data-section-marker={section.id} data-section-state={state} role="button" tabIndex={0}
          aria-label={`Otwórz przekrój ${section.label}, ${state}`} onClick={() => {
            if (!workspaceOpen) { setWorkspaceOpen(true); return; }
            setActiveId(section.id); setEditorOpen(true);
          }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!workspaceOpen) { setWorkspaceOpen(true); return; }
            setActiveId(section.id); setEditorOpen(true);
          } }}
          style={{ cursor: "pointer" }}>
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#ea580c" strokeWidth="5"
            vectorEffect="non-scaling-stroke"
            markerStart={`url(#section-plan-arrow-${section.id})`} markerEnd={`url(#section-plan-arrow-${section.id})`} />
          <line x1={middle.x} y1={middle.y} x2={viewEnd.x} y2={viewEnd.y} stroke="#9a3412" strokeWidth="8"
            vectorEffect="non-scaling-stroke"
            markerEnd={`url(#section-view-arrow-${section.id})`} />
          <rect x={middle.x - markerSize / 2} y={middle.y - markerSize / 2} width={markerSize} height={markerSize}
            rx={markerSize * .08} fill="white" stroke={stateColor} strokeWidth="4" vectorEffect="non-scaling-stroke" />
          <text x={middle.x} y={middle.y + planFontMm * .38} fontSize={planFontMm * 1.15} fontWeight="700"
            textAnchor="middle" fill={stateColor}>{section.label}</text>
          <defs>            <marker id={`section-plan-arrow-${section.id}`} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 Z" fill="#ea580c" /></marker>
            <marker id={`section-view-arrow-${section.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="#9a3412" /></marker></defs>
        </g>;
      })}
    </svg>
    {!workspaceOpen && <button type="button" className="cad-canvas-open"
      aria-label="Otwórz pełnoekranowy edytor przekrojów" onClick={openWorkspace} />}
    </div>
    {planCopyLayout.error && <p className="alert alert-error" role="alert">{planCopyLayout.error}</p>}
    {workspaceOpen && <>
      <div className="cad-section-plan-actions">
        <button className="quiet-button" type="button" onClick={() => setMiniView(svgBounds(drawing))}>Dopasuj rzut</button>
        <button className="quiet-button" type="button" disabled={!canUndo} onClick={onUndo}>Cofnij</button>
        <button className="quiet-button" type="button" disabled={!canRedo} onClick={onRedo}>Ponów</button>
        <button className="primary-button" type="button" aria-expanded={addMode !== null}
          onClick={() => { setWorkspaceOpen(true); setAddMode((current) => current ? null : "element"); setLineStart(null); }}>+ Dodaj własny przekrój</button>
        {addMode && <div className="cad-section-add-mode" role="group" aria-label="Sposób dodawania przekroju">
          <button type="button" className="quiet-button" aria-pressed={addMode === "element"}
            onClick={() => { setAddMode("element"); setLineStart(null); }}>Wskaż element</button>
          <button type="button" className="quiet-button" aria-pressed={addMode === "line"}
            onClick={() => { setAddMode("line"); setLineStart(null); }}>Wskaż dwa punkty linii</button>
          <span>{addMode === "element" ? "Dotknij słupa, stopy, ławy, ściany lub belki."
            : lineStart ? "Wskaż drugi punkt i kierunek linii cięcia." : "Wskaż pierwszy punkt linii cięcia."}</span>
        </div>}
        <label>Linia cięcia<select aria-label="Linia cięcia przekroju" value={cutLines.some(({ id }) => id === (cutId || selectedEntityId))
          ? cutId || selectedEntityId || "" : cutId}
          onChange={(event) => setCutId(event.target.value)}>
          <option value="">Wybierz istniejącą linię cięcia</option>
          {cutLines.map((entity) => <option key={entity.id} value={entity.id}>{entity.mark ?? entity.id}</option>)}
        </select></label>
        <button className="primary-button" type="button" disabled={!cutLines.some((entity) => entity.id === (cutId || selectedEntityId))}
          onClick={addSection}>Utwórz przekrój z linii cięcia</button>
      </div>
      {!sections.length && <p>Najpierw narysuj linię cięcia narzędziem „Linia przekroju”, a następnie wybierz ją powyżej. Przekrój wykorzystuje rzeczywiste przecięcia z geometrią konstrukcyjną.</p>}
      {editorOpen && active && <div className="cad-section-modal" role="dialog" aria-modal="true" aria-label={`Edytor przekroju ${active.label}`}>
        <div className="cad-section-modal-card">
          <header><div><strong>{active.label}</strong><span>Interaktywny rysunek techniczny · elementy są powiązane z rzutem</span></div>
            <button type="button" className="quiet-button" aria-label="Zamknij edytor przekroju" onClick={() => setEditorOpen(false)}>×</button></header>
          <div className="cad-section-editor-layout">
            <SectionElevation document={drawing} section={active} selectedId={selectedEntityId} onSelect={onSelectEntity} />
            <aside className="cad-section-property-sheet">
              <h4>Właściwości przekroju</h4>
              <p>Zmiany wymiarów są lokalnymi nadpisaniami przekroju i nie modyfikują rzutu fundamentów.</p>
              <label>Nazwa przekroju
                <input value={active.label} maxLength={40}
                  onChange={(event) => patchSection({ label: event.target.value.toLocaleUpperCase("pl-PL") })} />
              </label>
              <label>Kierunek patrzenia
                <select value={active.viewDirection} onChange={(event) => {
                  if (event.target.value === "left" || event.target.value === "right") {
                    patchSection({ viewDirection: event.target.value });
                  }
                }}>
                  <option value="left">W lewo</option>
                  <option value="right">W prawo</option>
                </select>
              </label>
              <label>Skala przekroju
                <select value={active.paperScale ?? 50} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (value === 10 || value === 20 || value === 25 || value === 50) patchSection({ paperScale: value });
                }}>
                  <option value={10}>1:10</option>
                  <option value={20}>1:20</option>
                  <option value={25}>1:25</option>
                  <option value={50}>1:50</option>
                </select>
              </label>
              <label>Format wydruku
                <select value={active.printFormat ?? "A4"}
                  onChange={(event) => patchSection({ printFormat: event.target.value === "A3" ? "A3" : "A4" })}>
                  <option value="A4">A4 poziomo</option>
                  <option value="A3">A3 poziomo</option>
                </select>
              </label>
              <label>Zapas materiałowy (%)
                <input type="number" min={0} max={100} step="0.5" value={active.wastePercent ?? 0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value) && value >= 0 && value <= 100) patchSection({ wastePercent: value });
                  }} />
              </label>
              <span className={`cad-section-status is-${foundationSectionState(drawing, active)}`}>
                Status: {foundationSectionState(drawing, active) === "complete" ? "kompletny"
                  : foundationSectionState(drawing, active) === "outdated" ? "wymaga aktualizacji po zmianie rzutu"
                    : foundationSectionState(drawing, active) === "needs-review" ? "wymaga weryfikacji projektanta"
                      : "wymaga uzupełnienia"}
              </span>
              {!!conflicts.length && <p className="alert alert-error" role="alert">
                Konflikt danych: {conflicts.map((id) => fields.find((field) => field.id === id)?.label ?? id).join(", ")}.
              </p>}
              {foundationSectionState(drawing, active) === "outdated" && <button type="button" className="quiet-button"
                onClick={() => patchSection({
                  sourceFingerprint: foundationSectionFingerprint(drawing,
                    active.sourceElementIds ?? active.linkedElementIds ?? []),
                  state: "incomplete",
                })}>Zaktualizuj z bieżącego rzutu</button>}
              {!!missing.length && <button type="button" className="primary-button" onClick={() => setWizardOpen(true)}>
                Uzupełnij brakujące dane ({missing.length})
              </button>}
              {fields.filter((field) => {
                if (active.kind === "column-pad") return field.id.startsWith("pad_") || field.id.startsWith("column_")
                  || ["foundation_bottom_elevation_m", "ground_elevation_m", "zero_level_elevation_m", "concrete_class"].includes(field.id);
                if (active.kind === "beam") return field.id.startsWith("beam_") || field.id.endsWith("_elevation_m");
                return !field.id.startsWith("pad_") && !field.id.startsWith("column_") && !field.id.startsWith("beam_");
              }).map((field) => {
                const key = `${active.id}:${field.id}`, resolved = values[field.id];
                return <label key={field.id}>{field.label}{field.unit !== "tekst" && ` (${field.unit})`}
                  <input type={field.numeric ? "number" : "text"} step="any"
                    value={drafts[key] ?? String(resolved?.value ?? "")}
                    onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                    onBlur={(event) => { if (event.target.value.trim()) saveOverride(field, event.target.value); }} />
                  <small>{resolved ? sourceLabels[resolved.source] : "brak danych"}</small>
                </label>;
              })}
              <button className="quiet-button" type="button"
                onClick={() => { removeSection(active); setEditorOpen(false); }}>
                Usuń przekrój (zachowaj linię cięcia)
              </button>
            </aside>
          </div>
        </div>
      </div>}
      {wizardOpen && wizardSection && <div className="cad-section-modal cad-section-wizard" role="dialog" aria-modal="true"
        aria-label={`Uzupełnij przekrój ${wizardIndex + 1} z ${incompleteSections.length}`}>
        <div className="cad-section-modal-card">
          <header><div><strong>Uzupełnij przekrój {wizardIndex + 1} z {incompleteSections.length} — {wizardSection.label}</strong>
            <span>Pokazujemy wyłącznie dane, których nie udało się odczytać z rzutu.</span></div>
            <button type="button" className="quiet-button" aria-label="Zamknij kreator" onClick={() => setWizardOpen(false)}>×</button></header>
          <div className="cad-section-wizard-fields">
            {foundationSectionMissingFields(drawing, wizardSection).map((fieldId) => {
              const field = fields.find(({ id }) => id === fieldId)!;
              const key = `${wizardSection.id}:${field.id}`;
              return <label key={field.id}>{field.label} {field.unit !== "tekst" && `(${field.unit})`}
                <input type={field.numeric ? "number" : "text"} step="any" value={drafts[key] ?? ""}
                  placeholder="Brak danych w projekcie"
                  onChange={(event) => {
                    setDrafts((current) => ({ ...current, [key]: event.target.value }));
                    setFieldErrors((current) => { const next = { ...current }; delete next[key]; return next; });
                  }} />
                {fieldErrors[key] && <span className="alert alert-error">{fieldErrors[key]}</span>}
              </label>;
            })}
          </div>
          <footer>
            <button type="button" className="quiet-button" disabled={wizardIndex <= 0}
              onClick={() => setActiveId(incompleteSections[wizardIndex - 1]!.id)}>Wstecz</button>
            <button type="button" className="quiet-button" onClick={() => saveWizardSection(true)}>Pomiń na razie</button>
            <button type="button" className="quiet-button" onClick={() => setWizardOpen(false)}>Zamknij</button>
            <button type="button" className="primary-button" onClick={() => saveWizardSection(false)}>Zapisz i dalej</button>
          </footer>
        </div>
      </div>}
    </>}
  </section>;
}
