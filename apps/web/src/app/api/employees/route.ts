import { randomBytes } from "node:crypto";
import { EmployeeInputSchema } from "@asystent/schemas";
import { apiError, authenticateRequest, createAdminClient } from "@/lib/server-supabase";

export async function POST(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    if (!caller) return apiError("Zaloguj się, aby dodać pracownika.", 401);
    const input = EmployeeInputSchema.safeParse(await request.json());
    if (!input.success) return apiError("Podaj prawidłowy e-mail, nazwę pracownika i profil działalności.", 400);
    const { data: membership, error: membershipError } = await caller.client.from("memberships")
      .select("role").eq("user_id", caller.user.id).eq("organization_id", input.data.business_id).maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "owner") return apiError("Tylko właściciel może tworzyć konta pracowników.", 403);
    const { data: profile, error: profileError } = await caller.client.from("business_profiles")
      .select("organization_id").eq("organization_id", input.data.business_id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return apiError("Najpierw uzupełnij dane firmy lub sklepu.", 409);

    const admin = createAdminClient();
    const password = randomBytes(24).toString("base64url");
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.data.email, password, email_confirm: true,
      user_metadata: { display_name: input.data.display_name },
    });
    if (createError) {
      if (createError.code === "email_exists" || createError.code === "email_conflict") {
        return apiError("Ten adres ma już konto. Nie zmieniono jego hasła ani uprawnień.", 409);
      }
      throw createError;
    }
    const { error: attachError } = await admin.rpc("attach_employee_account", {
      owner_id: caller.user.id, target_business_id: input.data.business_id, employee_id: created.user.id,
      employee_email: input.data.email, employee_name: input.data.display_name,
    });
    if (attachError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
      if (cleanupError) {
        console.error("Employee provisioning cleanup failed", { userId: created.user.id, code: cleanupError.code });
        return apiError("Nie udało się dokończyć tworzenia konta ani wycofać operacji. Skontaktuj się z administratorem.", 500);
      }
      throw attachError;
    }
    return Response.json({ email: input.data.email, password }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("Nieprawidłowe dane żądania.", 400);
    console.error("Employee provisioning failed", error instanceof Error ? error.message : "Unknown server error");
    return apiError("Nie udało się utworzyć konta pracownika. Sprawdź lokalną konfigurację serwera.", 500);
  }
}
