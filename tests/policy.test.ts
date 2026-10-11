/**
 * tests/policy.test.ts
 * Unit tests: Status Transition Policy & Business Rules (UT-01, TC-STA-01..10)
 */
import { describe, expect, test } from "bun:test";
import { computeTaskActions } from "../src/utils/policy";
import type { AuthenticatedUser } from "../src/types/auth.types";
import type { PolicyTask } from "../src/types/task.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pmUser: AuthenticatedUser = {
  id: "u_pm", public_id: "pub_pm", name: "PM User",
  email: "pm@test.com", role: "PM", department: null, avatarUrl: null,
};

const feUser: AuthenticatedUser = {
  id: "u_fe", public_id: "pub_fe", name: "FE User",
  email: "fe@test.com", role: "INTERNAL", department: "FRONTEND", avatarUrl: null,
};

const otherUser: AuthenticatedUser = {
  id: "u_other", public_id: "pub_other", name: "Other User",
  email: "other@test.com", role: "INTERNAL", department: "BACKEND", avatarUrl: null,
};

const clientUser: AuthenticatedUser = {
  id: "u_cli", public_id: "pub_cli", name: "Client",
  email: "cli@test.com", role: "CLIENT", department: null, avatarUrl: null,
};

function makeTask(overrides: Partial<PolicyTask> = {}): PolicyTask {
  return {
    id: "t_1", public_id: "pub_t1", projectId: "p_1",
    status: "TODO", department: "FRONTEND",
    assigneeId: feUser.id, assigneePublicId: feUser.public_id,
    clientVisible: true, version: 0, isBlocked: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BR-05: PM tidak dapat Complete task", () => {
  test("PM: DONE transition harus not allowed", () => {
    const actions = computeTaskActions(pmUser, makeTask({ status: "IN_PROGRESS" }));
    const done = actions.statusTransitions.find((t) => t.to === "DONE");
    expect(done?.allowed).toBe(false);
    expect(done?.reason).toBe("PM_CANNOT_COMPLETE");
  });
});

describe("BR-07: Hanya assignee yang dapat menyelesaikan task", () => {
  test("Assignee: DONE allowed", () => {
    const actions = computeTaskActions(feUser, makeTask({ status: "IN_PROGRESS" }));
    const done = actions.statusTransitions.find((t) => t.to === "DONE");
    expect(done?.allowed).toBe(true);
  });

  test("Non-assignee INTERNAL: DONE not allowed (NOT_ASSIGNEE)", () => {
    const actions = computeTaskActions(otherUser, makeTask({ status: "IN_PROGRESS" }));
    const done = actions.statusTransitions.find((t) => t.to === "DONE");
    expect(done?.allowed).toBe(false);
    expect(done?.reason).toBe("NOT_ASSIGNEE");
  });
});

describe("BR-03: Task blocked tidak boleh dimulai", () => {
  test("Blocked TODO -> IN_PROGRESS: not allowed (TASK_BLOCKED)", () => {
    const task = makeTask({
      isBlocked: true,
      blockers: [{ id: "pub_b1", title: "Prereq", status: "IN_PROGRESS" }],
    });
    const actions = computeTaskActions(feUser, task);
    const start = actions.statusTransitions.find((t) => t.to === "IN_PROGRESS");
    expect(start?.allowed).toBe(false);
    expect(start?.reason).toBe("TASK_BLOCKED");
  });
});

describe("BR-08: Task tanpa assignee tidak dapat dimulai", () => {
  test("TODO tanpa assignee -> IN_PROGRESS: not allowed (ASSIGNEE_REQUIRED)", () => {
    const task = makeTask({ assigneeId: null, assigneePublicId: null });
    const actions = computeTaskActions(pmUser, task);
    const start = actions.statusTransitions.find((t) => t.to === "IN_PROGRESS");
    expect(start?.allowed).toBe(false);
    expect(start?.reason).toBe("ASSIGNEE_REQUIRED");
  });
});

describe("State graph validity", () => {
  test("DONE -> TODO: bukan transisi valid (tidak muncul)", () => {
    const actions = computeTaskActions(feUser, makeTask({ status: "DONE" }));
    const toTodo = actions.statusTransitions.find((t) => t.to === "TODO");
    expect(toTodo).toBeUndefined();
  });

  test("IN_PROGRESS -> IN_PROGRESS: tidak muncul (same status)", () => {
    const actions = computeTaskActions(feUser, makeTask({ status: "IN_PROGRESS" }));
    const same = actions.statusTransitions.find((t) => t.to === "IN_PROGRESS");
    expect(same).toBeUndefined();
  });

  test("PM: dapat memulai task (TODO -> IN_PROGRESS)", () => {
    const task = makeTask({ status: "TODO", isBlocked: false });
    const actions = computeTaskActions(pmUser, task);
    const start = actions.statusTransitions.find((t) => t.to === "IN_PROGRESS");
    expect(start?.allowed).toBe(true);
  });
});

describe("Action permissions", () => {
  test("PM: semua admin actions true", () => {
    const actions = computeTaskActions(pmUser, makeTask());
    expect(actions.edit).toBe(true);
    expect(actions.delete).toBe(true);
    expect(actions.manageDependencies).toBe(true);
    expect(actions.upload).toBe(true);
  });

  test("INTERNAL: upload true, delete false", () => {
    const actions = computeTaskActions(feUser, makeTask());
    expect(actions.upload).toBe(true);
    expect(actions.delete).toBe(false);
    expect(actions.edit).toBe(false);
  });

  test("CLIENT: semua management false", () => {
    const actions = computeTaskActions(clientUser, makeTask());
    expect(actions.edit).toBe(false);
    expect(actions.delete).toBe(false);
    expect(actions.upload).toBe(false);
    expect(actions.manageDependencies).toBe(false);
  });
});