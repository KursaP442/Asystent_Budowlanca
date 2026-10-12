export function CadBeamSection({ widthMm: w, heightMm: h, coverMm, diameterMm, stirrupDiameterMm,
  topCount, bottomCount }: { widthMm: number; heightMm: number; coverMm: number; diameterMm: number;
  stirrupDiameterMm: number; topCount: number; bottomCount: number }) {
  const c = coverMm + stirrupDiameterMm + diameterMm / 2;
  const font = Math.max(w, h) / 12;
  const bars = (count: number, y: number) => Array.from({ length: count }, (_, i) =>
    <circle key={i} cx={count === 1 ? w / 2 : c + i * (w - 2 * c) / (count - 1)} cy={y}
      r={diameterMm / 2} fill="#0f172a" />);
  return <g className="cad-beam-section">
    <rect width={w} height={h} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    <rect x={coverMm + stirrupDiameterMm / 2} y={coverMm + stirrupDiameterMm / 2}
      width={w - 2 * coverMm - stirrupDiameterMm} height={h - 2 * coverMm - stirrupDiameterMm}
      rx={stirrupDiameterMm * 2} fill="none" stroke="#0f172a" strokeWidth={stirrupDiameterMm} />
    {bars(topCount, c)}{bars(bottomCount, h - c)}
    <path d={`M0,${-font}V${-font * 2}H${w}V${-font} M${-font},0H${-font * 2}V${h}H${-font}`}
      fill="none" stroke="#64748b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    <g fill="#0f172a" fontSize={font}>
      <text x={w / 2} y={-font * 2.4} textAnchor="middle">{w} mm</text>
      <text x={-font * 2.5} y={h / 2} textAnchor="end">{h} mm</text>
      <text x={w + font} y={c}>Góra {topCount}Ø{diameterMm}</text>
      <text x={w + font} y={h - c}>Dół {bottomCount}Ø{diameterMm}</text>
      <text x={0} y={h + font * 2}>Strzemiona Ø{stirrupDiameterMm} · otulina {coverMm} mm</text>
    </g>
  </g>;
}
