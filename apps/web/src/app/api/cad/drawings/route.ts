import { CadDocumentSchema, ConstructionTechnologySchema, cadEntityTool, getCadDrawingTools, getFoundationSupportOptions } from "@asystent/schemas";
import { CadPlanError, FoundationAssemblyError, synchronizeCadAttachments, synchronizeCadInfill, synchronizeFoundationSupports } from "@asystent/domain";
import { OutlineGeometryError } from "@asystent/geometry";
import { apiError, createAdminClient } from "@/lib/server-supabase";
import { findDrawingRequirement, requireCadOwner } from "@/lib/cad-api";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 2000000) return apiError("Rysunek przekracza limit rozmiaru.", 413);
    const input = CadDocumentSchema.safeParse(await request.json());
    if (!input.success || input.data.status !== "draft") return apiError("Nieprawidłowy szkic CAD. Zatwierdzanie nie jest dostępne w tym edytorze.", 400);
    const document = input.data;
    if (JSON.stringify(document).length > 2000000) return apiError("Rysunek przekracza limit rozmiaru.", 413);
    if (document.entities.some((entity) => entity.reviewStatus !== "draft"
      || (entity.kind === "rebar-line" || entity.kind === "rebar-annotation") && entity.attributes.specialistVerified)) {
      return apiError("Ten edytor zapisuje wyłącznie niezatwierdzone obiekty robocze.", 400);
    }
    const access = await requireCadOwner(request, document.projectId);
    if (access.response) return access.response;
    const drawingRequirement = findDrawingRequirement(access.job, document.requirementId);
    if (!drawingRequirement) return apiError("Etap nie należy do zakresu budowy.", 400);
    const technology = ConstructionTechnologySchema.parse(JSON.parse(access.job.materials));
    const allowed = getCadDrawingTools(drawingRequirement.requirement.kind, drawingRequirement.requirement.drawings[drawingRequirement.index], technology);
    const supportOptions = getFoundationSupportOptions(technology);
    if (document.entities.some((e) => e.infillFor && !e.derivedFrom) && technology.foundationBottomSlab !== "bottom-slab-yes") {
      return apiError("Płyta denna między ławami wymaga wyboru w danych budowy.", 400);
    }
    const synchronized = synchronizeCadInfill(synchronizeCadAttachments(document));
    if (synchronized.entities.some((e, i) => JSON.stringify(e.geometry) !== JSON.stringify(document.entities[i]?.geometry))) {
      return apiError("Przyczepione elementy i płyta denna muszą odpowiadać geometrii podparcia.", 400);
    }
    if (document.entities.some((e) => e.foundationBase && !e.derivedFrom && !supportOptions.some((option) => option.value === e.foundationBase?.type))) {
      return apiError("Podparcie ściany nie odpowiada sposobowi posadowienia w danych budowy.", 400);
    }
    const expectedSupports = synchronizeFoundationSupports(document, () => crypto.randomUUID()).entities.filter((e) => e.supportFor && !e.derivedFrom);
    const actualSupports = document.entities.filter((e) => e.supportFor && !e.derivedFrom);
    if (expectedSupports.length !== actualSupports.length || expectedSupports.some((expected) =>
      !actualSupports.some((actual) => actual.id === expected.id && JSON.stringify(actual.geometry) === JSON.stringify(expected.geometry)
        && JSON.stringify(actual.attributes) === JSON.stringify(expected.attributes)))) return apiError("Podparcia muszą odpowiadać geometrii i parametrom ścian.", 400);
    if (document.entities.some((entity) => {
      const tool = cadEntityTool(entity);
      return tool && !entity.derivedFrom && !allowed.includes(tool);
    })) return apiError("Rysunek zawiera element niepasujący do tego etapu. Przenieś go do właściwego rysunku.", 400);
    const references = document.entities.flatMap((entity) => entity.derivedFrom ? [entity.derivedFrom] : []);
    if (references.length) {
      const { data: sources, error: sourceError } = await access.caller.client.from("cad_drawings").select("payload,revision")
        .eq("job_id", document.projectId).in("payload->>id", [...new Set(references.map((reference) => reference.documentId))]);
      if (sourceError) throw sourceError;
      const revisions = new Map(sources.map((source) => [CadDocumentSchema.parse(source.payload).id, source.revision]));
      if (references.some((reference) => {
        const sourceRevision = revisions.get(reference.documentId);
        return reference.documentId === document.id || sourceRevision === undefined || reference.revision > sourceRevision;
      })) {
        return apiError("Podkład musi pochodzić z zapisanej wersji innego rysunku tego projektu.", 400);
      }
    }
    if (document.sourceImage && !document.sourceImage.storagePath.startsWith(`${access.caller.user.id}/${document.projectId}/${document.sourceImage.id}.`)) {
      return apiError("Skan nie należy do tego projektu.", 400);
    }
    if (document.sourceImage?.originalPath && !document.sourceImage.originalPath.startsWith(`${access.caller.user.id}/${document.projectId}/${document.sourceImage.id}-original.`)) {
      return apiError("Plik źródłowy nie należy do tego projektu.", 400);
    }
    const { data, error } = await createAdminClient().rpc("save_cad_drawing", {
      owner_id: access.caller.user.id, target_job_id: document.projectId, stage_id: document.requirementId,
      expected_revision: document.revision, document_payload: document,
    });
    if (error) {
      if (error.code === "40001") return apiError("Rysunek zmieniono w innej karcie. Wczytaj aktualną wersję przed zapisem.", 409);
      throw error;
    }
    return Response.json({ revision: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FoundationAssemblyError || error instanceof OutlineGeometryError || error instanceof CadPlanError) return apiError(error.message, 400);
    if (error instanceof SyntaxError) return apiError("Nieprawidłowe dane rysunku.", 400);
    console.error("CAD save failed", { type: error instanceof Error ? error.name : "DatabaseError" });
    return apiError("Nie udało się zapisać rysunku. Ponów zapis.", 500);
  }
}
