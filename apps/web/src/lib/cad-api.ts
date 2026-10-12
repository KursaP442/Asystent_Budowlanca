import "server-only";
import { authenticateRequest, apiError } from "./server-supabase";
import { ConstructionTechnologySchema, getProjectDocumentationRequirements, projectScopeFromConstruction, type ProjectDocumentationRequirement } from "@asystent/schemas";
import type { ConstructionJob } from "@asystent/api-client";

export function findDrawingRequirement(job: ConstructionJob, drawingId: string): { requirement: ProjectDocumentationRequirement; index: number } | null {
  const technology = ConstructionTechnologySchema.parse(JSON.parse(job.materials));
  const requirements = getProjectDocumentationRequirements(projectScopeFromConstruction({ ...job, technology_selections: technology }));
  for (const requirement of requirements) {
    const index = requirement.drawings.findIndex((_, i) => `${requirement.id}-drawing-${i}` === drawingId);
    if (index >= 0) return { requirement, index };
  }
  return null;
}

export async function requireCadOwner(request: Request, jobId: string) {
  const caller = await authenticateRequest(request);
  if (!caller) return { response: apiError("Zaloguj się, aby edytować projekt.", 401) };
  const { data, error } = await caller.client.from("construction_jobs").select("*")
    .eq("id", jobId).eq("client_id", caller.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return { response: apiError("Brak dostępu do projektu.", 403) };
  return { caller, job: data };
}
