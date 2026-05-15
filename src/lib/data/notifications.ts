import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

export async function getNotificationSnapshot(userId: string) {
  if (!process.env.DATABASE_URL) {
    return { unreadCount: 0, items: [] };
  }

  return unstable_cache(
    async () => {
      const [unreadCount, items] = await Promise.all([
        prisma.notification.count({
          where: { userId, readAt: null, thread: { status: "OPEN" } }
        }),
        prisma.notification.findMany({
          where: { userId, thread: { status: "OPEN" } },
          select: {
            id: true,
            title: true,
            body: true,
            readAt: true,
            createdAt: true,
            timeEntryId: true,
            threadId: true,
            timeEntry: { select: { userId: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 30
        })
      ]);

      return {
        unreadCount,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          readAt: item.readAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          threadId: item.threadId,
          timeEntryId: item.timeEntryId,
          href: item.timeEntry?.userId === userId ? `/time?entry=${item.timeEntryId ?? ""}` : `/reports?entry=${item.timeEntryId ?? ""}`
        }))
      };
    },
    [`notifications:${userId}`],
    { revalidate: 20, tags: ["notifications"] }
  )();
}
