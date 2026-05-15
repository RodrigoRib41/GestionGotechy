import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getProjectsPageData } from "@/lib/data/resources";
import { canDeleteResources, canManageResources } from "@/lib/permissions";
import { ProjectsClient } from "@/components/resources/projects-client";

export default async function ProjectsPage() {
  const session = await auth();
  if (!canManageResources(session)) {
    redirect("/");
  }

  const data = await getProjectsPageData();

  return <ProjectsClient canDelete={canDeleteResources(session)} clients={data.clients} projectTypes={data.projectTypes} projects={data.projects} />;
}
