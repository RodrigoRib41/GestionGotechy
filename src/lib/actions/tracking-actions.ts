"use server";

import { AuditAction, Role, TrackingHistoryAction, TrackingTaskPriority } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { canExportTracking, canManageTracking, requireRole, requireSession } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  trackingCommentSchema,
  trackingStatusSchema,
  trackingTaskPatchSchema,
  trackingTaskSchema,
  trackingTaskStatusChangeSchema,
  trackingTimeLogSchema
} from "@/lib/validators";

function revalidateTracking() {
  revalidatePath("/tracking");
  revalidateTag("tracking-data");
}

function canTouchTask(session: Awaited<ReturnType<typeof requireSession>>, task: { assigneeId: string }) {
  return canManageTracking(session) || task.assigneeId === session.user.id;
}

export async function createTrackingTask(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`tracking-create:${session.user.id}`, 40, 60_000);
  const parsed = trackingTaskSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const [project, status, assignee] = await Promise.all([
    prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true, clientId: true, status: true } }),
    prisma.trackingTaskStatus.findUnique({ where: { id: parsed.data.statusId }, select: { id: true, active: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { id: true, status: true } })
  ]);

  if (!project || project.clientId !== parsed.data.clientId || project.status !== "ACTIVE") {
    return { ok: false, message: "El proyecto no pertenece al cliente seleccionado o esta inactivo" };
  }

  if (!status?.active) {
    return { ok: false, message: "El estado seleccionado no esta activo" };
  }

  if (!assignee || assignee.status !== "ACTIVE") {
    return { ok: false, message: "El responsable seleccionado no esta activo" };
  }

  const dueDate = parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00`) : null;
  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.trackingTask.create({
      data: {
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim(),
        clientId: parsed.data.clientId,
        projectId: parsed.data.projectId,
        assigneeId: parsed.data.assigneeId,
        createdById: session.user.id,
        statusId: parsed.data.statusId,
        priority: parsed.data.priority as TrackingTaskPriority,
        dueDate,
        estimatedMinutes: parsed.data.estimatedMinutes,
        tags: parsed.data.tags
      },
      select: { id: true }
    });

    await tx.trackingTaskHistory.create({
      data: {
        taskId: created.id,
        actorId: session.user.id,
        action: TrackingHistoryAction.CREATE,
        message: "Tarea creada",
        toValue: {
          title: parsed.data.title,
          assigneeId: parsed.data.assigneeId,
          statusId: parsed.data.statusId
        }
      }
    });

    return created;
  });

  await prisma.auditLog.create({
    data: { action: AuditAction.CREATE, entity: "TrackingTask", entityId: task.id, actorId: session.user.id }
  });

  revalidateTracking();
  return { ok: true, message: "Tarea creada" };
}

export async function patchTrackingTask(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`tracking-patch:${session.user.id}`, 80, 60_000);
  const parsed = trackingTaskPatchSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const existing = await prisma.trackingTask.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      title: true,
      description: true,
      clientId: true,
      projectId: true,
      assigneeId: true,
      statusId: true,
      priority: true,
      dueDate: true,
      estimatedMinutes: true,
      tags: true
    }
  });

  if (!existing) {
    return { ok: false, message: "La tarea no existe" };
  }

  const clientId = parsed.data.clientId ?? existing.clientId;
  const projectId = parsed.data.projectId ?? existing.projectId;
  const assigneeId = parsed.data.assigneeId ?? existing.assigneeId;
  const statusId = parsed.data.statusId ?? existing.statusId;
  const [project, status, assignee] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true, status: true } }),
    prisma.trackingTaskStatus.findUnique({ where: { id: statusId }, select: { active: true, isFinal: true } }),
    prisma.user.findUnique({ where: { id: assigneeId }, select: { status: true } })
  ]);

  if (!project || project.clientId !== clientId || project.status !== "ACTIVE") {
    return { ok: false, message: "El proyecto no pertenece al cliente seleccionado o esta inactivo" };
  }

  if (!status?.active) {
    return { ok: false, message: "El estado seleccionado no esta activo" };
  }

  if (!assignee || assignee.status !== "ACTIVE") {
    return { ok: false, message: "El responsable seleccionado no esta activo" };
  }

  const dueDate = parsed.data.dueDate !== undefined && parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00`) : parsed.data.dueDate === "" ? null : undefined;
  const next = {
    title: parsed.data.title?.trim(),
    description: parsed.data.description?.trim(),
    clientId: parsed.data.clientId,
    projectId: parsed.data.projectId,
    assigneeId: parsed.data.assigneeId,
    statusId: parsed.data.statusId,
    priority: parsed.data.priority as TrackingTaskPriority | undefined,
    dueDate,
    estimatedMinutes: parsed.data.estimatedMinutes,
    tags: parsed.data.tags,
    closedAt: status.isFinal ? new Date() : null
  };

  await prisma.$transaction([
    prisma.trackingTask.update({ where: { id: existing.id }, data: next }),
    prisma.trackingTaskHistory.create({
      data: {
        taskId: existing.id,
        actorId: session.user.id,
        action: existing.assigneeId !== assigneeId ? TrackingHistoryAction.ASSIGNEE_CHANGE : TrackingHistoryAction.UPDATE,
        message: "Tarea actualizada",
        fromValue: existing,
        toValue: parsed.data
      }
    })
  ]);

  await prisma.auditLog.create({
    data: { action: AuditAction.UPDATE, entity: "TrackingTask", entityId: existing.id, actorId: session.user.id }
  });

  revalidateTracking();
  return { ok: true, message: "Tarea actualizada" };
}

