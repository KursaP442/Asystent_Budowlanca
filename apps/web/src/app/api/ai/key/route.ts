import { apiError, authenticateRequest, createAdminClient } from "@/lib/server-supabase";
import { encryptUserKey } from "@/lib/ai-key-vault";

export async function PUT(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    if (!caller) return apiError("Zaloguj się, aby zapisać klucz AI.", 401);
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || !("key" in input) || typeof input.key !== "string"
      || !/^sk-[A-Za-z0-9_-]{20,300}$/.test(input.key)) return apiError("Podaj prawidłowy klucz OpenAI API.", 400);
    if (!process.env.AI_KEY_ENCRYPTION_KEY) return apiError("Administrator musi skonfigurować szyfrowanie kluczy AI na serwerze (AI_KEY_ENCRYPTION_KEY).", 503);
    const encrypted_key = encryptUserKey(input.key, caller.user.id);
    const { error } = await createAdminClient().from("ai_user_credentials").upsert({ user_id: caller.user.id, encrypted_key });
    if (error) throw error;
    return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("Nieprawidłowe dane klucza.", 400);
    console.error("AI key storage failed", { type: error instanceof Error ? error.name : "DatabaseError" });
    return apiError("Nie udało się zapisać klucza. Sprawdź konfigurację szyfrowania serwera.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    if (!caller) return apiError("Zaloguj się, aby usunąć klucz.", 401);
    const { error } = await createAdminClient().from("ai_user_credentials").delete().eq("user_id", caller.user.id);
    if (error) throw error;
    return Response.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("AI key removal failed");
    return apiError("Nie udało się usunąć klucza.", 500);
  }
}
