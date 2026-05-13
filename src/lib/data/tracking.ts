import { subDays } from "date-fns";
import { unstable_cache } from "next/cache";

import { auth } from "@/auth";
import { canExportTracking, canManageTracking } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type TrackingScope = {
  userId: string;
  globalScope: boolean;
};

const demoStatuses = [
  { id: "st-1", name: "Pendiente", color: "#64748B", active: true, sortOrder: 10, isFinal: false, isBlocked: false },
  { id: "st-2", name: "En progreso", color: "#2563EB", active: true, sortOrder: 20, isFinal: false, isBlocked: false },
  { id: "st-3", name: "Bloqueado", color: "#F97316", active: true, sortOrder: 30, isFinal: false, isBlocked: true },
  { id: "st-4", name: "En revision", color: "#8B5CF6", active: true, sortOrder: 40, isFinal: false, isBlocked: false },
  { id: "st-5", name: "Finalizado", color: "#16A34A", active: true, sortOrder: 50, isFinal: true, isBlocked: false }
];

const demoTrackingData = {
  permissions: { userId: "demo", canManage: true, canExport: true },
  statuses: demoStatuses,
  clients: [
    { id: "c1", name: "Cliente Demo" },
    { id: "c2", name: "Cliente Operativo" }
  ],
  projects: [
    { id: "p1", name: "Soporte Demo", clientId: "c1", client: "Cliente Demo" },
    { id: "p2", name: "Desarrollo Demo", clientId: "c2", client: "Cliente Operativo" }
  ],
  users: [
    { id: "u1", name: "Sofia Peralta", email: "sofia@gotechy.com" },
    { id: "u2", name: "Marcos Vidal", email: "marcos@gotechy.com" }
  ],
  tasks: [
    {
      id: "t1",
      title: "Revisar jobs nocturnos",
      description: "Validar fallas intermitentes y registrar hallazgos.",
      priority: "HIGH",
      dueDate: subDays(new Date(), -1).toISOString(),
      estimatedMinutes: 180,
      consumedMinutes: 80,
      tags: ["basis", "soporte"],
      createdAt: subDays(new Date(), 2).toISOString(),
      updatedAt: subDays(new Date(), 1).toISOString(),
      closedAt: null,
      client: { id: "c1", name: "Cliente Demo" },
      project: { id: "p1", name: "Soporte Demo" },
      assignee: { id: "u1", name: "Sofia Peralta", email: "sofia@gotechy.com" },
      status: demoStatuses[1]
    },
    {
      id: "t2",
      title: "Ajustar reporte operativo",
      description: "Agregar columnas solicitadas por administracion.",
      priority: "MEDIUM",
      dueDate: subDays(new Date(), -5).toISOString(),
      estimatedMinutes: 240,
      consumedMinutes: 260,
      tags: ["reportes"],
      createdAt: subDays(new Date(), 6).toISOString(),
      updatedAt: subDays(new Date(), 4).toISOString(),
      closedAt: null,
      client: { id: "c2", name: "CARSA" },
      project: { id: "p2", name: "Desarrollo Demo" },
      assignee: { id: "u2", name: "Marcos Vidal", email: "marcos@gotechy.com" },
      status: demoStatuses[2]
    }
  ],
  history: [
    {
      id: "h1",
      taskId: "t1",
      action: "CREATE",
      message: "Tarea creada",
      minutes: null,
      createdAt: subDays(new Date(), 2).toISOString(),
      actor: "Sistema"
    }
  ]
};

export async function getTrackingData() {
  if (!process.env.DATABASE_URL) {
    return demoTrackingData;
  }

  try {
    const session = await auth();
    const userId = session?.user.id ?? "";
    const globalScope = canManageTracking(session) || canExportTracking(session);
    const scopeKey = globalScope ? "global" : `user:${userId}`;

    const data = await unstable_cache(
      () => buildTrackingData({ userId, globalScope }),
      ["tracking-data-v1", scopeKey],
      { revalidate: 30, tags: ["tracking-data"] }
    )();

    return {
      ...data,
      permissions: {
        userId,
        canManage: canManageTracking(session),
        canExport: canExportTracking(session)
      }
    };
  } catch {
    return demoTrackingData;
  }
}

async function buildTrackingData({ userId, globalScope }: TrackingScope) {
  const taskWhere = globalScope ? {} : { assigneeId: userId };
  const [statuses, clients, projects, users, tasks] = await Promise.all([
    prisma.trackingTaskStatus.findMany({
      select: { id: true, name: true, color: true, active: true, sortOrder: true, isFinal: true, isBlocked: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.client.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, clientId: true, client: { select: { name: true } } },
      orderBy: { name: "asc" }
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" }
    }),
    prisma.trackingTask.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        dueDate: true,
        estimatedMinutes: true,
        consumedMinutes: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        status: { select: { id: true, name: true, color: true, active: true, sortOrder: true, isFinal: true, isBlocked: true } }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 500
    })
  ]);
  const taskIds = tasks.map((task) => task.id);
  const history = taskIds.length
    ? await prisma.trackingTaskHistory.findMany({
        where: { taskId: { in: taskIds } },
        select: {
          id: true,
          taskId: true,
          action: true,
          message: true,
          minutes: true,
          createdAt: true,
          actor: { select: { name: true, email: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 1500
      })
    : [];

  return {
    statuses,
    clients,
    projects: projects.map((project) => ({ id: project.id, name: project.name, clientId: project.clientId, client: project.client.name })),
    users: users.map((user) => ({ id: user.id, name: user.name ?? user.email, email: user.email })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
      estimatedMinutes: task.estimatedMinutes,
      consumedMinutes: task.consumedMinutes,
      tags: task.tags,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      closedAt: task.closedAt?.toISOString() ?? null,
      client: task.client,
      project: task.project,
      assignee: { id: task.assignee.id, name: task.assignee.name ?? task.assignee.email, email: task.assignee.email },
      status: task.status
    })),
    history: history.map((item) => ({
      id: item.id,
      taskId: item.taskId,
      action: item.action,
      message: item.message,
      minutes: item.minutes,
      createdAt: item.createdAt.toISOString(),
      actor: item.actor?.name ?? item.actor?.email ?? "Sistema"
    }))
  };
}
