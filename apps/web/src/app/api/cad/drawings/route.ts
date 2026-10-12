import { CadDocumentSchema } from "@asystent/schemas";
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
    if (!findDrawingRequirement(access.job, document.requirementId)) return apiError("Etap nie należy do zakresu budowy.", 400);
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
    if (error instanceof SyntaxError) return apiError("Nieprawidłowe dane rysunku.", 400);
    console.error("CAD save failed", { type: error instanceof Error ? error.name : "DatabaseError" });
    return apiError("Nie udało się zapisać rysunku. Ponów zapis.", 500);
  }
}
