import { getSupabaseClient } from "./supabase";

export async function cadRequest(path: string, body: unknown, method = "POST"): Promise<unknown> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  const response = await fetch(path, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: method === "DELETE" || method === "GET" ? undefined : JSON.stringify(body), cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string"
      ? result.error : `Operacja nie powiodła się (HTTP ${response.status}).`);
  }
  return result;
}

export function cadError(error: unknown) {
  return error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : "Nie udało się wykonać operacji CAD.";
}
