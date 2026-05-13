"use server";

import { AuditAction } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { dashboardPreferenceSchema } from "@/lib/validators";

const maxPinnedDashboards = 6;

export async function pinDashboard(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`dashboard-pin:${session.user.id}`, 30, 60_000);

  const parsed = dashboardPreferenceSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Dashboard invalido" };
  }

  const current = await prisma.userDashboardPreference.findMany({
    where: { userId: session.user.id },
    select: { dashboardId: true, position: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }]
  });

  if (!current.some((item) => item.dashboardId === parsed.data.dashboardId) && current.length >= maxPinnedDashboards) {
    return { ok: false, message: "Ya tenes 6 dashboards fijados" };
  }

  const nextPosition = parsed.data.position ?? current.length;
  await prisma.userDashboardPreference.upsert({
    where: { userId_dashboardId: { userId: session.user.id, dashboardId: parsed.data.dashboardId } },
    update: { position: nextPosition },
    create: { userId: session.user.id, dashboardId: parsed.data.dashboardId, position: nextPosition }
  });

  await prisma.auditLog.create({
    data: {
      action: AuditAction.CONFIG_CHANGE,
      entity: "DashboardPreference",
      entityId: parsed.data.dashboardId,
      actorId: session.user.id,
      metadata: { pinned: true }
    }
  });

  revalidateTag(`dashboard-preferences:${session.user.id}`);
  revalidatePath("/");
  return { ok: true, message: "Dashboard fijado" };
}

export async function unpinDashboard(input: unknown) {
  const session = await requireSession();
  assertRateLimit(`dashboard-unpin:${session.user.id}`, 30, 60_000);

  const parsed = dashboardPreferenceSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Dashboard invalido" };
  }

  await prisma.userDashboardPreference.deleteMany({
    where: { userId: session.user.id, dashboardId: parsed.data.dashboardId }
  });

  const remaining = await prisma.userDashboardPreference.findMany({
    where: { userId: session.user.id },
    select: { id: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }]
  });

  await prisma.$transaction(
    remaining.map((item, index) =>
      prisma.userDashboardPreference.update({
        where: { id: item.id },
        data: { position: index }
      })
    )
  );

  await prisma.auditLog.create({
    data: {
      action: AuditAction.CONFIG_CHANGE,
      entity: "DashboardPreference",
      entityId: parsed.data.dashboardId,
      actorId: session.user.id,
      metadata: { pinned: false }
    }
  });

  revalidateTag(`dashboard-preferences:${session.user.id}`);
  revalidatePath("/");
  return { ok: true, message: "Dashboard desfijado" };
}
