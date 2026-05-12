import { endOfDay, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
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
          code: true,
          client: { select: { id: true, name: true, code: true } }
        },
        orderBy: { name: "asc" }
      }),
      prisma.category.findMany({
        where: { active: true },
        select: { id: true, name: true, color: true },
        orderBy: { name: "asc" }
      })
    ]);

    return { projects, categories };
  },
  ["time-entry-catalogs-v2"],
  { revalidate: 300, tags: ["time-entry-context"] }
);

export async function getTimeEntryContext() {
  if (!process.env.DATABASE_URL) {
    return {
      projects: demoProjects,
      categories: demoCategories,
      favoriteProjects: demoProjects.slice(0, 2),
      templates: [],
      personalMetrics: demoPersonalMetrics,
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
    const [recentEntries, favoriteProjects, templates, workSchedule, personalEntries] = await Promise.all([
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
          category: { select: { name: true } },
          user: { select: { name: true, email: true } }
        },
        orderBy: [{ date: "desc" }, { updatedAt: "desc" }]
      }),
      prisma.timeEntryFavoriteProject.findMany({
        where: { userId },
        select: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              client: { select: { id: true, name: true, code: true } }
            }
          }
        },
        take: 8
      }),
      prisma.timeEntryTemplate.findMany({
        where: { active: true, OR: [{ userId: null }, { userId }] },
        select: {
          id: true,
          name: true,
          detail: true,
          observations: true,
          minutes: true,
          overtimeMinutes: true,
          projectId: true,
          categoryId: true,
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              client: { select: { id: true, name: true, code: true } }
            }
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 8
      }),
      prisma.workSchedule.findUnique({ where: { userId } }),
      prisma.timeEntry.findMany({
        where: { userId, date: { gte: startOfMonth(now) } },
        select: { date: true, minutes: true, overtimeMinutes: true }
      })
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

    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        client: project.client
      })),
      categories: categories.map((category) => ({ id: category.id, name: category.name, color: category.color })),
      favoriteProjects: favoriteProjects.map(({ project }) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        client: project.client
      })),
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        detail: template.detail,
        observations: template.observations,
        minutes: template.minutes,
        overtimeMinutes: template.overtimeMinutes,
        projectId: template.projectId,
        categoryId: template.categoryId,
        project: template.project
          ? {
              id: template.project.id,
              name: template.project.name,
              code: template.project.code,
              client: template.project.client
            }
          : null
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
        detail: entry.detail,
        observations: entry.observations,
        minutes: entry.minutes,
        overtimeMinutes: entry.overtimeMinutes
      }))
    };
  } catch {
    return {
      projects: demoProjects,
      categories: demoCategories,
      favoriteProjects: demoProjects.slice(0, 2),
      templates: [],
      personalMetrics: demoPersonalMetrics,
      workSchedule: { dailyMinutes: 480, weeklyMinutes: 2400, workdays: [1, 2, 3, 4, 5], modality: "HYBRID" },
      recentEntries: demoTimeEntries
    };
  }
}
