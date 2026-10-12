import type { CadEntity } from "./cad-import.js";
import type { ProjectDocumentationKind } from "./construction-documentation.js";
import { constructionTechnologyCatalog, getConstructionTechnologyStages, type ConstructionTechnologySelections,
  type ConstructionTechnologyKey, type ConstructionWorkType } from "./construction-technology.js";

  export const foundationDocumentChecklist = {
    plan: "Rzut konstrukcyjny fundamentów: osie, wymiary i oznaczenia elementów",
    sections: "Przekroje, rzędne posadowienia i odniesienie do poziomu ±0,00",
    reinforcement: "Detale zbrojenia, zakotwienia, zakłady i zestawienie prętów",
    isolation: "Detale hydroizolacji, ocieplenia i połączenia z podłogą",
    geotechnics: "Opinia / dokumentacja geotechniczna i warunki gruntowo-wodne",
    concrete: "Opis konstrukcji: klasy betonu i stali, otulina, podbeton i zasypki",
    penetrations: "Przejścia instalacyjne, uziom i odwodnienie — jeżeli przewidziano",
  } as const;

export const cadDrawingTools = [
  { id: "footing", label: "Ława fundamentowa", geometry: "line" },
  { id: "foundation-wall", label: "Ściana fundamentowa", geometry: "line" },
  { id: "pad", label: "Stopa fundamentowa", geometry: "area" },
  { id: "excavation", label: "Wykop", geometry: "line" },
  { id: "column", label: "Słup", geometry: "area" },
  { id: "wall", label: "Ściana", geometry: "line" },
  { id: "opening", label: "Otwór w ścianie", geometry: "line" },
  { id: "slab", label: "Obrys / płyta", geometry: "area" },
  { id: "basement-area", label: "Pomieszczenie z piwnicą", geometry: "area" },
  { id: "beam", label: "Belka", geometry: "line" },
  { id: "lintel", label: "Nadproże", geometry: "line" },
  { id: "ring-beam", label: "Wieniec", geometry: "line" },
  { id: "roof-plane", label: "Połać dachu", geometry: "area" },
  { id: "rafter", label: "Krokiew", geometry: "line" },
  { id: "ridge", label: "Kalenica", geometry: "line" },
  { id: "gutter", label: "Rynna / obróbka", geometry: "line" },
  { id: "rebar-line", label: "Pręt zbrojeniowy", geometry: "line" },
  { id: "section", label: "Element przekroju", geometry: "area" },
  { id: "elevation", label: "Pole elewacji", geometry: "area" },
  { id: "finish", label: "Pole wykończenia", geometry: "area" },
  { id: "ceiling", label: "Pole sufitu", geometry: "area" },
  { id: "fence", label: "Przęsło / brama", geometry: "line" },
  { id: "paving", label: "Pole nawierzchni", geometry: "area" },
  { id: "kerb", label: "Obrzeże", geometry: "line" },
  { id: "drain", label: "Odwodnienie", geometry: "line" },
  { id: "pipe", label: "Trasa instalacji", geometry: "line" },
  { id: "terrain", label: "Obszar terenu", geometry: "area" },
  { id: "equipment", label: "Urządzenie / wyposażenie", geometry: "area" },
  { id: "void", label: "Otwór w płycie / polu", geometry: "area" },
  { id: "axis", label: "Oś konstrukcyjna", geometry: "line" },
  { id: "section-cut", label: "Linia przekroju", geometry: "line" },
  { id: "dimension", label: "Wymiar", geometry: "line" },
  { id: "annotation", label: "Opis", geometry: "point" },
] as const;
export type CadDrawingTool = typeof cadDrawingTools[number]["id"];

export function getCadWallDefaults(technology: ConstructionTechnologySelections, foundation: boolean) {
  const key = foundation ? "foundationWalls" : "loadBearingWall";
  const value = technology[key];
  const material = constructionTechnologyCatalog[key].options.find((option) => option.value === value)?.label;
  const widths: Record<string, number> = { "concrete-block-24": 240, "shuttering-block-24": 240,
    "shuttering-block-25": 250, "shuttering-block-30": 300 };
  return { material: value && value !== "according-to-project" ? material ?? null : null, widthMm: value ? widths[value] ?? null : null };
}

export function getFoundationSupportOptions(technology: ConstructionTechnologySelections) {
  const selected = [...technology.foundationType, ...technology.otherFoundationType];
  const options: { value: "strip" | "slab" | "manual"; label: string }[] = [];
  if (selected.some((v) => ["strip-footings", "combined-footing", "other-foundation-strip"].includes(v))) options.push({ value: "strip", label: "Ława pod ścianą" });
  if (selected.some((v) => ["foundation-slab", "other-foundation-slab"].includes(v)) || technology.foundationWalls === "foundation-slab-only") {
    options.push({ value: "slab", label: "Płyta — z zamkniętego obwodu ścian" });
  }
  if (!options.length || selected.some((v) => !["strip-footings", "combined-footing", "other-foundation-strip",
    "foundation-slab", "other-foundation-slab"].includes(v))) options.push({ value: "manual", label: "Podparcie istniejące / inne — z rysunku projektu" });
  return options;
}

