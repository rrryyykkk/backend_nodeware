/**
 * tests/serializer.test.ts
 * Unit tests: Client masking serializer (UT-05, TC-CLI-05..06, BR-16)
 */
import { describe, expect, test } from "bun:test";
import { toClientTask, toStaffTask, computeIsBlocked } from "../src/utils/serializer";
import type { RawTaskWithRelations } from "../src/types/task.types";
import type { AuthenticatedUser } from "../src/types/auth.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMockTask(overrides: Partial<RawTaskWithRelations> = {}): RawTaskWithRelations {
  return {
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
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    project: { public_id: "pub_proj_1" },
    assignee: {
      public_id: "pub_u3",
      name: "Fe User Secret Name",
      avatarUrl: "https://secret.com/avatar.jpg",
      department: "FRONTEND",
    },
    dependsOn: [],
    attachments: [],
    ...overrides,
  };
}

const staffUser: AuthenticatedUser = {
  id: "u_pm", public_id: "pub_pm", name: "PM User",
  email: "pm@test.com", role: "PM", department: null, avatarUrl: null,
};

const feUser: AuthenticatedUser = {
  id: "u_fe", public_id: "pub_fe", name: "FE User",
  email: "fe@test.com", role: "INTERNAL", department: "FRONTEND", avatarUrl: null,
};

// ---------------------------------------------------------------------------
// Client Masking Tests (BR-16)
// ---------------------------------------------------------------------------

describe("Client Masking (BR-16, TC-CLI-05..06)", () => {
  test("Client task hanya memuat field whitelist", () => {
    const task = makeMockTask();
    const clientView = toClientTask(task);

    expect(clientView).toEqual({
      id: "pub_task_uuid7",
      title: "Frontend Slicing",
      description: "Slicing checkout screens",
      status: "TODO",
      isBlocked: false,
    });
  });

  test("Client task TIDAK mengandung data internal (anti data-leak)", () => {
    const task = makeMockTask();
    const json = JSON.stringify(toClientTask(task));

    expect(json).not.toContain("Fe User Secret Name");   // assignee name
    expect(json).not.toContain("FRONTEND");              // department
    expect(json).not.toContain("internal_cuid_123");     // internal cuid
    expect(json).not.toContain("version");               // optimistic lock version
    expect(json).not.toContain("actions");               // available actions
    expect(json).not.toContain("attachments");           // attachment list
    expect(json).not.toContain("blockers");              // blocker list
  });

  test("Client task: isBlocked = true ketika ada blocker aktif", () => {
    const task = makeMockTask({
      status: "TODO",
      dependsOn: [
        {
          deletedAt: null,
          dependsOn: {
            public_id: "pub_blocker",
            title: "Blocker Task",
            status: "IN_PROGRESS",
            deletedAt: null,
          },
        },
      ],
    });
    const clientView = toClientTask(task);
    expect(clientView.isBlocked).toBe(true);
  });

  test("Client task: isBlocked = false ketika semua prereq DONE", () => {
    const task = makeMockTask({
      dependsOn: [
        {
          deletedAt: null,
          dependsOn: {
            public_id: "pub_prereq",
            title: "Done Task",
            status: "DONE",
            deletedAt: null,
          },
        },
      ],
    });
    const clientView = toClientTask(task);
    expect(clientView.isBlocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Staff Serializer Tests
// ---------------------------------------------------------------------------

describe("Staff Serializer (toStaffTask)", () => {
  test("Staff task mengandung field lengkap", () => {
    const task = makeMockTask();
    const staffView = toStaffTask(task, staffUser);

    expect(staffView.id).toBe("pub_task_uuid7");
    expect(staffView.department).toBe("FRONTEND");
    expect(staffView.assignee?.name).toBe("Fe User Secret Name");
    expect(staffView.version).toBe(3);
    expect(staffView.actions).toBeDefined();
  });

  test("Staff task: internal id TIDAK muncul di output", () => {
    const task = makeMockTask();
    const json = JSON.stringify(toStaffTask(task, staffUser));
    expect(json).not.toContain("internal_cuid_123");
  });

  test("Staff task: attachments ter-filter (soft-deleted tidak muncul)", () => {
    const task = makeMockTask({
      attachments: [
        {
          public_id: "att_active",
          fileName: "visible.pdf",
          size: 1024,
          url: "/uploads/visible.pdf",
          deletedAt: null,
          createdAt: new Date(),
          uploader: { public_id: "pub_u1", name: "Uploader" },
        },
        {
          public_id: "att_deleted",
          fileName: "deleted.pdf",
          size: 512,
          url: "/uploads/deleted.pdf",
          deletedAt: new Date(),
          createdAt: new Date(),
          uploader: { public_id: "pub_u1", name: "Uploader" },
        },
      ],
    });
    const staffView = toStaffTask(task, staffUser);
    expect(staffView.attachments).toHaveLength(1);
    expect(staffView.attachments?.[0]?.fileName).toBe("visible.pdf");
  });
});

// ---------------------------------------------------------------------------
// computeIsBlocked tests
// ---------------------------------------------------------------------------

describe("computeIsBlocked", () => {
  test("task tanpa dependensi: tidak blocked", () => {
    const task = makeMockTask({ dependsOn: [] });
    const { isBlocked } = computeIsBlocked(task);
    expect(isBlocked).toBe(false);
  });

  test("semua prereq DONE: tidak blocked", () => {
    const task = makeMockTask({
      dependsOn: [
        {
          deletedAt: null,
          dependsOn: { public_id: "p1", title: "T1", status: "DONE", deletedAt: null },
        },
        {
          deletedAt: null,
          dependsOn: { public_id: "p2", title: "T2", status: "DONE", deletedAt: null },
        },
      ],
    });
    expect(computeIsBlocked(task).isBlocked).toBe(false);
  });

  test("1 prereq IN_PROGRESS: blocked", () => {
    const task = makeMockTask({
      dependsOn: [
        {
          deletedAt: null,
          dependsOn: { public_id: "p1", title: "T1", status: "IN_PROGRESS", deletedAt: null },
        },
      ],
    });
    const { isBlocked, blockers } = computeIsBlocked(task);
    expect(isBlocked).toBe(true);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.id).toBe("p1");
  });

  test("soft-deleted prereq dikecualikan dari blocker", () => {
    const task = makeMockTask({
      dependsOn: [
        {
          deletedAt: new Date(),
          dependsOn: { public_id: "p1", title: "Deleted", status: "TODO", deletedAt: new Date() },
        },
      ],
    });
    const { isBlocked } = computeIsBlocked(task);
    expect(isBlocked).toBe(false);
  });
});