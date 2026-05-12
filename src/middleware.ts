import NextAuth from "next-auth";
import { NextResponse } from "next/server";

const publicRoutes = ["/login", "/access-denied"];

const { auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
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
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }

      return true;
    }
  }
});

export default auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest).*)"]
};
