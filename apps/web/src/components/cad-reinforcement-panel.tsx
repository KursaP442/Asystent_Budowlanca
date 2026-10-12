"use client";

import { useRef, useState } from "react";
import { createReinforcementLayout, placeReinforcementOnHost, type ReinforcementLayout } from "@asystent/domain";
import { ReinforcementLayoutSchema, type CadEntity } from "@asystent/schemas";
import { cadError } from "@/lib/cad-client";
import { CadBeamSection } from "./cad-beam-section";

export function CadReinforcementPanel({ hosts, selectedHostId, onCreate }: {
  hosts: CadEntity[]; selectedHostId: string | null; onCreate: (entities: CadEntity[]) => void;
}) {
  const [mode, setMode] = useState<"beam" | "mesh">("beam");
  const [error, setError] = useState("");
  const [hostId, setHostId] = useState("");
  const [offset, setOffset] = useState("");
  const [values, setValues] = useState({
    x: "", y: "", lengthMm: "", widthMm: "", heightMm: "", topBarCount: "", coverMm: "", diameterMm: "",
    transverseDiameterMm: "", spacingMm: "", longitudinalCount: "", steelGrade: "", designReference: "",
  });
  const resize = useRef<{ x: number; y: number; width: number; height: number; scale: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const labels: Record<keyof typeof values, string> = {
    x: "Początek X (mm)", y: "Początek Y (mm)", lengthMm: "Długość układu (mm)", widthMm: "Szerokość układu (mm)",
    heightMm: "Wysokość przekroju belki (mm)", topBarCount: "Liczba prętów górnych",
    coverMm: "Otulina układu (mm)", diameterMm: "Średnica prętów podłużnych (mm)",
    transverseDiameterMm: "Średnica prętów poprzecznych / strzemion (mm)",
    spacingMm: "Rozstaw poprzeczny (mm)", longitudinalCount: "Liczba prętów podłużnych",
    steelGrade: "Stal według projektu", designReference: "Numer rysunku konstrukcyjnego",
  };
  const candidates = hosts.filter((e): e is Extract<CadEntity, { kind: "wall" | "footing" | "construction-line" }> =>
    e.kind === "wall" || e.kind === "footing" || e.kind === "construction-line"
    && ["foundation-wall", "beam", "ring-beam", "lintel"].includes(e.attributes.role));
  function input(origin = { x: 0, y: 0 }): ReinforcementLayout {
    return { mode, origin, lengthMm: Number(values.lengthMm), widthMm: Number(values.widthMm),
      coverMm: Number(values.coverMm), diameterMm: Number(values.diameterMm),
      transverseDiameterMm: Number(values.transverseDiameterMm), spacingMm: Number(values.spacingMm),
      longitudinalCount: mode === "beam" ? Number(values.longitudinalCount) : 2,
      steelGrade: values.steelGrade, designReference: values.designReference,
      ...(mode === "beam" ? { heightMm: Number(values.heightMm), topBarCount: Number(values.topBarCount) } : {}) };
  }
  const parsed = ReinforcementLayoutSchema.safeParse(input());
  const spec = parsed.success ? parsed.data : null;
  const sectionWidth = Number(values.widthMm), sectionHeight = Number(values.heightMm);
  const sectionGeometry = [sectionWidth, sectionHeight].every((v) => Number.isFinite(v) && v > 0 && v <= 100000);
  const selectedHost = candidates.find((e) => e.id === selectedHostId);
  let previewSequence = 0;
  const preview = spec ? createReinforcementLayout(spec, () => `00000000-0000-4000-8000-${String(++previewSequence).padStart(12, "0")}`) : [];
  const control = (key: keyof typeof values) => <label key={key}>{labels[key]}<input
    type={key === "steelGrade" || key === "designReference" ? "text" : "number"} step="any" value={values[key]}
    onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>;
  return <div className="cad-generator">
    <button type="button" className="quiet-button" onClick={() => dialog.current?.showModal()}>Kreator zbrojenia belki / płyty</button>
    <dialog ref={dialog} className="cad-generator-dialog" aria-label="Graficzny kreator zbrojenia">
    <div className="cad-dialog-heading"><h3>Graficzny kreator zbrojenia</h3>
      <button type="button" className="quiet-button" onClick={() => dialog.current?.close()}>Zamknij kreator</button></div>
    <div className="cad-generator-fields">
    <section>
    <p>Przepisz projekt konstrukcyjny: przekrój, rzut prętów i miejsce ułożenia.
      Strzemiona są oznaczane w rzucie; nie wyliczamy długości gięcia ani nośności.</p>
    <label>Typ układu<select value={mode} onChange={(event) => setMode(event.target.value === "beam" ? "beam" : "mesh")}>
      <option value="beam">Belka — przekrój i rzut zbrojenia</option><option value="mesh">Płyta — siatka zbrojenia</option>
    </select></label>
    <h4>1. Geometria</h4>
    {control("lengthMm")}{control("widthMm")}{mode === "beam" && control("heightMm")}
    {mode === "beam" && sectionGeometry && <svg className="cad-section-designer" role="img" aria-label="Graficzny przekrój belki"
      viewBox={`${-sectionWidth * .6} ${-sectionHeight * .35} ${sectionWidth * 2.7} ${sectionHeight * 1.75}`}
      onPointerDown={(event) => {
        if (!(event.target instanceof Element) || !event.target.hasAttribute("data-resize")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        resize.current = { x: event.clientX, y: event.clientY, width: sectionWidth, height: sectionHeight,
          scale: Math.max(sectionWidth * 2.7 / bounds.width, sectionHeight * 1.75 / bounds.height) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => {
        const start = resize.current;
        if (!start) return;
        setValues((previous) => ({ ...previous, widthMm: String(Math.max(1, Math.round(start.width + (event.clientX - start.x) * start.scale))),
          heightMm: String(Math.max(1, Math.round(start.height + (event.clientY - start.y) * start.scale))) }));
      }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }}>
      {spec && spec.heightMm ? <CadBeamSection widthMm={spec.widthMm} heightMm={spec.heightMm} coverMm={spec.coverMm}
        diameterMm={spec.diameterMm} stirrupDiameterMm={spec.transverseDiameterMm}
        topCount={spec.topBarCount ?? Math.floor(spec.longitudinalCount / 2)}
        bottomCount={spec.longitudinalCount - (spec.topBarCount ?? Math.floor(spec.longitudinalCount / 2))} />
        : <g><rect width={sectionWidth} height={sectionHeight} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <text x={0} y={-sectionHeight / 10} fontSize={Math.max(sectionWidth, sectionHeight) / 12}>{sectionWidth} × {sectionHeight} mm</text></g>}
      <circle data-resize cx={sectionWidth} cy={sectionHeight} r={Math.max(sectionWidth, sectionHeight) / 25}
        fill="#ea580c"><title>Przeciągnij narożnik przekroju lub wpisz wymiary</title></circle>
    </svg>}
    </section><section>
    <h4>2. Pręty i strzemiona</h4>
    {control("coverMm")}{control("diameterMm")}{control("transverseDiameterMm")}{control("spacingMm")}
    {mode === "beam" && <>{control("longitudinalCount")}{control("topBarCount")}</>}
    {control("steelGrade")}{control("designReference")}
    {spec ? <div className="cad-beam-preview">
      <svg role="img" aria-label="Graficzny rzut zbrojenia" viewBox={`-100 -200 ${spec.lengthMm + 200} ${spec.widthMm + 400}`}>
        <rect width={spec.lengthMm} height={spec.widthMm} fill="#f1f5f9" stroke="#64748b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {preview.map((e, i) => "start" in e.geometry && e.kind === "rebar-line" ? <line key={i}
          x1={e.geometry.start.x} y1={e.geometry.start.y} x2={e.geometry.end.x} y2={e.geometry.end.y}
          stroke="#0f172a" strokeWidth={e.attributes.diameterMm}
          strokeDasharray={e.layerId === "rebar-top" ? `${e.attributes.diameterMm * 4} ${e.attributes.diameterMm * 2}` : undefined} /> : null)}
      </svg>
    </div> : <p>Uzupełnij parametry, aby zobaczyć zwymiarowany przekrój i rzut. {parsed.error?.issues[0]?.message}</p>}
    </section><section>
    <h4>3. Położenie {mode === "beam" ? "belki" : "siatki"}</h4>
    <label htmlFor="cad-rebar-host">Ściana / ława / belka pod układem</label>
    <select id="cad-rebar-host" value={hostId} onChange={(event) => setHostId(event.target.value)}>
      <option value="">Położenie według współrzędnych</option>
      {candidates.map((e, i) => <option key={e.id} value={e.id}>{i + 1}. {e.kind === "construction-line" ? e.attributes.role : e.kind}
        {" · "}{e.kind === "construction-line" || e.kind === "footing" ? e.attributes.designReference : e.attributes.material}</option>)}
    </select>
    {selectedHost && <button type="button" className="quiet-button"
      onClick={() => setHostId(selectedHost.id)}>Użyj elementu zaznaczonego na canvas</button>}
    <button type="button" className="quiet-button" onClick={() => dialog.current?.close()}>Wróć na canvas, aby wskazać podparcie</button>
    <p>Zaznacz ścianę na płótnie i otwórz ponownie kreator. Wpisane parametry pozostaną zachowane.</p>
    {hostId ? <label>Odległość od początku podparcia (mm)<input type="number" step="any" value={offset}
      onChange={(event) => setOffset(event.target.value)} /></label> : <>{control("x")}{control("y")}</>}
    {!candidates.length && <p>Aby przypisać układ do ściany, dodaj podkład z rzutu fundamentów opcją „Wykorzystaj wcześniejszy rysunek”.</p>}
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    <button type="button" className="quiet-button" onClick={() => {
      try {
        if (!spec) throw new Error(parsed.error?.issues.map((e) => e.message).join(" ") ?? "Uzupełnij parametry.");
        const host = candidates.find((e) => e.id === hostId);
        if (hostId && (!host || !offset.trim())) throw new Error("Wskaż istniejące podparcie i odległość od jego początku.");
        if (!hostId && (!values.x.trim() || !values.y.trim())) throw new Error("Podaj współrzędne położenia.");
        const entities = createReinforcementLayout(input(host ? { x: 0, y: 0 } : { x: Number(values.x), y: Number(values.y) }), () => crypto.randomUUID());
        onCreate(host ? placeReinforcementOnHost(entities, host, Number(offset), () => crypto.randomUUID()) : entities); setError("");
        dialog.current?.close();
      } catch (cause) { setError(cadError(cause)); }
    }}>Narysuj układ zbrojenia</button>
    </section></div></dialog>
  </div>;
}
