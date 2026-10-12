import { z } from "zod";
import {
  ConstructionTechnologySchema,
  constructionTechnologyCatalog,
  getConstructionTechnologyStages,
  requiresTechnologyOptionDescription,
} from "./construction-technology.js";
import type { ConstructionTechnologyKey } from "./construction-technology.js";

export * from "./construction-technology.js";
export * from "./construction-documentation.js";
export * from "./cad-import.js";
export * from "./documentation-draft.js";

export const OrganizationKindSchema = z.enum(["client", "contractor", "store"]);
export type OrganizationKind = z.infer<typeof OrganizationKindSchema>;

export const MembershipRoleSchema = z.enum(["owner", "admin", "member"]);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

const nipSchema = z
  .string()
  .transform((nip) => nip.replace(/[\s-]/g, ""))
  .refine((nip) => /^\d{10}$/.test(nip), "NIP musi zawierać 10 cyfr.")
  .refine(isValidPolishNip, "Nieprawidłowa suma kontrolna NIP.");

export const OrganizationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: OrganizationKindSchema,
    nip: nipSchema.optional(),
  })
  .superRefine((organization, context) => {
    if (organization.kind !== "client" && !organization.nip) {
      context.addIssue({
        code: "custom",
        path: ["nip"],
        message: "NIP is required for contractor and store organizations.",
      });
    }
  });

export type OrganizationInput = z.infer<typeof OrganizationInputSchema>;

export const OrganizationSchema = OrganizationInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const MembershipSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: MembershipRoleSchema,
});

export type Membership = z.infer<typeof MembershipSchema>;

const requiredText = (max: number) => z.string().trim().min(1, "To pole jest wymagane.").max(max);
const authEmail = z.string().trim().toLowerCase().max(254).pipe(z.email("Podaj poprawny adres e-mail."));

export const SignInInputSchema = z.object({
  email: authEmail,
  password: z.string().min(1, "Podaj hasło.").max(128, "Hasło może mieć maksymalnie 128 znaków."),
});
export type SignInInput = z.infer<typeof SignInInputSchema>;

export const SignUpInputSchema = z.object({
  display_name: requiredText(120),
  email: authEmail,
  password: z.string()
    .min(8, "Hasło musi mieć co najmniej 8 znaków.")
    .max(128, "Hasło może mieć maksymalnie 128 znaków."),
});
export type SignUpInput = z.infer<typeof SignUpInputSchema>;

const constructionDetailsFields = z.object({
  title: requiredText(120),
  city: requiredText(120),
  address: requiredText(240),
  description: requiredText(4000),
  building_type: z.enum(["house", "extension", "renovation", "other"]),
  area_m2: z.number().positive().max(100000),
  floors: z.number().int().min(1).max(100).nullable(),
  basement: z.boolean().nullable(),
  postal_code: z.string().trim().regex(/^\d{2}-\d{3}$/, "Podaj kod pocztowy w formacie 00-000."),
  plot_area_m2: z.number().positive().max(10000000).nullable().default(null),
  rooms: z.string().trim().max(500).default(""),
  existing_condition: z.string().trim().max(2000).default(""),
  work_category: z.string().trim().max(120).default(""),
  site_access: z.string().trim().max(1000).default(""),
  utilities: z.string().trim().max(1000).default(""),
  start_date: z.iso.date(),
  budget_pln: z.number().positive().max(1000000000).nullable(),
});

function validateConstructionDetails(
  input: z.infer<typeof constructionDetailsFields>,
  ctx: z.RefinementCtx,
) {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (input.building_type === "house" || input.building_type === "extension") {
    if (input.floors === null || input.basement === null) issue("floors", "Uzupełnij parametry budynku.");
    if (input.rooms || input.work_category) issue("rooms", "Dane nie pasują do rodzaju prac.");
  } else {
    if (input.floors !== null || input.basement !== null || input.plot_area_m2 !== null) issue("floors", "Te parametry nie dotyczą wybranego rodzaju prac.");
    if (input.building_type === "renovation" && (!input.rooms || !input.existing_condition)) issue("rooms", "Opisz pomieszczenia i ich obecny stan.");
    if (input.building_type === "other" && !input.work_category) issue("work_category", "Podaj kategorię prac.");
  }
}

export const ConstructionDetailsInputSchema = constructionDetailsFields.superRefine(validateConstructionDetails);
export type ConstructionDetailsInput = z.infer<typeof ConstructionDetailsInputSchema>;

export const ConstructionInputSchema = constructionDetailsFields.extend({
  technology_selections: ConstructionTechnologySchema,
}).superRefine((input, ctx) => {
  validateConstructionDetails(input, ctx);
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  const requiredStages: readonly ConstructionTechnologyKey[] = getConstructionTechnologyStages(input.building_type, input.technology_selections);
  for (const key of requiredStages) {
    const selected = input.technology_selections[key];
    const values = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (values.length === 0 && key !== "foundationBottomSlab") {
      issue("technology_selections", `Wybierz technologię: ${constructionTechnologyCatalog[key].label}.`);
    }
    if (values.some((value) => requiresTechnologyOptionDescription(key, value)) && !input.technology_selections.otherDescriptions[key]?.trim()) {
      issue("technology_selections", `Opisz wybraną opcję „Inne”: ${constructionTechnologyCatalog[key].label}.`);
    }
  }
});
export type ConstructionInput = z.infer<typeof ConstructionInputSchema>;

export const BusinessInputSchema = z.object({
  name: requiredText(120),
  nip: nipSchema,
  city: requiredText(120),
  address: requiredText(240),
  postal_code: z.string().trim().regex(/^\d{2}-\d{3}$/, "Podaj kod pocztowy w formacie 00-000."),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Podaj poprawny numer telefonu."),
  industry: requiredText(120),
  service_area: requiredText(500),
  radius_km: z.number().int().min(0).max(1000),
  description: requiredText(4000),
});
export type BusinessInput = z.infer<typeof BusinessInputSchema>;

export const EmployeeInputSchema = z.object({
  business_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  display_name: requiredText(120),
});
export const EmployeePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  password: z.string().min(12, "Hasło musi mieć co najmniej 12 znaków.").max(128),
}).refine((input) => input.current_password !== input.password, "Nowe hasło musi różnić się od tymczasowego.");

function isValidPolishNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) {
    return false;
  }

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce(
    (sum, weight, index) => sum + weight * Number(nip[index]),
    0,
  );

  return checksum % 11 === Number(nip[9]);
}
export * from "./cad-tools.js";
export * from "./cad-reinforcement.js";
