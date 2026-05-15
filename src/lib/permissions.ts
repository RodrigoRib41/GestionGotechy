import { Role, UserStatus } from "@prisma/client";
import type { Session } from "next-auth";

import { auth } from "@/auth";

export function getRole(session?: Session | null) {
  return session?.user.role ?? null;
}

export function hasRole(session: Session | null | undefined, allowedRoles: Role[]) {
  const role = getRole(session);
  return role === Role.SUPERADMIN || Boolean(role && allowedRoles.includes(role));
}

export function isSuperadmin(role?: Role | null) {
  return role === Role.SUPERADMIN;
}

export async function requireSession() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    throw new Error("Cuenta sin acceso activo");
  }

  return session;
}

export async function requireSuperadmin() {
  const session = await requireSession();

  if (!isSuperadmin(session.user.role)) {
    throw new Error("Permisos insuficientes");
  }

  return session;
}

export async function requireRole(allowedRoles: Role[]) {
  const session = await requireSession();

  if (!hasRole(session, allowedRoles)) {
    throw new Error("Permisos insuficientes");
  }

  return session;
}

export function canManageResources(session: Session | null | undefined) {
  return hasRole(session, [Role.ADMINISTRADOR]);
}

export function canDeleteResources(session: Session | null | undefined) {
  return hasRole(session, [Role.SUPERADMIN]);
}

export function canViewGlobalReports(session: Session | null | undefined) {
  return hasRole(session, [Role.ADMINISTRADOR]);
}

export function canImportTimeHistory(session: Session | null | undefined) {
  return hasRole(session, [Role.SUPERADMIN]);
}

export function canManageTracking(session: Session | null | undefined) {
  return hasRole(session, [Role.ADMINISTRADOR]);
}

export function canDeleteTracking(session: Session | null | undefined) {
  return hasRole(session, [Role.SUPERADMIN]);
}

export function canExportTracking(session: Session | null | undefined) {
  return hasRole(session, [Role.ADMINISTRADOR]);
}

export function canViewTracking(session: Session | null | undefined) {
  return hasRole(session, [Role.COLABORADOR, Role.ADMINISTRADOR]);
}

export function canViewObjectives(session: Session | null | undefined) {
  return hasRole(session, [Role.ADMINISTRADOR]);
}

export function canManageObjectives(session: Session | null | undefined) {
  return hasRole(session, [Role.SUPERADMIN]);
}

export function canDeleteTimeHistory(session: Session | null | undefined) {
  return hasRole(session, [Role.SUPERADMIN]);
}
