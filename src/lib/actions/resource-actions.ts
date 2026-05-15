"use server";

import { ClientStatus, ProjectStatus, Role, ThemeVariant, UserStatus, WorkModality } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  allowedEmailSchema,
  bulkClientDeleteSchema,
  bulkProjectDeleteSchema,
  categorySchema,
  clientSchema,
  disabledUserDeleteSchema,
  projectVisibilitySchema,
  projectTypeSchema,
  projectSchema,
  roleAssignmentSchema,
  themeVariantSchema,
  workScheduleSchema
} from "@/lib/validators";

function revalidateResourceSurfaces() {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/clients");
  revalidatePath("/time");
  revalidatePath("/tracking");
  revalidatePath("/objectives");
  revalidatePath("/reports");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  revalidateTag("objectives-dashboard");
  revalidateTag("tracking-data");
}

async function serializeProjectForList(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      status: true,
      usesEstimatedTime: true,
      estimatedMinutes: true,
      description: true,
      projectTypeId: true,
      projectType: { select: { id: true, name: true, monthlyReset: true } },
      client: { select: { id: true, name: true } },
      members: {
        where: { user: { status: UserStatus.ACTIVE } },
        select: { user: { select: { name: true, email: true } } }
      }
    }
  });

  if (!project) return null;

  const where = project.projectType?.monthlyReset
    ? { projectId, date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }
    : { projectId };
  const totals = await prisma.timeEntry.aggregate({
    where,
    _sum: { minutes: true, overtimeMinutes: true },
    _count: { _all: true }
  });

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    projectType: project.projectType,
    projectTypeId: project.projectTypeId,
    usesEstimatedTime: project.usesEstimatedTime,
    estimatedMinutes: project.estimatedMinutes,
    description: project.description,
    client: project.client,
    members: project.members.map((member) => member.user.name ?? member.user.email),
    consumedMinutes: (totals._sum.minutes ?? 0) + (totals._sum.overtimeMinutes ?? 0),
    entryCount: totals._count._all
  };
}

async function serializeClientForList(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      status: true,
      description: true,
      projects: { select: { id: true, status: true } }
    }
  });

  if (!client) return null;

  const totals = await prisma.timeEntry.aggregate({
    where: { clientId },
    _sum: { minutes: true, overtimeMinutes: true },
    _count: { _all: true }
  });

  return {
    id: client.id,
    name: client.name,
    status: client.status,
    description: client.description,
    projects: client.projects.length,
    activeProjects: client.projects.filter((project) => project.status === ProjectStatus.ACTIVE).length,
    consumedMinutes: (totals._sum.minutes ?? 0) + (totals._sum.overtimeMinutes ?? 0),
    entryCount: totals._count._all
  };
}

export async function createProject(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`project:${session.user.id}`, 20, 60_000);

  const parsed = projectSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name.trim(),
      clientId: parsed.data.clientId,
      projectTypeId: parsed.data.projectTypeId || null,
      status: parsed.data.status as ProjectStatus,
      usesEstimatedTime: parsed.data.usesEstimatedTime,
      estimatedMinutes: parsed.data.usesEstimatedTime ? parsed.data.estimatedMinutes : 0,
      description: parsed.data.description?.trim() || null
    }
  });

  revalidateResourceSurfaces();

  return { ok: true, message: "Proyecto creado", project: await serializeProjectForList(project.id) };
}

export async function updateProject(input: unknown) {
  await requireRole([Role.ADMINISTRADOR]);
  const parsed = projectSchema.safeParse(input);

  if (!parsed.success || !parsed.data.id) {
    return { ok: false, message: "Datos inválidos" };
  }

  const project = await prisma.project.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name.trim(),
      clientId: parsed.data.clientId,
      projectTypeId: parsed.data.projectTypeId || null,
      status: parsed.data.status as ProjectStatus,
      usesEstimatedTime: parsed.data.usesEstimatedTime,
      estimatedMinutes: parsed.data.usesEstimatedTime ? parsed.data.estimatedMinutes : 0,
      description: parsed.data.description?.trim() || null
    }
  });

  revalidateResourceSurfaces();
  return { ok: true, message: "Proyecto actualizado", project: await serializeProjectForList(project.id) };
}

