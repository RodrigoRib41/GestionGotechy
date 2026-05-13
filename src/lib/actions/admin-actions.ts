"use server";

import { AuditAction, Prisma } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getDatabaseState } from "@/lib/data/resources";
import { requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { auditDeletePreviewSchema, auditDeleteSchema } from "@/lib/validators";

export async function previewAuditLogDelete(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`audit-delete-preview:${session.user.id}`, 20, 60_000);

  const parsed = auditDeletePreviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Rango invalido" };
  }

  const range = buildAuditDeleteRange(parsed.data);
  const summary = await getAuditDeleteSummary(range.where);

  return { ok: true, message: "Resumen calculado", summary: { ...summary, label: range.label, from: range.from, to: range.to } };
}

export async function deleteAuditLogs(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`audit-delete:${session.user.id}`, 5, 60_000);

  const parsed = auditDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  if (parsed.data.confirmation !== "BORRAR") {
    return { ok: false, message: "Escribi BORRAR para confirmar" };
  }

  const configuredPin = process.env.AUDIT_DELETE_PIN || process.env.REPORT_DELETE_PIN;
  if (!configuredPin) {
    return { ok: false, message: "AUDIT_DELETE_PIN o REPORT_DELETE_PIN no esta configurado en el servidor" };
  }

  if (parsed.data.pin !== configuredPin) {
    return { ok: false, message: "PIN invalido" };
  }

  const range = buildAuditDeleteRange(parsed.data);
  const summary = await getAuditDeleteSummary(range.where);

  if (summary.count === 0) {
    return { ok: false, message: "No hay logs para eliminar" };
  }

  const [, audit] = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: range.where }),
    prisma.auditLog.create({
      data: {
        action: AuditAction.DELETE,
        entity: "AuditLog",
        actorId: session.user.id,
        metadata: {
          mode: parsed.data.mode,
          from: range.from ?? null,
          to: range.to ?? null,
          label: range.label,
          affectedCount: summary.count
        }
      }
    })
  ]);

  revalidatePath("/admin");
  revalidateTag("admin-database-state");
  return { ok: true, message: `${summary.count} logs eliminados`, auditId: audit.id };
}

export async function loadDatabaseState() {
  await requireSuperadmin();
  return { ok: true, state: await getDatabaseState() };
}

function buildAuditDeleteRange(input: { mode: "all" | "range"; from?: string; to?: string }) {
  if (input.mode === "all") {
    return { where: {}, label: "Todo el historial" };
  }

  return {
    where: {
      createdAt: {
        gte: new Date(`${input.from}T00:00:00`),
        lte: new Date(`${input.to}T23:59:59.999`)
      }
    },
    label: `${input.from} a ${input.to}`,
    from: input.from,
    to: input.to
  } satisfies { where: Prisma.AuditLogWhereInput; label: string; from?: string; to?: string };
}

async function getAuditDeleteSummary(where: Prisma.AuditLogWhereInput) {
  const [count, byAction, byEntity] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["action"], where, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["entity"], where, _count: { _all: true } })
  ]);

  return {
    count,
    actions: byAction.length,
    modules: byEntity.length
  };
}
