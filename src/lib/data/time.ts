import { eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { unstable_cache } from "next/cache";

import { auth } from "@/auth";
import { demoCategories, demoProjects, demoTimeEntries } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

const demoPersonalMetrics = {
  todayPercent: 88,
  weekPercent: 76,
  monthPercent: 64,
  pendingMinutes: 60,
  overtimeMinutes: 120,
  todayMinutes: 420,
  weekMinutes: 1860,
  monthMinutes: 6720
};

const getTimeEntryCatalogs = unstable_cache(
  async () => {
    const [projects, categories] = await Promise.all([
      prisma.project.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          status: true,
          usesEstimatedTime: true,
          estimatedMinutes: true,
          client: { select: { id: true, name: true } },
          projectType: { select: { id: true, name: true, monthlyReset: true } }
        },
        orderBy: { name: "asc" }
      }),
      prisma.category.findMany({
        where: { active: true },
        select: { id: true, name: true, color: true, kind: true, description: true },
        orderBy: { name: "asc" }
      })
    ]);

    return { projects, categories };
  },
  ["time-entry-catalogs-v4"],
  { revalidate: 300, tags: ["time-entry-context"] }
);

export async function getTimeEntryContext() {
  if (!process.env.DATABASE_URL) {
    return {
      userId: "demo",
      projects: demoProjects,
      categories: demoCategories,
      favorites: [],
      personalMetrics: demoPersonalMetrics,
      goalProgress: [],
      workSchedule: { dailyMinutes: 480, weeklyMinutes: 2400, workdays: [1, 2, 3, 4, 5], modality: "HYBRID" },
      recentEntries: demoTimeEntries
    };
  }

  try {
    const session = await auth();
    const userId = session?.user.id ?? "";
    const now = new Date();
    const thirtyDaysAgo = startOfDay(subDays(now, 30));
    const { projects, categories } = await getTimeEntryCatalogs();
    const projectIds = projects.map((project) => project.id);
    const monthlyProjectIds = projects.filter((project) => project.projectType?.monthlyReset).map((project) => project.id);
    const [recentEntries, favorites, workSchedule, personalEntries, activeGoals, projectTotals, monthlyProjectTotals] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { userId, date: { gte: thirtyDaysAgo } },
        select: {
          id: true,
          date: true,
          detail: true,
          observations: true,
          minutes: true,
          overtimeMinutes: true,
          projectId: true,
          clientId: true,
          categoryId: true,
          project: { select: { name: true } },
          client: { select: { name: true } },
          category: { select: { name: true, kind: true } },
          user: { select: { name: true, email: true } }
        },
        orderBy: [{ date: "desc" }, { updatedAt: "desc" }]
      }),
      prisma.timeEntryFavorite.findMany({
        where: { userId, project: { status: "ACTIVE" }, category: { active: true } },
        select: {
          id: true,
          name: true,
          detail: true,
          observations: true,
          minutes: true,
          overtimeMinutes: true,
          projectId: true,
          categoryId: true,
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
          category: { select: { id: true, name: true, kind: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: 5
      }),
      prisma.workSchedule.findUnique({ where: { userId } }),
      prisma.timeEntry.findMany({
        where: { userId, date: { gte: startOfMonth(now) } },
        select: {
          date: true,
          minutes: true,
          overtimeMinutes: true,
          clientId: true,
          projectId: true,
          categoryId: true,
          category: { select: { kind: true } }
        }
      }),
      prisma.goalObjective.findMany({
        where: {
          active: true,
          OR: [{ global: true }, { ownerId: userId }],
          excludedUsers: { none: { userId } }
        },
        select: {
          id: true,
          name: true,
          metricKind: true,
          period: true,
          targetPercent: true,
          targetMinutes: true,
          tolerancePercent: true,
          clientId: true,
          projectId: true,
          categoryId: true
        },
        orderBy: [{ period: "asc" }, { updatedAt: "desc" }],
        take: 6
      }),
      projectIds.length
        ? prisma.timeEntry.groupBy({
            by: ["projectId"],
            where: { projectId: { in: projectIds } },
            _sum: { minutes: true, overtimeMinutes: true }
          })
        : Promise.resolve([]),
      monthlyProjectIds.length
        ? prisma.timeEntry.groupBy({
            by: ["projectId"],
            where: { projectId: { in: monthlyProjectIds }, date: { gte: startOfMonth(now) } },
            _sum: { minutes: true, overtimeMinutes: true }
          })
        : Promise.resolve([])
    ]);

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const dailyExpected = workSchedule?.dailyMinutes ?? 480;
    const weeklyExpected = workSchedule?.weeklyMinutes ?? 2400;
    const workdays = workSchedule?.workdays ?? [1, 2, 3, 4, 5];
    const businessDaysElapsed = Array.from({ length: 7 }).filter((_, index) => {
      const day = subDays(now, index);
      return day >= weekStart && workdays.includes(day.getDay());
    }).length;
    const todayMinutes = personalEntries
      .filter((entry) => entry.date >= todayStart && entry.date <= todayEnd)
      .reduce((total, entry) => total + entry.minutes, 0);
    const weekMinutes = personalEntries
      .filter((entry) => entry.date >= weekStart)
      .reduce((total, entry) => total + entry.minutes, 0);
    const monthMinutes = personalEntries.reduce((total, entry) => total + entry.minutes, 0);
    const overtimeMinutes = personalEntries.reduce((total, entry) => total + entry.overtimeMinutes, 0);
    const expectedWeekSoFar = Math.max(dailyExpected, businessDaysElapsed * dailyExpected);
    const totalsByProject = new Map(
      projectTotals.map((item) => [item.projectId, (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0)])
    );
    const monthlyTotalsByProject = new Map(
      monthlyProjectTotals.map((item) => [item.projectId, (item._sum.minutes ?? 0) + (item._sum.overtimeMinutes ?? 0)])
    );

    return {
      userId,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        client: project.client,
        projectType: project.projectType,
        usesEstimatedTime: project.usesEstimatedTime,
        estimatedMinutes: project.estimatedMinutes,
        consumedMinutes: project.projectType?.monthlyReset
          ? monthlyTotalsByProject.get(project.id) ?? 0
          : totalsByProject.get(project.id) ?? 0
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        kind: category.kind,
        description: category.description
      })),
      favorites: favorites.map((favorite) => ({
        id: favorite.id,
        name: favorite.name,
        detail: favorite.detail,
        observations: favorite.observations,
        minutes: favorite.minutes,
        overtimeMinutes: favorite.overtimeMinutes,
        projectId: favorite.projectId,
        categoryId: favorite.categoryId,
        project: favorite.project.name,
        client: favorite.project.client.name,
        category: favorite.category.name,
        categoryKind: favorite.category.kind
      })),
      personalMetrics: {
        todayPercent: Math.round((todayMinutes / dailyExpected) * 100),
        weekPercent: Math.round((weekMinutes / expectedWeekSoFar) * 100),
        monthPercent: Math.round((monthMinutes / Math.max(dailyExpected, 22 * dailyExpected)) * 100),
        pendingMinutes: Math.max(0, dailyExpected - todayMinutes),
        overtimeMinutes,
        todayMinutes,
        weekMinutes,
        monthMinutes
      },
      goalProgress: buildGoalProgress(activeGoals, personalEntries, {
        now,
        dailyMinutes: dailyExpected,
        workdays
      }),
      workSchedule: {
        dailyMinutes: dailyExpected,
        weeklyMinutes: weeklyExpected,
        workdays,
        modality: workSchedule?.modality ?? "HYBRID"
      },
      recentEntries: recentEntries.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        collaborator: entry.user.name ?? entry.user.email,
        project: entry.project.name,
        projectId: entry.projectId,
        client: entry.client.name,
        clientId: entry.clientId,
        category: entry.category.name,
        categoryId: entry.categoryId,
        categoryKind: entry.category.kind,
        detail: entry.detail,
        observations: entry.observations,
        minutes: entry.minutes,
        overtimeMinutes: entry.overtimeMinutes
      }))
    };
  } catch {
    return {
      userId: "demo",
      projects: demoProjects,
      categories: demoCategories,
      favorites: [],
      personalMetrics: demoPersonalMetrics,
      goalProgress: [],
      workSchedule: { dailyMinutes: 480, weeklyMinutes: 2400, workdays: [1, 2, 3, 4, 5], modality: "HYBRID" },
      recentEntries: demoTimeEntries
    };
  }
}

