import type { CadDimensionLayout } from "@asystent/domain";

export function CadPlanDimensions({ dimensions, fontMm }: { dimensions: CadDimensionLayout[]; fontMm: number }) {
  const groups = [...new Set(dimensions.map((d) => d.group))];
  return <g pointerEvents="none">{groups.map((group) => <g key={group}
    className={group === "overall" ? "cad-overall-dimensions" : group.endsWith(":location") ? "cad-location-dimensions" : "cad-exterior-dimensions"}>
    {dimensions.filter((d) => d.group === group).map((d, i) => {
      const { start, end, a, b, text, color } = d, tick = fontMm / 3;
      const font = d.fontMm ?? fontMm, box = d.box;
      return <g key={i} className="cad-dimension" stroke={color} strokeWidth={1}
        data-dimension-entity={d.entityId} data-reference-id={d.referenceId} data-face-side={d.faceSide}
        data-measurement={Math.hypot(end.x - start.x, end.y - start.y)}
        data-label-box={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        <title>{d.description ?? (d.faceSide ? `Wymiar lica: ${d.faceSide === "left" ? "lewego" : "prawego"}.` : "Wymiar elementu.")}</title>
        <line x1={start.x} y1={start.y} x2={a.x} y2={a.y} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <line x1={end.x} y1={end.y} x2={b.x} y2={b.y} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
        {[a, b].map((p, j) => <line key={j} x1={p.x - tick} y1={p.y - tick} x2={p.x + tick} y2={p.y + tick}
          vectorEffect="non-scaling-stroke" />)}
        {d.anchor && <g className="cad-location-leader">
          <line x1={text.x} y1={box.y + box.height} x2={d.anchor.x} y2={d.anchor.y} vectorEffect="non-scaling-stroke" />
          <circle cx={d.anchor.x} cy={d.anchor.y} r={font / 5} fill={color} stroke="none" />
        </g>}
        <rect {...box} fill="#fcfdff" stroke="none" />
        <text x={text.x} y={text.y} fill={color} stroke="none" fontSize={font} textAnchor="middle">{d.label}</text>
      </g>;
    })}
  </g>)}</g>;
}
