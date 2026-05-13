import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getReportsData } from "@/lib/data/resources";
import { canDeleteTimeHistory, canViewGlobalReports } from "@/lib/permissions";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage() {
  const session = await auth();
  if (!canViewGlobalReports(session)) {
    redirect("/");
  }

  const rows = await getReportsData();

  return <ReportsClient rows={rows} canDeleteHistory={canDeleteTimeHistory(session)} />;
}
