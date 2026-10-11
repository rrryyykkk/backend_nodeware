import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/utils/component";
import type { Department, Role, TaskStatus } from "../generated/prisma/client";

async function main(): Promise<void> {
  console.log("🌱 Memulai seeding data...");

  const defaultPasswordHash = await hashPassword("Password123!");

  // 1. Seed Users (Idempotent upsert by email)
  const userData: {
    email: string;
    name: string;
    role: Role;
    department: Department | null;
  }[] = [
    {
      email: "pm@nodewave.test",
      name: "Product Manager",
      role: "PM",
      department: null,
    },
    {
      email: "uiux@nodewave.test",
      name: "UIUX Designer",
      role: "INTERNAL",
      department: "UIUX",
    },
    {
      email: "fe@nodewave.test",
      name: "Frontend Engineer",
      role: "INTERNAL",
      department: "FRONTEND",
    },
    {
      email: "be@nodewave.test",
      name: "Backend Engineer",
      role: "INTERNAL",
      department: "BACKEND",
    },
    {
      email: "client@nodewave.test",
      name: "Client Alpha",
      role: "CLIENT",
      department: null,
    },
    {
      email: "client2@nodewave.test",
      name: "Client Beta",
      role: "CLIENT",
      department: null,
    },
  ];

  const users: Record<string, { id: string; public_id: string }> = {};

  for (const u of userData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        department: u.department,
        deletedAt: null,
      },
      create: {
        email: u.email,
        name: u.name,
        password: defaultPasswordHash,
        role: u.role,
        department: u.department,
      },
      select: { id: true, public_id: true, email: true },
    });
    users[u.email] = { id: user.id, public_id: user.public_id };
  }
  console.log("✅ 6 Akun seed siap.");

  // 2. Seed Projects (Alpha & Beta)
  const projectAlpha = await prisma.project.upsert({
    where: { public_id: "018f0000-0000-7000-8000-000000000001" },
    update: { name: "Project Alpha", deletedAt: null },
    create: {
      public_id: "018f0000-0000-7000-8000-000000000001",
      name: "Project Alpha",
      description: "Project deliverable alpha with full deliverables",
    },
    select: { id: true, public_id: true },
  });

  const projectBeta = await prisma.project.upsert({
    where: { public_id: "018f0000-0000-7000-8000-000000000002" },
    update: { name: "Project Beta", deletedAt: null },
    create: {
      public_id: "018f0000-0000-7000-8000-000000000002",
      name: "Project Beta",
      description: "Project deliverable beta for multi-tenant tests",
    },
    select: { id: true, public_id: true },
  });

  // 3. Seed Project Members
  // Alpha members: pm, uiux, fe, be, client
  // Beta members: pm, be, client2
  const alphaUserEmails = [
    "pm@nodewave.test",
    "uiux@nodewave.test",
    "fe@nodewave.test",
    "be@nodewave.test",
    "client@nodewave.test",
  ];
  for (const email of alphaUserEmails) {
    const u = users[email]!;
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: projectAlpha.id, userId: u.id } },
      update: { deletedAt: null },
      create: { projectId: projectAlpha.id, userId: u.id },
    });
  }

  const betaUserEmails = [
    "pm@nodewave.test",
    "be@nodewave.test",
    "client2@nodewave.test",
  ];
  for (const email of betaUserEmails) {
    const u = users[email]!;
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: projectBeta.id, userId: u.id } },
      update: { deletedAt: null },
      create: { projectId: projectBeta.id, userId: u.id },
    });
  }
  console.log("✅ Memberships siap.");

  // 4. Seed Tasks Project Alpha
  // T1: Design Checkout UI (UIUX, uiux, IN_PROGRESS, clientVisible: true)
  // T2: Backend API Integration (BACKEND, be, DONE, clientVisible: true)
  // T3: Frontend Slicing (FRONTEND, fe, TODO, blocked by T1 & T2, clientVisible: true)
  // T4: Setup CI/CD (BACKEND, be, TODO, clientVisible: false)
  // T5: Write API Docs (BACKEND, be, DONE, clientVisible: false)
  // T6: Frontend Auth Pages (FRONTEND, fe, TODO, clientVisible: false)

  const pmId = users["pm@nodewave.test"]!.id;

  const alphaTaskDefs: {
    public_id: string;
    title: string;
    description: string;
    department: Department;
    assigneeEmail: string;
    status: TaskStatus;
    clientVisible: boolean;
  }[] = [
    {
      public_id: "018f0000-0000-7000-8000-000000000011",
      title: "Design Checkout UI",
      description: "Create interactive Figma mockup for checkout flow",
      department: "UIUX",
      assigneeEmail: "uiux@nodewave.test",
      status: "IN_PROGRESS",
      clientVisible: true,
    },
    {
      public_id: "018f0000-0000-7000-8000-000000000012",
      title: "Backend API Integration",
      description: "Integrate Payment Gateway API and webhooks",
      department: "BACKEND",
      assigneeEmail: "be@nodewave.test",
      status: "DONE",
      clientVisible: true,
    },
    {
      public_id: "018f0000-0000-7000-8000-000000000013",
      title: "Frontend Slicing",
      description: "Slice checkout screens using Tailwind and React",
      department: "FRONTEND",
      assigneeEmail: "fe@nodewave.test",
      status: "TODO",
      clientVisible: true,
    },
    {
      public_id: "018f0000-0000-7000-8000-000000000014",
      title: "Setup CI/CD",
      description: "Setup GitHub Actions pipeline and automated testing",
      department: "BACKEND",
      assigneeEmail: "be@nodewave.test",
      status: "TODO",
      clientVisible: false,
    },
    {
      public_id: "018f0000-0000-7000-8000-000000000015",
      title: "Write API Docs",
      description: "Document endpoints using OpenAPI 3.0 specification",
      department: "BACKEND",
      assigneeEmail: "be@nodewave.test",
      status: "DONE",
      clientVisible: false,
    },
    {
      public_id: "018f0000-0000-7000-8000-000000000016",
      title: "Frontend Auth Pages",
      description: "Implement Login, Register, and Forgot Password UI",
      department: "FRONTEND",
      assigneeEmail: "fe@nodewave.test",
      status: "TODO",
      clientVisible: false,
    },
  ];

  const tasks: Record<string, { id: string; public_id: string }> = {};

  for (const def of alphaTaskDefs) {
    const assignee = users[def.assigneeEmail]!;
    const t = await prisma.task.upsert({
      where: { public_id: def.public_id },
      update: {
        title: def.title,
        description: def.description,
        department: def.department,
        assigneeId: assignee.id,
        status: def.status,
        clientVisible: def.clientVisible,
        deletedAt: null,
      },
      create: {
        public_id: def.public_id,
        projectId: projectAlpha.id,
        title: def.title,
        description: def.description,
        department: def.department,
        assigneeId: assignee.id,
        createdById: pmId,
        status: def.status,
        clientVisible: def.clientVisible,
        version: 0,
      },
      select: { id: true, public_id: true },
    });
    tasks[def.title] = { id: t.id, public_id: t.public_id };
  }

  // 5. Seed Dependencies: T3 depends on T1 and T2
  const t3 = tasks["Frontend Slicing"]!;
  const t1 = tasks["Design Checkout UI"]!;
  const t2 = tasks["Backend API Integration"]!;

  await prisma.taskDependency.upsert({
    where: { taskId_dependsOnId: { taskId: t3.id, dependsOnId: t1.id } },
    update: { deletedAt: null },
    create: { taskId: t3.id, dependsOnId: t1.id },
  });

  await prisma.taskDependency.upsert({
    where: { taskId_dependsOnId: { taskId: t3.id, dependsOnId: t2.id } },
    update: { deletedAt: null },
    create: { taskId: t3.id, dependsOnId: t2.id },
  });

  // 6. Seed Comments di T1 & T3 untuk uji masking Client
  await prisma.comment.createMany({
    data: [
      {
        public_id: "018f0000-0000-7000-8000-000000000031",
        taskId: t1.id,
        authorId: users["uiux@nodewave.test"]!.id,
        body: "Mockup Figma sudah siap di-review oleh Frontend.",
        isInternal: true,
      },
      {
        public_id: "018f0000-0000-7000-8000-000000000032",
        taskId: t3.id,
        authorId: users["fe@nodewave.test"]!.id,
        body: "Menunggu approval desain dari UIUX sebelum mulai slicing.",
        isInternal: true,
      },
    ],
    skipDuplicates: true,
  });

  // 7. Seed Tasks Project Beta (2 task BACKEND, 1 client-visible)
  const betaTaskDefs: {
    public_id: string;
    title: string;
    description: string;
    department: Department;
    assigneeEmail: string;
    status: TaskStatus;
    clientVisible: boolean;
  }[] = [
    {
      public_id: "018f0000-0000-7000-8000-000000000021",
      title: "Beta Database Architecture",
      description: "Setup schema and database cluster for Beta",
      department: "BACKEND",
      assigneeEmail: "be@nodewave.test",
      status: "DONE",
      clientVisible: true,
    },
    {
      public_id: "018f0000-0000-7000-8000-000000000022",
      title: "Beta Redis Caching Layer",
      description: "Implement cache aside pattern in Beta services",
      department: "BACKEND",
      assigneeEmail: "be@nodewave.test",
      status: "TODO",
      clientVisible: false,
    },
  ];

  for (const def of betaTaskDefs) {
    const assignee = users[def.assigneeEmail]!;
    await prisma.task.upsert({
      where: { public_id: def.public_id },
      update: {
        title: def.title,
        description: def.description,
        department: def.department,
        assigneeId: assignee.id,
        status: def.status,
        clientVisible: def.clientVisible,
        deletedAt: null,
      },
      create: {
        public_id: def.public_id,
        projectId: projectBeta.id,
        title: def.title,
        description: def.description,
        department: def.department,
        assigneeId: assignee.id,
        createdById: pmId,
        status: def.status,
        clientVisible: def.clientVisible,
        version: 0,
      },
    });
  }

  // 8. Seed Audit Logs awal
  await prisma.taskAuditLog.createMany({
    data: [
      {
        taskId: t2.id,
        projectId: projectAlpha.id,
        userId: users["be@nodewave.test"]!.id,
        column: "status",
        oldValue: "IN_PROGRESS",
        newValue: "DONE",
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Kemarin untuk uji standup summary
      },
      {
        taskId: t1.id,
        projectId: projectAlpha.id,
        userId: users["uiux@nodewave.test"]!.id,
        column: "status",
        oldValue: "TODO",
        newValue: "IN_PROGRESS",
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ],
    skipDuplicates: true,
  });

  console.log("🎉 Seeding data berhasil diselesaikan!");
}

main()
  .catch((e) => {
    console.error("❌ Error saat seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
