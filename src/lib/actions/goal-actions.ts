"use server";

import { GoalHistoryFrequency, GoalMetricKind, GoalPeriod, Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { buildGoalCopy } from "@/lib/goal-copy";
import { goalHistoryDeletePreviewSchema, goalHistoryDeleteSchema, goalHistorySettingsSchema, goalObjectiveSchema } from "@/lib/validators";

export async function upsertGoalObjective(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`goal-upsert:${session.user.id}`, 30, 60_000);

  const parsed = goalObjectiveSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const copy = buildGoalCopy(parsed.data);
  const data = {
    name: copy.title,
    description: copy.description,
    metricKind: parsed.data.metricKind as GoalMetricKind,
    period: parsed.data.period as GoalPeriod,
    targetPercent: parsed.data.targetPercent ?? null,
    targetMinutes: parsed.data.targetMinutes ?? null,
    tolerancePercent: parsed.data.tolerancePercent,
    minDailyPercent: parsed.data.minDailyPercent ?? null,
    active: parsed.data.active,
    global: parsed.data.global,
    ownerId: parsed.data.global ? null : parsed.data.ownerId || null,
    clientId: parsed.data.clientId || null,
    projectId: parsed.data.projectId || null,
    categoryId: parsed.data.categoryId || null
  };

  const goal = await prisma.$transaction(async (tx) => {
    const saved = parsed.data.id
      ? await tx.goalObjective.update({ where: { id: parsed.data.id }, data })
      : await tx.goalObjective.create({ data });

    await tx.goalObjectiveExclusion.deleteMany({ where: { goalId: saved.id } });

    if (parsed.data.excludedUserIds.length) {
      await tx.goalObjectiveExclusion.createMany({
        data: parsed.data.excludedUserIds.map((userId) => ({ goalId: saved.id, userId })),
        skipDuplicates: true
      });
    }

    return saved;
  });

  revalidateTag("objectives-dashboard");
  revalidatePath("/objectives");
  return { ok: true, message: parsed.data.id ? "Objetivo actualizado" : "Objetivo creado", goalId: goal.id, copy };
}

export async function toggleGoalObjective(goalId: string) {
  const session = await requireSuperadmin();
  assertRateLimit(`goal-toggle:${session.user.id}`, 30, 60_000);

  const goal = await prisma.goalObjective.findUnique({ where: { id: goalId }, select: { active: true } });

  if (!goal) {
    return { ok: false, message: "Objetivo inexistente" };
  }

  const updated = await prisma.goalObjective.update({ where: { id: goalId }, data: { active: !goal.active } });

  revalidateTag("objectives-dashboard");
  revalidatePath("/objectives");
  return { ok: true, message: updated.active ? "Objetivo activado" : "Objetivo desactivado" };
}

export async function updateGoalHistorySettings(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`goal-history-settings:${session.user.id}`, 20, 60_000);

  const parsed = goalHistorySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Configuración inválida" };
  }

  await prisma.$transaction(
    parsed.data.settings.map((setting) =>
      prisma.goalHistorySetting.upsert({
        where: { frequency: setting.frequency as GoalHistoryFrequency },
        update: { enabled: setting.enabled },
        create: { frequency: setting.frequency as GoalHistoryFrequency, enabled: setting.enabled }
      })
    )
  );

  revalidateTag("objectives-dashboard");
  revalidatePath("/objectives");
  return { ok: true, message: "Historiales actualizados" };
}

export async function previewGoalHistoryDelete(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`goal-history-delete-preview:${session.user.id}`, 20, 60_000);

  const parsed = goalHistoryDeletePreviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Rango inválido" };
  }

  const range = buildGoalHistoryDeleteRange(parsed.data);
  const summary = await getGoalHistoryDeleteSummary(range.historyWhere, range.checkpointWhere);
  return { ok: true, message: "Resumen calculado", summary: { ...summary, label: range.label, from: range.from, to: range.to } };
}

export async function deleteGoalHistory(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`goal-history-delete:${session.user.id}`, 5, 60_000);

  const parsed = goalHistoryDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  if (parsed.data.confirmation !== "BORRAR") {
    return { ok: false, message: "Escribí BORRAR para confirmar" };
  }

  const configuredPin = process.env.GOAL_HISTORY_DELETE_PIN || process.env.REPORT_DELETE_PIN;
  if (!configuredPin) {
    return { ok: false, message: "GOAL_HISTORY_DELETE_PIN o REPORT_DELETE_PIN no está configurado en el servidor" };
  }

  if (parsed.data.pin !== configuredPin) {
    return { ok: false, message: "PIN inválido" };
  }

  const range = buildGoalHistoryDeleteRange(parsed.data);
  const summary = await getGoalHistoryDeleteSummary(range.historyWhere, range.checkpointWhere);

  if (summary.count === 0 && summary.checkpoints === 0) {
    return { ok: false, message: "No hay historial para eliminar" };
  }

  await prisma.$transaction([
    prisma.goalComplianceHistory.deleteMany({ where: range.historyWhere }),
    prisma.goalCheckpoint.deleteMany({ where: range.checkpointWhere })
  ]);

  revalidateTag("objectives-dashboard");
  revalidatePath("/objectives");
  return { ok: true, message: `${summary.count} snapshots y ${summary.checkpoints} checkpoints eliminados` };
}

function buildGoalHistoryDeleteRange(input: { mode: "all" | "range"; from?: string; to?: string; period?: GoalPeriod }) {
  const historyWhere: Prisma.GoalComplianceHistoryWhereInput = {
    ...(input.period ? { period: input.period } : {})
  };
  const checkpointWhere: Prisma.GoalCheckpointWhereInput = {
    ...(input.period ? { period: input.period } : {})
  };

  if (input.mode === "range") {
    historyWhere.periodStart = {
      gte: new Date(`${input.from}T00:00:00`),
      lte: new Date(`${input.to}T23:59:59.999`)
    };
    checkpointWhere.periodStart = {
      gte: new Date(`${input.from}T00:00:00`),
      lte: new Date(`${input.to}T23:59:59.999`)
    };
  }

  return {
    historyWhere,
    checkpointWhere,
    label: input.mode === "all" ? "Todo el historial" : `${input.from} a ${input.to}`,
    from: input.from,
    to: input.to
  };
}

async function getGoalHistoryDeleteSummary(historyWhere: Prisma.GoalComplianceHistoryWhereInput, checkpointWhere: Prisma.GoalCheckpointWhereInput) {
  const [count, checkpoints, byPeriod, unmet] = await Promise.all([
    prisma.goalComplianceHistory.count({ where: historyWhere }),
    prisma.goalCheckpoint.count({ where: checkpointWhere }),
    prisma.goalComplianceHistory.groupBy({ by: ["period"], where: historyWhere, _count: { _all: true } }),
    prisma.goalComplianceHistory.count({ where: { ...historyWhere, met: false } })
  ]);

  return {
    count,
    checkpoints,
    periods: byPeriod.length,
    unmet
  };
}
