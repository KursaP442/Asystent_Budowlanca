import type { CadEntity } from "./cad-import.js";
import type { ProjectDocumentationKind } from "./construction-documentation.js";
import { constructionTechnologyCatalog, getConstructionTechnologyStages, type ConstructionTechnologySelections,
  type ConstructionTechnologyKey, type ConstructionWorkType } from "./construction-technology.js";

export const cadDrawingTools = [
  { id: "footing", label: "Ława fundamentowa", geometry: "line" },
  { id: "foundation-wall", label: "Ściana fundamentowa", geometry: "line" },
  { id: "pad", label: "Stopa fundamentowa", geometry: "area" },
  { id: "column", label: "Słup", geometry: "area" },
  { id: "wall", label: "Ściana", geometry: "line" },
  { id: "opening", label: "Otwór w ścianie", geometry: "line" },
  { id: "slab", label: "Obrys / płyta", geometry: "area" },
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

const structural: CadDrawingTool[] = ["wall", "opening", "column", "beam", "lintel", "ring-beam", "slab", "void"];
const profiles: Record<ProjectDocumentationKind, CadDrawingTool[]> = {
  foundation: ["footing", "foundation-wall", "wall", "pad", "column", "slab", "void"],
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

export function getCadDrawingTools(kind: ProjectDocumentationKind, drawingTitle: string): CadDrawingTool[] {
  const reinforcement = /zbrojeni|prętów/i.test(drawingTitle) && !/rzut stropu/i.test(drawingTitle) && kind !== "roofStructure";
  const section = /przekro|profile|rozwinięcia|schemat/i.test(drawingTitle);
  const specific = reinforcement ? ["rebar-line", "section", "dimension", "annotation"] as CadDrawingTool[]
    : /rzut stropu/i.test(drawingTitle) ? ["slab", "void", "beam", "column", "ring-beam", "rebar-line"] as CadDrawingTool[]
      : section ? [...profiles[kind].filter((tool) => !["roof-plane", "slab", "paving", "terrain"].includes(tool)), "section" as const]
      : profiles[kind];
  return [...new Set([...specific, ...(/strop.*zbrojen/i.test(drawingTitle) ? ["rebar-line" as const] : []),
    "axis", "section-cut", "dimension", "annotation"] as CadDrawingTool[])];
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
