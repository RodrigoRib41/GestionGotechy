import { differenceInCalendarDays, eachDayOfInterval, format, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { unstable_cache } from "next/cache";

import { auth } from "@/auth";
import { resolveDashboardRange, type DashboardRangeInput } from "@/lib/date-ranges";
import { demoDashboardData } from "@/lib/demo-data";
import { canViewGlobalReports } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type DashboardQuery = {
  start: Date;
  end: Date;
  scopeUserId?: string;
  globalScope: boolean;
};

export async function getDashboardData(input: DashboardRangeInput = {}) {
  const range = resolveDashboardRange(input);

  if (!process.env.DATABASE_URL) {
    return { ...demoDashboardData, range: serializeRange(range), pinnedDashboardIds: [] };
  }

  try {
    const session = await auth();
    const globalScope = canViewGlobalReports(session);
    const scopeUserId = !globalScope && session?.user.id ? session.user.id : undefined;
    const scopeKey = globalScope ? "global" : `user:${scopeUserId ?? "anonymous"}`;
    const preferenceUserId = session?.user.id;

    const [data, pinnedDashboardIds] = await Promise.all([
      unstable_cache(
        () => buildDashboardData({ start: range.start, end: range.end, scopeUserId, globalScope }),
        ["dashboard-data-v4", scopeKey, range.from, range.to],
        { revalidate: 60, tags: ["dashboard-metrics"] }
      )(),
      preferenceUserId ? getPinnedDashboardIds(preferenceUserId) : Promise.resolve([])
    ]);

    return { ...data, range: serializeRange(range), pinnedDashboardIds };
  } catch {
    return { ...demoDashboardData, range: serializeRange(range), pinnedDashboardIds: [] };
  }
}

export async function getPinnedDashboardIds(userId: string) {
  return unstable_cache(
    async () => {
      const rows = await prisma.userDashboardPreference.findMany({
        where: { userId },
        select: { dashboardId: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        take: 6
      });

      return rows.map((row) => row.dashboardId);
    },
    ["dashboard-preferences-v1", userId],
    { revalidate: 300, tags: [`dashboard-preferences:${userId}`] }
  )();
}

async function buildDashboardData({ start, end, scopeUserId, globalScope }: DashboardQuery) {
  const where = {
    date: { gte: start, lte: end },
    ...(scopeUserId ? { userId: scopeUserId } : {}),
    user: { status: "ACTIVE" as const }
  };
  const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const previousEnd = subDays(start, 1);
  const previousStart = subDays(start, totalDays);
  const previousWhere = {
    date: { gte: previousStart, lte: previousEnd },
    ...(scopeUserId ? { userId: scopeUserId } : {}),
    user: { status: "ACTIVE" as const }
  };
  const monthHistoryStart = startOfMonth(subMonths(end, 5));
  const historyWhere = {
    date: { gte: monthHistoryStart, lte: end },
    ...(scopeUserId ? { userId: scopeUserId } : {}),
    user: { status: "ACTIVE" as const }
  };

  const [
    totals,
    previousTotals,
    byUser,
    byClient,
    byProject,
    byCategory,
    byDate,
    historyByDate,
    recentActivity,
    activeUsers,
    todayUsers,
    estimatedProjects,
    estimatedProjectTotals,
    estimatedProjectMonthTotals
  ] = await Promise.all([
    prisma.timeEntry.aggregate({
      where,
      _sum: { minutes: true, overtimeMinutes: true },
      _count: { _all: true }
    }),
    prisma.timeEntry.aggregate({
      where: previousWhere,
      _sum: { minutes: true, overtimeMinutes: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["userId"],
      where,
      _sum: { minutes: true, overtimeMinutes: true },
      _count: { _all: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["clientId"],
      where,
      _sum: { minutes: true, overtimeMinutes: true },
      _count: { _all: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId"],
      where,
      _sum: { minutes: true, overtimeMinutes: true },
      _count: { _all: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["categoryId"],
      where,
      _sum: { minutes: true, overtimeMinutes: true },
      _count: { _all: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["date"],
      where,
      _sum: { minutes: true, overtimeMinutes: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["date"],
      where: historyWhere,
      _sum: { minutes: true, overtimeMinutes: true }
    }),
    prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        date: true,
        detail: true,
        minutes: true,
        overtimeMinutes: true,
        user: { select: { name: true, email: true } },
        project: { select: { name: true } },
        client: { select: { name: true } },
        category: { select: { name: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    globalScope ? prisma.user.count({ where: { status: "ACTIVE" } }) : Promise.resolve(1),
    prisma.timeEntry.groupBy({
      by: ["userId"],
      where: {
        date: { gte: new Date(`${format(new Date(), "yyyy-MM-dd")}T00:00:00`), lte: new Date(`${format(new Date(), "yyyy-MM-dd")}T23:59:59`) },
        ...(scopeUserId ? { userId: scopeUserId } : {}),
        user: { status: "ACTIVE" as const }
      }
    }),
    prisma.project.findMany({
      where: { usesEstimatedTime: true, estimatedMinutes: { gt: 0 } },
      select: {
        id: true,
        name: true,
        estimatedMinutes: true,
        status: true,
        client: { select: { name: true } },
        projectType: { select: { name: true, monthlyReset: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        ...(scopeUserId ? { userId: scopeUserId } : {}),
        user: { status: "ACTIVE" as const },
        project: { usesEstimatedTime: true, estimatedMinutes: { gt: 0 } }
      },
      _sum: { minutes: true, overtimeMinutes: true }
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        ...(scopeUserId ? { userId: scopeUserId } : {}),
        user: { status: "ACTIVE" as const },
        date: { gte: startOfMonth(new Date()) },
        project: { usesEstimatedTime: true, estimatedMinutes: { gt: 0 } }
      },
      _sum: { minutes: true, overtimeMinutes: true }
    })
  ]);

  const userIds = byUser.map((item) => item.userId);
  const clientIds = byClient.map((item) => item.clientId);
  const projectIds = byProject.map((item) => item.projectId);
  const categoryIds = byCategory.map((item) => item.categoryId);
  const [users, clients, projects, categories, schedules] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    clientIds.length
      ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true, status: true, client: { select: { name: true } } }
        })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, color: true, kind: true } })
      : Promise.resolve([]),
    userIds.length
      ? prisma.workSchedule.findMany({ where: { userId: { in: userIds } }, select: { userId: true, dailyMinutes: true, workdays: true } })
      : Promise.resolve([])
  ]);

  const userMap = new Map(users.map((user) => [user.id, user.name ?? user.email]));
  const clientMap = new Map(clients.map((client) => [client.id, client.name]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.userId, schedule]));
  const totalMinutes = totals._sum.minutes ?? 0;
  const totalOvertimeMinutes = totals._sum.overtimeMinutes ?? 0;
  const previousMinutes = previousTotals._sum.minutes ?? 0;
  const productiveMinutes = byCategory.reduce((sum, item) => {
    const category = categoryMap.get(item.categoryId);
    return category?.kind === "PRODUCTIVE" ? sum + (item._sum.minutes ?? 0) : sum;
  }, 0);

  const hoursByEmployee = byUser
    .map((item) => {
      const schedule = scheduleMap.get(item.userId);
      const expectedMinutes = countWorkdays(start, end, schedule?.workdays ?? [1, 2, 3, 4, 5]) * (schedule?.dailyMinutes ?? 480);
      const minutes = item._sum.minutes ?? 0;

      return {
        id: item.userId,
        name: userMap.get(item.userId) ?? "Sin usuario",
        minutes,
        overtimeMinutes: item._sum.overtimeMinutes ?? 0,
        entryCount: item._count._all,
        averageDailyMinutes: Math.round(minutes / totalDays),
        utilizationPercent: expectedMinutes ? Math.round((minutes / expectedMinutes) * 100) : 0
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const hoursByClient = byClient
    .map((item) => ({
      id: item.clientId,
      name: clientMap.get(item.clientId) ?? "Sin cliente",
      minutes: item._sum.minutes ?? 0,
      overtimeMinutes: item._sum.overtimeMinutes ?? 0,
      entryCount: item._count._all
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const hoursByProject = byProject
    .map((item) => {
      const project = projectMap.get(item.projectId);

      return {
        id: item.projectId,
        name: project?.name ?? "Sin proyecto",
        client: project?.client.name ?? "Sin cliente",
        status: project?.status ?? "ACTIVE",
        minutes: item._sum.minutes ?? 0,
        overtimeMinutes: item._sum.overtimeMinutes ?? 0,
        entryCount: item._count._all
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const categoryDistribution = byCategory
    .map((item) => {
      const category = categoryMap.get(item.categoryId);

      return {
        id: item.categoryId,
        name: category?.name ?? "Sin categoria",
        value: item._sum.minutes ?? 0,
        overtimeMinutes: item._sum.overtimeMinutes ?? 0,
        color: category?.color ?? "#2563EB",
        kind: category?.kind ?? "PRODUCTIVE"
      };
    })
    .sort((a, b) => b.value - a.value);

  const daily = buildDailySeries(start, end, byDate);
  const weeklyEvolution = groupSeries(daily, (item) => format(startOfWeek(new Date(`${item.date}T12:00:00`), { weekStartsOn: 1 }), "dd/MM"));
  const monthlyEvolution = groupSeries(daily, (item) => format(new Date(`${item.date}T12:00:00`), "MMM yy"));
  const historyDaily = buildDailySeries(monthHistoryStart, end, historyByDate);
  const monthComparison = groupSeries(historyDaily, (item) => format(new Date(`${item.date}T12:00:00`), "MMM yy"));
  const maxDailyMinutes = Math.max(1, ...daily.map((item) => item.minutes + item.overtimeMinutes));
  const heatmap = groupHeatmap(daily.slice(-84), maxDailyMinutes);
  const previousDeltaPercent = previousMinutes === 0 ? (totalMinutes > 0 ? 100 : 0) : Math.round(((totalMinutes - previousMinutes) / previousMinutes) * 100);
  const averageDailyMinutes = Math.round(totalMinutes / totalDays);
  const estimatedTotalsByProject = new Map(
    estimatedProjectTotals.map((item) => [item.projectId, (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0)])
  );
  const estimatedMonthTotalsByProject = new Map(
    estimatedProjectMonthTotals.map((item) => [item.projectId, (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0)])
  );
  const estimatedProgress = estimatedProjects
    .map((project) => {
      const consumedMinutes = project.projectType?.monthlyReset
        ? estimatedMonthTotalsByProject.get(project.id) ?? 0
        : estimatedTotalsByProject.get(project.id) ?? 0;
      const percent = project.estimatedMinutes ? Math.round((consumedMinutes / project.estimatedMinutes) * 100) : 0;

      return {
        id: project.id,
        name: project.name,
        client: project.client.name,
        status: project.status,
        type: project.projectType?.name ?? "Sin tipo",
        monthlyReset: project.projectType?.monthlyReset ?? false,
        estimatedMinutes: project.estimatedMinutes,
        consumedMinutes,
        remainingMinutes: Math.max(0, project.estimatedMinutes - consumedMinutes),
        percent
      };
    })
    .sort((a, b) => b.percent - a.percent);

  return {
    range: serializeRange(resolveDashboardRange({ preset: "custom", from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") })),
    metrics: {
      totalMinutes,
      totalOvertimeMinutes,
      activeClients: hoursByClient.length,
      activeProjects: hoursByProject.length,
      averageDailyMinutes,
      activeEmployees: hoursByEmployee.length,
      entryCount: totals._count._all,
      productivity: totalMinutes === 0 ? 0 : Math.round((productiveMinutes / totalMinutes) * 100),
      productiveMinutes,
      internalMinutes: Math.max(0, totalMinutes - productiveMinutes),
      previousMinutes,
      previousDeltaPercent,
      missingUsers: Math.max(0, activeUsers - todayUsers.length),
      loadCompletion: activeUsers === 0 ? 0 : Math.round((todayUsers.length / activeUsers) * 100),
      todayMinutes: daily.find((item) => item.date === format(new Date(), "yyyy-MM-dd"))?.minutes ?? 0,
      weekMinutes: weeklyEvolution.at(-1)?.minutes ?? 0,
      monthMinutes: totalMinutes,
      overtimeMinutes: totalOvertimeMinutes
    },
    hoursByEmployee,
    hoursByClient,
    hoursByProject,
    estimatedProgress,
    overtimeByEmployee: [...hoursByEmployee].sort((a, b) => b.overtimeMinutes - a.overtimeMinutes),
    employeeRanking: hoursByEmployee.slice(0, 10),
    clientRanking: hoursByClient.slice(0, 10),
    categories: categoryDistribution,
    weekly: weeklyEvolution,
    weeklyEvolution,
    monthlyEvolution,
    productivityByEmployee: hoursByEmployee.map((item) => ({ name: item.name, value: item.utilizationPercent })),
    heatmap,
    overtimeTrend: daily.map((item) => ({ label: item.label, minutes: item.overtimeMinutes })),
    averageHoursByDay: daily.map((item) => ({ label: item.label, minutes: item.minutes + item.overtimeMinutes })),
    topProjectsActive: hoursByProject.filter((project) => project.status === "ACTIVE").slice(0, 8),
    utilizationByEmployee: hoursByEmployee.map((item) => ({ name: item.name, value: item.utilizationPercent, minutes: item.minutes })),
    monthComparison,
    collaborators: hoursByEmployee.slice(0, 8),
    projects: hoursByProject.slice(0, 8),
    recentActivity: recentActivity.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      collaborator: entry.user.name ?? entry.user.email,
      project: entry.project.name,
      client: entry.client.name,
      category: entry.category.name,
      detail: entry.detail,
      minutes: entry.minutes,
      overtimeMinutes: entry.overtimeMinutes
    }))
  };
}

function serializeRange(range: ReturnType<typeof resolveDashboardRange>) {
  return {
    preset: range.preset,
    label: range.label,
    from: range.from,
    to: range.to
  };
}

function buildDailySeries(
  start: Date,
  end: Date,
  groups: Array<{ date: Date; _sum: { minutes: number | null; overtimeMinutes: number | null } }>
) {
  const byDay = new Map(
    groups.map((item) => [
      format(item.date, "yyyy-MM-dd"),
      {
        minutes: item._sum.minutes ?? 0,
        overtimeMinutes: item._sum.overtimeMinutes ?? 0
      }
    ])
  );

  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const item = byDay.get(key) ?? { minutes: 0, overtimeMinutes: 0 };

    return {
      date: key,
      label: format(day, "dd/MM"),
      minutes: item.minutes,
      overtimeMinutes: item.overtimeMinutes
    };
  });
}

function groupSeries<T extends { date: string; minutes: number; overtimeMinutes: number }>(items: T[], labelFor: (item: T) => string) {
  const grouped = new Map<string, { label: string; minutes: number; overtimeMinutes: number }>();

  for (const item of items) {
    const label = labelFor(item);
    const current = grouped.get(label) ?? { label, minutes: 0, overtimeMinutes: 0 };
    current.minutes += item.minutes;
    current.overtimeMinutes += item.overtimeMinutes;
    grouped.set(label, current);
  }

  return Array.from(grouped.values());
}

function groupHeatmap(items: Array<{ date: string; minutes: number; overtimeMinutes: number }>, maxMinutes: number) {
  const weeks = new Map<string, Array<{ date: string; day: string; minutes: number; intensity: number }>>();

  for (const item of items) {
    const date = new Date(`${item.date}T12:00:00`);
    const week = format(startOfWeek(date, { weekStartsOn: 1 }), "dd/MM");
    const value = item.minutes + item.overtimeMinutes;
    const list = weeks.get(week) ?? [];
    list.push({
      date: item.date,
      day: format(date, "EEE"),
      minutes: value,
      intensity: Math.round((value / maxMinutes) * 100)
    });
    weeks.set(week, list);
  }

  return Array.from(weeks.entries()).map(([week, days]) => ({ week, days }));
}

function countWorkdays(start: Date, end: Date, workdays: number[]) {
  let count = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    if (workdays.includes(cursor.getDay())) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}
