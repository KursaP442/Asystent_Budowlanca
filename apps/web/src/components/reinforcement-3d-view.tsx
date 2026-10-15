"use client";

import { useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { reinforcementPath3d } from "@asystent/domain";
import type { CadEntity } from "@asystent/schemas";

type Rebar = Extract<CadEntity, { kind: "rebar-line" }>;
type Point3d = { x: number; y: number; z: number };

function rotate(point: Point3d, rotationX: number, rotationY: number): Point3d {
  const ax = rotationX * Math.PI / 180;
  const ay = rotationY * Math.PI / 180;
  const x1 = point.x * Math.cos(ay) + point.z * Math.sin(ay);
  const z1 = -point.x * Math.sin(ay) + point.z * Math.cos(ay);
  return {
    x: x1,
    y: point.y * Math.cos(ax) - z1 * Math.sin(ax),
    z: point.y * Math.sin(ax) + z1 * Math.cos(ax),
  };
}

function roundedPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M${points[0]!.x},${points[0]!.y} L${points[1]!.x},${points[1]!.y}`;
  let path = `M${points[0]!.x},${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!, current = points[index]!, next = points[index + 1]!;
    const before = { x: current.x + (previous.x - current.x) * 0.12, y: current.y + (previous.y - current.y) * 0.12 };
    const after = { x: current.x + (next.x - current.x) * 0.12, y: current.y + (next.y - current.y) * 0.12 };
    path += ` L${before.x},${before.y} Q${current.x},${current.y} ${after.x},${after.y}`;
  }
  const last = points[points.length - 1]!;
  return `${path} L${last.x},${last.y}`;
}

