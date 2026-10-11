import { z } from "zod";

export const OrganizationKindSchema = z.enum(["client", "contractor", "store"]);
export type OrganizationKind = z.infer<typeof OrganizationKindSchema>;

export const MembershipRoleSchema = z.enum(["owner", "admin", "member"]);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

const nipSchema = z
  .string()
  .transform((nip) => nip.replace(/[\s-]/g, ""))
  .refine((nip) => /^\d{10}$/.test(nip), "NIP must contain 10 digits.")
  .refine(isValidPolishNip, "NIP checksum is invalid.");

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
