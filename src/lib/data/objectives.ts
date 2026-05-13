import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isAfter, min, startOfDay, startOfMonth, startOfWeek, subWeeks } from "date-fns";
import { unstable_cache } from "next/cache";
import { GoalMetricKind, GoalPeriod } from "@prisma/client";

import { auth } from "@/auth";
import { canManageObjectives, canViewGlobalReports } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type ObjectiveEntry = {
  userId: string;
  date: Date;
  minutes: number;
  overtimeMinutes: number;
  clientId: string;
  projectId: string;
  categoryId: string;
  createdAt: Date;
  client: { name: string };
  project: { name: string };
  category: { name: string; kind: string };
};

type GoalForEvaluation = {
  id: string;
  name: string;
  metricKind: string;
  period: string;
  targetPercent: number | null;
  targetMinutes: number | null;
  tolerancePercent: number;
  minDailyPercent: number | null;
  active: boolean;
  global: boolean;
  ownerId: string | null;
  clientId: string | null;
  projectId: string | null;
  categoryId: string | null;
  excludedUsers: ReadonlyArray<{ userId: string }>;
};

const fallbackGoal = {
  id: "default-min-expected",
  name: "Mantener 60% del total esperado",
  description: "Todos los dias laborales cargados deben llegar al menos al 50%.",
  metricKind: "MIN_EXPECTED_PERCENT",
  period: "WEEKLY",
  targetPercent: 60,
  targetMinutes: null,
  tolerancePercent: 0,
  minDailyPercent: 50,
  active: true,
  global: true,
  ownerId: null,
  clientId: null,
  projectId: null,
  categoryId: null,
  excludedUsers: []
} as const;

export async function getObjectivesData() {
  const session = await auth();
  const now = new Date();
  const todayKey = format(now, "yyyy-MM-dd");
  const globalScope = canViewGlobalReports(session);
  const scopeUserId = globalScope ? undefined : session?.user.id;
  const canManage = canManageObjectives(session);

  if (!process.env.DATABASE_URL || !session?.user.id) {
    return buildDemoObjectives(canManage);
  }

  return unstable_cache(
    () => buildObjectivesData({ now, scopeUserId, canManage }),
    ["objectives-dashboard-v1", globalScope ? "global" : `user:${scopeUserId}`, canManage ? "manage" : "view", todayKey],
    { revalidate: 90, tags: ["objectives-dashboard"] }
  )();
}

