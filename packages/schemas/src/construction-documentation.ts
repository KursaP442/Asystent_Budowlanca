import { z } from "zod";
import {
  ConstructionTechnologySchema,
  constructionTechnologyCatalog,
  getConstructionTechnologyStages,
  type ConstructionTechnologySelections,
} from "./construction-technology.js";

export const projectDocumentationCatalog = {
  foundation: {
    label: "Fundamenty",
    drawings: ["Rzut fundamentów z osiami i wymiarami", "Przekroje fundamentów i poziomy posadowienia", "Detale zbrojenia i zestawienie prętów",
      "Detale izolacji, odwodnienia i przejść instalacyjnych"],
    measurements: ["Wymiary i rzędne ław, stóp, płyty oraz ścian fundamentowych", "Warstwy podłoża, hydroizolacji i izolacji cieplnej", "Klasa betonu, stal i zbrojenie wyłącznie z projektu konstrukcyjnego"],
  },
  basement: {
    label: "Piwnica",
    drawings: ["Rzut piwnicy", "Przekroje piwnicy i połączenia z fundamentami", "Detale konstrukcji, izolacji i zbrojenia piwnicy"],
    measurements: ["Wysokości, grubości ścian i stropu", "Wymiary otworów i schodów", "Układ warstw izolacyjnych oraz instalacji"],
  },
  storey: {
    label: "Kondygnacja",
    drawings: ["Rzut kondygnacji z wymiarami i otworami", "Przekroje oraz zestawienie ścian", "Rzut stropu, detale konstrukcyjne i zbrojenie"],
    measurements: ["Długości, grubości, materiały i wysokości ścian", "Wymiary, liczba i położenie otworów", "Grubość, warstwy i rozpiętości stropu; elementy żelbetowe według projektu"],
  },
  roof: {
    label: "Dach",
    drawings: ["Rzut dachu z wymiarami połaci", "Przekroje dachu, spadki i układ warstw", "Detale okapu, kalenicy, koszy i przejść dachowych"],
    measurements: ["Wymiary rzeczywiste połaci i kąty nachylenia", "Długości okapu, kalenicy, koszy i obróbek", "Powierzchnie otworów, warstwy, zakłady oraz rynny i rury spustowe"],
  },
  roofStructure: {
    label: "Konstrukcja dachu",
    drawings: ["Rzut konstrukcji dachu", "Przekroje elementów i detale połączeń", "Zestawienie drewna, stali lub zbrojenia według projektu"],
    measurements: ["Liczba, rozstaw, długość i przekrój każdego typu elementu", "Materiał, klasa i zabezpieczenia elementów", "Łączniki oraz podparcia wyłącznie z projektu konstrukcyjnego"],
  },
  concrete: {
    label: "Elementy betonowe i żelbetowe",
    drawings: ["Rzuty i przekroje elementów objętych zleceniem", "Detale deskowania, zbrojenia i połączeń", "Zestawienie prętów według projektu konstrukcyjnego"],
    measurements: ["Wymiary i liczba elementów", "Klasa betonu, powierzchnia deskowania", "Średnica, długość, liczba i kształt prętów; otulina z projektu"],
  },
  masonry: {
    label: "Roboty murowe",
    drawings: ["Rzuty i rozwinięcia ścian objętych pracami", "Przekroje oraz detale nadproży, wieńców i połączeń"],
    measurements: ["Długość, wysokość, grubość i materiał każdej ściany", "Otwory i powierzchnie do odjęcia", "Format elementów, spoiny, nadproża i wieniec według projektu"],
  },
  facade: {
    label: "Elewacja",
    drawings: ["Zwymiarowane elewacje z oknami i drzwiami", "Przekroje warstw i detale cokołu oraz ościeży"],
    measurements: ["Powierzchnia każdej elewacji, otworów i ościeży", "Grubość i parametry izolacji, warstwy i powierzchnie wykończenia", "Długość profili, parapetów, dylatacji i obróbek"],
  },
  joinery: {
    label: "Stolarka",
    drawings: ["Zestawienie okien, drzwi i bram", "Rzuty z lokalizacją otworów i detale montażu"],
    measurements: ["Szerokość, wysokość i liczba każdego typu", "Materiał, parametry, otwieranie i strony montażu", "Długości uszczelnień, parapety i obróbki"],
  },
  electrical: {
    label: "Instalacja elektryczna",
    drawings: ["Rzuty tras i punktów instalacji", "Schemat rozdzielnic, obwodów i zabezpieczeń"],
    measurements: ["Długość i rodzaj przewodów oraz tras", "Liczba punktów, osprzętu, obwodów i urządzeń", "Parametry kabli i zabezpieczeń według projektu branżowego"],
  },
  plumbing: {
    label: "Instalacja wodno-kanalizacyjna",
    drawings: ["Rzuty i rozwinięcia instalacji wodno-kanalizacyjnej", "Schematy podejść, pionów, spadków i urządzeń"],
    measurements: ["Długość, średnica, materiał i izolacja rur", "Kształtki, punkty poboru, podejścia i urządzenia", "Poziomy, spadki i miejsca przejść"],
  },
  heating: {
    label: "Ogrzewanie",
    drawings: ["Rzuty ogrzewania z podziałem na strefy", "Schemat kotłowni, źródła ciepła i rozdzielaczy"],
    measurements: ["Długości i średnice rur, pętle i rozstaw według projektu", "Liczba i parametry odbiorników oraz urządzeń", "Warstwy posadzek, izolacja i automatyka"],
  },
  ventilation: {
    label: "Wentylacja",
    drawings: ["Rzuty tras kanałów i punktów wentylacji", "Schemat urządzeń i przekroje przejść"],
    measurements: ["Długości, wymiary i materiał kanałów", "Kształtki, nawiewniki, wywiewniki i izolacja", "Wydatki i parametry urządzeń według projektu branżowego"],
  },
  chimney: {
    label: "Kominy",
    drawings: ["Lokalizacja i przekroje kominów", "Detale fundamentu, przejść, zakończenia i obróbek"],
    measurements: ["Wysokość, wymiary i liczba przewodów", "Typ systemu i lista elementów producenta", "Otwory, izolacja i obróbki według projektu"],
  },
  interior: {
    label: "Pomieszczenia i wykończenia",
    drawings: ["Zwymiarowane rzuty pomieszczeń", "Rozwinięcia ścian, sufitów i układ warstw podłogi"],
    measurements: ["Powierzchnie podłóg, ścian i sufitów według pomieszczeń", "Otwory i obszary wyłączone z robót", "Warstwy, grubości, materiały, wzory ułożenia i wyposażenie"],
  },
  fencing: {
    label: "Ogrodzenie",
    drawings: ["Plan przebiegu ogrodzenia, bram i furtek", "Przekroje fundamentów oraz detale przęseł"],
    measurements: ["Długości odcinków, wysokości i rozstaw słupków", "Liczba i wymiary przęseł, bram i furtek", "Wymiary podmurówki i fundamentów; zbrojenie według projektu"],
  },
  paving: {
    label: "Nawierzchnie",
    drawings: ["Plan nawierzchni i obrzeży", "Przekroje warstw oraz rzędne i spadki"],
    measurements: ["Powierzchnie i długości obrzeży", "Grubości warstw, materiał i zagęszczenie", "Spadki, odpływy i powierzchnie wymagające rozbiórki"],
  },
  terrace: {
    label: "Taras",
    drawings: ["Rzut tarasu z wymiarami", "Przekroje konstrukcji, warstw i połączenia z budynkiem"],
    measurements: ["Powierzchnia, obwód, wysokości i spadki", "Wymiary konstrukcji, podpór, legarów i warstw", "Odwodnienie, dylatacje i balustrady"],
  },
  drainage: {
    label: "Odwodnienie",
    drawings: ["Plan przebiegu odwodnienia i odbiornika", "Przekroje tras, studzienek i spadki"],
    measurements: ["Długości i średnice rur oraz koryt", "Liczba studzienek, wpustów i osadników", "Głębokości, obsypka, geowłóknina i parametry odbiornika"],
  },
  connections: {
    label: "Przyłącza zewnętrzne",
    drawings: ["Plan tras przyłączy według warunków operatorów", "Profile i detale skrzyżowań oraz połączeń"],
    measurements: ["Długości, średnice i materiały przewodów", "Wykopy, osłony, podsypki, studzienki i armatura", "Parametry i granice zakresu według projektów branżowych"],
  },
  retaining: {
    label: "Mur oporowy",
    drawings: ["Plan muru oporowego", "Przekroje i detale fundamentów, zbrojenia oraz drenażu"],
    measurements: ["Długości, wysokości i grubości muru", "Fundamenty, warstwy filtracyjne i drenaż", "Beton i zbrojenie wyłącznie z projektu konstrukcyjnego"],
  },
  garage: {
    label: "Garaż, wiata lub zadaszenie",
    drawings: ["Rzuty, elewacje i przekroje obiektu", "Rzuty fundamentów, konstrukcji i pokrycia"],
    measurements: ["Wymiary obiektu, słupów, belek i pokrycia", "Warstwy, otwory i stolarka", "Detale konstrukcyjne, łączniki i zbrojenie według projektu"],
  },
  sewage: {
    label: "Studnia i system ściekowy",
    drawings: ["Plan lokalizacji studni, zbiornika lub oczyszczalni", "Przekroje i profile przyłączeń"],
    measurements: ["Głębokość, pojemność i parametry urządzeń", "Długości i średnice przewodów", "Wykopy, podsypki, obsypki i warunki producenta"],
  },
  energy: {
    label: "Fotowoltaika i urządzenia energetyczne",
    drawings: ["Plan rozmieszczenia urządzeń i mocowań", "Schemat połączeń elektrycznych lub hydraulicznych"],
    measurements: ["Liczba, wymiary i parametry urządzeń", "Długości przewodów oraz elementy mocowania", "Obciążenia i konstrukcja nośna według projektu"],
  },
  landscaping: {
    label: "Zagospodarowanie terenu",
    drawings: ["Plan zagospodarowania z rzędnymi", "Przekroje warstw i plan nasadzeń"],
    measurements: ["Powierzchnie stref i objętości gruntu", "Grubości warstw, liczby i gatunki nasadzeń", "Trasy nawadniania i elementy wyposażenia"],
  },
  demolition: {
    label: "Rozbiórki",
    drawings: ["Inwentaryzacja elementów przeznaczonych do rozbiórki", "Plan zabezpieczenia i etapów rozbiórki"],
    measurements: ["Wymiary, materiały i ilości demontowanych elementów", "Zabezpieczenia, dostęp, segregacja i wywóz", "Ocena materiałów niebezpiecznych i wymaganych uzgodnień"],
  },
  specialist: {
    label: "Prace specjalistyczne",
    drawings: ["Zwymiarowany rysunek zakresu prac", "Detale i specyfikacja wykonania dla opisanego zakresu"],
    measurements: ["Indywidualne pozycje przedmiaru z jednostkami", "Wymiary, ilości, materiały i źródła parametrów", "Wyłączenia zakresu i wymagane uzgodnienia specjalisty"],
  },
  existing: {
    label: "Istniejący obiekt",
    drawings: ["Inwentaryzacja istniejącego obiektu i miejsca połączenia", "Projekt zmian, rozbiórek i zabezpieczeń"],
    measurements: ["Wymiary istniejących elementów", "Stan konstrukcji i instalacji", "Ekspertyzy i uzgodnienia wymagane dla zmian"],
  },
} as const;

