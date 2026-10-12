import { z } from "zod";

const moduleId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/);
export const DocumentationDraftSchema = z.object({
  version: z.literal(1),
  step: moduleId,
  modules: z.record(moduleId, z.object({
    measurements: z.array(z.string().max(4000)).max(20),
    notes: z.string().max(4000),
  }).strict()),
}).strict().superRefine((draft, ctx) => {
  if (!Object.hasOwn(draft.modules, draft.step)) {
    ctx.addIssue({ code: "custom", path: ["step"], message: "Bieżący etap nie występuje w dokumentacji." });
  }
  if (Object.keys(draft.modules).length > 150) {
    ctx.addIssue({ code: "custom", path: ["modules"], message: "Dokumentacja zawiera zbyt wiele zakresów." });
  }
  if (JSON.stringify(draft).length > 500000) {
    ctx.addIssue({ code: "custom", message: "Dokumentacja robocza przekracza limit 500 000 znaków." });
  }
});

export type DocumentationDraft = z.infer<typeof DocumentationDraftSchema>;
