import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminData } from "@/lib/data/resources";
import { TeamClient } from "@/components/team/team-client";

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user.roles?.includes("SUPERADMIN")) {
    redirect("/");
  }

  const data = await getAdminData();

  return <TeamClient users={data.users} />;
}