export type ProjectDocumentationKind = keyof typeof projectDocumentationCatalog;
type OtherCategory = typeof constructionTechnologyCatalog.otherWorkTechnology.options[number]["value"];

export const otherWorkDocumentation = {
  "foundation-construction": ["foundation"],
  "reinforced-concrete-work": ["concrete"],
  "masonry-work": ["masonry"],
  "roof-structure": ["roof", "roofStructure"],
  "roof-covering": ["roof"],
  "facade-work": ["facade"],
  fencing: ["fencing"],
  "garage-carport": ["garage"],
  "driveway-paving": ["paving"],
  "terrace-construction": ["terrace"],
  "site-drainage": ["drainage"],
  "external-utility-connections": ["connections"],
  "retaining-wall": ["retaining"],
  "windows-doors": ["joinery"],
  "electrical-installation": ["electrical"],
  "water-sewer-installation": ["plumbing"],
  "heating-installation": ["heating"],
  "ventilation-installation": ["ventilation"],
  "chimney-work": ["chimney"],
  "interior-plaster": ["interior"],
  "drywall-ceilings": ["interior"],
  "floors-screeds": ["interior"],
  "interior-finishing": ["interior", "joinery"],
  "well-septic-system": ["sewage"],
  "photovoltaic-work": ["energy"],
  "garden-landscaping": ["landscaping"],
  "demolition-work": ["demolition"],
  "other-specialist-work": ["specialist"],
} as const satisfies Record<OtherCategory, readonly ProjectDocumentationKind[]>;

