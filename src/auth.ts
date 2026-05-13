import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { AuditAction, Role, ThemeVariant, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_SUPERADMIN_EMAIL = "rodrigorib41@gmail.com";
const hasDatabase = Boolean(process.env.DATABASE_URL);

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

function isBootstrapSuperadmin(email: string) {
  return normalizeEmail(process.env.SUPERADMIN_EMAIL || DEFAULT_SUPERADMIN_EMAIL) === email;
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
          select: { role: true }
        })
      ]);

      if (existingUser?.status === UserStatus.DISABLED || existingUser?.status === UserStatus.DELETED) {
        return `/access-denied?email=${encodeURIComponent(email)}`;
      }

      if (existingUser?.status === UserStatus.ARCHIVED && !allowedEmail && !isBootstrapSuperadmin(email)) {
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
        const role = isBootstrapSuperadmin(email) ? Role.SUPERADMIN : Role.COLABORADOR;
        token.id = isBootstrapSuperadmin(email) ? "bootstrap-superadmin" : email;
        token.role = role;
        token.themeVariant = ThemeVariant.DEFAULT;
        token.status = UserStatus.ACTIVE;
        return token;
      }

      const [allowedEmail, existingDbUser] = await Promise.all([
        prisma.allowedEmail.findUnique({
          where: { email },
          select: { role: true }
        }),
        prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, status: true, themeVariant: true }
        })
      ]);

      if (!user && existingDbUser) {
        token.id = existingDbUser.id;
        token.role = isBootstrapSuperadmin(email) ? Role.SUPERADMIN : existingDbUser.role;
        token.themeVariant = existingDbUser.themeVariant;
        token.status = existingDbUser.status;
        return token;
      }

      const role = isBootstrapSuperadmin(email)
        ? Role.SUPERADMIN
        : allowedEmail?.role ?? existingDbUser?.role ?? Role.COLABORADOR;
      const status = UserStatus.ACTIVE;
      const dbUser = user
        ? await prisma.user.upsert({
            where: { email },
            update: {
              name: user.name ?? token.name,
              image: user.image ?? token.picture,
              role,
              status,
              lastLoginAt: new Date()
            },
            create: {
              email,
              name: user.name ?? token.name,
              image: user.image ?? token.picture,
              role,
              status,
              lastLoginAt: new Date()
            },
            select: { id: true, role: true, status: true, themeVariant: true }
          })
        : existingDbUser;

      if (!dbUser) {
        token.id = email;
        token.role = role;
        token.themeVariant = ThemeVariant.DEFAULT;
        token.status = status;
        return token;
      }

      if (user) {
        await prisma.workSchedule.upsert({
          where: { userId: dbUser.id },
          update: {},
          create: { userId: dbUser.id }
        });
      }

      token.id = dbUser.id;
      token.role = dbUser.role;
      token.themeVariant = dbUser.themeVariant;
      token.status = dbUser.status;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = token.role as Role;
        session.user.themeVariant = (token.themeVariant as ThemeVariant | undefined) ?? ThemeVariant.DEFAULT;
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
