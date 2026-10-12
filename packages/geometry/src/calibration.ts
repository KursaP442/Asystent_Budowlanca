import { distanceBetweenPoints, type Point2D } from "./index.js";

export type ScaleReference = { startPx: Point2D; endPx: Point2D; lengthMm: number };
export type CalibratedTransform = {
  mmPerPixel: number;
  relativeError: number;
  originPx: Point2D;
  rotationDegrees: number;
};

export function calibrateDrawing(
  references: readonly ScaleReference[],
  originPx: Point2D,
  rotationDegrees: number,
): CalibratedTransform {
  if (references.length < 1 || references.length > 10) throw new RangeError("Provide between 1 and 10 scale references.");
  if (!Number.isFinite(rotationDegrees) || rotationDegrees < -180 || rotationDegrees > 180) {
    throw new RangeError("Rotation must be between -180 and 180 degrees.");
  }
  distanceBetweenPoints(originPx, originPx);
  const scales = references.map(({ startPx, endPx, lengthMm }) => {
    const pixels = distanceBetweenPoints(startPx, endPx);
    if (pixels < 10 || !Number.isFinite(lengthMm) || lengthMm <= 0) {
      throw new RangeError("A scale reference needs at least 10 pixels and a positive finite length.");
    }
    return lengthMm / pixels;
  });
  const mmPerPixel = scales.reduce((sum, value) => sum + value, 0) / scales.length;
  const relativeError = Math.max(...scales.map((value) => Math.abs(value - mmPerPixel) / mmPerPixel));
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0 || !Number.isFinite(relativeError)) {
    throw new RangeError("Scale cannot be represented as a finite positive value.");
  }
  return { mmPerPixel, relativeError, originPx: { ...originPx }, rotationDegrees };
}

export function imagePointToMillimeters(point: Point2D, transform: CalibratedTransform): Point2D {
  distanceBetweenPoints(point, point);
  assertTransform(transform);
  const angle = transform.rotationDegrees * Math.PI / 180;
  const x = (point.x - transform.originPx.x) * transform.mmPerPixel;
  const y = (point.y - transform.originPx.y) * transform.mmPerPixel;
  const result = { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
  distanceBetweenPoints(result, result);
  return result;
}

export function millimeterPointToImage(point: Point2D, transform: CalibratedTransform): Point2D {
  distanceBetweenPoints(point, point);
  assertTransform(transform);
  const angle = -transform.rotationDegrees * Math.PI / 180;
  const result = {
    x: (point.x * Math.cos(angle) - point.y * Math.sin(angle)) / transform.mmPerPixel + transform.originPx.x,
    y: (point.x * Math.sin(angle) + point.y * Math.cos(angle)) / transform.mmPerPixel + transform.originPx.y,
  };
  distanceBetweenPoints(result, result);
  return result;
}

function assertTransform(transform: CalibratedTransform) {
  distanceBetweenPoints(transform.originPx, transform.originPx);
  if (!Number.isFinite(transform.mmPerPixel) || transform.mmPerPixel <= 0
    || !Number.isFinite(transform.rotationDegrees) || Math.abs(transform.rotationDegrees) > 180) {
    throw new RangeError("Invalid calibrated transform.");
  }
}
