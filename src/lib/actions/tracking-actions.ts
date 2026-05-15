"use server";

import { Role, TrackingHistoryAction, TrackingTaskPriority } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { canExportTracking, canManageTracking, requireRole, requireSession, requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { createNotificationWithRealtime, emitTrackingRealtimeEvent } from "@/lib/realtime";
import { getFreshTrackingData } from "@/lib/data/tracking";
import {
  trackingCommentDeleteSchema,
  trackingCommentEditSchema,
  trackingCommentSchema,
  trackingStatusSchema,
  trackingTaskBulkDeleteSchema,
  trackingTaskBulkUpdateSchema,
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

export async function loadTrackingSnapshot() {
  await requireSession();
  return getFreshTrackingData();
}

const notificationPriorityLabels: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente"
};

export async function createTrackingTask(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`tracking-create:${session.user.id}`, 40, 60_000);
  const parsed = trackingTaskSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const [project, status, assignee] = await Promise.all([
    prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true, name: true, clientId: true, status: true, client: { select: { name: true } } } }),
    prisma.trackingTaskStatus.findUnique({ where: { id: parsed.data.statusId }, select: { id: true, name: true, active: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { id: true, name: true, email: true, status: true } })
  ]);

  if (!project || project.clientId !== parsed.data.clientId || project.status !== "ACTIVE") {
    return { ok: false, message: "El proyecto no pertenece al cliente seleccionado o está inactivo" };
  }

  if (!status?.active) {
    return { ok: false, message: "El estado seleccionado no está activo" };
  }

  if (!assignee || assignee.status !== "ACTIVE") {
    return { ok: false, message: "El responsable seleccionado no está activo" };
  }

  const dueDate = parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00`) : null;
  await prisma.$transaction(async (tx) => {
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

    if (assignee.id !== session.user.id) {
      await createNotificationWithRealtime(tx, {
        userId: assignee.id,
        type: "TRACKING_TASK_ASSIGNED",
        title: "Nueva tarea asignada",
        body: `${project.client.name} / ${project.name} - ${parsed.data.title.trim()} - Prioridad ${notificationPriorityLabels[parsed.data.priority] ?? parsed.data.priority} - Estado ${status.name} - Asignó ${session.user.name ?? session.user.email}`,
        trackingTaskId: created.id
      });
    }

    await emitTrackingRealtimeEvent(tx, "task-created", created.id);

    return created;
  });

  revalidateTracking();
  return { ok: true, message: "Tarea creada" };
}

export async function patchTrackingTask(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`tracking-patch:${session.user.id}`, 80, 60_000);
  const parsed = trackingTaskPatchSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
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
      tags: true,
      archivedAt: true,
      deletedAt: true
    }
  });

  if (!existing) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (existing.deletedAt) {
    return { ok: false, message: "No se puede editar una tarea eliminada" };
  }

  const clientId = parsed.data.clientId ?? existing.clientId;
  const projectId = parsed.data.projectId ?? existing.projectId;
  const assigneeId = parsed.data.assigneeId ?? existing.assigneeId;
  const statusId = parsed.data.statusId ?? existing.statusId;
  const [project, status, assignee] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, clientId: true, status: true, client: { select: { name: true } } } }),
    prisma.trackingTaskStatus.findUnique({ where: { id: statusId }, select: { name: true, active: true, isFinal: true } }),
    prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, name: true, email: true, status: true } })
  ]);

  if (!project || project.clientId !== clientId || project.status !== "ACTIVE") {
    return { ok: false, message: "El proyecto no pertenece al cliente seleccionado o está inactivo" };
  }

  if (!status?.active) {
    return { ok: false, message: "El estado seleccionado no está activo" };
  }

  if (!assignee || assignee.status !== "ACTIVE") {
    return { ok: false, message: "El responsable seleccionado no está activo" };
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

  await prisma.$transaction(async (tx) => {
    await tx.trackingTask.update({ where: { id: existing.id }, data: next });
    await tx.trackingTaskHistory.create({
      data: {
        taskId: existing.id,
        actorId: session.user.id,
        action: existing.assigneeId !== assigneeId ? TrackingHistoryAction.ASSIGNEE_CHANGE : TrackingHistoryAction.UPDATE,
        message: "Tarea actualizada",
        fromValue: existing,
        toValue: parsed.data
      }
    });

    if (existing.assigneeId !== assigneeId && assigneeId !== session.user.id) {
      await createNotificationWithRealtime(tx, {
        userId: assigneeId,
        type: "TRACKING_TASK_ASSIGNED",
        title: "Tarea reasignada",
        body: `${project.client.name} / ${project.name} - ${parsed.data.title?.trim() ?? existing.title} - Prioridad ${notificationPriorityLabels[parsed.data.priority ?? existing.priority] ?? parsed.data.priority ?? existing.priority} - Estado ${status.name} - Asignó ${session.user.name ?? session.user.email}`,
        trackingTaskId: existing.id
      });
    } else if (parsed.data.statusId && existing.statusId !== parsed.data.statusId && assigneeId !== session.user.id) {
      await createNotificationWithRealtime(tx, {
        userId: assigneeId,
        type: "TRACKING_TASK_STATUS",
        title: "Estado de tarea actualizado",
        body: `${parsed.data.title?.trim() ?? existing.title}: ${status.name}`,
        trackingTaskId: existing.id
      });
    }

    await emitTrackingRealtimeEvent(tx, "task-updated", existing.id);
  });

  revalidateTracking();
  return { ok: true, message: "Tarea actualizada" };
}

export async function archiveTrackingTask(taskId: string) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  const task = await prisma.trackingTask.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, archivedAt: true, deletedAt: true }
  });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (task.deletedAt) {
    return { ok: false, message: "No se puede archivar una tarea eliminada" };
  }

  if (task.archivedAt) {
    return { ok: true, message: "La tarea ya estaba archivada" };
  }

  await prisma.$transaction([
    prisma.trackingTask.update({
      where: { id: task.id },
      data: { archivedAt: new Date(), archivedById: session.user.id }
    }),
    prisma.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action: TrackingHistoryAction.UPDATE,
        message: "Tarea archivada",
        fromValue: { archivedAt: null },
        toValue: { archivedAt: new Date().toISOString() }
      }
    })
  ]);
  await emitTrackingRealtimeEvent(prisma, "task-archived", task.id);

  revalidateTracking();
  return { ok: true, message: "Tarea archivada" };
}

export async function deleteTrackingTask(taskId: string) {
  await requireSuperadmin();
  const task = await prisma.trackingTask.findUnique({
    where: { id: taskId },
    select: { id: true, title: true }
  });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.trackingTask.delete({ where: { id: task.id } });
    await emitTrackingRealtimeEvent(tx, "task-deleted", task.id);
  });

  revalidateTracking();
  return { ok: true, message: "Tarea eliminada definitivamente" };
}

export async function restoreTrackingTask(taskId: string) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  const task = await prisma.trackingTask.findUnique({
    where: { id: taskId },
    select: { id: true, archivedAt: true, deletedAt: true }
  });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  await prisma.$transaction([
    prisma.trackingTask.update({
      where: { id: task.id },
      data: {
        archivedAt: null,
        archivedById: null,
        deletedAt: null,
        deletedById: null
      }
    }),
    prisma.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action: TrackingHistoryAction.REOPEN,
        message: "Tarea restaurada",
        fromValue: { archivedAt: task.archivedAt, deletedAt: task.deletedAt },
        toValue: { archivedAt: null, deletedAt: null }
      }
    })
  ]);
  await emitTrackingRealtimeEvent(prisma, "task-restored", task.id);

  revalidateTracking();
  return { ok: true, message: "Tarea restaurada" };
}

export async function changeTrackingTaskStatus(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-status:${session.user.id}`, 120, 60_000);
  const parsed = trackingTaskStatusChangeSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  const [task, nextStatus] = await Promise.all([
    prisma.trackingTask.findUnique({
      where: { id: parsed.data.taskId },
      select: {
        id: true,
        title: true,
        assigneeId: true,
        createdById: true,
        statusId: true,
        deletedAt: true,
        project: { select: { name: true, client: { select: { name: true } } } },
        status: { select: { name: true, isFinal: true } }
      }
    }),
    prisma.trackingTaskStatus.findUnique({
      where: { id: parsed.data.statusId },
      select: { id: true, name: true, active: true, isFinal: true }
    })
  ]);

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (task.deletedAt) {
    return { ok: false, message: "No se puede actualizar una tarea eliminada" };
  }

  if (!canTouchTask(session, task)) {
    return { ok: false, message: "No podés actualizar esta tarea" };
  }

  if (!nextStatus?.active) {
    return { ok: false, message: "El estado seleccionado no está activo" };
  }

  if (task.statusId === nextStatus.id) {
    return { ok: true, message: "Sin cambios" };
  }

  const action = nextStatus.isFinal ? TrackingHistoryAction.CLOSE : task.status.isFinal ? TrackingHistoryAction.REOPEN : TrackingHistoryAction.STATUS_CHANGE;

  await prisma.$transaction(async (tx) => {
    await tx.trackingTask.update({
      where: { id: task.id },
      data: {
        statusId: nextStatus.id,
        closedAt: nextStatus.isFinal ? new Date() : null
      }
    });
    await tx.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action,
        message: `Estado: ${task.status.name} -> ${nextStatus.name}`,
        fromValue: { statusId: task.statusId, name: task.status.name },
        toValue: { statusId: nextStatus.id, name: nextStatus.name }
      }
    });

    const recipients = new Set([task.assigneeId, task.createdById].filter(Boolean) as string[]);
    recipients.delete(session.user.id);
    await Promise.all(
      Array.from(recipients).map((userId) =>
        createNotificationWithRealtime(tx, {
          userId,
          type: "TRACKING_TASK_STATUS",
          title: "Estado de tarea actualizado",
          body: `${task.project.client.name} / ${task.project.name} - ${task.title}: ${task.status.name} -> ${nextStatus.name}`,
          trackingTaskId: task.id
        })
      )
    );

    await emitTrackingRealtimeEvent(tx, "task-status-changed", task.id);
  });

  revalidateTracking();
  return { ok: true, message: nextStatus.isFinal ? "Tarea cerrada" : task.status.isFinal ? "Tarea reabierta" : "Estado actualizado" };
}

