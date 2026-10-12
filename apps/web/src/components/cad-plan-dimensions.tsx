import type { CadDimensionLayout } from "@asystent/domain";

export function CadPlanDimensions({ dimensions, fontMm }: { dimensions: CadDimensionLayout[]; fontMm: number }) {
  const groups = [...new Set(dimensions.map((d) => d.group))];
  return <g pointerEvents="none">{groups.map((group) => <g key={group}
    className={group === "overall" ? "cad-overall-dimensions" : group.endsWith(":location") ? "cad-location-dimensions" : "cad-exterior-dimensions"}>
    {dimensions.filter((d) => d.group === group).map((d, i) => {
      const { start, end, a, b, text, color } = d, tick = fontMm / 3;
      const font = d.fontMm ?? fontMm, box = d.box;
      const extensionStart = (origin: typeof start, tip: typeof a) => {
        const length = Math.hypot(tip.x - origin.x, tip.y - origin.y);
        const ratio = length ? Math.min(1, font * 1.5 / length) : 0;
        return { x: tip.x + (origin.x - tip.x) * ratio, y: tip.y + (origin.y - tip.y) * ratio };
      };
      const fromA = extensionStart(start, a), fromB = extensionStart(end, b);
      return <g key={i} className="cad-dimension" stroke={color} strokeWidth={1}
        data-dimension-entity={d.entityId} data-reference-id={d.referenceId} data-face-side={d.faceSide}
        data-measurement={Math.hypot(end.x - start.x, end.y - start.y)}
        data-label-box={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        <title>{d.description ?? (d.faceSide ? `Wymiar lica: ${d.faceSide === "left" ? "lewego" : "prawego"}.` : "Wymiar elementu.")}</title>
        {!d.anchor && <>
          <line className="cad-dimension-extension" x1={fromA.x} y1={fromA.y} x2={a.x} y2={a.y}
            strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <line className="cad-dimension-extension" x1={fromB.x} y1={fromB.y} x2={b.x} y2={b.y}
            strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <line className="cad-dimension-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
          {[a, b].map((p, j) => <line key={j} x1={p.x - tick} y1={p.y - tick} x2={p.x + tick} y2={p.y + tick}
            vectorEffect="non-scaling-stroke" />)}
        </>}
        {d.anchor && <g className="cad-location-leader">
          <line x1={Math.max(box.x, Math.min(box.x + box.width, d.anchor.x))}
            y1={Math.max(box.y, Math.min(box.y + box.height, d.anchor.y))}
            x2={d.anchor.x} y2={d.anchor.y} vectorEffect="non-scaling-stroke" />
          <circle cx={d.anchor.x} cy={d.anchor.y} r={font / 5} fill={color} stroke="none" />
        </g>}
        <rect {...box} fill="#fcfdff" stroke="none" />
        <text x={text.x} y={text.y} fill={color} stroke="none" fontSize={font} textAnchor="middle">{d.label}</text>
      </g>;
    })}
  </g>)}</g>;
}