export async function toggleProjectStatus(projectId: string) {
  await requireRole([Role.ADMINISTRADOR]);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });

  if (!project) {
    return { ok: false, message: "Proyecto inexistente" };
  }

  const nextStatus = project.status === ProjectStatus.ACTIVE ? ProjectStatus.INACTIVE : ProjectStatus.ACTIVE;
  await prisma.project.update({ where: { id: projectId }, data: { status: nextStatus } });

  revalidateResourceSurfaces();
  return { ok: true, message: nextStatus === ProjectStatus.ACTIVE ? "Proyecto activado" : "Proyecto desactivado" };
}

export async function deleteProject(projectId: string) {
  await requireRole([Role.ADMINISTRADOR]);
  const [entryCount, taskCount] = await Promise.all([
    prisma.timeEntry.count({ where: { projectId } }),
    prisma.trackingTask.count({ where: { projectId } })
  ]);

  if (entryCount > 0) {
    return { ok: false, message: "No se puede eliminar un proyecto con minutos registrados" };
  }

  if (taskCount > 0) {
    return { ok: false, message: "No se puede eliminar un proyecto con tareas asociadas" };
  }

  await prisma.project.delete({ where: { id: projectId } });

  revalidateResourceSurfaces();
  return { ok: true, message: "Proyecto eliminado" };
}

export async function deleteProjects(input: unknown) {
  await requireRole([Role.ADMINISTRADOR]);
  const parsed = bulkProjectDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Selecciona proyectos para eliminar" };
  }

  const ids = Array.from(new Set(parsed.data.projectIds));
  const projects = await prisma.project.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      _count: { select: { timeEntries: true, trackingTasks: true } }
    }
  });
  const deletable = projects.filter((project) => project._count.timeEntries === 0 && project._count.trackingTasks === 0);
  const blocked = projects.filter((project) => project._count.timeEntries > 0 || project._count.trackingTasks > 0);

  if (!deletable.length) {
    return { ok: false, message: "No hay proyectos eliminables en la selección", blocked: blocked.map((project) => project.name) };
  }

  await prisma.project.deleteMany({ where: { id: { in: deletable.map((project) => project.id) } } });
  revalidateResourceSurfaces();

  return {
    ok: true,
    message: `${deletable.length} proyectos eliminados${blocked.length ? `; ${blocked.length} quedaron bloqueados por horas o tareas` : ""}`,
    deletedIds: deletable.map((project) => project.id),
    blocked: blocked.map((project) => project.name)
  };
}

export async function createClient(input: unknown) {
  const session = await requireRole([Role.ADMINISTRADOR]);
  assertRateLimit(`client:${session.user.id}`, 20, 60_000);

  const parsed = clientSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const client = await prisma.client.create({
    data: {
      name: parsed.data.name.trim(),
      status: parsed.data.status as ClientStatus,
      description: parsed.data.description?.trim() || null
    }
  });

  revalidateResourceSurfaces();

  return { ok: true, message: "Cliente creado", client: await serializeClientForList(client.id) };
}

export async function updateClient(input: unknown) {
  await requireRole([Role.ADMINISTRADOR]);
  const parsed = clientSchema.safeParse(input);

  if (!parsed.success || !parsed.data.id) {
    return { ok: false, message: "Datos inválidos" };
  }

  await prisma.client.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name.trim(),
      status: parsed.data.status as ClientStatus,
      description: parsed.data.description?.trim() || null
    }
  });

  revalidateResourceSurfaces();
  return { ok: true, message: "Cliente actualizado", client: await serializeClientForList(parsed.data.id) };
}

export async function deleteClient(clientId: string) {
  await requireRole([Role.ADMINISTRADOR]);
  const [entryCount, projectCount] = await Promise.all([
    prisma.timeEntry.count({ where: { clientId } }),
    prisma.project.count({ where: { clientId } })
  ]);

  if (entryCount > 0) {
    return { ok: false, message: "No se puede eliminar un cliente con minutos cargados" };
  }

  if (projectCount > 0) {
    return { ok: false, message: "No se puede eliminar un cliente con proyectos asociados" };
  }

  await prisma.client.delete({ where: { id: clientId } });

  revalidateResourceSurfaces();
  return { ok: true, message: "Cliente eliminado" };
}

