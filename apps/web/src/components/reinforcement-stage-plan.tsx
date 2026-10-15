"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { getCadPlanDimensions } from "@asystent/domain";
import type { CadDocument, CadEntity } from "@asystent/schemas";
import { CadPlanDimensions } from "./cad-plan-dimensions";

type Point = { x: number; y: number };
type Frame = { x: number; y: number; width: number; height: number };

function bandWidthMm(entity: CadEntity) {
  if (entity.kind === "wall") return entity.attributes.thicknessMm;
  if (entity.kind === "footing") return entity.attributes.widthMm;
  if (entity.kind === "construction-line") return entity.attributes.widthMm;
  return 0;
}

export function outlineOfEntity(entity: CadEntity): Point[] {
  if ("vertices" in entity.geometry) return entity.geometry.vertices;
  if ("start" in entity.geometry) {
    const { start, end } = entity.geometry;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const half = Math.max(bandWidthMm(entity), 1) / 2;
    if (!length) return [start, end];
    const nx = (-dy / length) * half;
    const ny = (dx / length) * half;
    return [
      { x: start.x + nx, y: start.y + ny }, { x: end.x + nx, y: end.y + ny },
      { x: end.x - nx, y: end.y - ny }, { x: start.x - nx, y: start.y - ny },
    ];
  }
  return [entity.geometry.point];
}

function centroid(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function boundsOf(points: Point[]): Frame {
  if (!points.length) return { x: 0, y: 0, width: 1000, height: 1000 };
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = Math.max(maxX - minX, maxY - minY, 500) * 0.1;
  return {
    x: minX - padding, y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 1),
    height: Math.max(maxY - minY + padding * 2, 1),
  };
}

