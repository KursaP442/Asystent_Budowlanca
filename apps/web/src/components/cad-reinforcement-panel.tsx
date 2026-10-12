"use client";

import { useState } from "react";
import { createReinforcementLayout, type ReinforcementLayout } from "@asystent/domain";
import type { CadEntity } from "@asystent/schemas";
import { cadError } from "@/lib/cad-client";

export function CadReinforcementPanel({ onCreate }: { onCreate: (entities: CadEntity[]) => void }) {
  const [mode, setMode] = useState<"beam" | "mesh">("beam");
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    x: "", y: "", lengthMm: "", widthMm: "", coverMm: "", diameterMm: "",
    transverseDiameterMm: "", spacingMm: "", longitudinalCount: "", steelGrade: "", designReference: "",
  });
  const labels: Record<keyof typeof values, string> = {
    x: "Początek X (mm)", y: "Początek Y (mm)", lengthMm: "Długość układu (mm)", widthMm: "Szerokość układu (mm)",
    coverMm: "Otulina układu (mm)", diameterMm: "Średnica prętów podłużnych (mm)",
    transverseDiameterMm: "Średnica prętów poprzecznych / strzemion (mm)",
    spacingMm: "Rozstaw poprzeczny (mm)", longitudinalCount: "Liczba prętów podłużnych",
    steelGrade: "Stal według projektu", designReference: "Numer rysunku konstrukcyjnego",
  };
  return <details className="cad-generator">
    <summary>Kreator zbrojenia belki / płyty</summary>
    <p>Przepisz parametry z projektu. Belka: rzut prętów podłużnych i położenia strzemion;
      płyta: siatka dwóch kierunków. To nie jest dobór nośności ani rozwinięcie gięcia prętów.</p>
    <label>Typ układu<select value={mode} onChange={(event) => setMode(event.target.value === "beam" ? "beam" : "mesh")}>
      <option value="beam">Belka — rzut zbrojenia</option><option value="mesh">Płyta — siatka zbrojenia</option>
    </select></label>
    {Object.entries(values).filter(([key]) => mode === "beam" || key !== "longitudinalCount").map(([key, value]) =>
      <label key={key}>{labels[key as keyof typeof values]}<input
        type={key === "steelGrade" || key === "designReference" ? "text" : "number"} step="any" value={value}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    <button type="button" className="quiet-button" onClick={() => {
      try {
        const numeric = ["x", "y", "lengthMm", "widthMm", "coverMm", "diameterMm", "transverseDiameterMm", "spacingMm",
          ...(mode === "beam" ? ["longitudinalCount"] : [])];
        if (numeric.some((key) => !values[key as keyof typeof values].trim())) throw new Error("Uzupełnij wszystkie wymiary z projektu.");
        const input: ReinforcementLayout = {
          mode, origin: { x: Number(values.x), y: Number(values.y) }, lengthMm: Number(values.lengthMm),
          widthMm: Number(values.widthMm), coverMm: Number(values.coverMm), diameterMm: Number(values.diameterMm),
          transverseDiameterMm: Number(values.transverseDiameterMm), spacingMm: Number(values.spacingMm),
          longitudinalCount: mode === "beam" ? Number(values.longitudinalCount) : 2,
          steelGrade: values.steelGrade, designReference: values.designReference,
        };
        onCreate(createReinforcementLayout(input, () => crypto.randomUUID())); setError("");
      } catch (cause) { setError(cadError(cause)); }
    }}>Narysuj układ zbrojenia</button>
  </details>;
}
