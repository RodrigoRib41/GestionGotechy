import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await auth();

  if (session?.user.role === Role.COLABORADOR) {
    redirect("/time");
  }

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
