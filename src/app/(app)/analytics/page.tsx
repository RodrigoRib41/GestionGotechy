import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { canViewGlobalReports } from "@/lib/permissions";
import { AnalyticsClient } from "@/components/analytics/analytics-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await auth();
  if (!canViewGlobalReports(session)) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const data = await getDashboardData({
    preset: valueOf(params.preset),
    from: valueOf(params.from),
    to: valueOf(params.to)
  });

  return <AnalyticsClient data={data} />;
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}