function buildGoalProgress(
  goals: Array<{
    id: string;
    name: string;
    metricKind: string;
    period: string;
    targetPercent: number | null;
    targetMinutes: number | null;
    tolerancePercent: number;
    clientId: string | null;
    projectId: string | null;
    categoryId: string | null;
  }>,
  entries: Array<{
    date: Date;
    minutes: number;
    overtimeMinutes: number;
    clientId: string;
    projectId: string;
    categoryId: string;
    category: { kind: string };
  }>,
  config: { now: Date; dailyMinutes: number; workdays: number[] }
) {
  return goals.map((goal) => {
    const periodStart = goal.period === "MONTHLY" ? startOfMonth(config.now) : startOfWeek(config.now, { weekStartsOn: 1 });
    const periodEnd = goal.period === "MONTHLY" ? endOfMonth(config.now) : endOfWeek(config.now, { weekStartsOn: 1 });
    const elapsedWorkdays = eachDayOfInterval({ start: periodStart, end: config.now }).filter((day) => config.workdays.includes(day.getDay())).length;
    const expectedMinutes = Math.max(config.dailyMinutes, elapsedWorkdays * config.dailyMinutes);
    const scopedEntries = entries
      .filter((entry) => entry.date >= periodStart && entry.date <= periodEnd)
      .filter((entry) => !goal.clientId || entry.clientId === goal.clientId)
      .filter((entry) => !goal.projectId || entry.projectId === goal.projectId)
      .filter((entry) => !goal.categoryId || entry.categoryId === goal.categoryId);
    const actualMinutes = scopedEntries.reduce((sum, entry) => sum + entry.minutes + entry.overtimeMinutes, 0);
    const productiveMinutes = scopedEntries
      .filter((entry) => entry.category.kind === "PRODUCTIVE")
      .reduce((sum, entry) => sum + entry.minutes, 0);
    const overtimeMinutes = scopedEntries.reduce((sum, entry) => sum + entry.overtimeMinutes, 0);
    const targetPercent = goal.targetPercent ?? 100;
    const requiredMinutes =
      goal.metricKind === "MAX_OVERTIME_MINUTES"
        ? goal.targetMinutes ?? 0
        : goal.targetMinutes ?? Math.round(expectedMinutes * (targetPercent / 100));
    const measuredMinutes = goal.metricKind === "PRODUCTIVE_PERCENT" ? productiveMinutes : goal.metricKind === "MAX_OVERTIME_MINUTES" ? overtimeMinutes : actualMinutes;
    const percent =
      goal.metricKind === "MAX_OVERTIME_MINUTES"
        ? requiredMinutes
          ? Math.max(0, Math.round(100 - (measuredMinutes / requiredMinutes) * 100))
          : 100
        : requiredMinutes
          ? Math.round((measuredMinutes / requiredMinutes) * 100)
          : 0;
    const missingMinutes =
      goal.metricKind === "MAX_OVERTIME_MINUTES" ? Math.max(0, measuredMinutes - requiredMinutes) : Math.max(0, requiredMinutes - measuredMinutes);
    const met = goal.metricKind === "MAX_OVERTIME_MINUTES" ? measuredMinutes <= requiredMinutes : measuredMinutes >= requiredMinutes;

    return {
      id: goal.id,
      name: goal.name,
      period: goal.period,
      percent: Math.min(999, Math.max(0, percent)),
      actualMinutes: measuredMinutes,
      targetMinutes: requiredMinutes,
      missingMinutes,
      met,
      tone: met ? "success" : percent >= 70 ? "warning" : "danger",
      message: met
        ? goal.metricKind === "MAX_OVERTIME_MINUTES"
          ? "Excelente control del tiempo extra."
          : "Excelente progreso para este objetivo."
        : goal.metricKind === "MAX_OVERTIME_MINUTES"
          ? "El tiempo extra supero el objetivo."
          : `Te faltan ${missingMinutes} minutos para alcanzar el objetivo.`
    };
  });
}
