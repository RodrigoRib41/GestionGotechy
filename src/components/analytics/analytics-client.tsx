"use client";

import { DashboardClient } from "@/components/dashboard/dashboard-client";

type DashboardData = Awaited<ReturnType<typeof import("@/lib/data/dashboard").getDashboardData>>;

export function AnalyticsClient({ data }: { data: DashboardData }) {
  return <DashboardClient data={data} />;
}