async function buildObjectivesData({
  now,
  scopeUserId,
  canManage
}: {
  now: Date;
  scopeUserId?: string;
  canManage: boolean;
}) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const entryStart = monthStart;
  const entryEnd = monthEnd;

  const allowedCollaboratorEmails = scopeUserId
    ? null
    : await prisma.allowedEmail.findMany({
        where: { role: "COLABORADOR" },
        select: { email: true }
      });
  const allowedEmailList = allowedCollaboratorEmails?.map((item) => item.email) ?? [];
  const users = await prisma.user.findMany({
    where: scopeUserId
      ? { id: scopeUserId, status: "ACTIVE" }
      : {
          status: "ACTIVE",
          role: "COLABORADOR",
          email: allowedEmailList.length ? { in: allowedEmailList } : "__NO_ACTIVE_COLLABORATORS__"
        },
    select: { id: true, name: true, email: true, workSchedule: { select: { dailyMinutes: true, workdays: true } } },
    orderBy: { name: "asc" }
  });
  const activeUserIds = users.map((user) => user.id);

  const [goalsRaw, entries, clients, projects, categories, historySettings] = await Promise.all([
    prisma.goalObjective.findMany({
      where: canManage ? {} : { active: true },
      include: { excludedUsers: { select: { userId: true } }, owner: { select: { name: true, email: true } } },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      take: 80
    }),
    prisma.timeEntry.findMany({
      where: {
        date: { gte: entryStart, lte: entryEnd },
        userId: activeUserIds.length ? { in: activeUserIds } : "__NO_ACTIVE_COLLABORATORS__"
      },
      select: {
        userId: true,
        date: true,
        minutes: true,
        overtimeMinutes: true,
        clientId: true,
        projectId: true,
        categoryId: true,
        createdAt: true,
        client: { select: { name: true } },
        project: { select: { name: true } },
        category: { select: { name: true, kind: true } }
      }
    }),
    canManage
      ? prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 })
      : Promise.resolve([]),
    canManage
      ? prisma.project.findMany({ select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" }, take: 300 })
      : Promise.resolve([]),
    canManage
      ? prisma.category.findMany({ select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    ensureGoalHistorySettings()
  ]);

  const goals = goalsRaw.length ? goalsRaw : [fallbackGoal];
  const userSummaries = users.map((user) => {
    const userEntries = entries.filter((entry) => entry.userId === user.id);
    const weekly = summarizeEntries(userEntries, weekStart, min([weekEnd, now]), user.workSchedule);
    const monthly = summarizeEntries(userEntries, monthStart, min([monthEnd, now]), user.workSchedule);
    return {
      id: user.id,
      name: user.name ?? user.email,
      weekly,
      monthly,
      noRecords: monthly.actualMinutes === 0
    };
  });

  const evaluations = goals.flatMap((goal) => {
    const excluded = new Set(goal.excludedUsers.map((item) => item.userId));

    return users
      .filter((user) => !excluded.has(user.id))
      .filter((user) => goal.global || goal.ownerId === user.id)
      .map((user) => {
        const periodStart = goal.period === "MONTHLY" ? monthStart : weekStart;
        const periodEnd = min([goal.period === "MONTHLY" ? monthEnd : weekEnd, now]);
        const scopedEntries = entries
          .filter((entry) => entry.userId === user.id)
          .filter((entry) => entry.date >= periodStart && entry.date <= periodEnd)
          .filter((entry) => !goal.clientId || entry.clientId === goal.clientId)
          .filter((entry) => !goal.projectId || entry.projectId === goal.projectId)
          .filter((entry) => !goal.categoryId || entry.categoryId === goal.categoryId);
        const summary = summarizeEntries(scopedEntries, periodStart, periodEnd, user.workSchedule);
        const result = evaluateGoal(goal, summary);

        return {
          id: `${goal.id}:${user.id}`,
          goalId: goal.id,
          userId: user.id,
          goalName: goal.name,
          collaborator: user.name ?? user.email,
          period: goal.period,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          metricKind: goal.metricKind,
          percent: result.percent,
          met: result.met,
          reason: result.reason,
          actualMinutes: summary.actualMinutes,
          expectedMinutes: summary.expectedMinutes,
          activeDays: summary.activeDays,
          overtimeMinutes: summary.overtimeMinutes
        };
      });
  });
  const dailyHistoryEnabled = historySettings.some((setting) => setting.frequency === "DAILY" && setting.enabled);
  const dailyEvaluations = dailyHistoryEnabled
    ? goals.flatMap((goal) => {
        const excluded = new Set(goal.excludedUsers.map((item) => item.userId));

        return users
          .filter((user) => !excluded.has(user.id))
          .filter((user) => goal.global || goal.ownerId === user.id)
          .map((user) => {
            const scopedEntries = entries
              .filter((entry) => entry.userId === user.id)
              .filter((entry) => entry.date >= dayStart && entry.date <= now)
              .filter((entry) => !goal.clientId || entry.clientId === goal.clientId)
              .filter((entry) => !goal.projectId || entry.projectId === goal.projectId)
              .filter((entry) => !goal.categoryId || entry.categoryId === goal.categoryId);
            const summary = summarizeEntries(scopedEntries, dayStart, now, user.workSchedule);
            const result = evaluateGoal(goal, summary);

            return {
              id: `${goal.id}:${user.id}:daily`,
              goalId: goal.id,
              userId: user.id,
              goalName: goal.name,
              collaborator: user.name ?? user.email,
              period: "DAILY",
              periodStart: dayStart.toISOString(),
              periodEnd: now.toISOString(),
              metricKind: goal.metricKind,
              percent: result.percent,
              met: result.met,
              reason: result.reason,
              actualMinutes: summary.actualMinutes,
              expectedMinutes: summary.expectedMinutes,
              activeDays: summary.activeDays,
              overtimeMinutes: summary.overtimeMinutes
            };
          });
      })
    : [];

  await Promise.all([
    persistGoalHistory(
      [...evaluations, ...dailyEvaluations].filter((item) => goalsRaw.some((goal) => goal.id === item.goalId)),
      historySettings
    ),
    ensureWeeklyCheckpoints({
      now,
      users,
      goals: goalsRaw,
      activeUserIds
    })
  ]);

  const [historyRows, checkpointRows] = await Promise.all([
    prisma.goalComplianceHistory.findMany({
    where: activeUserIds.length ? { userId: { in: activeUserIds } } : { userId: "__NO_ACTIVE_COLLABORATORS__" },
    select: {
      id: true,
      goalName: true,
      userName: true,
      period: true,
      periodStart: true,
      percent: true,
      met: true,
      reason: true,
      actualMinutes: true,
      expectedMinutes: true
    },
    orderBy: { periodStart: "desc" },
    take: 120
    }),
    prisma.goalCheckpoint.findMany({
      where: activeUserIds.length ? { userId: { in: activeUserIds } } : { userId: "__NO_ACTIVE_COLLABORATORS__" },
      select: {
        id: true,
        userName: true,
        periodStart: true,
        periodEnd: true,
        percent: true,
        met: true,
        actualMinutes: true,
        expectedMinutes: true,
        reachedGoals: true,
        missedGoals: true,
        trend: true,
        summary: true
      },
      orderBy: { periodStart: "desc" },
      take: 80
    })
  ]);

  const weeklyPercent = average(
    evaluations.filter((item) => item.period === "WEEKLY").map((item) => item.percent)
  );
  const monthlyPercent = average(
    evaluations.filter((item) => item.period === "MONTHLY").map((item) => item.percent)
  );
  const unmet = evaluations.filter((item) => !item.met);
  const ranking = [...userSummaries]
    .map((user) => ({
      id: user.id,
      name: user.name,
      percent: user.monthly.expectedMinutes ? Math.round((user.monthly.actualMinutes / user.monthly.expectedMinutes) * 100) : 0,
      minutes: user.monthly.actualMinutes
    }))
    .sort((a, b) => b.percent - a.percent);
  const clientRows = groupNamed(entries, "clientId", (entry) => entry.client.name);
  const projectRows = groupNamed(entries, "projectId", (entry) => entry.project.name);
  const trend = buildWeeklyTrend(entries, monthStart, now);
  const totalActual = userSummaries.reduce((sum, item) => sum + item.monthly.actualMinutes, 0);
  const elapsedWorkdays = Math.max(1, userSummaries.reduce((sum, item) => sum + item.monthly.elapsedWorkdays, 0));

  return {
    canManage,
    users: users.map((user) => ({ id: user.id, name: user.name ?? user.email })),
    clients,
    projects,
    categories,
    goals: goalsRaw.map((goal) => ({
      id: goal.id,
      name: goal.name,
      description: goal.description,
      metricKind: goal.metricKind,
      period: goal.period,
      targetPercent: goal.targetPercent,
      targetMinutes: goal.targetMinutes,
      tolerancePercent: goal.tolerancePercent,
      minDailyPercent: goal.minDailyPercent,
      active: goal.active,
      global: goal.global,
      ownerId: goal.ownerId,
      ownerName: goal.owner?.name ?? goal.owner?.email ?? null,
      clientId: goal.clientId,
      projectId: goal.projectId,
      categoryId: goal.categoryId,
      excludedUserIds: goal.excludedUsers.map((item) => item.userId)
    })),
    historySettings,
    summary: {
      weeklyPercent,
      monthlyPercent,
      unmetCount: unmet.length,
      noRecordUsers: userSummaries.filter((user) => user.noRecords).length,
      averageDailyMinutes: Math.round(totalActual / elapsedWorkdays),
      activeGoals: goals.filter((goal) => goal.active).length
    },
    evaluations,
    ranking,
    clientRows,
    projectRows,
    trend,
    historyRows: historyRows.map((row) => ({
      id: row.id,
      goalName: row.goalName,
      collaborator: row.userName,
      period: row.period,
      periodStart: row.periodStart.toISOString(),
      percent: Math.round(row.percent),
      met: row.met,
      reason: row.reason,
      actualMinutes: row.actualMinutes,
      expectedMinutes: row.expectedMinutes
    })),
    checkpointRows: checkpointRows.map((row) => ({
      id: row.id,
      collaborator: row.userName,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      percent: Math.round(row.percent),
      met: row.met,
      actualMinutes: row.actualMinutes,
      expectedMinutes: row.expectedMinutes,
      reachedGoals: row.reachedGoals,
      missedGoals: row.missedGoals,
      trend: row.trend,
      summary: row.summary
    })),
    historySummary: {
      snapshots: historyRows.length,
      checkpoints: checkpointRows.length,
      unmet: historyRows.filter((row) => !row.met).length
    },
    noRecordUsers: userSummaries.filter((user) => user.noRecords).map((user) => ({ id: user.id, name: user.name })),
    period: {
      week: `${format(weekStart, "dd/MM")} - ${format(min([weekEnd, now]), "dd/MM")}`,
      month: format(now, "MMMM yyyy")
    }
  };
}

async function ensureGoalHistorySettings() {
  const frequencies = ["DAILY", "WEEKLY", "MONTHLY"] as const;
  await Promise.all(
    frequencies.map((frequency) =>
      prisma.goalHistorySetting.upsert({
        where: { frequency },
        update: {},
        create: { frequency, enabled: true }
      })
    )
  );
  return prisma.goalHistorySetting.findMany({
    select: { frequency: true, enabled: true },
    orderBy: { frequency: "asc" }
  });
}

async function persistGoalHistory(
  evaluations: Array<{
    goalId: string;
    userId: string;
    goalName: string;
    collaborator: string;
    metricKind: string;
    period: string;
    periodStart: string;
    periodEnd: string;
    percent: number;
    met: boolean;
    reason: string;
    actualMinutes: number;
    expectedMinutes: number;
    overtimeMinutes: number;
    activeDays: number;
  }>,
  settings: Array<{ frequency: string; enabled: boolean }>
) {
  if (!evaluations.length) return;
  const enabled = new Set(settings.filter((setting) => setting.enabled).map((setting) => setting.frequency));
  if (!enabled.has("WEEKLY") && !enabled.has("MONTHLY") && !enabled.has("DAILY")) return;

  const snapshots = evaluations
    .filter((item) => enabled.has(item.period))
    .slice(0, 1000)
    .map((item) => {
    const periodStart = new Date(item.periodStart);
    const periodEnd = new Date(item.periodEnd);
    return {
      snapshotKey: `${item.goalId}:${item.userId}:${item.period}:${item.periodStart.slice(0, 10)}`,
      goalId: item.goalId,
      userId: item.userId,
      goalName: item.goalName,
      userName: item.collaborator,
      metricKind: item.metricKind as GoalMetricKind,
      period: item.period as GoalPeriod,
      periodStart,
      periodEnd,
      percent: item.percent,
      met: item.met,
      reason: item.reason,
      expectedMinutes: item.expectedMinutes,
      actualMinutes: item.actualMinutes,
      overtimeMinutes: item.overtimeMinutes,
      activeDays: item.activeDays,
      raw: {
        actualMinutes: item.actualMinutes,
        expectedMinutes: item.expectedMinutes,
        overtimeMinutes: item.overtimeMinutes,
        activeDays: item.activeDays
      }
    };
  });

  for (let index = 0; index < snapshots.length; index += 50) {
    const chunk = snapshots.slice(index, index + 50);
    await prisma.$transaction(
      chunk.map((snapshot) =>
        prisma.goalComplianceHistory.upsert({
          where: { snapshotKey: snapshot.snapshotKey },
          update: {
            goalName: snapshot.goalName,
            userName: snapshot.userName,
            percent: snapshot.percent,
            met: snapshot.met,
            reason: snapshot.reason,
            expectedMinutes: snapshot.expectedMinutes,
            actualMinutes: snapshot.actualMinutes,
            overtimeMinutes: snapshot.overtimeMinutes,
            activeDays: snapshot.activeDays,
            raw: snapshot.raw,
            calculatedAt: new Date()
          },
          create: snapshot
        })
      )
    );
  }
}

async function ensureWeeklyCheckpoints({
  now,
  users,
  goals,
  activeUserIds
}: {
  now: Date;
  users: Array<{ id: string; name: string | null; email: string; workSchedule: { dailyMinutes: number; workdays: number[] } | null }>;
  goals: GoalForEvaluation[];
  activeUserIds: string[];
}) {
  if (!activeUserIds.length || !goals.length) return;

  const weeklySetting = await prisma.goalHistorySetting.findUnique({ where: { frequency: "WEEKLY" }, select: { enabled: true } });
  if (!weeklySetting?.enabled) return;

  const previousWeekAnchor = subWeeks(now, 1);
  const periodStart = startOfWeek(previousWeekAnchor, { weekStartsOn: 1 });
  const periodEnd = endOfWeek(previousWeekAnchor, { weekStartsOn: 1 });
  const checkpointKeys = activeUserIds.map((userId) => `${userId}:WEEKLY:${format(periodStart, "yyyy-MM-dd")}`);
  const existing = await prisma.goalCheckpoint.findMany({
    where: { checkpointKey: { in: checkpointKeys } },
    select: { checkpointKey: true }
  });
  const existingKeys = new Set(existing.map((checkpoint) => checkpoint.checkpointKey));
  const missingUsers = users.filter((user) => !existingKeys.has(`${user.id}:WEEKLY:${format(periodStart, "yyyy-MM-dd")}`));
  if (!missingUsers.length) return;

  const [entries, previousCheckpoints] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId: { in: missingUsers.map((user) => user.id) },
        date: { gte: periodStart, lte: periodEnd },
        user: { status: "ACTIVE" }
      },
      select: {
        userId: true,
        date: true,
        minutes: true,
        overtimeMinutes: true,
        clientId: true,
        projectId: true,
        categoryId: true,
        createdAt: true,
        client: { select: { name: true } },
        project: { select: { name: true } },
        category: { select: { name: true, kind: true } }
      }
    }),
    prisma.goalCheckpoint.findMany({
      where: { userId: { in: missingUsers.map((user) => user.id) }, period: "WEEKLY", periodStart: { lt: periodStart } },
      select: { userId: true, percent: true, periodStart: true },
      orderBy: { periodStart: "desc" },
      take: missingUsers.length * 3
    })
  ]);
  const previousByUser = new Map<string, number>();
  for (const checkpoint of previousCheckpoints) {
    if (checkpoint.userId && !previousByUser.has(checkpoint.userId)) {
      previousByUser.set(checkpoint.userId, checkpoint.percent);
    }
  }

  const checkpoints = missingUsers.map((user) => {
    const userEntries = entries.filter((entry) => entry.userId === user.id);
    const weeklySummary = summarizeEntries(userEntries, periodStart, periodEnd, user.workSchedule);
    const excludedByGoal = new Map(goals.map((goal) => [goal.id, new Set(goal.excludedUsers.map((item) => item.userId))]));
    const evaluations = goals
      .filter((goal) => goal.active && goal.period === "WEEKLY")
      .filter((goal) => !excludedByGoal.get(goal.id)?.has(user.id))
      .filter((goal) => goal.global || goal.ownerId === user.id)
      .map((goal) => {
        const scopedEntries = userEntries
          .filter((entry) => !goal.clientId || entry.clientId === goal.clientId)
          .filter((entry) => !goal.projectId || entry.projectId === goal.projectId)
          .filter((entry) => !goal.categoryId || entry.categoryId === goal.categoryId);
        return { goal, result: evaluateGoal(goal, summarizeEntries(scopedEntries, periodStart, periodEnd, user.workSchedule)) };
      });
    const percent = evaluations.length ? average(evaluations.map((item) => item.result.percent)) : 0;
    const previousPercent = previousByUser.get(user.id);
    const trend = previousPercent === undefined ? "flat" : percent > previousPercent ? "positive" : percent < previousPercent ? "negative" : "flat";
    const reachedGoals = evaluations.filter((item) => item.result.met).length;
    const missedGoals = evaluations.length - reachedGoals;

    return {
      checkpointKey: `${user.id}:WEEKLY:${format(periodStart, "yyyy-MM-dd")}`,
      userId: user.id,
      userName: user.name ?? user.email,
      period: "WEEKLY" as const,
      periodStart,
      periodEnd,
      percent,
      met: missedGoals === 0 && evaluations.length > 0,
      expectedMinutes: weeklySummary.expectedMinutes,
      actualMinutes: weeklySummary.actualMinutes,
      reachedGoals,
      missedGoals,
      trend,
      summary:
        missedGoals === 0 && evaluations.length > 0
          ? "Semana cerrada con todos los objetivos cumplidos."
          : `Semana cerrada con ${reachedGoals} objetivos cumplidos y ${missedGoals} pendientes.`,
      raw: {
        evaluations: evaluations.map((item) => ({
          goalId: item.goal.id,
          goalName: item.goal.name,
          percent: item.result.percent,
          met: item.result.met,
          reason: item.result.reason
        }))
      }
    };
  });

  for (let index = 0; index < checkpoints.length; index += 50) {
    await prisma.goalCheckpoint.createMany({
      data: checkpoints.slice(index, index + 50),
      skipDuplicates: true
    });
  }
}

