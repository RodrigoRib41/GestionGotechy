import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getClientsPageData } from "@/lib/data/resources";
import { canManageResources } from "@/lib/permissions";
import { ClientsClient } from "@/components/resources/clients-client";

export default async function ClientsPage() {
  const session = await auth();
  if (!canManageResources(session)) {
    redirect("/");
  }

  const clients = await getClientsPageData();

  return <ClientsClient clients={clients} />;
}
