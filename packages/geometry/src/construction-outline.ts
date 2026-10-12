import type { Point2D } from "./index.js";

export class OutlineGeometryError extends Error {}

export function rectangleFromCorners(a: Point2D, b: Point2D): Point2D[] {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || a.x === b.x || a.y === b.y) {
    throw new Error("Prostokąt wymaga dodatniej szerokości i długości.");
  }
  return [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) }];
}

export function segmentRectangle(start: Point2D, end: Point2D, widthMm: number): Point2D[] {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!length || !Number.isFinite(widthMm) || widthMm <= 0) throw new Error("Nieprawidłowy obrys elementu.");
  const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length, half = widthMm / 2;
  return [
    { x: start.x - ux * half - uy * half, y: start.y - uy * half + ux * half },
    { x: end.x + ux * half - uy * half, y: end.y + uy * half + ux * half },
    { x: end.x + ux * half + uy * half, y: end.y + uy * half - ux * half },
    { x: start.x - ux * half + uy * half, y: start.y - uy * half - ux * half },
  ];
}

export function polygonExteriorSide(vertices: readonly Point2D[]): 1 | -1 {
  const sum = vertices.reduce((total, point, i) => {
    const next = vertices[(i + 1) % vertices.length]!;
    return total + point.x * next.y - next.x * point.y;
  }, 0);
  return sum > 0 ? -1 : 1;
}

export function offsetPolygon(vertices: Point2D[], distances: number[]): Point2D[] {
  if (vertices.length < 3 || vertices.length !== distances.length || distances.some((d) => !Number.isFinite(d) || d < 0)) {
    throw new OutlineGeometryError("Nieprawidłowy obwód lub odsunięcie płyty.");
  }
  const side = polygonExteriorSide(vertices);
  const edges = vertices.map((start, i) => {
    const end = vertices[(i + 1) % vertices.length]!;
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
    if (!length) throw new OutlineGeometryError("Obwód ma odcinek o zerowej długości.");
    const distance = distances[i]!;
    return { x: start.x - dy / length * side * distance, y: start.y + dx / length * side * distance, dx, dy };
  });
  return edges.map((b, i) => {
    const a = edges[(i + edges.length - 1) % edges.length]!;
    const cross = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(cross) < .000001) {
      const separation = Math.abs((b.x - a.x) * a.dy - (b.y - a.y) * a.dx) / Math.hypot(a.dx, a.dy);
      if (separation > .001) throw new OutlineGeometryError("Współliniowe ściany obwodu mają różne odsunięcia.");
      return { x: b.x, y: b.y };
    }
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / cross;
    return { x: a.x + a.dx * t, y: a.y + a.dy * t };
  });
}