export async function deleteClients(input: unknown) {
  await requireRole([Role.ADMINISTRADOR]);
  const parsed = bulkClientDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Selecciona clientes para eliminar" };
  }

  const ids = Array.from(new Set(parsed.data.clientIds));
  const clients = await prisma.client.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      _count: { select: { timeEntries: true, projects: true } }
    }
  });
  const deletable = clients.filter((client) => client._count.timeEntries === 0 && client._count.projects === 0);
  const blocked = clients.filter((client) => client._count.timeEntries > 0 || client._count.projects > 0);

  if (!deletable.length) {
    return { ok: false, message: "No hay clientes eliminables en la selección", blocked: blocked.map((client) => client.name) };
  }

  await prisma.client.deleteMany({ where: { id: { in: deletable.map((client) => client.id) } } });
  revalidateResourceSurfaces();

  return {
    ok: true,
    message: `${deletable.length} clientes eliminados${blocked.length ? `; ${blocked.length} quedaron bloqueados por proyectos u horas` : ""}`,
    deletedIds: deletable.map((client) => client.id),
    blocked: blocked.map((client) => client.name)
  };
}

export async function updateVisibleProjects(input: unknown) {
  const session = await requireSession();
  const parsed = projectVisibilitySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Selección inválida" };
  }

  const selectedIds = new Set(parsed.data.projectIds);
  const activeProjects = await prisma.project.findMany({
    where: { status: ProjectStatus.ACTIVE },
    select: { id: true }
  });

  await prisma.$transaction(
    activeProjects.map((project) =>
      prisma.userProjectVisibility.upsert({
        where: { userId_projectId: { userId: session.user.id, projectId: project.id } },
        update: { visible: selectedIds.has(project.id) },
        create: { userId: session.user.id, projectId: project.id, visible: selectedIds.has(project.id) }
      })
    )
  );

  revalidatePath("/time");
  revalidateTag("time-entry-context");
  return { ok: true, message: "Proyectos visibles actualizados" };
}

export async function refreshResourceCatalogs() {
  await requireRole([Role.ADMINISTRADOR]);
  revalidateResourceSurfaces();
  return { ok: true, message: "Datos actualizados" };
}

export async function addAllowedEmail(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`allowed-email:${session.user.id}`, 30, 60_000);

  const parsed = allowedEmailSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const allowedEmail = await prisma.allowedEmail.upsert({
    where: { email: parsed.data.email },
    update: { role: parsed.data.role as Role },
    create: { email: parsed.data.email, role: parsed.data.role as Role }
  });

  revalidatePath("/admin");

  return {
    ok: true,
    message: "Email habilitado",
    allowedEmail: {
      id: allowedEmail.id,
      email: allowedEmail.email,
      role: allowedEmail.role,
      displayName: allowedEmail.displayName,
      status: "ACTIVE"
    }
  };
}

export async function assignUserRole(input: unknown) {
  await requireSuperadmin();
  const parsed = roleAssignmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  const role = parsed.data.role as Role;
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      role,
      status: parsed.data.status as UserStatus | undefined
    }
  });

  revalidatePath("/admin");
  return { ok: true, message: "Rol actualizado" };
}

export async function previewDisabledUserDeletion(userId: string) {
  await requireSuperadmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, status: true, role: true }
  });

  if (!user) {
    return { ok: false, message: "Usuario inexistente" };
  }

  if (user.status !== UserStatus.DISABLED) {
    return { ok: false, message: "Solo se pueden eliminar usuarios DISABLED" };
  }

  const impact = await getDisabledUserDeletionImpact(user.id);
  return { ok: true, message: "Impacto calculado", impact: { ...impact, user } };
}

