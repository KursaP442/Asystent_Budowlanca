// Czyste funkcje przedmiarów i kosztorysów na bazie zatwierdzonej geometrii.
export function calculateAreaWithWaste(
  areaM2: number,
  wastePercent: number,
): number {
  assertNonNegativeFinite(areaM2, "Area");
  assertNonNegativeFinite(wastePercent, "Waste percentage");

  const areaWithWaste = areaM2 + (areaM2 * wastePercent) / 100;
  if (!Number.isFinite(areaWithWaste)) {
    throw new RangeError("Calculated area must be a finite number.");
  }

  return areaWithWaste;
}

export function calculateVolumeM3FromMillimeters(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
): number {
  assertNonNegativeFinite(lengthMm, "Length");
  assertNonNegativeFinite(widthMm, "Width");
  assertNonNegativeFinite(heightMm, "Height");

  const volumeM3 = (lengthMm * widthMm * heightMm) / 1_000_000_000;
  if (!Number.isFinite(volumeM3)) {
    throw new RangeError("Calculated volume must be a finite number.");
  }

  return volumeM3;
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number.`);
  }
}