function summarizeEntries(
  entries: ObjectiveEntry[],
  start: Date,
  end: Date,
  schedule?: { dailyMinutes: number; workdays: number[] } | null
) {
  const workdays = schedule?.workdays?.length ? schedule.workdays : [1, 2, 3, 4, 5];
  const dailyMinutes = schedule?.dailyMinutes ?? 480;
  const elapsedDays = eachDayOfInterval({ start, end }).filter((day) => workdays.includes(day.getDay()) && !isAfter(day, new Date()));
  const byDay = new Map<string, number>();
  let actualMinutes = 0;
  let overtimeMinutes = 0;
  let productiveMinutes = 0;
  let internalMinutes = 0;
  let entryDelayTotal = 0;

  for (const entry of entries) {
    const key = format(entry.date, "yyyy-MM-dd");
    const total = entry.minutes + entry.overtimeMinutes;
    byDay.set(key, (byDay.get(key) ?? 0) + total);
    actualMinutes += total;
    overtimeMinutes += entry.overtimeMinutes;

    if (entry.category.kind === "PRODUCTIVE") {
      productiveMinutes += entry.minutes;
    } else {
      internalMinutes += entry.minutes;
    }

    const entryDayEnd = new Date(`${format(entry.date, "yyyy-MM-dd")}T23:59:59`);
    entryDelayTotal += Math.max(0, Math.round((entry.createdAt.getTime() - entryDayEnd.getTime()) / 60000));
  }

  return {
    expectedMinutes: elapsedDays.length * dailyMinutes,
    actualMinutes,
    overtimeMinutes,
    productiveMinutes,
    internalMinutes,
    activeDays: Array.from(byDay.values()).filter((minutes) => minutes > 0).length,
    elapsedWorkdays: elapsedDays.length,
    dailyCompletionPercent: elapsedDays.length
      ? Math.round((elapsedDays.filter((day) => (byDay.get(format(day, "yyyy-MM-dd")) ?? 0) >= dailyMinutes * 0.5).length / elapsedDays.length) * 100)
      : 0,
    averageEntryDelayMinutes: entries.length ? Math.round(entryDelayTotal / entries.length) : 0,
    byDay,
    workdayKeys: elapsedDays.map((day) => format(day, "yyyy-MM-dd")),
    dailyMinutes
  };
}