export async function deleteDisabledUser(input: unknown) {
  const session = await requireSuperadmin();
  const parsed = disabledUserDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  if (parsed.data.confirmation !== "ELIMINAR") {
    return { ok: false, message: "Escribí ELIMINAR para confirmar" };
  }

  if (parsed.data.userId === session.user.id) {
    return { ok: false, message: "No podés eliminar tu propio usuario" };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, status: true }
  });

  if (!user) {
    return { ok: false, message: "Usuario inexistente" };
  }

  if (user.status !== UserStatus.DISABLED) {
    return { ok: false, message: "Solo se pueden eliminar usuarios DISABLED" };
  }

  const impact = await getDisabledUserDeletionImpact(user.id);

  if (parsed.data.strategy === "PHYSICAL" && !impact.canDeletePhysically) {
    return { ok: false, message: "El usuario tiene referencias históricas; usa archivado, soft delete o anonimizacion" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.allowedEmail.deleteMany({ where: { email: user.email } });
    await tx.projectMember.deleteMany({ where: { userId: user.id } });
    await tx.timeEntryFavorite.deleteMany({ where: { userId: user.id } });
    await tx.userDashboardPreference.deleteMany({ where: { userId: user.id } });
    await tx.goalObjectiveExclusion.deleteMany({ where: { userId: user.id } });
    await tx.workSchedule.deleteMany({ where: { userId: user.id } });

    if (parsed.data.strategy === "PHYSICAL") {
      await tx.user.delete({ where: { id: user.id } });
    } else {
      const anonymize = parsed.data.strategy === "ANONYMIZE";
      await tx.goalObjective.updateMany({ where: { ownerId: user.id }, data: { active: false } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: parsed.data.strategy === "ARCHIVE" ? UserStatus.ARCHIVED : UserStatus.DELETED,
          role: Role.COLABORADOR,
          name: anonymize ? "Usuario eliminado" : undefined,
          email: anonymize ? `deleted-${user.id}@gotechy.local` : undefined,
          image: anonymize ? null : undefined,
          archivedAt: parsed.data.strategy === "ARCHIVE" ? new Date() : undefined,
          deletedAt: parsed.data.strategy === "ARCHIVE" ? undefined : new Date(),
          lastLoginAt: null
        }
      });
    }

  });

  revalidatePath("/admin");
  revalidatePath("/team");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  revalidateTag("objectives-dashboard");
  revalidateTag("tracking-data");

  return {
    ok: true,
    message: parsed.data.strategy === "PHYSICAL" ? "Usuario eliminado definitivamente" : "Usuario resuelto sin borrar referencias"
  };
}

async function getDisabledUserDeletionImpact(userId: string) {
  const [
    sessions,
    accounts,
    projectLinks,
    favorites,
    dashboardPreferences,
    workSchedule,
    timeEntries,
    assignedTrackingTasks,
    createdTrackingTasks,
    trackingHistory,
    trackingAttachments,
    createdTimeEntryThreads,
    timeEntryComments,
    ownedGoals,
    goalExclusions,
    goalMetrics,
    goalCompliances,
    goalHistorySnapshots,
    goalCheckpoints
  ] = await Promise.all([
    prisma.session.count({ where: { userId } }),
    prisma.account.count({ where: { userId } }),
    prisma.projectMember.count({ where: { userId } }),
    prisma.timeEntryFavorite.count({ where: { userId } }),
    prisma.userDashboardPreference.count({ where: { userId } }),
    prisma.workSchedule.count({ where: { userId } }),
    prisma.timeEntry.count({ where: { userId } }),
    prisma.trackingTask.count({ where: { assigneeId: userId } }),
    prisma.trackingTask.count({ where: { createdById: userId } }),
    prisma.trackingTaskHistory.count({ where: { actorId: userId } }),
    prisma.trackingTaskAttachment.count({ where: { createdById: userId } }),
    prisma.timeEntryThread.count({ where: { createdById: userId } }),
    prisma.timeEntryComment.count({ where: { authorId: userId } }),
    prisma.goalObjective.count({ where: { ownerId: userId } }),
    prisma.goalObjectiveExclusion.count({ where: { userId } }),
    prisma.goalMetric.count({ where: { userId } }),
    prisma.goalCompliance.count({ where: { userId } }),
    prisma.goalComplianceHistory.count({ where: { userId } }),
    prisma.goalCheckpoint.count({ where: { userId } })
  ]);
  const blockingReferences =
    timeEntries +
    assignedTrackingTasks +
    createdTrackingTasks +
    trackingHistory +
    trackingAttachments +
    createdTimeEntryThreads +
    timeEntryComments +
    ownedGoals +
    goalMetrics +
    goalCompliances +
    goalHistorySnapshots +
    goalCheckpoints;

  return {
    sessions,
    accounts,
    projectLinks,
    favorites,
    dashboardPreferences,
    workSchedule,
    timeEntries,
    assignedTrackingTasks,
    createdTrackingTasks,
    trackingHistory,
    trackingAttachments,
    createdTimeEntryThreads,
    timeEntryComments,
    ownedGoals,
    goalExclusions,
    goalMetrics,
    goalCompliances,
    goalHistorySnapshots,
    goalCheckpoints,
    blockingReferences,
    canDeletePhysically: blockingReferences === 0
  };
}

