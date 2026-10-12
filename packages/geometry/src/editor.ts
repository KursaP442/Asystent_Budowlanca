import { type Point2D, distanceBetweenPoints } from "./index.js";

export function viewportToWorld(point: Point2D, bounds: { x: number; y: number; width: number; height: number },
  view: { x: number; y: number; width: number; height: number }, gridMm = 0): Point2D {
  if (![point.x, point.y, bounds.x, bounds.y, bounds.width, bounds.height, view.x, view.y, view.width, view.height, gridMm].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0 || view.width <= 0 || view.height <= 0 || gridMm < 0) {
    throw new RangeError("Invalid viewport transform.");
  }
  const x = view.x + (point.x - bounds.x) / bounds.width * view.width;
  const y = view.y + (point.y - bounds.y) / bounds.height * view.height;
  return gridMm ? { x: Math.round(x / gridMm) * gridMm, y: Math.round(y / gridMm) * gridMm } : { x, y };
}

export function calibrationScale(start: Point2D, end: Point2D, lengthMm: number): number {
  const distance = distanceBetweenPoints(start, end);
  if (!Number.isFinite(lengthMm) || lengthMm <= 0 || distance <= 0) throw new RangeError("Calibration requires a positive length and distinct points.");
  return lengthMm / distance;
}

export function drawingBounds(points: readonly Point2D[]) {
  if (!points.length) return { x: -1000, y: -1000, width: 14000, height: 10000 };
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) throw new RangeError("Invalid drawing coordinates.");
  const xs = points.map(({ x }) => x), ys = points.map(({ y }) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const width = Math.max(100, Math.max(...xs) - minX), height = Math.max(100, Math.max(...ys) - minY);
  return { x: minX - width * 0.1, y: minY - height * 0.1, width: width * 1.2, height: height * 1.2 };
}
