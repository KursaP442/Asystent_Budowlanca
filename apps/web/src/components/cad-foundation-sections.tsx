"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode,
  type WheelEvent as ReactWheelEvent } from "react";
import { CadEntitySchema, type CadDocument, type CadEntity, type FoundationSection, type FoundationSectionField } from "@asystent/schemas";
import { cadLayerOutline, cadLayerSides, foundationPlanExtents, getCadPlanDimensions, getCadPlanFaces,
  getFoundationSectionConflicts, getFoundationSectionIntersections, polygonCenter, resolveFoundationSectionValues } from "@asystent/domain";
import { cadEntityColor } from "@asystent/domain";
import { segmentRectangle } from "@asystent/geometry";
import { CadPlanDimensions } from "./cad-plan-dimensions";

const fields: { id: FoundationSectionField; label: string; unit: "mm" | "cm" | "m" | "tekst"; numeric: boolean }[] = [
  { id: "footing_width_cm", label: "Szerokość ławy", unit: "cm", numeric: true },
  { id: "footing_height_cm", label: "Wysokość ławy", unit: "cm", numeric: true },
  { id: "wall_thickness_cm", label: "Grubość ściany", unit: "cm", numeric: true },
  { id: "wall_height_cm", label: "Wysokość ściany", unit: "cm", numeric: true },
  { id: "foundation_bottom_elevation_m", label: "Rzędna spodu fundamentu", unit: "m", numeric: true },
  { id: "ground_elevation_m", label: "Rzędna terenu", unit: "m", numeric: true },
  { id: "zero_level_elevation_m", label: "Rzędna poziomu ±0,00", unit: "m", numeric: true },
  { id: "footing_material", label: "Materiał ławy", unit: "tekst", numeric: false },
  { id: "wall_material", label: "Materiał ściany", unit: "tekst", numeric: false },
  { id: "concrete_class", label: "Klasa betonu", unit: "tekst", numeric: false },
  { id: "xps_thickness_cm", label: "Grubość XPS", unit: "cm", numeric: true },
  { id: "waterproofing_type", label: "Typ hydroizolacji", unit: "tekst", numeric: false },
  { id: "blinding_concrete_thickness_cm", label: "Grubość betonu podkładowego", unit: "cm", numeric: true },
  { id: "floor_layers", label: "Warstwy podłogi (opis)", unit: "tekst", numeric: false },
  { id: "additional_components", label: "Dodatkowe elementy (opis)", unit: "tekst", numeric: false },
];
const sourceLabels = { section_override: "nadpisanie przekroju", element_instance: "element rzutu" } as const;
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

function PlanEntity({ entity, faces, selected, onClick }: {
  entity: CadEntity; faces: ReturnType<typeof getCadPlanFaces>; selected: boolean; onClick?: () => void;
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
        y={(entity.geometry.start.y + entity.geometry.end.y) / 2} fill={color} fontSize="180" textAnchor="middle"
        paintOrder="stroke" stroke="white" strokeWidth="60">{entity.attributes.label || `${entity.attributes.measuredMm} mm`}</text>}
      {entity.kind === "annotation" && <><line x1={entity.attributes.leader?.x ?? entity.geometry.point.x}
        y1={entity.attributes.leader?.y ?? entity.geometry.point.y} x2={entity.geometry.point.x} y2={entity.geometry.point.y}
        stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <text x={entity.geometry.point.x} y={entity.geometry.point.y} fill={color}
          fontSize={entity.attributes.fontSizeMm ?? 180}>{entity.attributes.text}</text></>}
      {entity.mark && <text x={(entity.geometry.start.x + entity.geometry.end.x) / 2} y={(entity.geometry.start.y + entity.geometry.end.y) / 2}
        fill="#0f172a" fontSize="180" textAnchor="middle" paintOrder="stroke" stroke="white" strokeWidth="60">{entity.mark}</text>}
      {selected && <circle cx={(entity.geometry.start.x + entity.geometry.end.x) / 2} cy={(entity.geometry.start.y + entity.geometry.end.y) / 2}
        r="180" fill="none" stroke="#ea580c" strokeWidth="25" vectorEffect="non-scaling-stroke" />}
    </g>;
  }
  if ("vertices" in entity.geometry) return <g data-entity-id={entity.id}>
    <title>{entity.mark ?? entity.kind} · {entity.id}</title>
    <polygon points={entity.geometry.vertices.map(({ x, y }) => `${x},${y}`).join(" ")} fill={color} fillOpacity=".28"
      stroke={selected ? "#ea580c" : color} strokeWidth={selected ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
    {entity.mark && <text x={polygonCenter(entity.geometry.vertices).x} y={polygonCenter(entity.geometry.vertices).y}
      fontSize="180" textAnchor="middle" fill="#0f172a">{entity.mark}</text>}
  </g>;
  return <g data-entity-id={entity.id}><title>{entity.id}</title><circle cx={entity.geometry.point.x} cy={entity.geometry.point.y} r="70" fill={color} /></g>;
}