function evaluateGoal(goal: GoalForEvaluation, summary: ReturnType<typeof summarizeEntries>) {
  const targetPercent = goal.targetPercent ?? 100;
  const targetMinutes = goal.targetMinutes ?? 0;
  const tolerance = goal.tolerancePercent ?? 0;
  const totalPercent = summary.expectedMinutes ? Math.round((summary.actualMinutes / summary.expectedMinutes) * 100) : 0;
  const productivePercent = summary.actualMinutes ? Math.round((summary.productiveMinutes / summary.actualMinutes) * 100) : 0;

  switch (goal.metricKind) {
    case "DAILY_MIN_PERCENT": {
      const met = summary.dailyCompletionPercent >= targetPercent - tolerance;
      return { percent: summary.dailyCompletionPercent, met, reason: `${summary.dailyCompletionPercent}% de dias laborales cumplen el minimo` };
    }
    case "MIN_WEEKLY_MINUTES": {
      const percent = targetMinutes ? Math.round((summary.actualMinutes / targetMinutes) * 100) : totalPercent;
      return { percent, met: summary.actualMinutes >= targetMinutes, reason: `${summary.actualMinutes} minutos cargados` };
    }
    case "MAX_OVERTIME_MINUTES": {
      const percent = targetMinutes ? Math.round((summary.overtimeMinutes / targetMinutes) * 100) : 0;
      return { percent, met: summary.overtimeMinutes <= targetMinutes, reason: `${summary.overtimeMinutes} minutos extra` };
    }
    case "MIN_ACTIVE_DAYS": {
      const targetDays = Math.max(1, targetMinutes);
      const percent = Math.round((summary.activeDays / targetDays) * 100);
      return { percent, met: summary.activeDays >= targetDays, reason: `${summary.activeDays} dias con actividad` };
    }
    case "PRODUCTIVE_PERCENT": {
      const met = productivePercent >= targetPercent - tolerance;
      return { percent: productivePercent, met, reason: `${productivePercent}% productivo` };
    }
    case "REDUCE_INTERNAL_MINUTES": {
      const percent = targetMinutes ? Math.round((summary.internalMinutes / targetMinutes) * 100) : 0;
      return { percent, met: summary.internalMinutes <= targetMinutes, reason: `${summary.internalMinutes} minutos internos` };
    }
    case "AVG_ENTRY_DELAY_MINUTES": {
      const percent = targetMinutes ? Math.round((summary.averageEntryDelayMinutes / targetMinutes) * 100) : 0;
      return { percent, met: summary.averageEntryDelayMinutes <= targetMinutes, reason: `${summary.averageEntryDelayMinutes} min promedio de demora` };
    }
    default: {
      const dailyMin = goal.minDailyPercent ?? 0;
      const daysMet = dailyMin
        ? summary.workdayKeys.filter((key) => (summary.byDay.get(key) ?? 0) >= summary.dailyMinutes * (dailyMin / 100)).length
        : summary.elapsedWorkdays;
      const everyDayMet = dailyMin ? summary.elapsedWorkdays === 0 || daysMet === summary.elapsedWorkdays : true;
      const met = totalPercent >= targetPercent - tolerance && everyDayMet;
      return { percent: totalPercent, met, reason: `${totalPercent}% del esperado${dailyMin ? `, minimo diario ${dailyMin}%` : ""}` };
    }
  }
}

