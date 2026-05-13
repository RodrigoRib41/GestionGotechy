import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { UserStatus } from "@prisma/client";

import { auth } from "@/auth";
import { AppShell } from "@/components/navigation/app-shell";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    redirect("/access-denied");
  }

  const themeVariant = session.user.themeVariant.toLowerCase();

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.dataset.theme=localStorage.getItem("gotechy:theme-variant")||"${themeVariant}"}catch(e){document.documentElement.dataset.theme="${themeVariant}"}`,
        }}
      />
      <AppShell user={session.user}>{children}</AppShell>
    </>
  );
}
