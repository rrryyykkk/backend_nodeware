import { describe, expect, test } from "bun:test";
import { detectCycle } from "../src/utils/graph";
import { computeTaskActions } from "../src/utils/policy";
import { toClientTask, type RawTaskWithRelations } from "../src/utils/serializer";
import type { AuthenticatedUser } from "../src/middleware/auth.middleware";

describe("Graph Cycle Detection (UT-02, TC-DEP-04..06)", () => {
  test("mendeteksi self-dependency", () => {
    const cycle = detectCycle([], { from: "t1", to: "t1" });
    expect(cycle).toEqual(["t1", "t1"]);
  });

  test("mendeteksi siklus 2 node (A -> B lalu B -> A)", () => {
    const edges = [{ from: "t1", to: "t2" }];
    const cycle = detectCycle(edges, { from: "t2", to: "t1" });
    expect(cycle).toEqual(["t2", "t1", "t2"]);
  });

  test("mendeteksi siklus 3 node (A -> B, B -> C, C -> A)", () => {
    const edges = [
      { from: "t1", to: "t2" },
      { from: "t2", to: "t3" },
    ];
    const cycle = detectCycle(edges, { from: "t3", to: "t1" });
    expect(cycle).toEqual(["t3", "t1", "t2", "t3"]);
  });

  test("mengizinkan penambahan edge pada DAG yang valid tanpa siklus", () => {
    const edges = [
      { from: "t1", to: "t2" },
      { from: "t2", to: "t3" },
    ];
    const cycle = detectCycle(edges, { from: "t1", to: "t3" });
    expect(cycle).toBeNull();
  });
});

describe("State-based Permission & Policy (UT-01, TC-STA-01..10)", () => {
  const pmUser: AuthenticatedUser = {
    id: "u_pm",
    public_id: "pub_pm",
    name: "PM User",
    email: "pm@test.com",
    role: "PM",
    department: null,
    avatarUrl: null,
  };

  const feUser: AuthenticatedUser = {
    id: "u_fe",
    public_id: "pub_fe",
    name: "FE User",
    email: "fe@test.com",
    role: "INTERNAL",
    department: "FRONTEND",
    avatarUrl: null,
  };

  test("PM tidak boleh Complete (IN_PROGRESS -> DONE) task (BR-05)", () => {
    const task = {
      id: "t_1",
      public_id: "pub_t1",
      projectId: "p_1",
      status: "IN_PROGRESS" as const,
      department: "FRONTEND" as const,
      assigneeId: feUser.id,
      assigneePublicId: feUser.public_id,
      clientVisible: true,
      version: 0,
      isBlocked: false,
    };

    const actions = computeTaskActions(pmUser, task);
    const doneTransition = actions.statusTransitions.find((t) => t.to === "DONE");
    expect(doneTransition?.allowed).toBe(false);
    expect(doneTransition?.reason).toBe("PM_CANNOT_COMPLETE");
  });

  test("Assignee berhak Complete (IN_PROGRESS -> DONE) task", () => {
    const task = {
      id: "t_1",
      public_id: "pub_t1",
      projectId: "p_1",
      status: "IN_PROGRESS" as const,
      department: "FRONTEND" as const,
      assigneeId: feUser.id,
      assigneePublicId: feUser.public_id,
      clientVisible: true,
      version: 0,
      isBlocked: false,
    };

    const actions = computeTaskActions(feUser, task);
    const doneTransition = actions.statusTransitions.find((t) => t.to === "DONE");
    expect(doneTransition?.allowed).toBe(true);
  });

  test("Task blocked tidak boleh dimulai (TODO -> IN_PROGRESS) (BR-03)", () => {
    const task = {
      id: "t_1",
      public_id: "pub_t1",
      projectId: "p_1",
      status: "TODO" as const,
      department: "FRONTEND" as const,
      assigneeId: feUser.id,
      assigneePublicId: feUser.public_id,
      clientVisible: true,
      version: 0,
      isBlocked: true,
      blockers: [{ id: "pub_b1", title: "Prerequisite Task", status: "IN_PROGRESS" as const }],
    };

    const actions = computeTaskActions(feUser, task);
    const startTransition = actions.statusTransitions.find((t) => t.to === "IN_PROGRESS");
    expect(startTransition?.allowed).toBe(false);
    expect(startTransition?.reason).toBe("TASK_BLOCKED");
  });
});

describe("Client Masking Serializer (UT-05, TC-CLI-05, 06)", () => {
  test("Client task hanya memuat field whitelist (anti data-leak)", () => {
    const mockTask: RawTaskWithRelations = {
      id: "internal_cuid_123",
      public_id: "pub_task_uuid7",
      projectId: "proj_internal",
      title: "Frontend Slicing",
      description: "Slicing checkout screens",
      status: "TODO",
      department: "FRONTEND",
      assigneeId: "user_internal_456",
      clientVisible: true,
      version: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignee: {
        public_id: "pub_u3",
        name: "Fe User Secret Name",
        avatarUrl: "https://secret.com/avatar.jpg",
        department: "FRONTEND",
      },
      dependsOn: [],
      attachments: [],
    };

    const clientView = toClientTask(mockTask);
    const jsonString = JSON.stringify(clientView);

    expect(clientView).toEqual({
      id: "pub_task_uuid7",
      title: "Frontend Slicing",
      description: "Slicing checkout screens",
      status: "TODO",
      isBlocked: false,
    });

    expect(jsonString).not.toContain("Fe User Secret Name");
    expect(jsonString).not.toContain("FRONTEND");
    expect(jsonString).not.toContain("internal_cuid_123");
    expect(jsonString).not.toContain("version");
    expect(jsonString).not.toContain("actions");
  });
});