export async function deleteAllowedEmail(allowedEmailId: string) {
  await requireSuperadmin();
  const allowedEmail = await prisma.allowedEmail.findUnique({
    where: { id: allowedEmailId },
    select: { id: true, email: true, role: true }
  });

  if (!allowedEmail) {
    return { ok: false, message: "Email inexistente" };
  }

  if (allowedEmail.email === (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase()) {
    return { ok: false, message: "No se puede eliminar el superadmin inicial" };
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: allowedEmail.email },
      select: { id: true }
    });

    await tx.allowedEmail.delete({ where: { id: allowedEmail.id } });

    if (user) {
      await Promise.all([
        tx.session.deleteMany({ where: { userId: user.id } }),
        tx.account.deleteMany({ where: { userId: user.id } }),
        tx.projectMember.deleteMany({ where: { userId: user.id } }),
        tx.timeEntryFavorite.deleteMany({ where: { userId: user.id } }),
        tx.userDashboardPreference.deleteMany({ where: { userId: user.id } }),
        tx.goalObjectiveExclusion.deleteMany({ where: { userId: user.id } }),
        tx.workSchedule.deleteMany({ where: { userId: user.id } }),
        tx.goalObjective.updateMany({
          where: { ownerId: user.id },
          data: { active: false }
        }),
        tx.user.update({
          where: { id: user.id },
          data: {
            status: UserStatus.ARCHIVED,
            role: Role.COLABORADOR,
            lastLoginAt: null
          }
        })
      ]);
    }

  });

  revalidatePath("/admin");
  revalidatePath("/team");
  revalidateTag("objectives-dashboard");
  revalidateTag("time-entry-context");
  return { ok: true, message: "Email eliminado y usuario archivado" };
}

export async function previewAllowedEmailDeletion(allowedEmailId: string) {
  await requireSuperadmin();
  const allowedEmail = await prisma.allowedEmail.findUnique({
    where: { id: allowedEmailId },
    select: { id: true, email: true, role: true }
  });

  if (!allowedEmail) {
    return { ok: false, message: "Email inexistente" };
  }

  if (allowedEmail.email === (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase()) {
    return { ok: false, message: "No se puede eliminar el superadmin inicial" };
  }

  const impact = await getAllowedEmailDeletionImpact(allowedEmail.email);
  return { ok: true, message: "Impacto calculado", impact: { email: allowedEmail.email, role: allowedEmail.role, ...impact } };
}

async function getAllowedEmailDeletionImpact(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true }
  });

  if (!user) {
    return {
      userFound: false,
      userStatus: null,
      sessions: 0,
      accounts: 0,
      projectLinks: 0,
      favorites: 0,
      dashboardPreferences: 0,
      ownedGoals: 0,
      historicalTimeEntries: 0,
      assignedTrackingTasks: 0,
      createdTrackingTasks: 0,
      goalHistorySnapshots: 0
    };
  }

  const [
    sessions,
    accounts,
    projectLinks,
    favorites,
    dashboardPreferences,
    ownedGoals,
    historicalTimeEntries,
    assignedTrackingTasks,
    createdTrackingTasks,
    goalHistorySnapshots
  ] = await Promise.all([
    prisma.session.count({ where: { userId: user.id } }),
    prisma.account.count({ where: { userId: user.id } }),
    prisma.projectMember.count({ where: { userId: user.id } }),
    prisma.timeEntryFavorite.count({ where: { userId: user.id } }),
    prisma.userDashboardPreference.count({ where: { userId: user.id } }),
    prisma.goalObjective.count({ where: { ownerId: user.id } }),
    prisma.timeEntry.count({ where: { userId: user.id } }),
    prisma.trackingTask.count({ where: { assigneeId: user.id } }),
    prisma.trackingTask.count({ where: { createdById: user.id } }),
    prisma.goalComplianceHistory.count({ where: { userId: user.id } })
  ]);

  return {
    userFound: true,
    userStatus: user.status,
    sessions,
    accounts,
    projectLinks,
    favorites,
    dashboardPreferences,
    ownedGoals,
    historicalTimeEntries,
    assignedTrackingTasks,
    createdTrackingTasks,
    goalHistorySnapshots
  };
}

