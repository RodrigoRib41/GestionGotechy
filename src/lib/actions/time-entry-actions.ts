"use server";

import { ProjectStatus } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import { revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { isSuperadmin, requireSession } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { timeEntryFavoriteSchema, timeEntryPatchSchema, timeEntrySchema } from "@/lib/validators";

function revalidateTimeSurfaces() {
  revalidateTag("dashboard-metrics");
  revalidateTag("time-entry-context");
  revalidateTag("objectives-dashboard");
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
  categoryKind: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
};

type SerializedFavorite = {
  id: string;
  name: string;
  projectId: string;
  categoryId: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
  project: string;
  client: string;
  category: string;
  categoryKind: string;
};

export async function createTimeEntry(input: unknown): Promise<
  | { ok: true; message: string; entry: SerializedEntry }
  | { ok: false; message: string }
> {
  const session = await requireSession();
  assertRateLimit(`time-entry:${session.user.id}`, 30, 60_000);

  const parsed = timeEntrySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const [project, category] = await Promise.all([
    prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { id: true, name: true, status: true, clientId: true, client: { select: { id: true, name: true } } }
    }),
    prisma.category.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true, name: true, kind: true }
    })
  ]);

  if (!project) {
    return { ok: false, message: "El proyecto seleccionado no existe" };
  }

  if (project.status !== ProjectStatus.ACTIVE) {
    return { ok: false, message: "El proyecto seleccionado está inactivo" };
  }

  if (!category) {
    return { ok: false, message: "La categoría seleccionada no existe" };
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

  revalidateTimeSurfaces();

  return {
    ok: true,
    message: "Tiempo registrado",
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
      categoryKind: category.kind,
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
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
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
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const existing = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    select: { userId: true, date: true }
  });

  if (!existing) {
    return { ok: false, message: "La carga no existe" };
  }

  const ownsEntry = existing.userId === session.user.id;
  const superadmin = isSuperadmin(session.user.role);

  if (!ownsEntry && !superadmin) {
    return { ok: false, message: "Solo podés editar tus propias cargas" };
  }

  if (!superadmin && differenceInCalendarDays(new Date(), existing.date) > 30) {
    return { ok: false, message: "Solo podés editar cargas de hasta 30 días anteriores" };
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
      return { ok: false, message: "La categoría seleccionada no existe" };
    }

    data.categoryId = parsed.data.categoryId;
  }

  if (parsed.data.projectId !== undefined) {
    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { clientId: true, status: true }
    });

    if (!project) {
      return { ok: false, message: "El proyecto seleccionado no existe" };
    }

    if (project.status !== ProjectStatus.ACTIVE) {
      return { ok: false, message: "El proyecto seleccionado está inactivo" };
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
      category: { select: { name: true, kind: true } }
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
      categoryKind: entry.category.kind,
      detail: entry.detail,
      observations: entry.observations,
      minutes: entry.minutes,
      overtimeMinutes: entry.overtimeMinutes
    }
  };
}

export async function saveTimeEntryFavorite(input: unknown): Promise<
  | { ok: true; message: string; favorite: SerializedFavorite; duplicate?: boolean }
  | { ok: false; message: string }
> {
  const session = await requireSession();
  assertRateLimit(`time-entry-favorite:${session.user.id}`, 20, 60_000);
  const parsed = timeEntryFavoriteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const duplicate = await prisma.timeEntryFavorite.findFirst({
    where: {
      userId: session.user.id,
      projectId: parsed.data.projectId,
      categoryId: parsed.data.categoryId,
      detail: parsed.data.detail.trim(),
      minutes: parsed.data.minutes,
      overtimeMinutes: parsed.data.overtimeMinutes
    },
    include: favoriteInclude
  });

  if (duplicate) {
    const favorite = await prisma.timeEntryFavorite.update({
      where: { id: duplicate.id },
      data: {
        name: parsed.data.name.trim(),
        observations: parsed.data.observations?.trim() || null
      },
      include: favoriteInclude
    });

    revalidateTag("time-entry-context");
    return { ok: true, message: "Ese favorito ya existia", favorite: serializeFavorite(favorite), duplicate: true };
  }

  const count = await prisma.timeEntryFavorite.count({ where: { userId: session.user.id } });
  if (count >= 5) {
    return { ok: false, message: "Solo podés guardar hasta 5 favoritos" };
  }

  const [project, category] = await Promise.all([
    prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true, status: true } }),
    prisma.category.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true, active: true } })
  ]);

  if (!project || project.status !== ProjectStatus.ACTIVE) {
    return { ok: false, message: "El proyecto seleccionado no está activo" };
  }

  if (!category || !category.active) {
    return { ok: false, message: "La categoría seleccionada no está activa" };
  }

  const favorite = await prisma.timeEntryFavorite.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name.trim(),
      projectId: parsed.data.projectId,
      categoryId: parsed.data.categoryId,
      detail: parsed.data.detail.trim(),
      observations: parsed.data.observations?.trim() || null,
      minutes: parsed.data.minutes,
      overtimeMinutes: parsed.data.overtimeMinutes
    },
    include: favoriteInclude
  });

  revalidateTag("time-entry-context");
  return { ok: true, message: "Favorito guardado", favorite: serializeFavorite(favorite) };
}

