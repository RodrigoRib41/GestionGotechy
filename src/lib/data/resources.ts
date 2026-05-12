import { demoClients, demoProjects, demoTimeEntries } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

export async function getProjectsPageData() {
  if (!process.env.DATABASE_URL) {
    return {
      clients: demoClients.map(({ id, name, code, status }) => ({ id, name, code, status })),
      projects: demoProjects.map((project) => ({ ...project, members: ["Equipo Gotechy"] }))
    };
  }

  try {
    const [projects, clients, projectTotals] = await Promise.all([
      prisma.project.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          type: true,
          estimatedMinutes: true,
          client: { select: { id: true, name: true, code: true } },
          members: { select: { user: { select: { name: true, email: true } } } }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.client.findMany({ orderBy: { name: "asc" } }),
      prisma.timeEntry.groupBy({
        by: ["projectId"],
        _sum: { minutes: true, overtimeMinutes: true },
        _count: { _all: true }
      })
    ]);
    const totalsByProject = new Map(
      projectTotals.map((item) => [
        item.projectId,
        {
          minutes: (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0),
          count: item._count._all
        }
      ])
    );

    return {
      clients,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        type: project.type,
        estimatedMinutes: project.estimatedMinutes,
        client: project.client,
        members: project.members.map((member) => member.user.name ?? member.user.email),
        consumedMinutes: totalsByProject.get(project.id)?.minutes ?? 0,
        entryCount: totalsByProject.get(project.id)?.count ?? 0
      }))
    };
  } catch {
    return {
      clients: demoClients.map(({ id, name, code, status }) => ({ id, name, code, status })),
      projects: demoProjects.map((project) => ({ ...project, members: ["Equipo Gotechy"], entryCount: 0 }))
    };
  }
}

export async function getClientsPageData() {
  if (!process.env.DATABASE_URL) {
    return demoClients;
  }

  try {
    const [clients, clientTotals] = await Promise.all([
      prisma.client.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          projects: { select: { id: true, status: true } }
        },
        orderBy: { name: "asc" }
      }),
      prisma.timeEntry.groupBy({
        by: ["clientId"],
        _sum: { minutes: true, overtimeMinutes: true },
        _count: { _all: true }
      })
    ]);
    const totalsByClient = new Map(
      clientTotals.map((item) => [
        item.clientId,
        {
          minutes: (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0),
          count: item._count._all
        }
      ])
    );

    return clients.map((client) => ({
      id: client.id,
      name: client.name,
      code: client.code,
      status: client.status,
      projects: client.projects.length,
      activeProjects: client.projects.filter((project) => project.status === "ACTIVE").length,
      consumedMinutes: totalsByClient.get(client.id)?.minutes ?? 0,
      entryCount: totalsByClient.get(client.id)?.count ?? 0
    }));
  } catch {
    return demoClients;
  }
}

export async function getReportsData() {
  if (!process.env.DATABASE_URL) {
    return demoTimeEntries.map((entry) => ({
      ...entry,
      collaboratorId: entry.collaborator,
      clientId: entry.client,
      projectId: entry.project,
      observations: "",
      createdAt: entry.date,
      updatedAt: entry.date
    }));
  }

  try {
    const entries = await prisma.timeEntry.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        category: { select: { name: true } }
      },
      orderBy: { date: "desc" },
      take: 1500
    });

    return entries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      collaborator: entry.user.name ?? entry.user.email,
      collaboratorId: entry.user.id,
      project: entry.project.name,
      projectId: entry.project.id,
      client: entry.client.name,
      clientId: entry.client.id,
      category: entry.category.name,
      detail: entry.detail,
      observations: entry.observations,
      minutes: entry.minutes,
      overtimeMinutes: entry.overtimeMinutes,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString()
    }));
  } catch {
    return demoTimeEntries.map((entry) => ({
      ...entry,
      collaboratorId: entry.collaborator,
      clientId: entry.client,
      projectId: entry.project,
      observations: "",
      createdAt: entry.date,
      updatedAt: entry.date
    }));
  }
}

export async function getAdminData() {
  const demoAdmin = {
    users: [],
    allowedEmails: [
      { id: "demo-allowed", email: "rodrigorib41@gmail.com", role: "SUPERADMIN", roles: ["SUPERADMIN"], displayName: "Rodrigo" }
    ],
    logs: [],
    categories: []
  };

  if (!process.env.DATABASE_URL) {
    return demoAdmin;
  }

  try {
    const [users, allowedEmails, logs, categories] = await Promise.all([
      prisma.user.findMany({
        include: { roles: { select: { role: true } }, workSchedule: true },
        orderBy: { updatedAt: "desc" },
        take: 50
      }),
      prisma.allowedEmail.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } })
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roles: user.roles.map((item) => item.role),
        status: user.status,
        workSchedule: user.workSchedule
          ? {
              weeklyMinutes: user.workSchedule.weeklyMinutes,
              dailyMinutes: user.workSchedule.dailyMinutes,
              workdays: user.workSchedule.workdays,
              modality: user.workSchedule.modality
            }
          : null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null
      })),
      allowedEmails: allowedEmails.map((email) => ({
        id: email.id,
        email: email.email,
        role: email.role,
        roles: email.roles,
        displayName: email.displayName
      })),
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        actor: log.actor?.name ?? log.actor?.email ?? "Sistema",
        createdAt: log.createdAt.toISOString()
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        kind: category.kind,
        active: category.active
      }))
    };
  } catch {
    return demoAdmin;
  }
}