export async function bulkUpdateTrackingTasks(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`tracking-bulk-update:${session.user.id}`, 20, 60_000);
  const parsed = trackingTaskBulkUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const taskIds = Array.from(new Set(parsed.data.taskIds));
  const tasks = await prisma.trackingTask.findMany({
    where: { id: { in: taskIds } },
    select: {
      id: true,
      title: true,
      statusId: true,
      assigneeId: true,
      createdById: true,
      deletedAt: true,
      project: { select: { name: true, client: { select: { name: true } } } }
    }
  });
  const activeTasks = tasks.filter((task) => !task.deletedAt);
  const activeTaskIds = activeTasks.map((task) => task.id);

  if (!activeTaskIds.length) {
    return { ok: false, message: "No hay tareas activas para actualizar" };
  }

  const data: {
    statusId?: string;
    assigneeId?: string;
    priority?: TrackingTaskPriority;
    dueDate?: Date | null;
    closedAt?: Date | null;
  } = {};
  let statusName: string | null = null;

  if (parsed.data.statusId) {
    const status = await prisma.trackingTaskStatus.findUnique({
      where: { id: parsed.data.statusId },
      select: { id: true, name: true, active: true, isFinal: true }
    });

    if (!status?.active) {
      return { ok: false, message: "El estado seleccionado no está activo" };
    }

    data.statusId = status.id;
    data.closedAt = status.isFinal ? new Date() : null;
    statusName = status.name;
  }

  if (parsed.data.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { id: true, status: true } });
    if (!assignee || assignee.status !== "ACTIVE") {
      return { ok: false, message: "El responsable seleccionado no está activo" };
    }
    data.assigneeId = assignee.id;
  }

  if (parsed.data.priority) {
    data.priority = parsed.data.priority as TrackingTaskPriority;
  }

  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T12:00:00`) : null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.trackingTask.updateMany({
      where: { id: { in: activeTaskIds } },
      data
    });
    await tx.trackingTaskHistory.createMany({
      data: activeTaskIds.map((taskId) => ({
        taskId,
        actorId: session.user.id,
        action: data.statusId ? TrackingHistoryAction.STATUS_CHANGE : TrackingHistoryAction.UPDATE,
        message: data.statusId ? `Estado actualizado masivamente: ${statusName}` : "Actualización masiva",
        toValue: parsed.data
      }))
    });

    for (const task of activeTasks) {
      const recipients = new Set<string>();
      if (data.assigneeId) recipients.add(data.assigneeId);
      if (data.statusId) {
        recipients.add(task.assigneeId);
        if (task.createdById) recipients.add(task.createdById);
      }
      recipients.delete(session.user.id);

      await Promise.all(
        Array.from(recipients).map((userId) =>
          createNotificationWithRealtime(tx, {
            userId,
            type: data.assigneeId ? "TRACKING_TASK_ASSIGNED" : "TRACKING_TASK_STATUS",
            title: data.assigneeId ? "Tarea asignada" : "Estado de tarea actualizado",
            body: `${task.project.client.name} / ${task.project.name} - ${task.title}${statusName ? ` - ${statusName}` : ""}`,
            trackingTaskId: task.id
          })
        )
      );
    }

    await emitTrackingRealtimeEvent(tx, "tasks-bulk-updated", null);
  });

  revalidateTracking();
  return { ok: true, message: `${activeTaskIds.length} tareas actualizadas`, updatedIds: activeTaskIds };
}

export async function bulkDeleteTrackingTasks(input: unknown) {
  await requireSuperadmin();
  const parsed = trackingTaskBulkDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Selecciona tareas para eliminar" };
  }

  const taskIds = Array.from(new Set(parsed.data.taskIds));
  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.trackingTask.deleteMany({ where: { id: { in: taskIds } } });
    await emitTrackingRealtimeEvent(tx, "tasks-bulk-deleted", null);
    return result;
  });

  revalidateTracking();
  return { ok: true, message: `${deleted.count} tareas eliminadas definitivamente`, deletedIds: taskIds };
}

export async function addTrackingComment(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-comment:${session.user.id}`, 80, 60_000);
  const parsed = trackingCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const task = await prisma.trackingTask.findUnique({
    where: { id: parsed.data.taskId },
    select: {
      id: true,
      title: true,
      assigneeId: true,
      createdById: true,
      deletedAt: true,
      project: { select: { name: true, client: { select: { name: true } } } }
    }
  });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (task.deletedAt) {
    return { ok: false, message: "No se puede comentar una tarea eliminada" };
  }

  if (!canTouchTask(session, task)) {
    return { ok: false, message: "No podés comentar esta tarea" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.trackingTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } });
    await tx.trackingTaskHistory.create({
      data: {
        taskId: task.id,
        actorId: session.user.id,
        action: TrackingHistoryAction.COMMENT,
        message: parsed.data.message.trim()
      }
    });

    const recipients = new Set([task.assigneeId, task.createdById].filter(Boolean) as string[]);
    recipients.delete(session.user.id);
    await Promise.all(
      Array.from(recipients).map((userId) =>
        createNotificationWithRealtime(tx, {
          userId,
          type: "TRACKING_TASK_COMMENT",
          title: "Nuevo comentario en una tarea",
          body: `${task.project.client.name} / ${task.project.name} - ${task.title}`,
          trackingTaskId: task.id
        })
      )
    );

    await emitTrackingRealtimeEvent(tx, "task-comment-added", task.id);
  });

  revalidateTracking();
  return { ok: true, message: "Comentario agregado" };
}

