import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { getTimeEntryContext } from "@/lib/data/time";
import { hasRole } from "@/lib/permissions";
import { QuickTimeEntry } from "@/components/time/quick-time-entry";

export default async function TimePage() {
  const session = await auth();
  if (!hasRole(session, [Role.COLLABORATOR])) {
    redirect("/");
  }

  const context = await getTimeEntryContext();

  return <QuickTimeEntry {...context} />;
}