export function ReinforcementStagePlan({ document, stageLabel, hostGroups, backgroundEntities = [],
  supportDimensionRole, selectedIds, labelOf, statusOf, onOpen }: {
  document: CadDocument;
  stageLabel: string;
  hostGroups: CadEntity[][];
  backgroundEntities?: CadEntity[];
  supportDimensionRole?: "pad" | "column";
  selectedIds: string[];
  labelOf: (entities: CadEntity[], index: number) => string;
  statusOf: (entities: CadEntity[]) => "none" | "partial" | "complete" | "review";
  onOpen: (entities: CadEntity[]) => void;
}) {
  const shapes = useMemo(() => hostGroups.map((entities, index) => ({
    entities,
    outlines: entities.map(outlineOfEntity),
    label: labelOf(entities, index),
  })), [hostGroups, labelOf]);
  const backgroundShapes = useMemo(() => backgroundEntities.map((entity) => ({
    entity,
    outline: outlineOfEntity(entity),
  })), [backgroundEntities]);
  const shapePoints = useMemo(() => shapes.flatMap(({ outlines }) => outlines.flat()), [shapes]);
  const backgroundPoints = useMemo(() => backgroundShapes.flatMap(({ outline }) => outline), [backgroundShapes]);
  const dimensionFont = Math.max(25, Math.max(boundsOf(shapePoints).width, boundsOf(shapePoints).height) / 55);
  const dimensions = useMemo(() => {
    const dimensionEntities = supportDimensionRole
      ? [...backgroundEntities, ...hostGroups.flat()]
      : hostGroups.flat();
    const generated = getCadPlanDimensions({ ...document, entities: dimensionEntities }, dimensionFont);
    return supportDimensionRole
      ? generated.filter((dimension) => dimension.chainId?.startsWith(`supports:${supportDimensionRole}:`))
      : generated;
  }, [backgroundEntities, dimensionFont, document, hostGroups, supportDimensionRole]);
  const initial = useMemo(() => boundsOf([
    ...shapePoints,
    ...backgroundPoints,
    ...dimensions.flatMap((dimension) => [
      dimension.a,
      dimension.b,
      { x: dimension.box.x, y: dimension.box.y },
      { x: dimension.box.x + dimension.box.width, y: dimension.box.y + dimension.box.height },
    ]),
  ]), [backgroundPoints, dimensions, shapePoints]);
  const [frame, setFrame] = useState<Frame | null>(null);
  const view = frame ?? initial;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; frame: Frame; moved: boolean } | null>(null);
  const pinch = useRef<Map<number, Point>>(new Map());
  const panned = useRef(false);
  const zoomBy = (factor: number, focus: Point) => {
    setFrame((current) => {
      const base = current ?? initial;
      const width = Math.max(initial.width / 40, Math.min(initial.width * 6, base.width * factor));
      const height = base.height * (width / base.width);
      return {
        width, height,
        x: focus.x - (focus.x - base.x) * (width / base.width),
        y: focus.y - (focus.y - base.y) * (height / base.height),
      };
    });
  };
  const toModel = (clientX: number, clientY: number): Point => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    return {
      x: view.x + ((clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((clientY - rect.top) / rect.height) * view.height,
    };
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    panned.current = false;
    if (pinch.current.size > 1) { drag.current = null; return; }
    drag.current = { x: event.clientX, y: event.clientY, frame: view, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pinch.current.size > 1) {
      const previous = [...pinch.current.values()];
      pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = [...pinch.current.values()];
      const before = Math.hypot(previous[0]!.x - previous[1]!.x, previous[0]!.y - previous[1]!.y);
      const after = Math.hypot(next[0]!.x - next[1]!.x, next[0]!.y - next[1]!.y);
      if (before > 0 && after > 0) {
        zoomBy(before / after, toModel((next[0]!.x + next[1]!.x) / 2, (next[0]!.y + next[1]!.y) / 2));
      }
      return;
    }
    const start = drag.current;
    const rect = svg.current?.getBoundingClientRect();
    if (!start || !rect || !rect.width || !rect.height) return;
    const dx = ((event.clientX - start.x) / rect.width) * start.frame.width;
    const dy = ((event.clientY - start.y) / rect.height) * start.frame.height;
    if (Math.abs(event.clientX - start.x) > 4 || Math.abs(event.clientY - start.y) > 4) {
      if (!start.moved && !event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      start.moved = true;
    }
    setFrame({ ...start.frame, x: start.frame.x - dx, y: start.frame.y - dy });
  };
  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    pinch.current.delete(event.pointerId);
    if (pinch.current.size === 0) {
      panned.current = drag.current?.moved === true;
      drag.current = null;
    }
  };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    zoomBy(event.deltaY > 0 ? 1.12 : 0.89, toModel(event.clientX, event.clientY));
  };
  const open = (entities: CadEntity[]) => {
    if (drag.current?.moved || panned.current) return;
    onOpen(entities);
  };
  const labelSize = Math.max(view.width, view.height) / 42;
  return <div className="cad-reinforcement-stage-plan">
    <div className="cad-reinforcement-stage-plan-controls">
      <strong>{stageLabel}</strong>
      <span>Rzut tylko do odczytu. Kliknij element, aby otworzyć detale zbrojenia.</span>
      <button type="button" className="quiet-button" onClick={() => zoomBy(0.8, { x: view.x + view.width / 2, y: view.y + view.height / 2 })}>Przybliż</button>
      <button type="button" className="quiet-button" onClick={() => zoomBy(1.25, { x: view.x + view.width / 2, y: view.y + view.height / 2 })}>Oddal</button>
      <button type="button" className="quiet-button" onClick={() => setFrame(null)}>Dopasuj</button>
    </div>
    <svg ref={svg} className="cad-reinforcement-stage-canvas"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      aria-label={`Rzut etapu: ${stageLabel}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={onWheel}>
      <g className="cad-reinforcement-stage-background" pointerEvents="none" aria-hidden="true">
        {backgroundShapes.map(({ entity, outline }) => <polygon key={entity.id}
          points={outline.map((point) => `${point.x},${point.y}`).join(" ")} />)}
      </g>
      {shapes.map(({ entities, outlines, label }) => {
        const points = outlines.flat();
        const middle = centroid(points);
        const selected = entities.some((entity) => selectedIds.includes(entity.id));
        return <g key={entities.map((entity) => entity.id).join(":")} className="cad-reinforcement-stage-shape"
          data-host-id={entities[0]?.id} data-host-ids={entities.map((entity) => entity.id).join(",")}
          data-host-count={entities.length} data-status={statusOf(entities)}
          aria-current={selected ? "true" : undefined}>
          {outlines.map((outline, index) => <polygon key={entities[index]!.id}
            points={outline.map((point) => `${point.x},${point.y}`).join(" ")}
            data-selected={selected ? "true" : undefined}
            onClick={() => open(entities)}><title>{label}</title></polygon>)}
          <text x={middle.x} y={middle.y} fontSize={labelSize} textAnchor="middle" pointerEvents="none">{label}</text>
        </g>;
      })}
      <CadPlanDimensions dimensions={dimensions} fontMm={dimensionFont} />
    </svg>
    <div className="cad-reinforcement-stage-picker" role="group" aria-label={`Elementy etapu: ${stageLabel}`}>
      {shapes.map(({ entities, label }) => <button key={entities.map((entity) => entity.id).join(":")} type="button"
        aria-pressed={entities.some((entity) => selectedIds.includes(entity.id))} data-status={statusOf(entities)}
        onClick={() => onOpen(entities)}>{label}</button>)}
    </div>
    {!shapes.length && <p>Ten etap nie ma jeszcze elementów pobranych z rzutu.</p>}
  </div>;
}
