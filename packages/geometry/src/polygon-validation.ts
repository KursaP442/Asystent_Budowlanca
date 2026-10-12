import { distanceBetweenPoints, polygonAreaMm2, type Point2D } from "./index.js";

export function isSimplePolygon(vertices: readonly Point2D[]): boolean {
  if (vertices.length < 3) return false;
  if (vertices.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new RangeError("Polygon coordinates must be finite.");
  }
  if (polygonAreaMm2(vertices) <= 0) return false;
  for (let first = 0; first < vertices.length; first += 1) {
    const a = vertices[first]!;
    const b = vertices[(first + 1) % vertices.length]!;
    if (distanceBetweenPoints(a, b) === 0) return false;
    for (let second = first + 1; second < vertices.length; second += 1) {
      if (second === first + 1 || first === 0 && second === vertices.length - 1) continue;
      const c = vertices[second]!;
      const d = vertices[(second + 1) % vertices.length]!;
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const cross = (p: Point2D, q: Point2D, r: Point2D) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: Point2D, q: Point2D, r: Point2D) =>
    q.x >= Math.min(p.x, r.x) && q.x <= Math.max(p.x, r.x)
    && q.y >= Math.min(p.y, r.y) && q.y <= Math.max(p.y, r.y);
  const abc = cross(a, b, c);
  const abd = cross(a, b, d);
  const cda = cross(c, d, a);
  const cdb = cross(c, d, b);
  if (abc === 0 && onSegment(a, c, b) || abd === 0 && onSegment(a, d, b)
    || cda === 0 && onSegment(c, a, d) || cdb === 0 && onSegment(c, b, d)) return true;
  return Math.sign(abc) !== Math.sign(abd) && Math.sign(cda) !== Math.sign(cdb);
}