export async function updateTrackingComment(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-comment-edit:${session.user.id}`, 80, 60_000);
  const parsed = trackingCommentEditSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invÃ¡lidos" };
  }

  const historyItem = await prisma.trackingTaskHistory.findUnique({
    where: { id: parsed.data.historyId },
    select: {
      id: true,
      taskId: true,
      action: true,
      actorId: true,
      task: {
        select: {
          id: true,
          assigneeId: true,
          deletedAt: true
        }
      }
    }
  });

  if (!historyItem || historyItem.action !== TrackingHistoryAction.COMMENT) {
    return { ok: false, message: "El comentario no existe" };
  }

  if (historyItem.task.deletedAt) {
    return { ok: false, message: "No se puede editar un comentario de una tarea eliminada" };
  }

  if (historyItem.actorId !== session.user.id) {
    return { ok: false, message: "Solo el autor puede editar este comentario" };
  }

  if (!canTouchTask(session, historyItem.task)) {
    return { ok: false, message: "No tenÃ©s permisos para editar este comentario" };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.trackingTask.update({
      where: { id: historyItem.taskId },
      data: { updatedAt: new Date() }
    });
    const item = await tx.trackingTaskHistory.update({
      where: { id: historyItem.id },
      data: { message: parsed.data.message.trim() },
      select: {
        id: true,
        taskId: true,
        action: true,
        message: true,
        minutes: true,
        createdAt: true,
        actorId: true,
        actor: { select: { name: true, email: true } }
      }
    });

    await emitTrackingRealtimeEvent(tx, "task-comment-updated", historyItem.taskId);
    return item;
  });

  revalidateTracking();
  return {
    ok: true,
    message: "Comentario actualizado",
    history: {
      id: updated.id,
      taskId: updated.taskId,
      action: updated.action,
      message: updated.message,
      minutes: updated.minutes,
      createdAt: updated.createdAt.toISOString(),
      actor: updated.actor?.name ?? updated.actor?.email ?? "Sistema",
      actorId: updated.actorId
    }
  };
}

export async function deleteTrackingComment(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-comment-delete:${session.user.id}`, 80, 60_000);
  const parsed = trackingCommentDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invÃ¡lidos" };
  }

  const historyItem = await prisma.trackingTaskHistory.findUnique({
    where: { id: parsed.data.historyId },
    select: {
      id: true,
      taskId: true,
      action: true,
      actorId: true,
      task: {
        select: {
          id: true,
          assigneeId: true,
          deletedAt: true
        }
      }
    }
  });

  if (!historyItem || historyItem.action !== TrackingHistoryAction.COMMENT) {
    return { ok: false, message: "El comentario no existe" };
  }

  if (historyItem.task.deletedAt) {
    return { ok: false, message: "No se puede eliminar un comentario de una tarea eliminada" };
  }

  const canDeleteComment = historyItem.actorId === session.user.id || canManageTracking(session);
  if (!canDeleteComment) {
    return { ok: false, message: "Solo el autor o un administrador puede eliminar este comentario" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.trackingTaskHistory.delete({ where: { id: historyItem.id } });
    await tx.trackingTask.update({
      where: { id: historyItem.taskId },
      data: { updatedAt: new Date() }
    });
    await emitTrackingRealtimeEvent(tx, "task-comment-deleted", historyItem.taskId);
  });

  revalidateTracking();
  return { ok: true, message: "Comentario eliminado", historyId: historyItem.id };
}