export async function updateTimeEntryFavorite(
  favoriteId: string,
  input: unknown
): Promise<{ ok: true; message: string; favorite: SerializedFavorite } | { ok: false; message: string }> {
  const session = await requireSession();
  assertRateLimit(`time-entry-favorite-update:${session.user.id}`, 30, 60_000);
  const parsed = timeEntryFavoriteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const existing = await prisma.timeEntryFavorite.findUnique({ where: { id: favoriteId }, select: { userId: true } });

  if (!existing || existing.userId !== session.user.id) {
    return { ok: false, message: "No podés editar este favorito" };
  }

  const [project, category, duplicate] = await Promise.all([
    prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true, status: true } }),
    prisma.category.findUnique({ where: { id: parsed.data.categoryId }, select: { id: true, active: true } }),
    prisma.timeEntryFavorite.findFirst({
      where: {
        id: { not: favoriteId },
        userId: session.user.id,
        projectId: parsed.data.projectId,
        categoryId: parsed.data.categoryId,
        detail: parsed.data.detail.trim(),
        minutes: parsed.data.minutes,
        overtimeMinutes: parsed.data.overtimeMinutes
      },
      select: { id: true }
    })
  ]);

  if (!project || project.status !== ProjectStatus.ACTIVE) {
    return { ok: false, message: "El proyecto seleccionado no está activo" };
  }

  if (!category || !category.active) {
    return { ok: false, message: "La categoría seleccionada no está activa" };
  }

  if (duplicate) {
    return { ok: false, message: "Ya existe un favorito con esa configuracion" };
  }

  const favorite = await prisma.timeEntryFavorite.update({
    where: { id: favoriteId },
    data: {
      name: parsed.data.name.trim(),
      projectId: parsed.data.projectId,
      categoryId: parsed.data.categoryId,
      detail: parsed.data.detail.trim(),
      observations: parsed.data.observations?.trim() || null,
      minutes: parsed.data.minutes,
      overtimeMinutes: parsed.data.overtimeMinutes
    },
    include: favoriteInclude
  });

  revalidateTag("time-entry-context");
  return { ok: true, message: "Favorito actualizado", favorite: serializeFavorite(favorite) };
}

export async function deleteTimeEntryFavorite(favoriteId: string) {
  const session = await requireSession();
  const existing = await prisma.timeEntryFavorite.findUnique({ where: { id: favoriteId }, select: { userId: true } });

  if (!existing || existing.userId !== session.user.id) {
    return { ok: false, message: "No podés eliminar este favorito" };
  }

  await prisma.timeEntryFavorite.delete({ where: { id: favoriteId } });

  revalidateTag("time-entry-context");
  return { ok: true, message: "Favorito eliminado" };
}

const favoriteInclude = {
  project: { select: { name: true, client: { select: { name: true } } } },
  category: { select: { name: true, kind: true } }
} as const;

function serializeFavorite(favorite: {
  id: string;
  name: string;
  projectId: string;
  categoryId: string;
  detail: string;
  observations: string | null;
  minutes: number;
  overtimeMinutes: number;
  project: { name: string; client: { name: string } };
  category: { name: string; kind: string };
}): SerializedFavorite {
  return {
    id: favorite.id,
    name: favorite.name,
    projectId: favorite.projectId,
    categoryId: favorite.categoryId,
    detail: favorite.detail,
    observations: favorite.observations,
    minutes: favorite.minutes,
    overtimeMinutes: favorite.overtimeMinutes,
    project: favorite.project.name,
    client: favorite.project.client.name,
    category: favorite.category.name,
    categoryKind: favorite.category.kind
  };
}