function groupNamed(entries: ObjectiveEntry[], key: "clientId" | "projectId", nameFor: (entry: ObjectiveEntry) => string) {
  const grouped = new Map<string, { id: string; name: string; minutes: number }>();

  for (const entry of entries) {
    const id = entry[key];
    const current = grouped.get(id) ?? { id, name: nameFor(entry), minutes: 0 };
    current.minutes += entry.minutes + entry.overtimeMinutes;
    grouped.set(id, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8);
}

function buildWeeklyTrend(entries: ObjectiveEntry[], monthStart: Date, now: Date) {
  const rows: Array<{ label: string; minutes: number }> = [];
  let cursor = startOfWeek(monthStart, { weekStartsOn: 1 });

  while (cursor <= now) {
    const start = cursor;
    const end = min([endOfWeek(start, { weekStartsOn: 1 }), now]);
    rows.push({
      label: format(start, "dd/MM"),
      minutes: entries
        .filter((entry) => entry.date >= start && entry.date <= end)
        .reduce((sum, entry) => sum + entry.minutes + entry.overtimeMinutes, 0)
    });
    cursor = addDays(end, 1);
  }

  return rows;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildDemoObjectives(canManage: boolean) {
  return {
    canManage,
    users: [],
    clients: [],
    projects: [],
    categories: [],
    goals: [],
    historySettings: [
      { frequency: "DAILY", enabled: true },
      { frequency: "WEEKLY", enabled: true },
      { frequency: "MONTHLY", enabled: true }
    ],
    summary: { weeklyPercent: 0, monthlyPercent: 0, unmetCount: 0, noRecordUsers: 0, averageDailyMinutes: 0, activeGoals: 0 },
    evaluations: [],
    ranking: [],
    clientRows: [],
    projectRows: [],
    trend: [],
    historyRows: [],
    checkpointRows: [],
    historySummary: { snapshots: 0, checkpoints: 0, unmet: 0 },
    noRecordUsers: [],
    period: { week: "Sin datos", month: "Sin datos" }
  };
}
