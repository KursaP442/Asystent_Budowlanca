import { EmployeePasswordSchema } from "@asystent/schemas";
import { apiError, authenticateRequest, createAdminClient, createUserClient } from "@/lib/server-supabase";

export async function POST(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    if (!caller) return apiError("Zaloguj się ponownie.", 401);
    const input = EmployeePasswordSchema.safeParse(await request.json());
    if (!input.success) return apiError("Podaj dotychczasowe hasło oraz inne nowe hasło o długości co najmniej 12 znaków.", 400);
    const { data: employee, error: employeeError } = await caller.client.from("employee_accounts")
      .select("user_id,password_change_required").eq("user_id", caller.user.id).maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee?.password_change_required || !caller.user.email) return apiError("To konto nie wymaga zmiany hasła tymczasowego.", 403);
    const verification = createUserClient();
    const { data: verified, error: verifyError } = await verification.auth.signInWithPassword({
      email: caller.user.email, password: input.data.current_password,
    });
    if (verifyError || verified.user?.id !== caller.user.id) return apiError("Dotychczasowe hasło jest nieprawidłowe.", 403);
    const admin = createAdminClient();
    const { error: passwordError } = await admin.auth.admin.updateUserById(caller.user.id, { password: input.data.password });
    if (passwordError) throw passwordError;
    const { error: flagError } = await admin.from("employee_accounts")
      .update({ password_change_required: false }).eq("user_id", caller.user.id).select("user_id").single();
    if (flagError) {
      console.error("Employee password flag update failed", { userId: caller.user.id, code: flagError.code });
      return apiError("Hasło zmieniono, ale panel pozostaje zablokowany. Spróbuj ponownie, używając nowego hasła jako dotychczasowego.", 500);
    }
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("Nieprawidłowe dane żądania.", 400);
    console.error("Employee password change failed", error instanceof Error ? error.message : "Unknown server error");
    return apiError("Nie udało się zmienić hasła. Spróbuj ponownie.", 500);
  }
}
