"use server";

import { Prisma, Role } from "@prisma/client";
import { startOfDay, subDays } from "date-fns";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { createNotificationWithRealtime, emitRealtimeEvent } from "@/lib/realtime";
import { timeEntryCommentSchema, timeEntryThreadIdSchema, timeEntryThreadReplySchema } from "@/lib/validators";

const threadInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  comments: {
    select: {
      id: true,
      message: true,
      createdAt: true,
      authorId: true,
      author: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: "asc" as const }
  },
  timeEntry: {
    select: {
      id: true,
      userId: true,
      date: true,
      detail: true,
      user: { select: { id: true, name: true, email: true } },
      project: { select: { name: true } },
      client: { select: { name: true } }
    }
  },
  reads: { select: { userId: true, lastReadAt: true } }
} as const;

type ThreadWithDetails = Prisma.TimeEntryThreadGetPayload<{ include: typeof threadInclude }>;

function revalidateCommentSurfaces() {
  revalidatePath("/time");
  revalidatePath("/reports");
  revalidateTag("time-entry-context");
  revalidateTag("notifications");
}

export async function createTimeEntryThreadComment(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`time-entry-comment:${session.user.id}`, 40, 60_000);
  const parsed = timeEntryCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const entry = await prisma.timeEntry.findUnique({
    where: { id: parsed.data.timeEntryId },
    select: {
      id: true,
      userId: true,
      date: true,
      detail: true,
      user: { select: { name: true, email: true } },
      project: { select: { name: true } }
    }
  });

  if (!entry) {
    return { ok: false, message: "El registro de horas no existe" };
  }

  if (entry.date < startOfDay(subDays(new Date(), 30))) {
    return { ok: false, message: "Solo se pueden comentar registros de los últimos 30 días" };
  }

  const existing = await prisma.timeEntryThread.findUnique({
    where: { timeEntryId: entry.id },
    select: { id: true, status: true }
  });

  if (existing?.status === "RESOLVED") {
    return { ok: false, message: "El hilo ya está resuelto" };
  }

  const thread = await prisma.$transaction(async (tx) => {
    const savedThread =
      existing ??
      (await tx.timeEntryThread.create({
        data: {
          timeEntryId: entry.id,
          createdById: session.user.id
        },
        select: { id: true, status: true }
      }));

    await tx.timeEntryComment.create({
      data: {
        threadId: savedThread.id,
        authorId: session.user.id,
        message: parsed.data.message.trim()
      }
    });

    await tx.timeEntryThreadRead.upsert({
      where: { threadId_userId: { threadId: savedThread.id, userId: session.user.id } },
      update: { lastReadAt: new Date() },
      create: { threadId: savedThread.id, userId: session.user.id }
    });

    if (entry.userId !== session.user.id) {
      await createNotificationWithRealtime(tx, {
        userId: entry.userId,
        type: "TIME_ENTRY_COMMENT",
        title: "Nuevo comentario en una carga de horas",
        body: `${entry.project.name}: ${entry.detail}`,
        threadId: savedThread.id,
        timeEntryId: entry.id
      });
    }

    await emitRealtimeEvent(tx, "TIME_ENTRY_COMMENT", { action: "upsert", timeEntryId: entry.id, threadId: savedThread.id });

    return tx.timeEntryThread.findUniqueOrThrow({
      where: { id: savedThread.id },
      include: threadInclude
    });
  });

  revalidateCommentSurfaces();
  return { ok: true, message: existing ? "Comentario agregado" : "Comentario creado", thread: serializeThread(thread, session.user.id) };
}

