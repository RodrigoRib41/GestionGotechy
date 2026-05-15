import { Prisma, type RealtimeEventType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function emitRealtimeEvent(
  db: DbClient,
  type: RealtimeEventType,
  payload?: Prisma.InputJsonValue,
  userId?: string | null
) {
  await db.realtimeEvent.create({
    data: {
      type,
      payload: payload ?? Prisma.JsonNull,
      userId: userId ?? null
    }
  });
}

export async function emitTrackingRealtimeEvent(db: DbClient, action: string, taskId?: string | null) {
  await emitRealtimeEvent(db, "TRACKING", { action, taskId: taskId ?? null });
}

export async function createNotificationWithRealtime(
  db: DbClient,
  data: Prisma.NotificationUncheckedCreateInput,
  payload?: Prisma.InputJsonValue
) {
  const notification = await db.notification.create({ data });
  await emitRealtimeEvent(db, "NOTIFICATION", payload ?? { notificationId: notification.id }, data.userId);
  return notification;
}
