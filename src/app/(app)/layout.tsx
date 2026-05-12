import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { auth } from "@/auth";
import { AppShell } from "@/components/navigation/app-shell";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}