export async function replyTimeEntryThread(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`time-entry-reply:${session.user.id}`, 60, 60_000);
  const parsed = timeEntryThreadReplySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const thread = await prisma.timeEntryThread.findUnique({
    where: { id: parsed.data.threadId },
    include: threadInclude
  });

  if (!thread) {
    return { ok: false, message: "El hilo no existe" };
  }

  if (thread.status === "RESOLVED") {
    return { ok: false, message: "El hilo ya está resuelto" };
  }

  const canReply = thread.timeEntry.userId === session.user.id || thread.createdById === session.user.id || session.user.role === Role.SUPERADMIN || session.user.role === Role.ADMINISTRADOR;
  if (!canReply) {
    return { ok: false, message: "No podés responder este hilo" };
  }

  const notifyUserId = session.user.id === thread.timeEntry.userId ? thread.createdById : thread.timeEntry.userId;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.timeEntryComment.create({
      data: {
        threadId: thread.id,
        authorId: session.user.id,
        message: parsed.data.message.trim()
      }
    });

    await tx.timeEntryThreadRead.upsert({
      where: { threadId_userId: { threadId: thread.id, userId: session.user.id } },
      update: { lastReadAt: new Date() },
      create: { threadId: thread.id, userId: session.user.id }
    });

    if (notifyUserId !== session.user.id) {
      await createNotificationWithRealtime(tx, {
        userId: notifyUserId,
        type: "TIME_ENTRY_COMMENT",
        title: "Nueva respuesta en una carga de horas",
        body: `${thread.timeEntry.project.name}: ${thread.timeEntry.detail}`,
        threadId: thread.id,
        timeEntryId: thread.timeEntryId
      });
    }

    await emitRealtimeEvent(tx, "TIME_ENTRY_COMMENT", { action: "reply", timeEntryId: thread.timeEntryId, threadId: thread.id });

    return tx.timeEntryThread.findUniqueOrThrow({
      where: { id: thread.id },
      include: threadInclude
    });
  });

  revalidateCommentSurfaces();
  return { ok: true, message: "Respuesta enviada", thread: serializeThread(updated, session.user.id) };
}

export async function markTimeEntryThreadRead(input: unknown) {
  const session = await requireSession();
  const parsed = timeEntryThreadIdSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Hilo inválido" };
  }

  const thread = await prisma.timeEntryThread.findUnique({
    where: { id: parsed.data.threadId },
    select: { id: true, createdById: true, timeEntry: { select: { userId: true } } }
  });

  if (!thread) {
    return { ok: false, message: "El hilo no existe" };
  }

  const canRead = thread.timeEntry.userId === session.user.id || thread.createdById === session.user.id || session.user.role === Role.SUPERADMIN || session.user.role === Role.ADMINISTRADOR;
  if (!canRead) {
    return { ok: false, message: "No podés leer este hilo" };
  }

  await prisma.$transaction([
    prisma.timeEntryThreadRead.upsert({
      where: { threadId_userId: { threadId: thread.id, userId: session.user.id } },
      update: { lastReadAt: new Date() },
      create: { threadId: thread.id, userId: session.user.id }
    }),
    prisma.notification.updateMany({
      where: { userId: session.user.id, threadId: thread.id, readAt: null },
      data: { readAt: new Date() }
    })
  ]);

  revalidateTag("notifications");
  return { ok: true, message: "Hilo marcado como leido" };
}

export async function resolveTimeEntryThread(input: unknown) {
  const session = await requireSession();
  const parsed = timeEntryThreadIdSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Hilo inválido" };
  }

  const thread = await prisma.timeEntryThread.findUnique({
    where: { id: parsed.data.threadId },
    include: threadInclude
  });

  if (!thread) {
    return { ok: false, message: "El hilo no existe" };
  }

  if (thread.createdById !== session.user.id) {
    return { ok: false, message: "Solo quien inicio el comentario puede resolverlo" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.timeEntryThread.delete({ where: { id: thread.id } });
    await emitRealtimeEvent(tx, "TIME_ENTRY_COMMENT", { action: "delete", timeEntryId: thread.timeEntryId, threadId: thread.id });
  });

  revalidateCommentSurfaces();
  return { ok: true, message: "Hilo resuelto y eliminado", timeEntryId: thread.timeEntryId, threadId: thread.id, thread: null };
}

function serializeThread(thread: ThreadWithDetails, currentUserId: string) {
  const latestRead = thread.reads?.find((read) => read.userId === currentUserId)?.lastReadAt ?? null;
  return {
    id: thread.id,
    status: thread.status,
    timeEntryId: thread.timeEntryId,
    createdById: thread.createdById,
    createdBy: thread.createdBy.name ?? thread.createdBy.email,
    resolvedAt: thread.resolvedAt?.toISOString() ?? null,
    createdAt: thread.createdAt.toISOString(),
    unread: latestRead ? thread.comments.some((comment) => comment.authorId !== currentUserId && comment.createdAt > latestRead) : thread.comments.some((comment) => comment.authorId !== currentUserId),
    entry: {
      id: thread.timeEntry.id,
      date: thread.timeEntry.date.toISOString(),
      detail: thread.timeEntry.detail,
      collaborator: thread.timeEntry.user.name ?? thread.timeEntry.user.email,
      project: thread.timeEntry.project.name,
      client: thread.timeEntry.client.name
    },
    comments: thread.comments.map((comment) => ({
      id: comment.id,
      message: comment.message,
      authorId: comment.authorId,
      author: comment.author.name ?? comment.author.email,
      createdAt: comment.createdAt.toISOString(),
      mine: comment.authorId === currentUserId
    }))
  };
}