export async function logTrackingTaskTime(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`tracking-time:${session.user.id}`, 80, 60_000);
  const parsed = trackingTimeLogSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const task = await prisma.trackingTask.findUnique({ where: { id: parsed.data.taskId }, select: { id: true, assigneeId: true, consumedMinutes: true, deletedAt: true } });

  if (!task) {
    return { ok: false, message: "La tarea no existe" };
  }

  if (task.deletedAt) {
    return { ok: false, message: "No se puede imputar tiempo en una tarea eliminada" };
  }

  if (!canTouchTask(session, task)) {
    return { ok: false, message: "No podés imputar tiempo en esta tarea" };
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
  await emitTrackingRealtimeEvent(prisma, "task-time-logged", task.id);

  revalidateTracking();
  return { ok: true, message: "Tiempo imputado" };
}

export async function upsertTrackingStatus(input: unknown) {
  await requireRole([Role.ADMINISTRADOR]);
  const parsed = trackingStatusSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const data = {
    name: parsed.data.name.trim(),
    color: parsed.data.color,
    active: parsed.data.active,
    sortOrder: parsed.data.sortOrder,
    isFinal: parsed.data.isFinal,
    isBlocked: parsed.data.isBlocked
  };
  if (parsed.data.id) {
    await prisma.trackingTaskStatus.update({ where: { id: parsed.data.id }, data });
  } else {
    await prisma.trackingTaskStatus.create({ data });
  }
  await emitTrackingRealtimeEvent(prisma, "status-upserted", parsed.data.id ?? null);

  revalidateTracking();
  return { ok: true, message: parsed.data.id ? "Estado actualizado" : "Estado creado" };
}

export async function deleteTrackingStatus(statusId: string) {
  await requireSuperadmin();
  const count = await prisma.trackingTask.count({ where: { statusId } });

  if (count > 0) {
    await prisma.trackingTaskStatus.update({ where: { id: statusId }, data: { active: false } });
    await emitTrackingRealtimeEvent(prisma, "status-deactivated", statusId);
    revalidateTracking();
    return { ok: true, message: "Estado desactivado porque tiene tareas asociadas" };
  }

  await prisma.trackingTaskStatus.delete({ where: { id: statusId } });
  await emitTrackingRealtimeEvent(prisma, "status-deleted", statusId);

  revalidateTracking();
  return { ok: true, message: "Estado eliminado" };
}

export async function logTrackingExport(format: "CSV" | "XLSX" | "PDF") {
  const session = await requireSession();

  if (!canExportTracking(session)) {
    return { ok: false, message: "No tenés permisos para exportar" };
  }

  return { ok: true, message: `Exportación ${format} preparada` };
}
