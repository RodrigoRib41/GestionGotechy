"use server";

import { AuditAction, Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { reportDeletePreviewSchema, reportDeleteSchema } from "@/lib/validators";

type DeleteRange = {
  where: Prisma.TimeEntryWhereInput;
  label: string;
  from?: string;
  to?: string;
};

export async function previewTimeHistoryDelete(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`report-delete-preview:${session.user.id}`, 20, 60_000);

  const parsed = reportDeletePreviewSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Rango invalido" };
  }

  const range = buildDeleteRange(parsed.data);
  const summary = await getDeleteSummary(range.where);

  return { ok: true, message: "Resumen calculado", summary: { ...summary, label: range.label, from: range.from, to: range.to } };
}

export async function deleteTimeHistory(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`report-delete:${session.user.id}`, 5, 60_000);

  const parsed = reportDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  if (parsed.data.confirmation !== "BORRAR") {
    return { ok: false, message: "Escribi BORRAR para confirmar" };
  }

  const configuredPin = process.env.REPORT_DELETE_PIN;

  if (!configuredPin) {
    return { ok: false, message: "REPORT_DELETE_PIN no esta configurado en el servidor" };
  }

  if (parsed.data.pin !== configuredPin) {
    return { ok: false, message: "PIN invalido" };
  }

  const range = buildDeleteRange(parsed.data);
  const summary = await getDeleteSummary(range.where);

  if (summary.count === 0) {
    return { ok: false, message: "No hay registros para borrar" };
  }

  const [deleted] = await prisma.$transaction([
    prisma.timeEntry.deleteMany({ where: range.where }),
    prisma.auditLog.create({
      data: {
        action: AuditAction.DELETE,
        entity: "TimeEntryHistory",
        actorId: session.user.id,
        metadata: {
          mode: parsed.data.mode,
          from: range.from ?? null,
          to: range.to ?? null,
          label: range.label,
          affectedCount: summary.count,
          minutes: summary.minutes,
          overtimeMinutes: summary.overtimeMinutes
        }
      }
    })
  ]);

  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/time");
  revalidatePath("/objectives");
  revalidateTag("dashboard-metrics");
  revalidateTag("time-entry-context");
  revalidateTag("objectives-dashboard");

  return { ok: true, message: `${deleted.count} registros borrados`, deletedCount: deleted.count };
}

function buildDeleteRange(input: { mode: "all" | "range"; from?: string; to?: string }): DeleteRange {
  if (input.mode === "all") {
    return { where: {}, label: "Todo el historial" };
  }

  const start = new Date(`${input.from}T00:00:00`);
  const end = new Date(`${input.to}T23:59:59.999`);

  return {
    where: { date: { gte: start, lte: end } },
    label: `${input.from} a ${input.to}`,
    from: input.from,
    to: input.to
  };
}

async function getDeleteSummary(where: Prisma.TimeEntryWhereInput) {
  const [aggregate, users, projects] = await Promise.all([
    prisma.timeEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { minutes: true, overtimeMinutes: true }
    }),
    prisma.timeEntry.groupBy({ by: ["userId"], where }),
    prisma.timeEntry.groupBy({ by: ["projectId"], where })
  ]);

  return {
    count: aggregate._count._all,
    minutes: aggregate._sum.minutes ?? 0,
    overtimeMinutes: aggregate._sum.overtimeMinutes ?? 0,
    collaborators: users.length,
    projects: projects.length
  };
}
