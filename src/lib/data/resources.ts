import { demoClients, demoProjects, demoTimeEntries } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export async function getProjectsPageData() {
  if (!process.env.DATABASE_URL) {
    return {
      clients: demoClients.map(({ id, name, status }) => ({ id, name, status })),
      projectTypes: [
        { id: "type-soporte", name: "Soporte", active: true, monthlyReset: true },
        { id: "type-desarrollo", name: "Desarrollo", active: true, monthlyReset: false }
      ],
      projects: demoProjects.map((project) => ({ ...project, members: ["Equipo Gotechy"] }))
    };
  }

  try {
    const [projects, clients, projectTypes, projectTotals, monthlyProjectTotals] = await Promise.all([
      prisma.project.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          usesEstimatedTime: true,
          estimatedMinutes: true,
          description: true,
          projectType: { select: { id: true, name: true, monthlyReset: true } },
          projectTypeId: true,
          client: { select: { id: true, name: true } },
          members: {
            where: { user: { status: "ACTIVE" } },
            select: { user: { select: { name: true, email: true } } }
          }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.client.findMany({
        select: { id: true, name: true, status: true },
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" }
      }),
      prisma.projectType.findMany({ where: { active: true }, select: { id: true, name: true, active: true, monthlyReset: true }, orderBy: { name: "asc" } }),
      prisma.timeEntry.groupBy({
        by: ["projectId"],
        _sum: { minutes: true, overtimeMinutes: true },
        _count: { _all: true }
      }),
      prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: { date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
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
    const monthlyTotalsByProject = new Map(
      monthlyProjectTotals.map((item) => [
        item.projectId,
        {
          minutes: (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0),
          count: item._count._all
        }
      ])
    );

    return {
      clients,
      projectTypes,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        projectType: project.projectType,
        projectTypeId: project.projectTypeId,
        usesEstimatedTime: project.usesEstimatedTime,
        estimatedMinutes: project.estimatedMinutes,
        description: project.description,
        client: project.client,
        members: project.members.map((member) => member.user.name ?? member.user.email),
        consumedMinutes: project.projectType?.monthlyReset
          ? monthlyTotalsByProject.get(project.id)?.minutes ?? 0
          : totalsByProject.get(project.id)?.minutes ?? 0,
        entryCount: project.projectType?.monthlyReset
          ? monthlyTotalsByProject.get(project.id)?.count ?? 0
          : totalsByProject.get(project.id)?.count ?? 0
      }))
    };
  } catch {
    return {
      clients: demoClients.map(({ id, name, status }) => ({ id, name, status })),
      projectTypes: [
        { id: "type-soporte", name: "Soporte", active: true, monthlyReset: true },
        { id: "type-desarrollo", name: "Desarrollo", active: true, monthlyReset: false }
      ],
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
          status: true,
          description: true,
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
      status: client.status,
      description: client.description,
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
      where: { user: { status: "ACTIVE" } },
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
      { id: "demo-allowed", email: "rodrigorib41@gmail.com", role: "SUPERADMIN", displayName: "Rodrigo", status: "ACTIVE" }
    ],
    logs: [],
    categories: [],
    projectTypes: [],
    databaseState: emptyDatabaseState()
  };

  if (!process.env.DATABASE_URL) {
    return demoAdmin;
  }

  try {
    const [users, allowedEmails, logs, categories, projectTypes] = await Promise.all([
      prisma.user.findMany({
        where: { status: { notIn: ["ARCHIVED", "DELETED"] } },
        include: { workSchedule: true },
        orderBy: { updatedAt: "desc" },
        take: 50
      }),
      prisma.allowedEmail.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.auditLog.findMany({
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      prisma.projectType.findMany({ orderBy: { name: "asc" } })
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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
        displayName: email.displayName,
        status: "ACTIVE"
      })),
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        actorId: log.actorId,
        actor: log.actor?.name ?? log.actor?.email ?? "Sistema",
        createdAt: log.createdAt.toISOString()
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        kind: category.kind,
        active: category.active
      })),
      projectTypes: projectTypes.map((projectType) => ({
        id: projectType.id,
        name: projectType.name,
        description: projectType.description,
        active: projectType.active,
        monthlyReset: projectType.monthlyReset
      })),
      databaseState: emptyDatabaseState()
    };
  } catch {
    return demoAdmin;
  }
}

export async function getDatabaseState() {
  if (!process.env.DATABASE_URL) {
    return emptyDatabaseState();
  }

  return unstable_cache(
    async () => {
      const quotaMb = Number(process.env.SUPABASE_DB_QUOTA_MB ?? process.env.DATABASE_QUOTA_MB ?? 0);
      const [{ databaseSize }] = await prisma.$queryRaw<Array<{ databaseSize: bigint }>>`
        SELECT pg_database_size(current_database())::bigint AS "databaseSize"
      `;
      const tableRows = await prisma.$queryRaw<
        Array<{ tableName: string; totalBytes: bigint; dataBytes: bigint; rowEstimate: bigint }>
      >`
        SELECT
          c.relname AS "tableName",
          pg_total_relation_size(c.oid)::bigint AS "totalBytes",
          pg_relation_size(c.oid)::bigint AS "dataBytes",
          GREATEST(COALESCE(s.n_live_tup, 0), COALESCE(c.reltuples, 0))::bigint AS "rowEstimate"
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 14
      `;
      const usedBytes = Number(databaseSize ?? BigInt(0));
      const totalAvailableBytes = quotaMb > 0 ? quotaMb * 1024 * 1024 : null;
      const percentUsed = totalAvailableBytes ? Math.min(100, Math.round((usedBytes / totalAvailableBytes) * 100)) : null;
      const totalRecords = tableRows.reduce((sum, table) => sum + Number(table.rowEstimate ?? BigInt(0)), 0);
      const largestTable = tableRows.at(0);

      return {
        usedBytes,
        totalAvailableBytes,
        percentUsed,
        totalRecords,
        largestTable: largestTable?.tableName ?? "Sin datos",
        health: percentUsed !== null && percentUsed > 85 ? "warning" : "healthy",
        growthEstimateBytes30d: Math.round(usedBytes * 0.08),
        tables: tableRows.map((table) => ({
          name: table.tableName,
          totalBytes: Number(table.totalBytes ?? BigInt(0)),
          dataBytes: Number(table.dataBytes ?? BigInt(0)),
          rowEstimate: Number(table.rowEstimate ?? BigInt(0))
        }))
      };
    },
    ["admin-database-state-v1"],
    { revalidate: 600, tags: ["admin-database-state"] }
  )();
}

function emptyDatabaseState() {
  return {
    usedBytes: 0,
    totalAvailableBytes: null as number | null,
    percentUsed: null as number | null,
    totalRecords: 0,
    largestTable: "Sin datos",
    health: "healthy",
    growthEstimateBytes30d: 0,
    tables: [] as Array<{ name: string; totalBytes: number; dataBytes: number; rowEstimate: number }>
  };
}
