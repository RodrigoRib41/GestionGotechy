import NextAuth from "next-auth";
import { NextResponse } from "next/server";

const publicRoutes = ["/login", "/access-denied"];
const protectedRoutes: Array<{ prefix: string; allowedRoles: string[] }> = [
  { prefix: "/api/admin", allowedRoles: ["SUPERADMIN"] },
  { prefix: "/admin", allowedRoles: ["SUPERADMIN"] },
  { prefix: "/team", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR"] },
  { prefix: "/reports", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR"] },
  { prefix: "/projects", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR"] },
  { prefix: "/clients", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR"] },
  { prefix: "/tracking", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR", "COLABORADOR"] },
  { prefix: "/objectives", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR"] },
  { prefix: "/time", allowedRoles: ["SUPERADMIN", "ADMINISTRADOR", "COLABORADOR"] }
];

function normalizeEmail(email?: unknown) {
  return typeof email === "string" ? email.trim().replace(/^["']|["']$/g, "").toLowerCase() : "";
}

function normalizeRole(role?: unknown) {
  if (role === "SUPERADMIN") return "SUPERADMIN";
  if (role === "ADMINISTRADOR" || role === "ADMINISTRATOR") return "ADMINISTRADOR";
  if (role === "COLABORADOR" || role === "COLLABORATOR") return "COLABORADOR";
  return "";
}

function normalizeStatus(status?: unknown) {
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "DISABLED") return "DISABLED";
  if (status === "PENDING") return "PENDING";
  if (status === "ARCHIVED") return "ARCHIVED";
  if (status === "DELETED") return "DELETED";
  return "";
}

function getEffectiveRole(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const source = payload as Record<string, unknown>;
  const email = normalizeEmail(source.email);
  const superadminEmails = (process.env.SUPERADMIN_EMAIL ?? "")
    .split(/[,\s;]+/)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

  if (email && superadminEmails.includes(email)) {
    return "SUPERADMIN";
  }

  return normalizeRole(source.role);
}

const { auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token }) {
      const role = getEffectiveRole(token);
      if (role) {
        token.role = role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = getEffectiveRole(token) as typeof session.user.role;
        session.user.status = normalizeStatus(token.status) as typeof session.user.status;
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const isPublic = publicRoutes.some((route) => pathname.startsWith(route));

      if (isPublic) {
        if (session?.user && pathname === "/login") {
          return NextResponse.redirect(new URL("/", request.url));
        }
        return true;
      }

      if (!session?.user) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ message: "No autenticado" }, { status: 401 });
        }

        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }

      if (normalizeStatus(session.user.status) && normalizeStatus(session.user.status) !== "ACTIVE") {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ message: "Cuenta sin acceso activo" }, { status: 403 });
        }

        return NextResponse.redirect(new URL("/access-denied", request.url));
      }

      const route = protectedRoutes.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));

      if (route) {
        const role = getEffectiveRole(session.user);
        const allowed = role === "SUPERADMIN" || route.allowedRoles.includes(role);

        if (!allowed) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
          }

          return NextResponse.redirect(new URL("/access-denied", request.url));
        }
      }

      return true;
    }
  }
});

export default auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