export async function updateThemeVariant(input: unknown) {
  const session = await requireSession();
  const parsed = themeVariantSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Tema inválido" };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { themeVariant: parsed.data.themeVariant as ThemeVariant }
  });

  return { ok: true, message: "Tema actualizado" };
}

export async function upsertCategory(input: unknown) {
  await requireSuperadmin();
  const parsed = categorySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  const data = {
    name: parsed.data.name.trim(),
    color: parsed.data.color,
    kind: parsed.data.kind,
    active: parsed.data.active
  };
  if (parsed.data.id) {
    await prisma.category.update({ where: { id: parsed.data.id }, data });
  } else {
    await prisma.category.create({ data });
  }

  revalidatePath("/admin");
  revalidatePath("/time");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  return { ok: true, message: parsed.data.id ? "Categoría actualizada" : "Categoría creada" };
}

export async function deleteCategory(categoryId: string) {
  await requireSuperadmin();
  const count = await prisma.timeEntry.count({ where: { categoryId } });

  if (count > 0) {
    await prisma.category.update({ where: { id: categoryId }, data: { active: false } });
    revalidatePath("/admin");
    revalidatePath("/time");
    revalidateTag("time-entry-context");
    revalidateTag("dashboard-metrics");
    return { ok: true, message: "Categoría desactivada porque tiene minutos asociados" };
  }

  await prisma.category.delete({ where: { id: categoryId } });
  revalidatePath("/admin");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  return { ok: true, message: "Categoría eliminada" };
}

export async function upsertProjectType(input: unknown) {
  await requireSuperadmin();
  const parsed = projectTypeSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  const data = {
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    active: parsed.data.active,
    monthlyReset: parsed.data.monthlyReset
  };

  if (parsed.data.id) {
    await prisma.projectType.update({ where: { id: parsed.data.id }, data });
  } else {
    await prisma.projectType.create({ data });
  }

  revalidatePath("/admin");
  revalidatePath("/projects");
  revalidatePath("/time");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  return { ok: true, message: parsed.data.id ? "Tipo actualizado" : "Tipo creado" };
}

export async function deleteProjectType(projectTypeId: string) {
  await requireSuperadmin();
  const count = await prisma.project.count({ where: { projectTypeId } });

  if (count > 0) {
    await prisma.projectType.update({ where: { id: projectTypeId }, data: { active: false } });
    revalidatePath("/admin");
    revalidatePath("/projects");
    revalidateTag("time-entry-context");
    revalidateTag("dashboard-metrics");
    return { ok: true, message: "Tipo desactivado porque tiene proyectos asociados" };
  }

  await prisma.projectType.delete({ where: { id: projectTypeId } });

  revalidatePath("/admin");
  revalidatePath("/projects");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  return { ok: true, message: "Tipo eliminado" };
}

export async function updateWorkSchedule(input: unknown) {
  await requireSuperadmin();
  const parsed = workScheduleSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  await prisma.workSchedule.upsert({
    where: { userId: parsed.data.userId },
    update: {
      weeklyMinutes: parsed.data.weeklyMinutes,
      dailyMinutes: parsed.data.dailyMinutes,
      workdays: parsed.data.workdays,
      modality: parsed.data.modality as WorkModality
    },
    create: {
      userId: parsed.data.userId,
      weeklyMinutes: parsed.data.weeklyMinutes,
      dailyMinutes: parsed.data.dailyMinutes,
      workdays: parsed.data.workdays,
      modality: parsed.data.modality as WorkModality
    }
  });

  revalidatePath("/team");
  revalidatePath("/admin");
  return { ok: true, message: "Horario laboral actualizado" };
}

export async function logReportExport(_format: "CSV" | "XLSX" | "PDF" | "MASTER_XLSX") {
  void _format;
  await requireSession();
  return { ok: true };
}
