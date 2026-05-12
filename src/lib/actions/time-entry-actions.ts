"use server";

import { AuditAction } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { isSuperadmin, requireSession } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { timeEntryPatchSchema, timeEntrySchema } from "@/lib/validators";

function revalidateTimeSurfaces() {
  revalidateTag("dashboard-metrics");
  revalidateTag("time-entry-context");
}

type SerializedEntry = {
  id: string;
  date: string;
  collaborator: string;
  project: string;
  projectId: string;
  client: string;
  clientId: string;
  category: string;
  categoryId: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
};

export async function createTimeEntry(input: unknown): Promise<
  | { ok: true; message: string; entry: SerializedEntry }
  | { ok: false; message: string }
> {
  const session = await requireSession();
  assertRateLimit(`time-entry:${session.user.id}`, 30, 60_000);

  const parsed = timeEntrySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const [project, category] = await Promise.all([
    prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } }
    }),
    prisma.category.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true, name: true }
    })
  ]);

  if (!project) {
    return { ok: false, message: "El proyecto seleccionado no existe" };
  }

  if (!category) {
    return { ok: false, message: "La categoria seleccionada no existe" };
  }

  const entry = await prisma.timeEntry.create({
    data: {
      date: new Date(`${parsed.data.date}T12:00:00`),
      detail: parsed.data.detail.trim(),
      observations: parsed.data.observations?.trim() || null,
      minutes: parsed.data.minutes,
      overtimeMinutes: parsed.data.overtimeMinutes,
      userId: session.user.id,
      projectId: parsed.data.projectId,
      clientId: project.clientId,
      categoryId: parsed.data.categoryId
    }
  });

  await prisma.timeEntryFavoriteProject.upsert({
    where: { userId_projectId: { userId: session.user.id, projectId: parsed.data.projectId } },
    update: {},
    create: { userId: session.user.id, projectId: parsed.data.projectId }
  });

  await prisma.auditLog.create({
    data: {
      action: AuditAction.CREATE,
      entity: "TimeEntry",
      entityId: entry.id,
      actorId: session.user.id,
      metadata: { minutes: entry.minutes, overtimeMinutes: entry.overtimeMinutes }
    }
  });

  revalidateTimeSurfaces();

  return {
    ok: true,
    message: "Horas registradas",
    entry: {
      id: entry.id,
      date: entry.date.toISOString(),
      collaborator: session.user.name ?? session.user.email ?? "Usuario",
      project: project.name,
      projectId: project.id,
      client: project.client.name,
      clientId: project.client.id,
      category: category.name,
      categoryId: category.id,
      detail: entry.detail,
      observations: entry.observations,
      minutes: entry.minutes,
      overtimeMinutes: entry.overtimeMinutes
    }
  };
}

export async function updateTimeEntry(entryId: string, input: unknown) {
  const parsed = timeEntrySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  return patchTimeEntry(entryId, parsed.data);
}

export async function patchTimeEntry(
  entryId: string,
  input: unknown
): Promise<{ ok: true; message: string; entry: SerializedEntry } | { ok: false; message: string }> {
  const session = await requireSession();
  assertRateLimit(`time-entry-patch:${session.user.id}`, 120, 60_000);

  const parsed = timeEntryPatchSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const existing = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    select: { userId: true, date: true }
  });

  if (!existing) {
    return { ok: false, message: "La carga no existe" };
  }

  const ownsEntry = existing.userId === session.user.id;
  const superadmin = isSuperadmin(session.user.roles);

  if (!ownsEntry && !superadmin) {
    return { ok: false, message: "Solo podes editar tus propias cargas" };
  }

  if (!superadmin && differenceInCalendarDays(new Date(), existing.date) > 30) {
    return { ok: false, message: "Solo podes editar cargas de hasta 30 dias anteriores" };
  }

  const data: {
    date?: Date;
    detail?: string;
    observations?: string | null;
    minutes?: number;
    overtimeMinutes?: number;
    projectId?: string;
    clientId?: string;
    categoryId?: string;
  } = {};

  if (parsed.data.date !== undefined) {
    data.date = new Date(`${parsed.data.date}T12:00:00`);
  }

  if (parsed.data.detail !== undefined) {
    data.detail = parsed.data.detail.trim();
  }

  if (parsed.data.observations !== undefined) {
    data.observations = parsed.data.observations.trim() || null;
  }

  if (parsed.data.minutes !== undefined) {
    data.minutes = parsed.data.minutes;
  }

  if (parsed.data.overtimeMinutes !== undefined) {
    data.overtimeMinutes = parsed.data.overtimeMinutes;
  }

  if (parsed.data.categoryId !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true } });

    if (!category) {
      return { ok: false, message: "La categoria seleccionada no existe" };
    }

    data.categoryId = parsed.data.categoryId;
  }

  if (parsed.data.projectId !== undefined) {
    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { clientId: true }
    });

    if (!project) {
      return { ok: false, message: "El proyecto seleccionado no existe" };
    }

    data.projectId = parsed.data.projectId;
    data.clientId = project.clientId;
  }

  const entry = await prisma.timeEntry.update({
    where: { id: entryId },
    data,
    select: {
      id: true,
      date: true,
      detail: true,
      observations: true,
      minutes: true,
      overtimeMinutes: true,
      projectId: true,
      clientId: true,
      categoryId: true,
      user: { select: { name: true, email: true } },
      project: { select: { name: true } },
      client: { select: { name: true } },
      category: { select: { name: true } }
    }
  });

  await prisma.auditLog.create({
    data: {
      action: AuditAction.UPDATE,
      entity: "TimeEntry",
      entityId: entryId,
      actorId: session.user.id,
      metadata: { fields: Object.keys(parsed.data) }
    }
  });

  revalidateTimeSurfaces();

  return {
    ok: true,
    message: "Carga actualizada",
    entry: {
      id: entry.id,
      date: entry.date.toISOString(),
      collaborator: entry.user.name ?? entry.user.email,
      project: entry.project.name,
      projectId: entry.projectId,
      client: entry.client.name,
      clientId: entry.clientId,
      category: entry.category.name,
      categoryId: entry.categoryId,
      detail: entry.detail,
      observations: entry.observations,
      minutes: entry.minutes,
      overtimeMinutes: entry.overtimeMinutes
    }
  };
}

export async function toggleFavoriteProject(projectId: string) {
  const session = await requireSession();
  const existing = await prisma.timeEntryFavoriteProject.findUnique({
    where: { userId_projectId: { userId: session.user.id, projectId } }
  });

  if (existing) {
    await prisma.timeEntryFavoriteProject.delete({ where: { id: existing.id } });
  } else {
    await prisma.timeEntryFavoriteProject.create({ data: { userId: session.user.id, projectId } });
  }

  revalidateTag("time-entry-context");
  return { ok: true, message: existing ? "Favorito quitado" : "Favorito agregado" };
}
