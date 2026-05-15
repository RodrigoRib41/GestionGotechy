"use server";

import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { getNotificationSnapshot } from "@/lib/data/notifications";
import { emitRealtimeEvent } from "@/lib/realtime";

export async function markNotificationRead(notificationId: string) {
  const session = await requireSession();

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: session.user.id },
    data: { readAt: new Date() }
  });
  await emitRealtimeEvent(prisma, "NOTIFICATION", { action: "read", notificationId }, session.user.id);

  revalidateTag("notifications");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const session = await requireSession();

  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() }
  });
  await emitRealtimeEvent(prisma, "NOTIFICATION", { action: "read-all" }, session.user.id);

  revalidateTag("notifications");
  return { ok: true };
}

export async function loadNotificationSnapshot() {
  const session = await requireSession();
  return getNotificationSnapshot(session.user.id);
}
