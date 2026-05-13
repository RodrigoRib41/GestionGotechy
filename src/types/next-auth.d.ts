import { Role, ThemeVariant, UserStatus } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      themeVariant: ThemeVariant;
      status: UserStatus;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    themeVariant?: ThemeVariant;
    status?: UserStatus;
  }
}
