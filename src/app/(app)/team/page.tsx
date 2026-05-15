import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminData } from "@/lib/data/resources";
import { canManageResources } from "@/lib/permissions";
import { TeamClient } from "@/components/team/team-client";

export default async function TeamPage() {
  const session = await auth();
  if (!canManageResources(session)) {
    redirect("/");
  }

  const data = await getAdminData();

  return <TeamClient users={data.users.filter((user) => user.status === "ACTIVE")} />;
}
