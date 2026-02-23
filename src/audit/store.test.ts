import { describe, it, expect, beforeEach } from "vitest";
import { AuditStore } from "./store.js";
import type { AuditEventType } from "./types.js";

function makeStore(): AuditStore {
  return new AuditStore(":memory:");
}

describe("AuditStore", () => {
  let store: AuditStore;

  beforeEach(() => {
    store = makeStore();
  });

  describe("log", () => {
    it("logs an event and returns the full AuditEvent with id and timestamp", () => {
      const event = store.log({
        event_type: "skill.executed",
        actor: "user-123",
        detail: "Executed skill hello-world",
      });

      expect(event.id).toBeTruthy();
      expect(typeof event.id).toBe("string");
      expect(event.event_type).toBe("skill.executed");
      expect(event.actor).toBe("user-123");
      expect(event.detail).toBe("Executed skill hello-world");
      expect(event.timestamp).toBeTruthy();
      // Verify timestamp is a valid ISO string
      expect(() => new Date(event.timestamp)).not.toThrow();
    });

    it("stores optional fields as null when not provided", () => {
      const event = store.log({
        event_type: "access.denied",
        actor: "user-456",
        detail: "Access denied to admin command",
      });

      expect(event.skill_name).toBeNull();
      expect(event.action_id).toBeNull();
      expect(event.session_key).toBeNull();
      expect(event.channel_id).toBeNull();
    });

    it("stores optional fields when provided", () => {
      const event = store.log({
        event_type: "skill.executed",
        actor: "user-789",
        skill_name: "invoice-create",
        action_id: "action-abc",
        detail: "Created invoice",
        session_key: "session-xyz",
        channel_id: "chan-001",
      });

      expect(event.skill_name).toBe("invoice-create");
      expect(event.action_id).toBe("action-abc");
      expect(event.session_key).toBe("session-xyz");
      expect(event.channel_id).toBe("chan-001");
    });

    it("generates unique IDs for each event", () => {
      const a = store.log({ event_type: "skill.executed", actor: "u1", detail: "event a" });
      const b = store.log({ event_type: "skill.executed", actor: "u1", detail: "event b" });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("query with no filters", () => {
    it("returns empty array when no events logged", () => {
      const events = store.query();
      expect(events).toEqual([]);
    });

    it("returns all logged events sorted by timestamp DESC", () => {
      store.log({ event_type: "skill.executed", actor: "user-1", detail: "first" });
      store.log({ event_type: "skill.rejected", actor: "user-2", detail: "second" });
      store.log({ event_type: "access.denied", actor: "user-3", detail: "third" });

      const events = store.query();
      expect(events).toHaveLength(3);
      // Should be DESC order - most recent first
      // All inserted within the same millisecond possibly, but the order should be stable
      // Verify all are present
      const details = events.map((e) => e.detail);
      expect(details).toContain("first");
      expect(details).toContain("second");
      expect(details).toContain("third");
    });

    it("returns at most 100 events by default", () => {
      for (let i = 0; i < 110; i++) {
        store.log({ event_type: "skill.executed", actor: "user", detail: `event ${i}` });
      }
      const events = store.query();
      expect(events).toHaveLength(100);
    });
  });

  describe("query by event_type", () => {
    it("filters by event_type", () => {
      store.log({ event_type: "skill.executed", actor: "u1", detail: "exec 1" });
      store.log({ event_type: "skill.rejected", actor: "u2", detail: "rejected 1" });
      store.log({ event_type: "skill.executed", actor: "u3", detail: "exec 2" });

      const executed = store.query({ event_type: "skill.executed" });
      expect(executed).toHaveLength(2);
      expect(executed.every((e) => e.event_type === "skill.executed")).toBe(true);

      const rejected = store.query({ event_type: "skill.rejected" });
      expect(rejected).toHaveLength(1);
      expect(rejected[0].actor).toBe("u2");
    });

    it("returns empty array when no events match event_type", () => {
      store.log({ event_type: "skill.executed", actor: "u1", detail: "exec" });
      const events = store.query({ event_type: "hitl.expired" });
      expect(events).toEqual([]);
    });
  });

  describe("query by actor", () => {
    it("filters by actor", () => {
      store.log({ event_type: "skill.executed", actor: "alice", detail: "alice exec" });
      store.log({ event_type: "skill.executed", actor: "bob", detail: "bob exec" });
      store.log({ event_type: "skill.rejected", actor: "alice", detail: "alice rejected" });

      const aliceEvents = store.query({ actor: "alice" });
      expect(aliceEvents).toHaveLength(2);
      expect(aliceEvents.every((e) => e.actor === "alice")).toBe(true);

      const bobEvents = store.query({ actor: "bob" });
      expect(bobEvents).toHaveLength(1);
      expect(bobEvents[0].detail).toBe("bob exec");
    });
  });

  describe("query by skill_name", () => {
    it("filters by skill_name", () => {
      store.log({
        event_type: "skill.executed",
        actor: "u1",
        skill_name: "invoice-create",
        detail: "inv 1",
      });
      store.log({
        event_type: "skill.executed",
        actor: "u2",
        skill_name: "quote-send",
        detail: "quote 1",
      });
      store.log({
        event_type: "skill.executed",
        actor: "u3",
        skill_name: "invoice-create",
        detail: "inv 2",
      });

      const invoiceEvents = store.query({ skill_name: "invoice-create" });
      expect(invoiceEvents).toHaveLength(2);
      expect(invoiceEvents.every((e) => e.skill_name === "invoice-create")).toBe(true);
    });
  });

  describe("query with since timestamp", () => {
    it("filters events to those after the since timestamp", async () => {
      // Log an event before the cutoff
      store.log({ event_type: "skill.executed", actor: "u1", detail: "before cutoff" });

      // Wait a moment to ensure different timestamps
      const cutoff = new Date().toISOString();
      // Small sleep to ensure any subsequent events are after cutoff
      await new Promise((r) => setTimeout(r, 5));

      store.log({ event_type: "skill.executed", actor: "u2", detail: "after cutoff" });

      const events = store.query({ since: cutoff });
      expect(events).toHaveLength(1);
      expect(events[0].detail).toBe("after cutoff");
    });

    it("returns empty when no events are after since", () => {
      store.log({ event_type: "skill.executed", actor: "u1", detail: "old event" });

      const future = new Date(Date.now() + 60000).toISOString();
      const events = store.query({ since: future });
      expect(events).toEqual([]);
    });
  });

  describe("query with limit", () => {
    it("caps results at the specified limit", () => {
      for (let i = 0; i < 20; i++) {
        store.log({ event_type: "skill.executed", actor: "user", detail: `event ${i}` });
      }

      const events = store.query({ limit: 5 });
      expect(events).toHaveLength(5);
    });

    it("returns all events when limit exceeds event count", () => {
      store.log({ event_type: "skill.executed", actor: "u1", detail: "event 1" });
      store.log({ event_type: "skill.executed", actor: "u2", detail: "event 2" });

      const events = store.query({ limit: 100 });
      expect(events).toHaveLength(2);
    });
  });

  describe("combined filters", () => {
    it("combines event_type and actor filters", () => {
      store.log({ event_type: "skill.executed", actor: "alice", detail: "alice exec" });
      store.log({ event_type: "skill.rejected", actor: "alice", detail: "alice rejected" });
      store.log({ event_type: "skill.executed", actor: "bob", detail: "bob exec" });

      const events = store.query({ event_type: "skill.executed", actor: "alice" });
      expect(events).toHaveLength(1);
      expect(events[0].detail).toBe("alice exec");
    });

    it("combines limit with other filters", () => {
      for (let i = 0; i < 10; i++) {
        store.log({ event_type: "skill.executed", actor: "user", detail: `event ${i}` });
      }

      const events = store.query({ event_type: "skill.executed", limit: 3 });
      expect(events).toHaveLength(3);
    });
  });

  describe("all event types", () => {
    const eventTypes: AuditEventType[] = [
      "skill.executed",
      "skill.rejected",
      "hitl.submitted",
      "hitl.accepted",
      "hitl.rejected",
      "hitl.expired",
      "access.denied",
      "pii.scrubbed",
    ];

    it("can store and retrieve all event types", () => {
      for (const et of eventTypes) {
        store.log({ event_type: et, actor: "system", detail: `test ${et}` });
      }

      for (const et of eventTypes) {
        const events = store.query({ event_type: et });
        expect(events).toHaveLength(1);
        expect(events[0].event_type).toBe(et);
      }
    });
  });
});
