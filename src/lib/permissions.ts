import { Role } from "@prisma/client";
import type { Session } from "next-auth";

import { auth } from "@/auth";

export function getRoles(session?: Session | null) {
  return session?.user.roles?.length ? session.user.roles : session?.user.role ? [session.user.role] : [];
}

export function hasRole(session: Session | null | undefined, roles: Role[]) {
  const userRoles = getRoles(session);
  return userRoles.includes(Role.SUPERADMIN) || roles.some((role) => userRoles.includes(role));
}

export function isSuperadmin(roleOrRoles?: Role | Role[] | null) {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : roleOrRoles ? [roleOrRoles] : [];
  return roles.includes(Role.SUPERADMIN);
}

export async function requireSession() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("No autenticado");
  }

  return session;
}

export async function requireSuperadmin() {
  const session = await requireSession();

  if (!isSuperadmin(session.user.roles)) {
    throw new Error("Permisos insuficientes");
  }

  return session;
}

export async function requireRole(roles: Role[]) {
  const session = await requireSession();

  if (!hasRole(session, roles)) {
    throw new Error("Permisos insuficientes");
  }

  return session;
}

export function canManageResources(session: Session | null | undefined) {
  return hasRole(session, [Role.ADMINISTRATOR]);
}

export function canViewGlobalReports(session: Session | null | undefined) {
  return hasRole(session, [Role.REPORTER]);
}
