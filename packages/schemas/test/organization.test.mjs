import assert from "node:assert/strict";
import test from "node:test";
import {
  MembershipSchema,
  OrganizationInputSchema,
  OrganizationSchema,
} from "../dist/index.js";

test("client organization accepts a name and trims surrounding whitespace", () => {
  const result = OrganizationInputSchema.parse({
    name: "  Moja budowa  ",
    kind: "client",
  });

  assert.equal(result.name, "Moja budowa");
  assert.equal(result.kind, "client");
});

test("contractor organization requires a valid Polish NIP and normalizes separators", () => {
  const result = OrganizationInputSchema.parse({
    name: "Firma budowlana",
    kind: "contractor",
    nip: "526-025-02-74",
  });

  assert.equal(result.nip, "5260250274");
  assert.equal(
    OrganizationInputSchema.safeParse({ name: "Firma", kind: "contractor" }).success,
    false,
  );
  assert.equal(
    OrganizationInputSchema.safeParse({
      name: "Firma",
      kind: "contractor",
      nip: "5260250275",
    }).success,
    false,
  );
});

test("organization schema validates persisted ids and timestamps", () => {
  const result = OrganizationSchema.safeParse({
    id: "6e83c190-b7b7-4ccb-8f2c-22c6d7459f59",
    name: "Klient",
    kind: "client",
    createdAt: "2026-10-11T12:00:00Z",
  });

  assert.equal(result.success, true);
});

test("membership schema only accepts supported roles and UUID identifiers", () => {
  const valid = {
    userId: "6e83c190-b7b7-4ccb-8f2c-22c6d7459f59",
    organizationId: "c7910357-dd23-4021-a3da-a598e873db15",
    role: "admin",
  };

  assert.equal(MembershipSchema.safeParse(valid).success, true);
  assert.equal(MembershipSchema.safeParse({ ...valid, role: "superadmin" }).success, false);
  assert.equal(MembershipSchema.safeParse({ ...valid, userId: "not-a-uuid" }).success, false);
});
