"use client";

import { useId, useMemo } from "react";
import { reinforcementShapeOutline } from "@asystent/domain";
import type { ReinforcementShape } from "@asystent/schemas";

type Point = { x: number; y: number };

function roundedPath(points: Point[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M${points[0]!.x},${points[0]!.y} L${points[1]!.x},${points[1]!.y}`;
  let path = `M${points[0]!.x},${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const before = { x: current.x + (previous.x - current.x) * .12, y: current.y + (previous.y - current.y) * .12 };
    const after = { x: current.x + (next.x - current.x) * .12, y: current.y + (next.y - current.y) * .12 };
    path += ` L${before.x},${before.y} Q${current.x},${current.y} ${after.x},${after.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L${last.x},${last.y}`;
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)).replace(".", ",");
}

function unit(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length < 1e-6 ? null : { x: dx / length, y: dy / length };
}

export function ReinforcementShapePreview({ shape, label, compact = false }: {
  shape: ReinforcementShape;
  label: string;
  compact?: boolean;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const frame = compact
    ? { width: 240, height: 160, padding: 52, font: 11, offset: 15, tick: 4, labelGap: 8, arc: 13, escape: 17 }
    : { width: 480, height: 320, padding: 84, font: 12, offset: 26, tick: 5, labelGap: 10, arc: 20, escape: 19 };
  const drawing = useMemo(() => {
    const outline = reinforcementShapeOutline(shape);
    const projected = outline.points;
    const width = Math.max(1, outline.widthMm);
    const height = Math.max(1, outline.heightMm);
    const scale = Math.min(
      (frame.width - frame.padding * 2) / width,
      (frame.height - frame.padding * 2) / height,
    );
    const points = projected.map(({ x, y }) => ({
      x: frame.width / 2 + (x - outline.widthMm / 2) * scale,
      y: frame.height / 2 + (y - outline.heightMm / 2) * scale,
    }));
    const centroid = points.reduce((total, point) => ({
      x: total.x + point.x / points.length,
      y: total.y + point.y / points.length,
    }), { x: 0, y: 0 });

    const placedLabels: Array<{ x: number; y: number; radius: number }> = [];
    const dimensions = shape.bends.flatMap((bend, index) => {
      const from = points[index];
      const to = points[index + 1];
      if (!from || !to) return [];
      const direction = unit(from, to);
      if (!direction) return [];
      const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      let normal = { x: -direction.y, y: direction.x };
      if ((middle.x - centroid.x) * normal.x + (middle.y - centroid.y) * normal.y < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
      const shift = (point: Point, distance: number) => ({
        x: point.x + normal.x * distance,
        y: point.y + normal.y * distance,
      });
      const text = `${formatNumber(bend.lengthMm / 10)} cm`;
      let rotation = Math.atan2(direction.y, direction.x) * 180 / Math.PI;
      if (rotation > 90 || rotation < -90) rotation += 180;
      const labelWidth = text.length * frame.font * .58 + 10;
      const radius = Math.max(labelWidth, frame.font * 1.5) / 2;
      let offset = frame.offset;
      const candidate = shift(middle, offset + frame.labelGap);
      const collides = placedLabels.some((placed) =>
        Math.hypot(placed.x - candidate.x, placed.y - candidate.y) < placed.radius + radius);
      if (collides) offset += frame.escape;
      const label = shift(middle, offset + frame.labelGap);
      placedLabels.push({ x: label.x, y: label.y, radius });
      return [{
        key: `segment-${index}`,
        text,
        detail: `Część ${index + 1}: ${formatNumber(bend.lengthMm)} mm`,
        baselineStart: shift(from, offset),
        baselineEnd: shift(to, offset),
        extensionStart: { from, to: shift(from, offset + frame.tick) },
        extensionEnd: { from: to, to: shift(to, offset + frame.tick) },
        tickStart: { a: shift(from, offset - frame.tick), b: shift(from, offset + frame.tick) },
        tickEnd: { a: shift(to, offset - frame.tick), b: shift(to, offset + frame.tick) },
        label,
        labelWidth,
        rotation,
      }];
    });

    const angles = shape.bends.flatMap((bend, index) => {
      const vertex = points[index + 1];
      const previous = points[index];
      const next = points[index + 2];
      if (!vertex || !previous || !next || bend.angleDegrees === 0) return [];
      const toPrevious = unit(vertex, previous);
      const toNext = unit(vertex, next);
      if (!toPrevious || !toNext) return [];
      const radius = frame.arc;
      const start = { x: vertex.x + toPrevious.x * radius, y: vertex.y + toPrevious.y * radius };
      const end = { x: vertex.x + toNext.x * radius, y: vertex.y + toNext.y * radius };
      const sweep = toPrevious.x * toNext.y - toPrevious.y * toNext.x > 0 ? 1 : 0;
      const bisector = unit({ x: 0, y: 0 }, { x: toPrevious.x + toNext.x, y: toPrevious.y + toNext.y })
        ?? { x: -toNext.y, y: toNext.x };
      const text = `${formatNumber(bend.angleDegrees)}°`;
      return [{
        key: `angle-${index}`,
        text,
        detail: `Gięcie po części ${index + 1}: ${text}, promień ${formatNumber(bend.radiusMm)} mm`,
        vertex,
        arc: `M${start.x},${start.y} A${radius},${radius} 0 0 ${sweep} ${end.x},${end.y}`,
        label: { x: vertex.x + bisector.x * (radius + 13), y: vertex.y + bisector.y * (radius + 13) },
        labelWidth: text.length * frame.font * .58 + 10,
      }];
    });

    return { barPath: roundedPath(points), points, dimensions, angles };
  }, [shape, frame.width, frame.height, frame.padding, frame.offset, frame.font,
    frame.tick, frame.labelGap, frame.arc, frame.escape]);

  const totalLengthMm = shape.bends.reduce((total, bend) => total + bend.lengthMm, 0);
  const diameterMm = shape.diameterMm ?? 12;
  const baseWidth = compact ? 5 : 9;
  const barWidth = Math.min(compact ? 9 : 16, Math.max(compact ? 3 : 5, baseWidth * diameterMm / 12));
  const description = `${shape.bends.length} ${shape.bends.length === 1 ? "część" : "części"} · ${formatNumber(totalLengthMm / 10)} cm`
    + (shape.diameterMm ? ` · Ø${formatNumber(shape.diameterMm)} mm` : "");

  return <svg className={`reinforcement-shape-preview${compact ? " reinforcement-shape-preview-compact" : ""}`}
    role="img" aria-label={`Podgląd 2D: ${label}`} viewBox={`0 0 ${frame.width} ${frame.height}`}>
    <title>{`Podgląd 2D: ${label} — ${description}`}</title>
    <defs>
      <pattern id={`${instanceId}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="#cbd5e1" strokeWidth=".5" strokeOpacity=".6" />
      </pattern>
      <linearGradient id={`${instanceId}-bar`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#60a5fa" />
        <stop offset=".5" stopColor="#1d4ed8" />
        <stop offset="1" stopColor="#1e3a8a" />
      </linearGradient>
    </defs>
    <rect width={frame.width} height={frame.height} fill="#f8fafc" />
    <rect width={frame.width} height={frame.height} fill={`url(#${instanceId}-grid)`} />
    <path className="reinforcement-shape-bar-halo" d={drawing.barPath} fill="none"
      strokeWidth={barWidth + (compact ? 3 : 6)} strokeLinecap="round" strokeLinejoin="round" />
    <path className="reinforcement-shape-bar" d={drawing.barPath} fill="none"
      stroke={`url(#${instanceId}-bar)`} strokeWidth={barWidth}
      strokeLinecap="round" strokeLinejoin="round" />
    <g className="reinforcement-shape-dimensions" fill="none" pointerEvents="none">
      {drawing.dimensions.map((dimension) => <g key={dimension.key} className="reinforcement-shape-dimension">
        <title>{dimension.detail}</title>
        <line className="reinforcement-shape-dimension-extension"
          x1={dimension.extensionStart.from.x} y1={dimension.extensionStart.from.y}
          x2={dimension.extensionStart.to.x} y2={dimension.extensionStart.to.y} />
        <line className="reinforcement-shape-dimension-extension"
          x1={dimension.extensionEnd.from.x} y1={dimension.extensionEnd.from.y}
          x2={dimension.extensionEnd.to.x} y2={dimension.extensionEnd.to.y} />
        <line className="reinforcement-shape-dimension-line"
          x1={dimension.baselineStart.x} y1={dimension.baselineStart.y}
          x2={dimension.baselineEnd.x} y2={dimension.baselineEnd.y} />
        <line className="reinforcement-shape-dimension-tick"
          x1={dimension.tickStart.a.x} y1={dimension.tickStart.a.y}
          x2={dimension.tickStart.b.x} y2={dimension.tickStart.b.y} />
        <line className="reinforcement-shape-dimension-tick"
          x1={dimension.tickEnd.a.x} y1={dimension.tickEnd.a.y}
          x2={dimension.tickEnd.b.x} y2={dimension.tickEnd.b.y} />
        <g transform={`rotate(${dimension.rotation} ${dimension.label.x} ${dimension.label.y})`}>
          <rect x={dimension.label.x - dimension.labelWidth / 2} y={dimension.label.y - frame.font * .78}
            width={dimension.labelWidth} height={frame.font * 1.5} rx={3} fill="#ffffff" fillOpacity=".95" />
          <text className="reinforcement-shape-dimension-text" x={dimension.label.x} y={dimension.label.y}
            fontSize={frame.font} textAnchor="middle" dominantBaseline="middle">{dimension.text}</text>
        </g>
      </g>)}
      {drawing.angles.map((angle) => <g key={angle.key} className="reinforcement-shape-angle">
        <title>{angle.detail}</title>
        <path className="reinforcement-shape-angle-arc" d={angle.arc} />
        <circle className="reinforcement-shape-angle-vertex" cx={angle.vertex.x} cy={angle.vertex.y} r={2.4} />
        <rect x={angle.label.x - angle.labelWidth / 2} y={angle.label.y - frame.font * .78}
          width={angle.labelWidth} height={frame.font * 1.5} rx={3} fill="#ffffff" fillOpacity=".95" />
        <text className="reinforcement-shape-angle-text" x={angle.label.x} y={angle.label.y}
          fontSize={frame.font} textAnchor="middle" dominantBaseline="middle">{angle.text}</text>
      </g>)}
    </g>
  </svg>;
}
