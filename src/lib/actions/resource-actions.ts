"use server";

import { AuditAction, Category, ProjectType, Role, UserStatus, WorkModality } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  allowedEmailSchema,
  categorySchema,
  clientSchema,
  projectSchema,
  roleAssignmentSchema,
  workScheduleSchema
} from "@/lib/validators";

function primaryRole(roles: Role[]) {
  if (roles.includes(Role.SUPERADMIN)) return Role.SUPERADMIN;
  if (roles.includes(Role.ADMINISTRATOR)) return Role.ADMINISTRATOR;
  if (roles.includes(Role.REPORTER)) return Role.REPORTER;
  return Role.COLLABORATOR;
}

export async function createProject(input: unknown) {
  const session = await requireRole([Role.ADMINISTRATOR]);
  assertRateLimit(`project:${session.user.id}`, 20, 60_000);

  const parsed = projectSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name.trim(),
      code: parsed.data.code,
      clientId: parsed.data.clientId,
      type: parsed.data.type as ProjectType,
      estimatedMinutes: Math.round(parsed.data.estimatedHours * 60)
    }
  });

  await prisma.auditLog.create({
    data: { action: AuditAction.CREATE, entity: "Project", entityId: project.id, actorId: session.user.id }
  });

  revalidatePath("/projects");
  revalidatePath("/");

  return { ok: true, message: "Proyecto creado" };
}

export async function updateProject(input: unknown) {
  const session = await requireRole([Role.ADMINISTRATOR]);
  const parsed = projectSchema.safeParse(input);

  if (!parsed.success || !parsed.data.id) {
    return { ok: false, message: "Datos invalidos" };
  }

  await prisma.project.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name.trim(),
      code: parsed.data.code,
      clientId: parsed.data.clientId,
      type: parsed.data.type as ProjectType,
      estimatedMinutes: Math.round(parsed.data.estimatedHours * 60)
    }
  });

  await prisma.auditLog.create({
    data: { action: AuditAction.UPDATE, entity: "Project", entityId: parsed.data.id, actorId: session.user.id }
  });

  revalidatePath("/projects");
  return { ok: true, message: "Proyecto actualizado" };
}

export async function deleteProject(projectId: string) {
  const session = await requireRole([Role.ADMINISTRATOR]);
  const entryCount = await prisma.timeEntry.count({ where: { projectId } });

  if (entryCount > 0) {
    return { ok: false, message: "No se puede eliminar un proyecto con horas registradas" };
  }

  await prisma.project.delete({ where: { id: projectId } });
  await prisma.auditLog.create({
    data: { action: AuditAction.DELETE, entity: "Project", entityId: projectId, actorId: session.user.id }
  });

  revalidatePath("/projects");
  return { ok: true, message: "Proyecto eliminado" };
}

export async function createClient(input: unknown) {
  const session = await requireRole([Role.ADMINISTRATOR]);
  assertRateLimit(`client:${session.user.id}`, 20, 60_000);

  const parsed = clientSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const client = await prisma.client.create({
    data: { name: parsed.data.name.trim(), code: parsed.data.code, description: parsed.data.description?.trim() }
  });

  await prisma.auditLog.create({
    data: { action: AuditAction.CREATE, entity: "Client", entityId: client.id, actorId: session.user.id }
  });

  revalidatePath("/clients");
  revalidatePath("/projects");

  return { ok: true, message: "Cliente creado" };
}

export async function updateClient(input: unknown) {
  const session = await requireRole([Role.ADMINISTRATOR]);
  const parsed = clientSchema.safeParse(input);

  if (!parsed.success || !parsed.data.id) {
    return { ok: false, message: "Datos invalidos" };
  }

  await prisma.client.update({
    where: { id: parsed.data.id },
    data: { name: parsed.data.name.trim(), code: parsed.data.code, description: parsed.data.description?.trim() }
  });

  await prisma.auditLog.create({
    data: { action: AuditAction.UPDATE, entity: "Client", entityId: parsed.data.id, actorId: session.user.id }
  });

  revalidatePath("/clients");
  return { ok: true, message: "Cliente actualizado" };
}