const structural: CadDrawingTool[] = ["wall", "opening", "column", "beam", "lintel", "ring-beam", "slab", "void"];
const profiles: Record<ProjectDocumentationKind, CadDrawingTool[]> = {
  foundation: ["footing", "foundation-wall", "wall", "pad", "column", "slab", "void", "excavation"],
  basement: structural, storey: structural, masonry: ["wall", "opening", "column", "lintel", "ring-beam"],
  concrete: ["footing", "pad", "column", "beam", "slab", "void"],
  roof: ["roof-plane", "ridge", "gutter", "void"],
  roofStructure: ["rafter", "beam", "column", "ridge", "roof-plane"],
  facade: ["elevation", "finish", "void"], joinery: ["wall", "opening", "equipment"],
  interior: ["wall", "opening", "finish", "ceiling", "void", "equipment"],
  fencing: ["fence", "column", "footing", "pad"],
  paving: ["paving", "kerb", "drain", "void"],
  terrace: ["slab", "column", "beam", "finish", "kerb", "drain", "void"],
  drainage: ["drain", "pipe", "equipment", "terrain"],
  connections: ["pipe", "equipment", "terrain"],
  retaining: ["foundation-wall", "footing", "drain"],
  garage: ["footing", "wall", "opening", "column", "beam", "roof-plane"],
  chimney: ["pad", "column", "equipment"],
  plumbing: ["pipe", "equipment"], electrical: ["pipe", "equipment"], heating: ["pipe", "equipment"],
  ventilation: ["pipe", "equipment"], sewage: ["pipe", "equipment", "terrain"],
  energy: ["equipment", "pipe", "roof-plane"], landscaping: ["terrain", "paving", "kerb", "equipment"],
  demolition: ["wall", "opening", "terrain"], existing: structural,
  specialist: ["wall", "slab", "section", "equipment", "pipe", "terrain"],
};

export function getCadDrawingTools(kind: ProjectDocumentationKind, drawingTitle: string,
  technology?: ConstructionTechnologySelections, basement = false): CadDrawingTool[] {
  const reinforcement = /zbrojeni|prętów/i.test(drawingTitle) && !/rzut stropu/i.test(drawingTitle) && kind !== "roofStructure";
  const section = /przekro|profile|rozwinięcia|schemat/i.test(drawingTitle);
  const specific = kind === "foundation" && /Detale izolacji/i.test(drawingTitle) ? ["section", "foundation-wall", "footing", "drain", "pipe", "void"] as CadDrawingTool[]
    : reinforcement ? ["rebar-line", "section", "dimension", "annotation"] as CadDrawingTool[]
    : /rzut stropu/i.test(drawingTitle) ? ["slab", "void", "beam", "column", "ring-beam", "rebar-line"] as CadDrawingTool[]
      : section ? [...profiles[kind].filter((tool) => !["roof-plane", "slab", "paving", "terrain"].includes(tool)), "section" as const]
      : profiles[kind];
  const result = [...new Set([...specific, ...(/strop.*zbrojen/i.test(drawingTitle) ? ["rebar-line" as const] : []),
    ...(kind === "foundation" && !section && !reinforcement && basement ? ["basement-area" as const] : []),
    "axis", "section-cut", "dimension", "annotation"] as CadDrawingTool[])];
  if (kind === "foundation" && technology && !technology.foundationType.includes("foundation-slab")
    && !technology.otherFoundationType.includes("other-foundation-slab")
    && technology.foundationWalls !== "foundation-slab-only"
    && technology.foundationBottomSlab !== "bottom-slab-yes"
    && !technology.foundationType.includes("according-to-project")
    && !technology.otherFoundationType.includes("according-to-project")) return result.filter((tool) => tool !== "slab");
  return result;
}

export function cadEntityTool(entity: CadEntity): CadDrawingTool | null {
  if (entity.kind === "construction-line" || entity.kind === "construction-area") return entity.attributes.role;
  return cadDrawingTools.find(({ id }) => id === entity.kind)?.id ?? null;
}

export function getCadTechnologyHints(kind: ProjectDocumentationKind, workType: ConstructionWorkType,
  selections: ConstructionTechnologySelections): { label: string; material: string; thermal: boolean }[] {
  const sections: Partial<Record<ProjectDocumentationKind, string[]>> = {
    foundation: ["Fundamenty i izolacje", "Fundamenty i zbrojenie"],
    storey: ["Ściany i konstrukcja", "Stropy i schody"], basement: ["Fundamenty i izolacje", "Ściany i konstrukcja"],
    facade: ["Fasada i elewacja", "Elewacja"], roof: ["Dach", "Pokrycie dachu"],
    roofStructure: ["Dach", "Konstrukcja dachu"], paving: ["Nawierzchnie i obrzeża"],
    fencing: ["Ogrodzenie"], interior: ["Wykończenia"],
  };
  const active = new Set(getConstructionTechnologyStages(workType, selections));
  return Object.entries(constructionTechnologyCatalog).flatMap(([name, definition]) => {
    const key = name as ConstructionTechnologyKey;
    if (!active.has(key) || !(sections[kind] ?? []).some((section) => definition.section.startsWith(section))) return [];
    const value = selections[key];
    const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    return values.flatMap((choice) => {
      const option = definition.options.find((item) => item.value === choice);
      if (!option || choice.includes("no-") || choice.endsWith("-none") || choice === "according-to-project") return [];
      return [{ label: definition.label, material: option.label,
        thermal: name.toLowerCase().includes("insulation") && !choice.includes("no-insulation") }];
    });
  });
}