function SectionElevation({ document, section, selectedId, onSelect }: {
  document: CadDocument; section: FoundationSection; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hits = useMemo(() => getFoundationSectionIntersections(document, section), [document, section]);
  const bottom = Number(section.overrides.foundation_bottom_elevation_m?.value);
  const hasBottom = Number.isFinite(bottom);
  const baseY = hasBottom ? -bottom * 1000 : 0;
  const ground = Number(section.overrides.ground_elevation_m?.value);
  const zero = Number(section.overrides.zero_level_elevation_m?.value);
  const hasGround = hasBottom && Number.isFinite(ground);
  const hasZero = hasBottom && Number.isFinite(zero);
  const scale = section.paperScale ?? document.paperScale ?? 50;
  const maxHeight = Math.max(1000, ...hits.map((hit) => (hit.heightMm ?? 0) + hit.verticalOffsetMm));
  const yBottom = baseY + 700;
  const cut = document.entities.find((entity) => entity.id === section.cutEntityId);
  const dx = cut?.kind === "construction-line" ? cut.geometry.end.x - cut.geometry.start.x : 0;
  const dy = cut?.kind === "construction-line" ? cut.geometry.end.y - cut.geometry.start.y : 0;
  const sectionMargin = maxHeight * .6, materialReserve = Math.max(0, ...hits.map(({ material }) => material?.length ?? 0)) * 120;
  const rangeStartX = hits.length ? Math.max(0, Math.min(...hits.map(({ startMm }) => startMm)) + sectionMargin - 1000) : sectionMargin;
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
  const drawing = <svg ref={svgRef} className="cad-section-svg" role="img" aria-label={`Rysunek przekroju ${section.label}`}
    width={`${totalRange / scale}mm`} height={`${(yBottom - yTop) / scale}mm`}
    viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="xMidYMid meet">
    <defs><pattern id={`section-hatch-${section.id}`} width="140" height="140" patternUnits="userSpaceOnUse">
      <path d="M0 140 L140 0 M-35 35 L35 -35 M105 175 L175 105" stroke="#64748b" strokeWidth="8" />
    </pattern><marker id={`section-arrow-${section.id}`} markerWidth="100" markerHeight="100" refX="50" refY="50" orient="auto-start-reverse">
      <path d="M0 0 L100 50 L0 100 Z" fill="#334155" /></marker></defs>
    <rect x={0} y={yTop} width={totalRange} height={yBottom - yTop} fill="#fff" />
    {!hasBottom && <text x={totalRange / 2} y={yTop + 250} textAnchor="middle" fontSize={Math.max(100, maxHeight / 18)} fill="#9a3412">
      Rzędna spodu fundamentu niepodana — położenie pionowe nieustalone
    </text>}
    {hits.map((hit, index) => {
      const entity = document.entities.find(({ id }) => id === hit.elementId)!;
      const height = hit.heightMm;
      if (height === null) return <g key={`${hit.elementId}-${index}`} data-section-element={hit.elementId}
        role="button" tabIndex={0} onClick={() => onSelect(hit.elementId)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(hit.elementId); } }}>
        <line x1={Math.min(sectionX(hit.startMm), sectionX(hit.endMm))} y1={baseY}
          x2={Math.max(sectionX(hit.startMm), sectionX(hit.endMm))} y2={baseY}
          stroke="#dc2626" strokeWidth="100" strokeDasharray="120 60" />
        <title>{entity.mark ?? hit.elementType}: wysokość nieznana; ID {hit.elementId}</title>
      </g>;
      const xStart = sectionX(hit.startMm), xEnd = sectionX(hit.endMm);
      const xLeft = Math.min(xStart, xEnd), xRight = Math.max(xStart, xEnd);
      const xCenter = (xStart + xEnd) / 2;
      return <g key={`${hit.elementId}-${index}`} data-section-element={hit.elementId} role="button" tabIndex={0}
        aria-label={`${entity.mark ?? hit.elementType}, ${hit.endMm - hit.startMm} milimetrów`}
        onClick={() => onSelect(hit.elementId)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(hit.elementId); } }}
        style={{ cursor: "pointer" }}>
        <title>{entity.mark ?? hit.elementType} · {entity.id}{hit.material ? ` · ${hit.material}` : ""}</title>
        <rect x={xLeft} y={baseY - hit.verticalOffsetMm - height}
          width={hit.endMm - hit.startMm} height={height}
          fill={hit.material ? `url(#section-hatch-${section.id})` : "#dbe3ec"} stroke={selectedId === hit.elementId ? "#ea580c" : "#0f172a"}
          strokeWidth={selectedId === hit.elementId ? 24 : 12} vectorEffect="non-scaling-stroke" />
        <line x1={xLeft} y1={yBottom - 250} x2={xRight} y2={yBottom - 250} stroke="#334155" strokeWidth="8"
          markerStart={`url(#section-arrow-${section.id})`} markerEnd={`url(#section-arrow-${section.id})`} />
        <text x={xCenter} y={yBottom - 320} textAnchor="middle" fontSize={Math.max(100, maxHeight / 20)} fill="#0f172a">
          {Math.round(hit.endMm - hit.startMm)} mm
        </text>
        <text x={xCenter} y={baseY - hit.verticalOffsetMm - height / 2}
          textAnchor="middle" fontSize={Math.max(100, maxHeight / 20)} fill="#0f172a">
          {entity.mark ?? hit.elementType}
        </text>
        {hit.material && <text x={section.viewDirection === "left" ? xRight + 80 : xLeft - 80}
          y={baseY - hit.verticalOffsetMm - height / 2} textAnchor={section.viewDirection === "left" ? "start" : "end"}
          fontSize={Math.max(80, maxHeight / 24)} fill="#334155">{hit.material}</text>}
        <line x1={xStart - 180} y1={baseY - hit.verticalOffsetMm - height}
          x2={xStart - 180}
          y2={baseY - hit.verticalOffsetMm} stroke="#334155" strokeWidth="8"
          markerStart={`url(#section-arrow-${section.id})`} markerEnd={`url(#section-arrow-${section.id})`} />
        <text x={xStart - 240} y={baseY - hit.verticalOffsetMm - height / 2} textAnchor="end"
          transform={`rotate(-90 ${xStart - 240} ${baseY - hit.verticalOffsetMm - height / 2})`}
          fontSize={Math.max(90, maxHeight / 22)} fill="#334155">{Math.round(height)} mm</text>
      </g>;
    })}
    {hasBottom && <g><line x1={totalRange - 500} y1={baseY} x2={totalRange - 100} y2={baseY} stroke="#0f172a" strokeWidth="15" />
      <text x={totalRange - 450} y={baseY - 80} textAnchor="end" fontSize={Math.max(100, maxHeight / 20)}>
        Spód fundamentu {bottom.toFixed(2)} m
      </text></g>}
    {hasGround && <g><line x1={0} y1={-(ground - bottom) * 1000} x2={totalRange} y2={-(ground - bottom) * 1000}
      stroke="#7c5e31" strokeWidth="12" strokeDasharray="120 60" /><text x={totalRange - 100} y={-(ground - bottom) * 1000 - 60}
        textAnchor="end" fontSize={Math.max(100, maxHeight / 20)}>Teren {ground.toFixed(2)} m</text></g>}
    {hasZero && <g><line x1={totalRange - 600} y1={-(zero - bottom) * 1000} x2={totalRange - 100}
      y2={-(zero - bottom) * 1000} stroke="#2563eb" strokeWidth="14" markerEnd={`url(#section-arrow-${section.id})`} />
      <text x={totalRange - 100} y={-(zero - bottom) * 1000 - 70} textAnchor="end"
        fontSize={Math.max(100, maxHeight / 20)}>±0,00 = {zero.toFixed(2)} m</text></g>}
    <text x={sectionX(Math.max(0, rangeStartX - sectionMargin))} y={yBottom - 80} fontSize={Math.max(100, maxHeight / 18)}>
      {section.label} · kierunek patrzenia: {section.viewDirection} · 1:{scale}
    </text>
    <text x={totalRange / 2} y={yTop + 480} textAnchor="middle" fontSize={Math.max(90, maxHeight / 22)}>
      {Math.hypot(dx, dy).toFixed(0)} mm — zakres widoczności {section.visibilityRangeMm} mm
    </text>
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
      <span>{hits.length} rzeczywistych przecięć · skala rysunku 1:{scale}</span>
    </div>
    {!hits.length && <p role="status">Linia nie przecina obecnej geometrii konstrukcyjnej. Rysunek pozostaje pusty — nie dodano elementów.</p>}
    {!hasBottom && <p className="cad-disclaimer">Bez podanej rzędnej fundamentu rysunek nie przypisuje elementom poziomu ±0,00 ani terenu.</p>}
  </div>;
}

