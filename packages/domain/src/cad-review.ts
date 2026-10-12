import {
  CadDocumentSchema,
  CadProposalSchema,
  type CadDocument,
  type CadProposal,
} from "@asystent/schemas";
import { calibrateDrawing, isSimplePolygon } from "@asystent/geometry";

export type CadReviewIssue = {
  code: "polygon" | "calibration" | "review" | "structural-review" | "empty";
  entityId?: string;
  message: string;
};

export function getCadApprovalIssues(value: CadDocument): CadReviewIssue[] {
  const document = CadDocumentSchema.parse(value);
  const issues: CadReviewIssue[] = [];
  if (!document.entities.length) issues.push({ code: "empty", message: "Dokument nie ma obiektów do zatwierdzenia." });
  for (const entity of document.entities) {
    if ("vertices" in entity.geometry && !isSimplePolygon(entity.geometry.vertices)) {
      issues.push({ code: "polygon", entityId: entity.id, message: "Obrys jest zdegenerowany lub przecina sam siebie." });
    }
    if (entity.reviewStatus !== "verified") issues.push({ code: "review", entityId: entity.id, message: "Obiekt wymaga zatwierdzenia przez użytkownika." });
    if (entity.kind === "trace-line" || entity.kind === "trace-area") {
      issues.push({ code: "review", entityId: entity.id, message: "Rozpoznany obrys wymaga klasyfikacji i parametrów elementu przed przedmiarem." });
    }
    if ((entity.kind === "rebar-annotation" || entity.kind === "rebar-line") && !entity.attributes.specialistVerified) {
      issues.push({ code: "structural-review", entityId: entity.id, message: "Zbrojenie wymaga kontroli uprawnionego specjalisty." });
    }
  }
  const imported = document.entities.some(({ source }) => source.documentId !== null || source.origin !== "manual");
  if (imported && !document.calibration) {
    issues.push({ code: "calibration", message: "Brak kalibracji importowanego projektu." });
  }
  if (document.calibration) {
    if (document.calibration.references.some(({ confirmedByUser }) => !confirmedByUser)) {
      issues.push({ code: "calibration", message: "Potwierdź długości referencyjne." });
    }
    const transform = calibrateDrawing(document.calibration.references, document.calibration.originPx, document.calibration.rotationDegrees);
    if (transform.relativeError > 0.01) {
      issues.push({ code: "calibration", message: "Rozbieżność skali przekracza 1%. Popraw podkład lub pomiary; nie licz dokładnego przedmiaru." });
    }
  }
  return issues;
}

export function approveCadDocument(value: CadDocument): CadDocument {
  const issues = getCadApprovalIssues(value);
  if (issues.length) throw new Error(issues.map(({ message }) => message).join(" "));
  return CadDocumentSchema.parse({ ...value, status: "approved" });
}

export function previewCadProposal(value: CadDocument, proposalValue: CadProposal): CadDocument {
  const document = CadDocumentSchema.parse(value);
  const proposal = CadProposalSchema.parse(proposalValue);
  if (document.projectId !== proposal.projectId || document.id !== proposal.documentId) {
    throw new Error("Propozycja nie dotyczy tego projektu i dokumentu.");
  }
  if (document.revision !== proposal.baseRevision) throw new Error("Projekt zmienił się od czasu analizy. Odrzucono nieaktualną propozycję.");
  if (proposal.entities.some(({ id }) => document.entities.some((entity) => entity.id === id))) {
    throw new Error("Propozycja zawiera obiekt już obecny w dokumencie.");
  }
  return CadDocumentSchema.parse({
    ...document, status: "draft",
    entities: [...document.entities, ...proposal.entities],
  });
}
