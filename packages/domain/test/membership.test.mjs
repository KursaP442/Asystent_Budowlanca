import assert from "node:assert/strict";
import test from "node:test";
import {
  listMembershipsForUser,
  MembershipAccessError,
  resolveActiveMembership,
} from "../dist/index.js";

const userId = "6e83c190-b7b7-4ccb-8f2c-22c6d7459f59";
const otherUserId = "cb21f323-5789-4c1d-a061-67be0246bd74";
const clientOrgId = "c7910357-dd23-4021-a3da-a598e873db15";
const contractorOrgId = "eed1e09c-bf96-4ec5-9759-c1f1ae4111b9";

const memberships = [
  { userId, organizationId: clientOrgId, role: "owner" },
  { userId, organizationId: contractorOrgId, role: "member" },
  { userId: otherUserId, organizationId: clientOrgId, role: "admin" },
];

test("user can select the membership and role for one of multiple organizations", () => {
  assert.deepEqual(resolveActiveMembership(memberships, userId, contractorOrgId), {
    userId,
    organizationId: contractorOrgId,
    role: "member",
  });
});

test("membership listing is scoped to the requested user", () => {
  assert.deepEqual(listMembershipsForUser(memberships, userId), memberships.slice(0, 2));
});

test("active membership selection rejects missing or duplicate membership instead of falling back", () => {
  assert.throws(
    () => resolveActiveMembership(memberships, otherUserId, contractorOrgId),
    MembershipAccessError,
  );
  assert.throws(
    () =>
      resolveActiveMembership(
        [...memberships, memberships[0]],
        userId,
        clientOrgId,
      ),
    MembershipAccessError,
  );
});