export const ProjectScopeSchema = z.object({
  workType: z.enum(["house", "extension", "renovation", "other"]),
  floors: z.number().int().min(1).max(100).nullable(),
  basement: z.boolean().nullable(),
  technology: ConstructionTechnologySchema,
}).strict().superRefine((input, ctx) => {
  const building = input.workType === "house" || input.workType === "extension";
  if (building ? input.floors === null || input.basement === null : input.floors !== null || input.basement !== null) {
    ctx.addIssue({ code: "custom", path: ["floors"], message: "Parametry kondygnacji nie pasują do rodzaju prac." });
  }
});
export type ProjectScope = z.infer<typeof ProjectScopeSchema>;
export type ProjectDocumentationRequirement = {
  id: string;
  kind: ProjectDocumentationKind;
  label: string;
  drawings: readonly string[];
  measurements: readonly string[];
};

const excludedInstallationValues = new Set([
  "no-water-sewer-work", "no-heating-work", "no-ventilation-work", "no-electrical-work",
]);

export function getProjectDocumentationRequirements(scope: ProjectScope): ProjectDocumentationRequirement[] {
  const input = ProjectScopeSchema.parse(scope);
  const requirements = new Map<string, ProjectDocumentationRequirement>();
  const add = (kind: ProjectDocumentationKind, id: string = kind, label?: string) => {
    const definition = projectDocumentationCatalog[kind];
    requirements.set(id, { ...definition, id, kind, label: label ?? definition.label });
  };
  if (input.workType === "other") {
    for (const category of input.technology.otherWorkTechnology) {
      const kinds = otherWorkDocumentation[category as OtherCategory];
      if (!kinds) throw new Error(`Brak reguł dokumentacji dla kategorii: ${category}.`);
      kinds.forEach((kind) => add(kind));
    }
    if (input.technology.otherWorkTechnology.includes("roof-structure")
      && input.technology.otherRoofStructure === "other-roof-reinforced-concrete") add("concrete");
    return [...requirements.values()];
  }
  if (input.workType === "extension") add("existing");
  if (input.workType === "house" || input.workType === "extension") {
    if (!input.technology.foundationType.includes("no-foundation")) add("foundation");
    if (input.basement) add("basement");
    const floors = input.floors;
    if (floors === null) throw new Error("Brak liczby kondygnacji.");
    for (let index = 0; index < floors; index += 1) {
      add("storey", `storey-${index}`, index === 0 ? "Parter" : `Piętro ${index}`);
    }
    if (input.technology.roofStructure !== "no-roof-work") {
      add("roof"); add("roofStructure");
    }
  } else {
    add("existing"); add("interior");
    if (["thermal-modernization", "other-renovation-scope"].includes(input.technology.renovationScope ?? "")) {
      if (input.technology.foundationWaterproofing !== "no-foundation-work") add("foundation");
      add("facade");
      if (input.technology.roofStructure && input.technology.roofStructure !== "no-roof-work") {
        add("roof"); add("roofStructure");
      }
    }
  }
  const stages = getConstructionTechnologyStages(input.workType, input.technology);
  const installations = [
    ["waterSewerInstallation", "plumbing"],
    ["heatingSystem", "heating"],
    ["ventilationSystem", "ventilation"],
    ["electricalInstallation", "electrical"],
  ] as const;
  for (const [key, kind] of installations) {
    if (stages.includes(key) && !excludedInstallationValues.has(input.technology[key] ?? "")) add(kind);
  }
  if (stages.includes("windowsSystem") && input.technology.windowsSystem !== "windows-not-included") add("joinery");
  if (stages.includes("exteriorDoor") && input.technology.exteriorDoor !== "exterior-door-not-included") add("joinery");
  if (stages.includes("renovationWindows") && input.technology.renovationWindows !== "windows-no-work") add("joinery");
  if (stages.includes("exteriorFacadeFinish")
    && !input.technology.exteriorFacadeFinish.includes("facade-finish-no-work")) add("facade");
  if (stages.includes("interiorFloorFinish")) add("interior");
  return [...requirements.values()];
}

export function projectScopeFromConstruction(input: {
  building_type: ProjectScope["workType"];
  floors: number | null;
  basement: boolean | null;
  technology_selections: ConstructionTechnologySelections;
}): ProjectScope {
  return ProjectScopeSchema.parse({
    workType: input.building_type,
    floors: input.floors,
    basement: input.basement,
    technology: input.technology_selections,
  });
}
