import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminData } from "@/lib/data/resources";
import { isSuperadmin } from "@/lib/permissions";
import { AdminPanel } from "@/components/admin/admin-panel";

export default async function AdminPage() {
  const session = await auth();

  if (!isSuperadmin(session?.user.role)) {
    redirect("/");
  }

  const data = await getAdminData();

  return <AdminPanel data={data} />;
}
