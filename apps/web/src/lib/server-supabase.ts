import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@asystent/api-client";

export function createUserClient(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Brakuje konfiguracji serwera Supabase.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Tworzenie kont pracowników wymaga lokalnej konfiguracji serwera.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticateRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error) {
    if (!error.status || error.status >= 500) throw error;
    return null;
  }
  if (!data.user) return null;
  return { user: data.user, client };
}

export function apiError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
