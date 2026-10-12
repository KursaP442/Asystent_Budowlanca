import { randomUUID } from "node:crypto";
import { PlanScanRequestSchema } from "@asystent/schemas";
import { assembleRecognizedPlan } from "@asystent/domain";
import { apiError, createAdminClient } from "@/lib/server-supabase";
import { findDrawingRequirement, requireCadOwner } from "@/lib/cad-api";
import { decryptUserKey } from "@/lib/ai-key-vault";
import { recognizePlan } from "@/lib/openai-plan";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const input = PlanScanRequestSchema.safeParse(await request.json());
    if (!input.success) return apiError("Wybierz skan i potwierdź zgodę na płatną analizę OpenAI.", 400);
    const { projectId, requirementId, sourceId, page, originalExtension } = input.data;
    const access = await requireCadOwner(request, projectId);
    if (access.response) return access.response;
    const { user, client } = access.caller;
    const found = findDrawingRequirement(access.job, requirementId);
    if (!found) return apiError("Etap rysunku nie należy do wybranego zakresu budowy.", 400);
    const storagePath = `${user.id}/${projectId}/${sourceId}.png`;
    const { data: file, error: downloadError } = await client.storage.from("project-scans").download(storagePath);
    if (downloadError) return apiError("Nie można odczytać prywatnego skanu. Prześlij go ponownie.", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length < 24 || bytes.length > 10485760 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      return apiError("Wymagany jest poprawny obraz PNG do 10 MB.", 400);
    }
    const widthPx = bytes.readUInt32BE(16), heightPx = bytes.readUInt32BE(20);
    if (!widthPx || !heightPx || widthPx > 10000 || heightPx > 10000 || widthPx * heightPx > 25000000) return apiError("Skan ma zbyt duże wymiary.", 400);
    const admin = createAdminClient();
    const { data: credential, error: keyError } = await admin.from("ai_user_credentials").select("encrypted_key").eq("user_id", user.id).maybeSingle();
    if (keyError) throw keyError;
    if (!credential) return apiError("Dodaj swój klucz OpenAI API w oknie skanowania.", 409);
    if (!process.env.AI_KEY_ENCRYPTION_KEY) return apiError("Serwer nie ma skonfigurowanego szyfrowania kluczy AI.", 503);
    const { error: limitError } = await admin.rpc("claim_plan_scan", { target_user_id: user.id });
    if (limitError) {
      if (limitError.code === "P0001") return apiError("Limit aplikacji: maksymalnie 10 prób analizy na godzinę.", 429);
      throw limitError;
    }
    const result = await recognizePlan(decryptUserKey(credential.encrypted_key, user.id), bytes, widthPx, heightPx, found.requirement.drawings[found.index]);
    const entities = assembleRecognizedPlan(result, { documentId: sourceId, widthPx, heightPx, layerId: requirementId }, randomUUID)
      .map((entity) => ({ ...entity, source: { ...entity.source, page } }));
    return Response.json({
      sourceImage: { id: sourceId, storagePath, widthPx, heightPx, mmPerPixel: 1, page,
        ...(originalExtension ? { originalPath: `${user.id}/${projectId}/${sourceId}-original.${originalExtension}` } : {}) }, entities,
      warnings: [...result.warnings, "To odwzorowanie robocze, nie projekt konstrukcyjny. Ustaw skalę dwoma punktami i sprawdź wszystkie elementy."],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("Nieprawidłowy format danych lub odpowiedzi AI.", 400);
    console.error("Plan recognition failed", { type: error instanceof Error ? error.name : "DatabaseError" });
    return apiError(error instanceof Error ? error.message : "Nie udało się przeanalizować skanu.", 502);
  }
}
