import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ObjectivesClient } from "@/components/objectives/objectives-client";
import { getObjectivesData } from "@/lib/data/objectives";
import { canViewObjectives } from "@/lib/permissions";

export default async function ObjectivesPage() {
  const session = await auth();

  if (!canViewObjectives(session)) {
    redirect("/");
  }

  const data = await getObjectivesData();

  return <ObjectivesClient data={data} />;
}
