import { CadEntitySchema, PlanRecognitionSchema, type CadEntity, type PlanRecognition } from "@asystent/schemas";
import { isSimplePolygon } from "@asystent/geometry";

export function assembleRecognizedPlan(value: PlanRecognition, source: {
  documentId: string; widthPx: number; heightPx: number; layerId: string;
}, newId: () => string): CadEntity[] {
  const recognition = PlanRecognitionSchema.parse(value);
  if (!recognition.elements.length) throw new Error("AI nie rozpoznało elementów. Wybierz czytelniejszy rysunek lub narysuj go ręcznie.");
  return recognition.elements.map((element) => {
    if (element.points.some(({ x, y }) => x > source.widthPx || y > source.heightPx)) {
      throw new Error("AI zwróciło obiekty poza granicami skanu.");
    }
    const common = {
      id: newId(), units: "mm", reviewStatus: "draft", layerId: source.layerId,
      source: { documentId: source.documentId, page: 1, origin: "openai", confidence: element.confidence },
    };
    if (element.type === "line") {
      if (element.points.length !== 2) throw new Error("Rozpoznany odcinek musi mieć dwa punkty.");
      return CadEntitySchema.parse({
        ...common, kind: "trace-line",
        geometry: { start: element.points[0], end: element.points[1] }, attributes: { label: element.label },
      });
    }
    if (element.type === "area") {
      if (!isSimplePolygon(element.points)) throw new Error("AI zwróciło przecinający się lub zdegenerowany obrys.");
      return CadEntitySchema.parse({ ...common, kind: "trace-area", geometry: { vertices: element.points }, attributes: { label: element.label } });
    }
    if (element.points.length !== 1) throw new Error("Rozpoznany opis musi mieć jeden punkt.");
    return CadEntitySchema.parse({ ...common, kind: "annotation", geometry: { point: element.points[0] }, attributes: { text: element.label } });
  });
}
