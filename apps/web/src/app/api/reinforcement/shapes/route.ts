import { ReinforcementShapeLibraryItemSchema } from "@asystent/schemas";
import { apiError, authenticateRequest } from "@/lib/server-supabase";

export async function GET(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    if (!caller) return apiError("Sesja wygasła. Zaloguj się ponownie.", 401);
    const { data, error } = await caller.client.from("reinforcement_shape_templates")
      .select("id,name,category,shape,created_at").eq("user_id", caller.user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const items = data.map((row) => ReinforcementShapeLibraryItemSchema.parse({
      id: row.id, name: row.name, category: row.category, shape: row.shape, createdAt: row.created_at,
    }));
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Reinforcement shape library read failed", { type: error instanceof Error ? error.name : "DatabaseError" });
    return apiError("Nie udało się wczytać biblioteki podgięć i strzemion.", 500);
  }
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 100000) return apiError("Kształt przekracza limit rozmiaru.", 413);
    const caller = await authenticateRequest(request);
    if (!caller) return apiError("Sesja wygasła. Zaloguj się ponownie.", 401);
    const input = ReinforcementShapeLibraryItemSchema.safeParse(await request.json());
    if (!input.success) return apiError(input.error.issues[0]?.message ?? "Nieprawidłowy kształt pręta.", 400);
    const item = { ...input.data, createdAt: new Date().toISOString() };
    const { error } = await caller.client.from("reinforcement_shape_templates").insert({
      user_id: caller.user.id,
      id: item.id,
      name: item.name,
      category: item.category,
      shape: item.shape,
      created_at: item.createdAt,
    });
    if (error?.code === "23505") return apiError("Masz już kształt o tej nazwie.", 409);
    if (error) throw error;
    return Response.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError("Nieprawidłowe dane kształtu.", 400);
    console.error("Reinforcement shape library save failed", { type: error instanceof Error ? error.name : "DatabaseError" });
    return apiError("Nie udało się zapisać kształtu w bibliotece użytkownika.", 500);
  }
}