export function Reinforcement3dView({ bars, concreteWidthMm = 400, concreteHeightMm = 500,
  showConcreteInitially = true, offsetsByBarId = {}, lockedRotation, highlightedBarIds, label }: {
  bars: Rebar[];
  concreteWidthMm?: number;
  concreteHeightMm?: number;
  showConcreteInitially?: boolean;
  offsetsByBarId?: Record<string, { x?: number; y?: number; z?: number }>;
  /** Stały kierunek patrzenia; model nie reaguje wtedy na obrót, przesuwanie ani zoom. */
  lockedRotation?: { x: number; y: number };
  highlightedBarIds?: ReadonlySet<string>;
  label?: string;
}) {
  const [freeRotation, setRotation] = useState({ x: -25, y: 35 });
  const rotation = lockedRotation ?? freeRotation;
  const locked = Boolean(lockedRotation);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<"rotate" | "pan">("rotate");
  const [showConcrete, setShowConcrete] = useState(showConcreteInitially);
  const [selectedLayer, setSelectedLayer] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const steelGradientId = useId().replaceAll(":", "");
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    rotationX: number;
    rotationY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const layers = useMemo(() => [...new Set(bars.map((bar) => bar.layerId))], [bars]);
  const visibleBars = selectedLayer === "all" ? bars : bars.filter((bar) => bar.layerId === selectedLayer);
  const paths = visibleBars.map((bar) => {
    const offset = offsetsByBarId[bar.id] ?? {};
    const baseZ = offset.z !== undefined ? 0
      : bar.layerId === "rebar-top" ? concreteHeightMm * 0.35
        : bar.layerId === "rebar-bottom" ? -concreteHeightMm * 0.35 : 0;
    return {
      bar,
      points: (bar.attributes.shape
        ? reinforcementPath3d({
          x: bar.geometry.start.x + (offset.x ?? 0),
          y: bar.geometry.start.y + (offset.y ?? 0),
          z: baseZ + (offset.z ?? 0),
        }, bar.attributes.shape)
        : [bar.geometry.start, bar.geometry.end].map((point) => ({
          x: point.x + (offset.x ?? 0),
          y: point.y + (offset.y ?? 0),
          z: baseZ + (offset.z ?? 0),
        }))).map((point) => rotate(point, rotation.x, rotation.y)),
    };
  });
  const allPoints = paths.flatMap(({ points }) => points);
  const bounds = allPoints.length ? {
    minX: Math.min(...allPoints.map(({ x }) => x)),
    maxX: Math.max(...allPoints.map(({ x }) => x)),
    minY: Math.min(...allPoints.map(({ y }) => y)),
    maxY: Math.max(...allPoints.map(({ y }) => y)),
  } : { minX: -500, maxX: 500, minY: -300, maxY: 300 };
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, concreteWidthMm, 100);
  const scale = 620 / span * zoom;
  const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const project = (point: Point3d) => ({
    x: 400 + pan.x + (point.x - center.x) * scale,
    y: 230 + pan.y + (point.y - center.y) * scale,
  });
  const selected = bars.find((bar) => bar.id === selectedId);
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (locked || event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rotationX: rotation.x,
      rotationY: rotation.y,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    if (interactionMode === "pan") {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setPan({
        x: drag.current.panX + (event.clientX - drag.current.x) * 800 / rect.width,
        y: drag.current.panY + (event.clientY - drag.current.y) * 460 / rect.height,
      });
      return;
    }
    setRotation({
      x: Math.max(-89, Math.min(89, drag.current.rotationX + (event.clientY - drag.current.y) * 0.45)),
      y: drag.current.rotationY + (event.clientX - drag.current.x) * 0.45,
    });
  };
  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (locked) return;
    event.preventDefault();
    setZoom((value) => Math.max(0.35, Math.min(4, value * (event.deltaY > 0 ? 0.9 : 1.1))));
  };
  const resetView = () => {
    setRotation({ x: -25, y: 35 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  return <div className="cad-reinforcement-3d" data-locked-view={locked ? "front" : undefined}>
    {!locked && <div className="cad-reinforcement-3d-controls">
      <label>Warstwa<select value={selectedLayer} onChange={(event) => setSelectedLayer(event.target.value)}>
        <option value="all">Wszystkie</option>
        {layers.map((layer) => <option key={layer} value={layer}>{layer}</option>)}
      </select></label>
      <button type="button" className="quiet-button" aria-pressed={showConcrete}
        onClick={() => setShowConcrete((value) => !value)}>{showConcrete ? "Ukryj beton" : "Pokaż beton"}</button>
      <button type="button" className="quiet-button" aria-pressed={interactionMode === "rotate"}
        onClick={() => setInteractionMode("rotate")}>Obrót</button>
      <button type="button" className="quiet-button" aria-pressed={interactionMode === "pan"}
        onClick={() => setInteractionMode("pan")}>Przesuwanie</button>
      <button type="button" className="quiet-button" aria-label="Oddal model 3D"
        onClick={() => setZoom((value) => Math.max(.35, value / 1.25))}>−</button>
      <strong className="cad-reinforcement-3d-zoom">{Math.round(zoom * 100)}%</strong>
      <button type="button" className="quiet-button" aria-label="Przybliż model 3D"
        onClick={() => setZoom((value) => Math.min(4, value * 1.25))}>+</button>
      <button type="button" className="quiet-button" onClick={resetView}>Reset widoku</button>
      <span>{interactionMode === "rotate" ? "Przeciągnij: obrót" : "Przeciągnij: przesuwanie"} · kółko/pinch: zoom</span>
    </div>}
    <svg role="img" aria-label={label ?? "Interaktywny model 3D zbrojenia"} viewBox="0 0 800 460"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag}
      onWheel={onWheel}>
      <defs>
        <linearGradient id={steelGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93c5fd" /><stop offset=".35" stopColor="#1d4ed8" /><stop offset="1" stopColor="#172554" />
        </linearGradient>
      </defs>
      {showConcrete && <g opacity=".18" pointerEvents="none"
        transform={`translate(${pan.x} ${pan.y}) translate(400 230) scale(${zoom}) translate(-400 -230)`}>
        <rect x="55" y="55" width="690" height="350" rx="16" fill="#94a3b8" stroke="#334155" strokeWidth="3" />
        <path d="M55 55L120 20H760L745 55M745 55L760 20V355L745 405" fill="none" stroke="#334155" strokeWidth="2" />
      </g>}
      {showConcrete && <g className="cad-reinforcement-3d-material-label" pointerEvents="none"
        transform={`translate(${pan.x} ${pan.y}) translate(400 230) scale(${zoom}) translate(-400 -230)`}>
        <line x1="62" y1="46" x2="86" y2="58" />
        <text x="58" y="42" textAnchor="start">BETON</text>
      </g>}
      {paths.map(({ bar, points }) => {
        const path = roundedPath(points.map(project));
        const selectedBar = selectedId === bar.id;
        const highlighted = highlightedBarIds?.has(bar.id) ?? false;
        const dimmed = Boolean(highlightedBarIds?.size) && !highlighted && bar.layerId === "rebar-stirrups";
        const width = Math.max(3, Math.min(24, bar.attributes.diameterMm * scale)) * (highlighted ? 1.6 : 1);
        return <g key={bar.id} data-rebar-id={bar.id} data-highlighted={highlighted || undefined}
          opacity={dimmed ? .28 : 1} onPointerDown={(event) => {
          if (interactionMode === "pan" && !locked) return;
          event.stopPropagation();
          setSelectedId(bar.id);
        }}>
          <path d={path} fill="none"
            stroke={selectedBar ? "#f97316" : highlighted ? "#f59e0b" : `url(#${steelGradientId})`}
            strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
          <path d={path} fill="none" stroke="#fff" opacity=".4"
            strokeWidth={Math.max(1, width * 0.18)} strokeLinecap="round" strokeLinejoin="round" />
        </g>;
      })}
    </svg>
    {selected ? <p><strong>Wybrany pręt:</strong> Ø{selected.attributes.diameterMm} · {selected.attributes.steelGrade} · {selected.layerId}</p>
      : <p>Wybierz pręt w modelu, aby odczytać jego właściwości.</p>}
    {!bars.length && <p>Brak prętów do podglądu przestrzennego.</p>}
  </div>;
}
