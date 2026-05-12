import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getProjectsPageData } from "@/lib/data/resources";
import { canManageResources } from "@/lib/permissions";
import { ProjectsClient } from "@/components/resources/projects-client";

export default async function ProjectsPage() {
  const session = await auth();
  if (!canManageResources(session)) {
    redirect("/");
  }

  const data = await getProjectsPageData();

  return <ProjectsClient clients={data.clients} projects={data.projects} />;
}