export function CadFoundationSections({ drawing, sourceUrl, selectedEntityId, onSelectEntity, onChange }: {
  drawing: CadDocument; sourceUrl: string; selectedEntityId: string | null; onSelectEntity: (id: string) => void; onChange: (next: CadDocument) => void;
}) {
  const [activeId, setActiveId] = useState(drawing.sections?.[0]?.id ?? "");
  const [cutId, setCutId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [miniView, setMiniView] = useState<ViewBox>(() => svgBounds(drawing));
  const miniGesture = useRef<{ pointer: number; point: { x: number; y: number }; view: ViewBox } | null>(null);
  const sections = drawing.sections ?? [];
  const active = sections.find(({ id }) => id === activeId) ?? sections[0];
  const cutLines = drawing.entities.filter((entity) => entity.kind === "construction-line" && entity.attributes.role === "section-cut");
  const values = active ? resolveFoundationSectionValues(drawing, active) : {};
  const conflicts = active ? getFoundationSectionConflicts(drawing, active) : [];
  const planCopyLayout = useMemo(() => {
    try { return { dimensions: getCadPlanDimensions(drawing, 2.5 * (drawing.paperScale ?? 100), [], undefined, false),
      faces: getCadPlanFaces(drawing), error: "" }; }
    catch (cause) { return { dimensions: [], faces: [], error: cause instanceof Error ? cause.message : "Nie udało się wyznaczyć wymiarów rzutu." }; }
  }, [drawing]);
  const missing = fields.filter(({ id }) => !values[id]);

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
    event.currentTarget.setPointerCapture(event.pointerId);
    miniGesture.current = { pointer: event.pointerId, point: miniPoint(event.currentTarget, event.clientX, event.clientY), view: miniView };
  }
  function moveMiniPan(event: ReactPointerEvent<SVGSVGElement>) {
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

  return <section className="cad-foundation-sections" aria-labelledby="foundation-sections-heading">
    <h3 id="foundation-sections-heading">Przekroje fundamentów i poziomy posadowienia</h3>
    <p>Podgląd jest kopią geometrii bieżącego rzutu z tymi samymi współrzędnymi i identyfikatorami. Tworzenie przekroju zapisuje wyłącznie metadane i nie zmienia geometrii planu.</p>
    <p className="cad-disclaimer">Przekrój jest rysunkiem roboczym, nie projektem konstrukcyjnym. Nie dobiera zbrojenia, nośności gruntu, klas materiałów ani zgodności normowej; dane do realizacji wymaga weryfikacji uprawnionego projektanta.</p>
    <svg className="cad-section-plan" role="img" aria-label="Kopia rzutu fundamentów w trybie tylko do odczytu"
      viewBox={`${miniView.x} ${miniView.y} ${miniView.width} ${miniView.height}`} preserveAspectRatio="xMidYMid meet"
      data-paper-scale={drawing.paperScale ?? 100}
      onPointerDown={startMiniPan} onPointerMove={moveMiniPan} onPointerUp={() => { miniGesture.current = null; }}
      onPointerCancel={() => { miniGesture.current = null; }} onWheel={zoomMini}>
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
      {drawing.entities.map((entity) => <PlanEntity key={entity.id} entity={entity} faces={planCopyLayout.faces}
        selected={entity.id === selectedEntityId || sections.some((section) => section.cutEntityId === entity.id && section.id === active?.id)}
        onClick={() => {
          onSelectEntity(entity.id);
          const section = sections.find(({ cutEntityId }) => cutEntityId === entity.id);
          if (section) setActiveId(section.id);
        }} />)}
      <CadPlanDimensions dimensions={planCopyLayout.dimensions} fontMm={Math.max(2.5 * (drawing.paperScale ?? 100), miniView.width / 85)}
        onDimensionClick={(dimension) => { if (dimension.entityId) onSelectEntity(dimension.entityId); }} />
      {sections.map((section) => {
        const line = drawing.entities.find((entity) => entity.id === section.cutEntityId);
        if (line?.kind !== "construction-line") return null;
        const { start, end } = line.geometry, middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const norm = Math.hypot(end.x - start.x, end.y - start.y) || 1, nx = (end.y - start.y) / norm * 250, ny = -(end.x - start.x) / norm * 250;
        const direction = section.viewDirection === "left" ? -1 : 1;
        const viewEnd = { x: middle.x + direction * (end.y - start.y) / norm * 900,
          y: middle.y + direction * -(end.x - start.x) / norm * 900 };
        return <g key={section.id} data-section-marker={section.id} role="button" tabIndex={0}
          aria-label={`Otwórz przekrój ${section.label}`} onClick={() => setActiveId(section.id)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveId(section.id); } }}
          style={{ cursor: "pointer" }}>
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#ea580c" strokeWidth="5"
            markerStart={`url(#section-plan-arrow-${section.id})`} markerEnd={`url(#section-plan-arrow-${section.id})`} />
          <line x1={middle.x} y1={middle.y} x2={viewEnd.x} y2={viewEnd.y} stroke="#9a3412" strokeWidth="8"
            markerEnd={`url(#section-view-arrow-${section.id})`} />
          <text x={start.x + nx} y={start.y + ny} fontSize="220" textAnchor="middle" fill="#9a3412">{section.label.split("-")[0]}</text>
          <text x={end.x - nx} y={end.y - ny} fontSize="220" textAnchor="middle" fill="#9a3412">{section.label.split("-")[1]}</text>
          <text x={middle.x + nx} y={middle.y + ny} fontSize="220" textAnchor="middle" fill="#9a3412">{section.label}</text>
          <defs>            <marker id={`section-plan-arrow-${section.id}`} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 Z" fill="#ea580c" /></marker>
            <marker id={`section-view-arrow-${section.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="#9a3412" /></marker></defs>
        </g>;
      })}
    </svg>
    {planCopyLayout.error && <p className="alert alert-error" role="alert">{planCopyLayout.error}</p>}
    <div className="cad-section-plan-actions">
      <button className="quiet-button" type="button" onClick={() => setMiniView(svgBounds(drawing))}>Dopasuj rzut</button>
      <label>Linia cięcia<select aria-label="Linia cięcia przekroju" value={cutLines.some(({ id }) => id === (cutId || selectedEntityId))
        ? cutId || selectedEntityId || "" : cutId}
        onChange={(event) => setCutId(event.target.value)}>
        <option value="">Wybierz istniejącą linię cięcia</option>
        {cutLines.map((entity) => <option key={entity.id} value={entity.id}>{entity.mark ?? entity.id}</option>)}
      </select></label>
      <button className="primary-button" type="button" disabled={!cutLines.some((entity) => entity.id === (cutId || selectedEntityId))}
        onClick={addSection}>Utwórz przekrój z linii cięcia</button>
    </div>
    {!!sections.length && <nav className="cad-section-tabs" aria-label="Przekroje">
      {sections.map((section) => <button type="button" key={section.id} aria-pressed={active?.id === section.id}
        onClick={() => setActiveId(section.id)}>{section.label}</button>)}
    </nav>}
    {active && <>
      <div className="cad-section-settings">
        <label>Kierunek patrzenia<select value={active.viewDirection} onChange={(event) => {
          if (event.target.value === "left" || event.target.value === "right") patchSection({ viewDirection: event.target.value });
        }}><option value="left">W lewo</option><option value="right">W prawo</option></select></label>
        <label>Zakres widoczności na linii cięcia (mm)<input type="number" min={1} max={100000000} value={active.visibilityRangeMm}
          onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) patchSection({ visibilityRangeMm: value }); }} /></label>
        <label>Skala przekroju<select value={active.paperScale ?? 50} onChange={(event) => {
          const value = Number(event.target.value);
          if (value === 10 || value === 20 || value === 25 || value === 50) patchSection({ paperScale: value });
        }}><option value={10}>1:10</option><option value={20}>1:20</option><option value={25}>1:25</option><option value={50}>1:50</option></select></label>
      </div>
      <SectionElevation document={drawing} section={active} selectedId={selectedEntityId} onSelect={onSelectEntity} />
      <button className="quiet-button" type="button" onClick={() => removeSection(active)}>Usuń przekrój (zachowaj linię cięcia)</button>
      <details className="cad-section-data" open>
        <summary>Dane i właściwości · zachowano źródło wartości</summary>
        {!!conflicts.length && <p className="alert alert-error" role="alert">Konflikt danych na przeciętych elementach: {conflicts.map((id) => fields.find((field) => field.id === id)?.label ?? id).join(", ")}.
          Wartości nie zostały wybrane automatycznie. Zapisz jawne nadpisanie dla tego przekroju.</p>}
        {fields.map((field) => {
          const resolved = values[field.id], override = active.overrides[field.id], draftKey = `${active.id}:${field.id}`;
          return <div className="cad-section-field" key={field.id}>
            <label htmlFor={`section-${active.id}-${field.id}`}>{field.label} {field.unit !== "tekst" && `(${field.unit})`}
              <input id={`section-${active.id}-${field.id}`} type={field.numeric ? "number" : "text"}
                maxLength={field.numeric ? undefined : 2000}
                step="any" value={drafts[draftKey] ?? String(resolved?.value ?? "")}
                placeholder={resolved ? "" : "Brak danych — nie przyjęto wartości"}
                onChange={(event) => {
                  setDrafts((current) => ({ ...current, [draftKey]: event.target.value }));
                  setFieldErrors((current) => { const next = { ...current }; delete next[draftKey]; return next; });
                }} /></label>
            {fieldErrors[draftKey] && <span className="alert alert-error" role="alert">{fieldErrors[draftKey]}</span>}
            <span>{resolved ? `${sourceLabels[resolved.source]}${resolved.validated ? " · format sprawdzony" : " · wymaga sprawdzenia"}` : "brak wartości"}
              {override && <button className="quiet-button" type="button" onClick={() => {
                const next = { ...active.overrides }; delete next[field.id]; patchSection({ overrides: next });
              }}>Usuń nadpisanie</button>}</span>
            {draftKey in drafts && <button className="quiet-button" type="button" disabled={!drafts[draftKey]?.trim()}
              onClick={() => saveOverride(field, drafts[draftKey] ?? "")}>Zapisz wartość przekroju</button>}
          </div>;
        })}
        {!!missing.length && <p className="cad-disclaimer">Nieuzupełnione pola pozostają nieznane. Wartości wpisane tutaj są nadpisaniami tego przekroju; dane rzutu pozostają bez zmian.</p>}
      </details>
    </>}
    {!sections.length && <p>Najpierw narysuj linię cięcia narzędziem „Linia przekroju”, a następnie wybierz ją powyżej. Przekrój wykorzystuje rzeczywiste przecięcia z geometrią konstrukcyjną.</p>}
  </section>;
}
