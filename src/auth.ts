import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { AuditAction, Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_SUPERADMIN_EMAIL = "rodrigorib41@gmail.com";
const hasDatabase = Boolean(process.env.DATABASE_URL);
const bootstrapRoles = [Role.SUPERADMIN];

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

function isBootstrapSuperadmin(email: string) {
  return normalizeEmail(process.env.SUPERADMIN_EMAIL || DEFAULT_SUPERADMIN_EMAIL) === email;
}

function primaryRole(roles: Role[]) {
  if (roles.includes(Role.SUPERADMIN)) return Role.SUPERADMIN;
  if (roles.includes(Role.ADMINISTRATOR)) return Role.ADMINISTRATOR;
  if (roles.includes(Role.REPORTER)) return Role.REPORTER;
  return Role.COLLABORATOR;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasDatabase ? PrismaAdapter(prisma) : undefined,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8
  },
  pages: {
    signIn: "/login",
    error: "/access-denied"
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      allowDangerousEmailAccountLinking: true
    })
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const email = normalizeEmail(user.email ?? profile?.email);

      if (!email) {
        return "/access-denied";
      }

      if (!hasDatabase) {
        return isBootstrapSuperadmin(email) ? true : `/access-denied?email=${encodeURIComponent(email)}`;
      }

      const [existingUser, allowedEmail] = await Promise.all([
        prisma.user.findUnique({
          where: { email },
          select: { id: true, status: true }
        }),
        prisma.allowedEmail.findUnique({
          where: { email },
          select: { role: true, roles: true }
        })
      ]);

      if (existingUser?.status === UserStatus.DISABLED) {
        return `/access-denied?email=${encodeURIComponent(email)}`;
      }

      const allowed = isBootstrapSuperadmin(email) || allowedEmail || existingUser?.status === UserStatus.ACTIVE;

      if (!allowed) {
        await prisma.auditLog.create({
          data: {
            action: AuditAction.DENIED_LOGIN,
            entity: "User",
            metadata: { email }
          }
        });
        return `/access-denied?email=${encodeURIComponent(email)}`;
      }

      return true;
    },
    async jwt({ token, user }) {
      const email = normalizeEmail(user?.email ?? token.email);

      if (!email) {
        return token;
      }

      if (!hasDatabase) {
        const roles = isBootstrapSuperadmin(email) ? bootstrapRoles : [Role.COLLABORATOR];
        token.id = isBootstrapSuperadmin(email) ? "bootstrap-superadmin" : email;
        token.roles = roles;
        token.role = primaryRole(roles);
        token.status = UserStatus.ACTIVE;
        return token;
      }

      const allowedEmail = await prisma.allowedEmail.findUnique({
        where: { email },
        select: { role: true, roles: true }
      });

      const desiredRoles = isBootstrapSuperadmin(email)
        ? bootstrapRoles
        : allowedEmail?.roles?.length
          ? allowedEmail.roles
          : [allowedEmail?.role ?? Role.COLLABORATOR];
      const role = primaryRole(desiredRoles);
      const status = UserStatus.ACTIVE;

      const dbUser = await prisma.user.upsert({
        where: { email },
        update: {
          name: user?.name ?? token.name,
          image: user?.image ?? token.picture,
          role,
          status,
          lastLoginAt: new Date()
        },
        create: {
          email,
          name: user?.name ?? token.name,
          image: user?.image ?? token.picture,
          role,
          status,
          lastLoginAt: new Date()
        },
        select: { id: true, role: true, status: true }
      });

      await prisma.userRole.createMany({
        data: desiredRoles.map((userRole) => ({ userId: dbUser.id, role: userRole })),
        skipDuplicates: true
      });

      await prisma.workSchedule.upsert({
        where: { userId: dbUser.id },
        update: {},
        create: { userId: dbUser.id }
      });

      const dbRoles = await prisma.userRole.findMany({
        where: { userId: dbUser.id },
        select: { role: true }
      });
      const roles = dbRoles.length ? dbRoles.map((item) => item.role) : [dbUser.role];

      token.id = dbUser.id;
      token.roles = roles;
      token.role = primaryRole(roles);
      token.status = dbUser.status;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = token.role as Role;
        session.user.roles = (token.roles as Role[] | undefined) ?? [token.role as Role];
        session.user.status = token.status as UserStatus;
      }

      return session;
    }
  },
  events: {
    async signIn({ user }) {
      if (!hasDatabase) {
        return;
      }

      const email = normalizeEmail(user.email);

      await prisma.auditLog.create({
        data: {
          action: AuditAction.LOGIN,
          entity: "User",
          entityId: user.id,
          metadata: { email }
        }
      });
    }
  }
});
