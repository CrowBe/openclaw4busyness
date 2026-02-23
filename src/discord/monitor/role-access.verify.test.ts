import { describe, it, expect } from "vitest";
import { resolveDiscordRoleAllowed, resolveDiscordMemberAllowed } from "./allow-list.js";

describe("role-based access control", () => {
  const ADMIN_ROLE_ID = "111111111111111111";
  const OPERATOR_ROLE_ID = "222222222222222222";
  const FIELD_WORKER_ROLE_ID = "333333333333333333";

  describe("resolveDiscordRoleAllowed", () => {
    it("allows admin when admin role in allowlist", () => {
      expect(
        resolveDiscordRoleAllowed({
          allowList: [ADMIN_ROLE_ID],
          memberRoleIds: [ADMIN_ROLE_ID],
        }),
      ).toBe(true);
    });

    it("denies field worker from admin-only channel", () => {
      expect(
        resolveDiscordRoleAllowed({
          allowList: [ADMIN_ROLE_ID],
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
        }),
      ).toBe(false);
    });

    it("allows wildcard", () => {
      expect(
        resolveDiscordRoleAllowed({
          allowList: ["*"],
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
        }),
      ).toBe(true);
    });

    it("allows when no allowlist configured", () => {
      expect(
        resolveDiscordRoleAllowed({
          allowList: undefined,
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
        }),
      ).toBe(true);
    });

    it("allows operator in operator+admin channel", () => {
      expect(
        resolveDiscordRoleAllowed({
          allowList: [ADMIN_ROLE_ID, OPERATOR_ROLE_ID],
          memberRoleIds: [OPERATOR_ROLE_ID],
        }),
      ).toBe(true);
    });

    it("denies field worker from operator-only channel", () => {
      expect(
        resolveDiscordRoleAllowed({
          allowList: [ADMIN_ROLE_ID, OPERATOR_ROLE_ID],
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
        }),
      ).toBe(false);
    });
  });

  describe("resolveDiscordMemberAllowed - combined user and role", () => {
    it("allows user in user allowlist even without role", () => {
      expect(
        resolveDiscordMemberAllowed({
          userAllowList: ["specific-user-id"],
          roleAllowList: [ADMIN_ROLE_ID],
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
          userId: "specific-user-id",
        }),
      ).toBe(true);
    });

    it("denies user not in user or role allowlist", () => {
      expect(
        resolveDiscordMemberAllowed({
          userAllowList: ["specific-user-id"],
          roleAllowList: [ADMIN_ROLE_ID],
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
          userId: "other-user-id",
        }),
      ).toBe(false);
    });

    it("allows when no restrictions configured", () => {
      expect(
        resolveDiscordMemberAllowed({
          memberRoleIds: [FIELD_WORKER_ROLE_ID],
          userId: "any-user-id",
        }),
      ).toBe(true);
    });
  });
});
