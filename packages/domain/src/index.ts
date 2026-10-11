import type { Membership } from "@asystent/schemas";

export class MembershipAccessError extends Error {
  constructor(userId: string, organizationId: string) {
    super(`User ${userId} has no membership in organization ${organizationId}.`);
    this.name = "MembershipAccessError";
  }
}

export function listMembershipsForUser(
  memberships: readonly Membership[],
  userId: string,
): Membership[] {
  return memberships.filter((membership) => membership.userId === userId);
}

export function resolveActiveMembership(
  memberships: readonly Membership[],
  userId: string,
  organizationId: string,
): Membership {
  const matches = memberships.filter(
    (membership) =>
      membership.userId === userId &&
      membership.organizationId === organizationId,
  );

  if (matches.length !== 1) {
    throw new MembershipAccessError(userId, organizationId);
  }

  return matches[0]!;
}
