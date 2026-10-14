import { cadDimensionLabelAngle, cadDimensionLabelPlacement, cadDimensionLabelRect, formatCadDimensionMm,
  type CadDimensionLayout } from "@asystent/domain";

const TICK_ANGLE = Math.PI / 4;

function tickEndpoints(point: { x: number; y: number }, start: { x: number; y: number },
  end: { x: number; y: number }, length: number) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lineLength = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy / lineLength, dx / lineLength) + TICK_ANGLE;
  const half = length / 2, tx = Math.cos(angle) * half, ty = Math.sin(angle) * half;
  return [{ x: point.x - tx, y: point.y - ty }, { x: point.x + tx, y: point.y + ty }] as const;
}

export function CadPlanDimensions({ dimensions, fontMm, onDimensionClick, editing, onEditingValueChange,
  onCommitDimension, onCancelDimension }: {
  dimensions: CadDimensionLayout[]; fontMm: number;
  onDimensionClick?: (dimension: CadDimensionLayout, key: string) => void;
  editing?: { key: string; value: string } | null;
  onEditingValueChange?: (value: string) => void;
  onCommitDimension?: (dimension: CadDimensionLayout, value: string) => void;
  onCancelDimension?: () => void;
}) {
  const groups = [...new Set(dimensions.map((d) => d.group))];
  const chains = [...new Set(dimensions.flatMap((d) => d.chainId ? [d.chainId] : []))];
  const dimensionTicks = new Map<string, { point: { x: number; y: number }; start: { x: number; y: number };
    end: { x: number; y: number }; length: number; color: string }>();
  const boxesOverlap = (a: CadDimensionLayout["box"], b: CadDimensionLayout["box"]) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const dimension of dimensions.filter((item) => !item.anchor)) {
    for (const point of [dimension.a, dimension.b]) {
      const dx = dimension.b.x - dimension.a.x, dy = dimension.b.y - dimension.a.y;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI;
      const key = `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}:${Math.round(angle * 1000)}:${dimension.color}`;
      if (!dimensionTicks.has(key)) dimensionTicks.set(key, {
        point, start: dimension.a, end: dimension.b, length: dimension.fontMm ?? fontMm, color: dimension.color,
      });
    }
  }
  return <g pointerEvents="none">
    <g className="cad-dimension-chains">{chains.map((chainId) => {
      const items = dimensions.filter((d) => d.chainId === chainId && d.anchor);
      if (!items.length) return null;
      const first = items[0]!;
      const origin = first.chainStart ?? first.start;
      const finish = first.chainEnd ?? items.reduce((best, d) =>
        Math.hypot(d.end.x - origin.x, d.end.y - origin.y) > Math.hypot(best.x - origin.x, best.y - origin.y) ? d.end : best,
      first.end);
      const length = Math.hypot(finish.x - origin.x, finish.y - origin.y);
      if (!length) return null;
      const ux = (finish.x - origin.x) / length, uy = (finish.y - origin.y) / length;
      const nx = -uy, ny = ux;
      const chainAngle = cadDimensionLabelAngle(origin, finish);
      const stations: { station: number; point: { x: number; y: number }; items: CadDimensionLayout[] }[] = [
        { station: 0, point: origin, items: [] },
        { station: length, point: finish, items: [] },
      ];
      for (const dimension of items) {
        const station = (dimension.end.x - origin.x) * ux + (dimension.end.y - origin.y) * uy;
        if (station < -1 || station > length + 1) continue;
        const point = { x: origin.x + ux * station, y: origin.y + uy * station };
        const existing = stations.find((item) => Math.abs(item.station - station) <= 1);
        if (existing) existing.items.push(dimension);
        else stations.push({ station, point, items: [dimension] });
      }
      stations.sort((a, b) => a.station - b.station);
      const segments = stations.slice(0, -1).flatMap((station, index) => {
        const next = stations[index + 1]!;
        const segmentLength = next.station - station.station;
        if (segmentLength < 1) return [];
        const owner = next.items[0];
        const label = formatCadDimensionMm(segmentLength);
        const font = owner?.fontMm ?? fontMm;
        return [{ station, next, owner, label, font }];
      });
      const lane = first.chainLane ?? 6, side = first.chainSide ?? first.side ?? 1;
      const occupiedLabelBoxes: CadDimensionLayout["box"][] = [];
      const labelPlacements = segments.map(({ station, next, label, font }) => {
        const placementAt = (labelLane: number) => cadDimensionLabelPlacement({
          x: (station.point.x + next.point.x) / 2 + nx * side * fontMm * labelLane,
          y: (station.point.y + next.point.y) / 2 + ny * side * fontMm * labelLane,
        }, chainAngle, label, font);
        if (first.chainFixedLabels) return placementAt(lane);
        for (let labelLane = lane; ; labelLane++) {
          const placement = placementAt(labelLane);
          if (occupiedLabelBoxes.some((other) => boxesOverlap(placement.box, other))) continue;
          occupiedLabelBoxes.push(placement.box);
          return placement;
        }
      });
      const offset = side * fontMm * lane;
      const baseline = stations.map((station) => ({
        ...station,
        point: { x: station.point.x + nx * offset, y: station.point.y + ny * offset },
      }));
      const chainColor = first.chainColor ?? first.color;
      return <g key={chainId} className="cad-dimension-chain" color={chainColor} fill="none" strokeWidth={1}
        vectorEffect="non-scaling-stroke">
        <title>Łańcuch wymiarowy: odległości między sąsiednimi kreskami</title>
        <line className="cad-dimension-line" stroke={chainColor} x1={baseline[0]!.point.x} y1={baseline[0]!.point.y}
          x2={baseline.at(-1)!.point.x} y2={baseline.at(-1)!.point.y} vectorEffect="non-scaling-stroke" />
        {stations.map((station, index) => {
          const at = baseline[index]!.point;
          const [tickStart, tickEnd] = tickEndpoints(at, baseline[0]!.point, baseline.at(-1)!.point, fontMm * .8);
          const color = station.items[0]?.color ?? chainColor;
          return <g key={`${chainId}:tick:${index}`} color={color} stroke={color}>
            {first.chainExtensions !== false && <line className="cad-dimension-extension"
              x1={station.point.x} y1={station.point.y} x2={at.x} y2={at.y}
              vectorEffect="non-scaling-stroke" />}
            <line x1={tickStart.x} y1={tickStart.y} x2={tickEnd.x} y2={tickEnd.y}
              vectorEffect="non-scaling-stroke" />
          </g>;
        })}
        {segments.map(({ station, next, owner, label, font }, index) => {
          const segmentLength = next.station - station.station;
          const { text, box } = labelPlacements[index]!;
          const dimension = owner ? { ...owner, start: station.point, end: next.point,
            a: baseline[index]!.point, b: baseline[index + 1]!.point,
            label, color: owner.color, labelAngle: chainAngle, text, box } satisfies CadDimensionLayout : undefined;
          const labelRect = cadDimensionLabelRect(text, label, font);
          const key = `${chainId}:segment:${index}`;
          const selectEntity = dimension?.entityId ? () => onDimensionClick?.(dimension, key) : undefined;
          const isEditing = editing?.key === key;
          const color = owner?.color ?? station.items[0]?.color ?? chainColor;
          return <g key={key} className={`cad-dimension${selectEntity ? " cad-dimension-editable" : ""}`}
            pointerEvents={selectEntity ? "auto" : "none"} color={color} stroke={color} strokeWidth={1}
            role={selectEntity ? "button" : undefined} aria-label={selectEntity ? `Wymiar ${label}` : undefined}
            tabIndex={selectEntity && onDimensionClick ? 0 : undefined}
            data-dimension-entity={dimension?.entityId} data-reference-id={dimension?.referenceId}
            data-measurement-kind={owner?.measurementKind ?? "chain-segment"} data-measurement={segmentLength}
            onPointerDown={selectEntity ? (event) => event.stopPropagation() : undefined}
            onClick={selectEntity ? (event) => { event.stopPropagation(); selectEntity(); } : undefined}
            onKeyDown={selectEntity ? (event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectEntity(); }
            } : undefined}>
            <g transform={`rotate(${chainAngle} ${text.x} ${text.y})`}>
            {isEditing ? <foreignObject x={labelRect.x} y={labelRect.y} width={Math.max(labelRect.width, font * 7)} height={Math.max(labelRect.height, font * 1.8)}
              pointerEvents="auto" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
              <input autoFocus type="number" min={0.1} step="any" aria-label="Nowy wymiar (cm)" defaultValue={editing.value}
                className="cad-dimension-input" onChange={(event) => onEditingValueChange?.(event.target.value)}
                onBlur={(event) => onCommitDimension?.(dimension!, event.currentTarget.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") { event.preventDefault(); onCommitDimension?.(dimension!, event.currentTarget.value); }
                  if (event.key === "Escape") { event.preventDefault(); onCancelDimension?.(); }
                }} />
            </foreignObject> : <>
              {selectEntity && <rect {...labelRect} fill="transparent" stroke="none" pointerEvents="all" />}
              <rect {...labelRect} fill="#fff" fillOpacity=".96" stroke="none" />
              <text x={text.x} y={text.y} fill={color} stroke="none" fontSize={font} textAnchor="middle">{label}</text>
            </>}
            </g>
          </g>;
        })}
      </g>;
    })}</g>
    <g className="cad-dimension-ticks" fill="none" strokeWidth={1}
      vectorEffect="non-scaling-stroke" aria-hidden="true">
      {[...dimensionTicks.values()].map(({ point, start, end, length, color }, index) => {
        const [tickStart, tickEnd] = tickEndpoints(point, start, end, length * .8);
        return <line key={index} stroke={color} x1={tickStart.x} y1={tickStart.y} x2={tickEnd.x} y2={tickEnd.y}
          vectorEffect="non-scaling-stroke" />;
      })}
    </g>
    {groups.map((group) => <g key={group}
    className={group === "overall" ? "cad-overall-dimensions" : group.endsWith(":location") ? "cad-location-dimensions" : "cad-exterior-dimensions"}>
    {dimensions.filter((d) => d.group === group && !d.chainId).map((d, i) => {
      const { start, end, a, b, text } = d;
      const font = d.fontMm ?? fontMm, box = d.box, labelRect = cadDimensionLabelRect(text, d.label, font);
      const key = `${group}:${i}`;
      const extensionStart = (origin: typeof start, tip: typeof a) => {
        const length = Math.hypot(tip.x - origin.x, tip.y - origin.y);
        const ratio = length ? Math.min(1, font * 1.5 / length) : 0;
        return { x: tip.x + (origin.x - tip.x) * ratio, y: tip.y + (origin.y - tip.y) * ratio };
      };
      const fromA = extensionStart(start, a), fromB = extensionStart(end, b);
      const entityId = d.entityId;
      const selectEntity = entityId ? () => onDimensionClick?.(d, key) : undefined;
      const isEditing = editing?.key === key;
      return <g key={i} className={`cad-dimension${onDimensionClick && d.entityId ? " cad-dimension-editable" : ""}`}
        pointerEvents="none"
        role={selectEntity ? "button" : undefined}
        aria-label={selectEntity ? `Wymiar ${d.label}` : undefined}
        tabIndex={selectEntity && onDimensionClick ? 0 : undefined}
        onPointerDown={selectEntity ? (event) => event.stopPropagation() : undefined}
        onClick={selectEntity ? (event) => { event.stopPropagation(); selectEntity(); } : undefined}
        onKeyDown={selectEntity ? (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectEntity(); }
        } : undefined}
        color={d.color} stroke={d.color} strokeWidth={1}
        data-dimension-entity={d.entityId} data-reference-id={d.referenceId} data-face-side={d.faceSide}
        data-measurement-kind={d.measurementKind}
        data-measurement={Math.hypot(end.x - start.x, end.y - start.y)}
        data-label-box={`${box.x} ${box.y} ${box.width} ${box.height}`}>
        <title>{selectEntity ? `Kliknij cztery razy, aby zmienić wymiar. ${d.description ?? ""}`
          : d.description ?? (d.faceSide ? `Wymiar lica: ${d.faceSide === "left" ? "lewego" : "prawego"}.` : "Wymiar elementu.")}</title>
        {!d.anchor && d.measurementKind !== "strip-width" && <>
          <line className="cad-dimension-extension" x1={fromA.x} y1={fromA.y} x2={a.x} y2={a.y}
            vectorEffect="non-scaling-stroke" />
          <line className="cad-dimension-extension" x1={fromB.x} y1={fromB.y} x2={b.x} y2={b.y}
            vectorEffect="non-scaling-stroke" />
        </>}
        {!d.anchor && <>
          <line className="cad-dimension-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
        </>}
        {d.anchor && <g className="cad-location-leader">
          <line x1={Math.max(box.x, Math.min(box.x + box.width, d.anchor.x))}
            y1={Math.max(box.y, Math.min(box.y + box.height, d.anchor.y))}
            x2={d.anchor.x} y2={d.anchor.y} vectorEffect="non-scaling-stroke" />
          <circle cx={d.anchor.x} cy={d.anchor.y} r={font / 5} fill={d.color} stroke="none" />
        </g>}
        <g transform={`rotate(${d.labelAngle} ${text.x} ${text.y})`}>
        {isEditing ? <foreignObject x={labelRect.x} y={labelRect.y} width={Math.max(labelRect.width, font * 7)} height={Math.max(labelRect.height, font * 1.8)}
          pointerEvents="auto" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <input autoFocus type="number" min={0.1} step="any" aria-label="Nowy wymiar (cm)" defaultValue={editing.value}
            className="cad-dimension-input" onChange={(event) => onEditingValueChange?.(event.target.value)}
            onBlur={(event) => onCommitDimension?.(d, event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") { event.preventDefault(); onCommitDimension?.(d, event.currentTarget.value); }
              if (event.key === "Escape") { event.preventDefault(); onCancelDimension?.(); }
            }} />
        </foreignObject> : <>
          {selectEntity && onDimensionClick && <rect {...labelRect} fill="transparent" stroke="none" pointerEvents="all"
            onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectEntity(); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectEntity(); }
            }} />}
          <rect {...labelRect} fill="#fff" fillOpacity=".96" stroke="none" />
          <text x={text.x} y={text.y} fill={d.color} stroke="none" fontSize={font} textAnchor="middle">{d.label}</text>
        </>}
        </g>
      </g>;
    })}
  </g>)}</g>;
}