export async function deleteClient(clientId: string) {
  const session = await requireRole([Role.ADMINISTRATOR]);
  const [entryCount, activeProjectCount] = await Promise.all([
    prisma.timeEntry.count({ where: { clientId } }),
    prisma.project.count({ where: { clientId, status: "ACTIVE" } })
  ]);

  if (entryCount > 0) {
    return { ok: false, message: "No se puede eliminar un cliente con horas cargadas" };
  }

  if (activeProjectCount > 0) {
    return { ok: false, message: "No se puede eliminar un cliente con proyectos activos" };
  }

  await prisma.client.delete({ where: { id: clientId } });
  await prisma.auditLog.create({
    data: { action: AuditAction.DELETE, entity: "Client", entityId: clientId, actorId: session.user.id }
  });

  revalidatePath("/clients");
  revalidatePath("/projects");
  return { ok: true, message: "Cliente eliminado" };
}

export async function addAllowedEmail(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`allowed-email:${session.user.id}`, 30, 60_000);

  const parsed = allowedEmailSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos invalidos" };
  }

  const roles = parsed.data.roles as Role[];
  const allowedEmail = await prisma.allowedEmail.upsert({
    where: { email: parsed.data.email },
    update: { role: primaryRole(roles), roles },
    create: { email: parsed.data.email, role: primaryRole(roles), roles }
  });

  await prisma.auditLog.create({
    data: {
      action: AuditAction.ROLE_CHANGE,
      entity: "AllowedEmail",
      entityId: allowedEmail.id,
      actorId: session.user.id,
      metadata: { email: allowedEmail.email, roles }
    }
  });

  revalidatePath("/admin");

  return { ok: true, message: "Email habilitado" };
}

export async function assignUserRoles(input: unknown) {
  const session = await requireSuperadmin();
  const parsed = roleAssignmentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const roles = parsed.data.roles as Role[];
  await prisma.$transaction([
    prisma.user.update({
      where: { id: parsed.data.userId },
      data: {
        role: primaryRole(roles),
        status: parsed.data.status as UserStatus | undefined
      }
    }),
    prisma.userRole.deleteMany({ where: { userId: parsed.data.userId } }),
    prisma.userRole.createMany({ data: roles.map((role) => ({ userId: parsed.data.userId, role })) })
  ]);

  await prisma.auditLog.create({
    data: {
      action: AuditAction.ROLE_CHANGE,
      entity: "User",
      entityId: parsed.data.userId,
      actorId: session.user.id,
      metadata: { roles, status: parsed.data.status }
    }
  });

  revalidatePath("/admin");
  return { ok: true, message: "Roles actualizados" };
}

export async function upsertCategory(input: unknown) {
  const session = await requireSuperadmin();
  const parsed = categorySchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const data = {
    name: parsed.data.name.trim(),
    color: parsed.data.color,
    kind: parsed.data.kind,
    active: parsed.data.active
  };
  const category: Category = parsed.data.id
    ? await prisma.category.update({ where: { id: parsed.data.id }, data })
    : await prisma.category.create({ data });

  await prisma.auditLog.create({
    data: { action: AuditAction.CONFIG_CHANGE, entity: "Category", entityId: category.id, actorId: session.user.id }
  });

  revalidatePath("/admin");
  revalidatePath("/time");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  return { ok: true, message: parsed.data.id ? "Categoria actualizada" : "Categoria creada" };
}

export async function deleteCategory(categoryId: string) {
  const session = await requireSuperadmin();
  const count = await prisma.timeEntry.count({ where: { categoryId } });

  if (count > 0) {
    await prisma.category.update({ where: { id: categoryId }, data: { active: false } });
    revalidatePath("/admin");
    revalidatePath("/time");
    revalidateTag("time-entry-context");
    revalidateTag("dashboard-metrics");
    return { ok: true, message: "Categoria desactivada porque tiene horas asociadas" };
  }

  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.auditLog.create({
    data: { action: AuditAction.CONFIG_CHANGE, entity: "Category", entityId: categoryId, actorId: session.user.id }
  });
  revalidatePath("/admin");
  revalidateTag("time-entry-context");
  revalidateTag("dashboard-metrics");
  return { ok: true, message: "Categoria eliminada" };
}

export async function updateWorkSchedule(input: unknown) {
  const session = await requireSuperadmin();
  const parsed = workScheduleSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
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

  await prisma.auditLog.create({
    data: { action: AuditAction.CONFIG_CHANGE, entity: "WorkSchedule", entityId: parsed.data.userId, actorId: session.user.id }
  });

  revalidatePath("/team");
  revalidatePath("/admin");
  return { ok: true, message: "Horario laboral actualizado" };
}

export async function logReportExport(format: "CSV" | "XLSX" | "PDF" | "MASTER_XLSX") {
  const session = await requireSession();

  await prisma.auditLog.create({
    data: { action: AuditAction.EXPORT, entity: "Report", actorId: session.user.id, metadata: { format } }
  });
}
