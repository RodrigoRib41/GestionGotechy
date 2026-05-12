import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminData } from "@/lib/data/resources";
import { AdminPanel } from "@/components/admin/admin-panel";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user.roles?.includes("SUPERADMIN")) {
    redirect("/");
  }

  const data = await getAdminData();

  return <AdminPanel data={data} />;
}