export async function changeTrackingTaskStatus(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-status:${session.user.id}`, 120, 60_000);
  const parsed = trackingTaskStatusChangeSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const [task, nextStatus] = await Promise.all([
    prisma.trackingTask.findUnique({
      where: { id: parsed.data.taskId },
      select: { id: true, assigneeId: true, statusId: true, status: { select: { name: true, isFinal: true } } }
    }),
    prisma.trackingTaskStatus.findUnique({
      where: { id: parsed.data.statusId },
      select: { id: true, name: true, active: true, isFinal: true }
    })
  ]);

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (!canTouchTask(session, task)) {
    return { ok: false, message: "No podes actualizar esta tarea" };
  }

  if (!nextStatus?.active) {
    return { ok: false, message: "El estado seleccionado no esta activo" };
  }

  if (task.statusId === nextStatus.id) {
    return { ok: true, message: "Sin cambios" };
  }

  const action = nextStatus.isFinal ? TrackingHistoryAction.CLOSE : task.status.isFinal ? TrackingHistoryAction.REOPEN : TrackingHistoryAction.STATUS_CHANGE;

  await prisma.$transaction([
    prisma.trackingTask.update({
      where: { id: task.id },
      data: {
        statusId: nextStatus.id,
        closedAt: nextStatus.isFinal ? new Date() : null
      }
    }),
    prisma.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action,
        message: `Estado: ${task.status.name} -> ${nextStatus.name}`,
        fromValue: { statusId: task.statusId, name: task.status.name },
        toValue: { statusId: nextStatus.id, name: nextStatus.name }
      }
    })
  ]);

  revalidateTracking();
  return { ok: true, message: nextStatus.isFinal ? "Tarea cerrada" : task.status.isFinal ? "Tarea reabierta" : "Estado actualizado" };
}

export async function addTrackingComment(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-comment:${session.user.id}`, 80, 60_000);
  const parsed = trackingCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const task = await prisma.trackingTask.findUnique({ where: { id: parsed.data.taskId }, select: { id: true, assigneeId: true } });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (!canTouchTask(session, task)) {
    return { ok: false, message: "No podes comentar esta tarea" };
  }

  await prisma.$transaction([
    prisma.trackingTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } }),
    prisma.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action: TrackingHistoryAction.COMMENT,
        message: parsed.data.message.trim()
      }
    })
  ]);

  revalidateTracking();
  return { ok: true, message: "Comentario agregado" };
}

export async function logTrackingTaskTime(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-time:${session.user.id}`, 80, 60_000);
  const parsed = trackingTimeLogSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const task = await prisma.trackingTask.findUnique({ where: { id: parsed.data.taskId }, select: { id: true, assigneeId: true, consumedMinutes: true } });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (!canTouchTask(session, task)) {
    return { ok: false, message: "No podes imputar tiempo en esta tarea" };
  }

  await prisma.$transaction([
    prisma.trackingTask.update({
      where: { id: task.id },
      data: { consumedMinutes: { increment: parsed.data.minutes } }
    }),
    prisma.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action: TrackingHistoryAction.TIME_LOGGED,
        minutes: parsed.data.minutes,
        message: parsed.data.message?.trim() || `Tiempo imputado: ${parsed.data.minutes}m`
      }
    })
  ]);

  revalidateTracking();
  return { ok: true, message: "Tiempo imputado" };
}

export async function upsertTrackingStatus(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  const parsed = trackingStatusSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const data = {
    name: parsed.data.name.trim(),
    color: parsed.data.color,
    active: parsed.data.active,
    sortOrder: parsed.data.sortOrder,
    isFinal: parsed.data.isFinal,
    isBlocked: parsed.data.isBlocked
  };
  const status = parsed.data.id
    ? await prisma.trackingTaskStatus.update({ where: { id: parsed.data.id }, data })
    : await prisma.trackingTaskStatus.create({ data });

  await prisma.auditLog.create({
    data: { action: AuditAction.CONFIG_CHANGE, entity: "TrackingTaskStatus", entityId: status.id, actorId: session.user.id }
  });

  revalidateTracking();
  return { ok: true, message: parsed.data.id ? "Estado actualizado" : "Estado creado" };
}

export async function deleteTrackingStatus(statusId: string) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  const count = await prisma.trackingTask.count({ where: { statusId } });

  if (count > 0) {
    await prisma.trackingTaskStatus.update({ where: { id: statusId }, data: { active: false } });
    revalidateTracking();
    return { ok: true, message: "Estado desactivado porque tiene tareas asociadas" };
  }

  await prisma.trackingTaskStatus.delete({ where: { id: statusId } });
  await prisma.auditLog.create({
    data: { action: AuditAction.CONFIG_CHANGE, entity: "TrackingTaskStatus", entityId: statusId, actorId: session.user.id }
  });

  revalidateTracking();
  return { ok: true, message: "Estado eliminado" };
}

export async function logTrackingExport(format: "CSV" | "XLSX" | "PDF") {
  const session = await requireSession();

  if (!canExportTracking(session)) {
    return { ok: false, message: "No tenes permisos para exportar" };
  }

  await prisma.auditLog.create({
    data: { action: AuditAction.EXPORT, entity: "Tracking", actorId: session.user.id, metadata: { format } }
  });

  return { ok: true, message: "Exportacion registrada" };
}
