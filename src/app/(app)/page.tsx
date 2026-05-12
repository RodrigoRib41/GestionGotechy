import { getDashboardData } from "@/lib/data/dashboard";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const data = await getDashboardData({
    preset: valueOf(params.preset),
    from: valueOf(params.from),
    to: valueOf(params.to)
  });

  return <DashboardClient data={data} />;
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}
