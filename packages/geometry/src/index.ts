// Niezależny od UI model geometrii 2D (mm): punkty, odcinki, polilinie, transformacje, topologia.
export interface Point2D {
  x: number;
  y: number;
}

export * from "./calibration.js";
export * from "./polygon-validation.js";

export function distanceBetweenPoints(start: Point2D, end: Point2D): number {
  assertFinitePoint(start);
  assertFinitePoint(end);

  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function polygonAreaMm2(vertices: readonly Point2D[]): number {
  if (vertices.length < 3) {
    throw new RangeError("A polygon must have at least three vertices.");
  }

  for (const vertex of vertices) {
    assertFinitePoint(vertex);
  }

  let doubledArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    doubledArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(doubledArea) / 2;
}

function assertFinitePoint(point: Point2D): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Point coordinates must be finite numbers.");
  }
}
