"use server";

import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";

export async function markNotificationRead(notificationId: string) {
  const session = await requireSession();

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: session.user.id },
    data: { readAt: new Date() }
  });

  revalidateTag("notifications");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const session = await requireSession();

  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null },
    data: { readAt: new Date() }
  });

  revalidateTag("notifications");
  return { ok: true };
}
