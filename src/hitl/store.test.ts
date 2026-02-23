import { describe, it, expect, beforeEach } from "vitest";
import { HitlStore } from "./store.js";

describe("HitlStore", () => {
  let store: HitlStore;

  beforeEach(() => {
    store = new HitlStore(":memory:");
  });

  describe("createPendingAction", () => {
    it("creates a pending action with default expiry", () => {
      const action = store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 100, client: "ACME Corp" },
        requested_by: "user-123",
      });

      expect(action.id).toBeTruthy();
      expect(action.skill_name).toBe("send_invoice");
      expect(action.action_type).toBe("financial");
      expect(action.proposed_data).toBe(JSON.stringify({ amount: 100, client: "ACME Corp" }));
      expect(action.requested_by).toBe("user-123");
      expect(action.status).toBe("pending");
      expect(action.decided_by).toBeNull();
      expect(action.decided_at).toBeNull();
      expect(action.reject_reason).toBeNull();
      expect(action.session_key).toBeNull();
      expect(action.channel_id).toBeNull();
    });

    it("creates a pending action with custom expiry and optional fields", () => {
      const action = store.createPendingAction({
        skill_name: "send_email",
        action_type: "client_facing",
        proposed_data: { subject: "Hello", body: "World" },
        requested_by: "user-456",
        expires_in_ms: 60_000, // 1 minute
        session_key: "session-abc",
        channel_id: "channel-xyz",
      });

      expect(action.status).toBe("pending");
      expect(action.session_key).toBe("session-abc");
      expect(action.channel_id).toBe("channel-xyz");

      const requestedAt = new Date(action.requested_at).getTime();
      const expiresAt = new Date(action.expires_at).getTime();
      expect(expiresAt - requestedAt).toBeCloseTo(60_000, -2);
    });

    it("sets requested_at and expires_at as ISO timestamps", () => {
      const before = new Date().toISOString();
      const action = store.createPendingAction({
        skill_name: "modify_config",
        action_type: "system_modify",
        proposed_data: { key: "value" },
        requested_by: "user-789",
      });
      const after = new Date().toISOString();

      expect(action.requested_at >= before).toBe(true);
      expect(action.requested_at <= after).toBe(true);
      expect(action.expires_at > action.requested_at).toBe(true);
    });
  });

  describe("getPendingAction", () => {
    it("returns the action by ID", () => {
      const created = store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 200 },
        requested_by: "user-123",
      });

      const fetched = store.getPendingAction(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.skill_name).toBe("send_invoice");
    });

    it("returns null for a non-existent ID", () => {
      const result = store.getPendingAction("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  describe("listPendingActions", () => {
    beforeEach(() => {
      store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 100 },
        requested_by: "user-123",
      });
      store.createPendingAction({
        skill_name: "send_email",
        action_type: "client_facing",
        proposed_data: { subject: "Hi" },
        requested_by: "user-456",
      });
      store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 300 },
        requested_by: "user-456",
      });
    });

    it("lists all actions when no filter is provided", () => {
      const actions = store.listPendingActions();
      expect(actions).toHaveLength(3);
    });

    it("filters by status", () => {
      const actions = store.listPendingActions({ status: "pending" });
      expect(actions).toHaveLength(3);
      for (const action of actions) {
        expect(action.status).toBe("pending");
      }
    });

    it("filters by skill_name", () => {
      const actions = store.listPendingActions({ skill_name: "send_invoice" });
      expect(actions).toHaveLength(2);
      for (const action of actions) {
        expect(action.skill_name).toBe("send_invoice");
      }
    });

    it("filters by requested_by", () => {
      const actions = store.listPendingActions({ requested_by: "user-456" });
      expect(actions).toHaveLength(2);
      for (const action of actions) {
        expect(action.requested_by).toBe("user-456");
      }
    });

    it("applies limit", () => {
      const actions = store.listPendingActions({ limit: 2 });
      expect(actions).toHaveLength(2);
    });

    it("combines filters", () => {
      const actions = store.listPendingActions({
        skill_name: "send_invoice",
        requested_by: "user-456",
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].skill_name).toBe("send_invoice");
      expect(actions[0].requested_by).toBe("user-456");
    });
  });

  describe("acceptAction", () => {
    it("changes status to accepted and records decided_by and decided_at", () => {
      const created = store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 100 },
        requested_by: "user-123",
      });

      const accepted = store.acceptAction(created.id, "approver-999");
      expect(accepted).not.toBeNull();
      expect(accepted!.status).toBe("accepted");
      expect(accepted!.decided_by).toBe("approver-999");
      expect(accepted!.decided_at).toBeTruthy();
      expect(accepted!.reject_reason).toBeNull();
    });

    it("returns null for a non-existent action", () => {
      const result = store.acceptAction("nonexistent-id", "approver-999");
      expect(result).toBeNull();
    });

    it("does not change status if action is not pending", () => {
      const created = store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 100 },
        requested_by: "user-123",
      });

      store.rejectAction(created.id, "approver-999", "Not approved");
      const result = store.acceptAction(created.id, "approver-888");
      // Should return the row but status stays rejected
      expect(result!.status).toBe("rejected");
    });
  });

  describe("rejectAction", () => {
    it("changes status to rejected and stores reason", () => {
      const created = store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 100 },
        requested_by: "user-123",
      });

      const rejected = store.rejectAction(created.id, "approver-999", "Too expensive");
      expect(rejected).not.toBeNull();
      expect(rejected!.status).toBe("rejected");
      expect(rejected!.decided_by).toBe("approver-999");
      expect(rejected!.decided_at).toBeTruthy();
      expect(rejected!.reject_reason).toBe("Too expensive");
    });

    it("rejects without a reason", () => {
      const created = store.createPendingAction({
        skill_name: "send_invoice",
        action_type: "financial",
        proposed_data: { amount: 100 },
        requested_by: "user-123",
      });

      const rejected = store.rejectAction(created.id, "approver-999");
      expect(rejected!.status).toBe("rejected");
      expect(rejected!.reject_reason).toBeNull();
    });

    it("returns null for a non-existent action", () => {
      const result = store.rejectAction("nonexistent-id", "approver-999", "Nope");
      expect(result).toBeNull();
    });
  });

  describe("expireActions", () => {
    it("marks pending actions past their expires_at as expired", () => {
      // Create an already-expired action (expires 1ms in the past)
      const expired = store.createPendingAction({
        skill_name: "old_task",
        action_type: "system_modify",
        proposed_data: {},
        requested_by: "user-123",
        expires_in_ms: -1000, // already expired
      });

      // Create a still-valid action (expires 24h from now, the default)
      const valid = store.createPendingAction({
        skill_name: "new_task",
        action_type: "system_modify",
        proposed_data: {},
        requested_by: "user-123",
      });

      const count = store.expireActions();
      expect(count).toBeGreaterThanOrEqual(1);

      const expiredRow = store.getPendingAction(expired.id);
      expect(expiredRow!.status).toBe("expired");

      const validRow = store.getPendingAction(valid.id);
      expect(validRow!.status).toBe("pending");
    });

    it("returns the number of expired actions", () => {
      store.createPendingAction({
        skill_name: "task_a",
        action_type: "financial",
        proposed_data: {},
        requested_by: "user-123",
        expires_in_ms: -1000,
      });
      store.createPendingAction({
        skill_name: "task_b",
        action_type: "financial",
        proposed_data: {},
        requested_by: "user-123",
        expires_in_ms: -1000,
      });

      const count = store.expireActions();
      expect(count).toBe(2);
    });

    it("does not expire already-accepted or rejected actions", () => {
      const action = store.createPendingAction({
        skill_name: "task_c",
        action_type: "financial",
        proposed_data: {},
        requested_by: "user-123",
        expires_in_ms: -1000, // already expired timestamp
      });

      // Accept it before expiring
      store.acceptAction(action.id, "approver-001");

      const count = store.expireActions();
      // Should not be expired since it was already accepted
      expect(count).toBe(0);

      const row = store.getPendingAction(action.id);
      expect(row!.status).toBe("accepted");
    });
  });

  describe("listPendingActions with auto-expire", () => {
    it("does not return expired actions when filtered by status=pending", () => {
      // Create an already-expired action
      store.createPendingAction({
        skill_name: "stale_task",
        action_type: "financial",
        proposed_data: {},
        requested_by: "user-123",
        expires_in_ms: -1000,
      });

      // Create a valid pending action
      store.createPendingAction({
        skill_name: "fresh_task",
        action_type: "financial",
        proposed_data: {},
        requested_by: "user-123",
      });

      const pendingActions = store.listPendingActions({ status: "pending" });
      expect(pendingActions).toHaveLength(1);
      expect(pendingActions[0].skill_name).toBe("fresh_task");
    });

    it("auto-expires actions on list even without status filter", () => {
      store.createPendingAction({
        skill_name: "stale_task",
        action_type: "financial",
        proposed_data: {},
        requested_by: "user-123",
        expires_in_ms: -1000,
      });

      // List without filter - auto-expire should run
      const allActions = store.listPendingActions();
      const staleAction = allActions.find((a) => a.skill_name === "stale_task");
      expect(staleAction!.status).toBe("expired");
    });
  });
});
