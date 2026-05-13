"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, BriefcaseBusiness, Building2, Clock3, TimerReset, UsersRound } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatMinutes } from "@/lib/utils";

type DashboardData = Awaited<ReturnType<typeof import("@/lib/data/dashboard").getDashboardData>>;

const ChartGrid = dynamic(() => import("@/components/dashboard/dashboard-charts").then((mod) => mod.DashboardCharts), {
  ssr: false,
  loading: () => <ChartsSkeleton />
});

const ranges = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "last-month", label: "Ultimo mes" },
  { value: "quarter", label: "3 meses" },
  { value: "custom", label: "Rango" }
] as const;

export function DashboardClient({ data }: { data: DashboardData }) {
  const kpis = useMemo(
    () => [
      { label: "Tiempo total", value: formatMinutes(data.metrics.totalMinutes), helper: `${data.metrics.entryCount} registros`, icon: Clock3 },
      { label: "Tiempo extra", value: formatMinutes(data.metrics.totalOvertimeMinutes), helper: `${data.metrics.previousDeltaPercent}% vs periodo previo`, icon: TimerReset },
      { label: "Clientes activos", value: String(data.metrics.activeClients), helper: "Con consumo en el periodo", icon: Building2 },
      { label: "Proyectos activos", value: String(data.metrics.activeProjects), helper: `${data.topProjectsActive.length} top activos`, icon: BriefcaseBusiness },
      { label: "Promedio diario", value: formatMinutes(data.metrics.averageDailyMinutes), helper: `${data.metrics.productivity}% productivo`, icon: BarChart3 },
      { label: "Empleados activos", value: String(data.metrics.activeEmployees), helper: `${data.metrics.loadCompletion}% cargaron hoy`, icon: UsersRound }
    ],
    [data]
  );

  return (
    <div className="space-y-4">
      <PeriodFilters range={data.range} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((metric) => {
          const Icon = metric.icon;

          return (
            <Card key={metric.label} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">{metric.label}</p>
                    <div className="mt-1 truncate text-2xl font-semibold tracking-normal">{metric.value}</div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{metric.helper}</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="h-4 w-4 text-teal-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <ChartGrid data={data} />
    </div>
  );
}

function PeriodFilters({ range }: { range: DashboardData["range"] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  function apply(next: { preset: string; from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", next.preset);

    if (next.preset === "custom" && next.from && next.to) {
      params.set("from", next.from);
      params.set("to", next.to);
    } else {
      params.delete("from");
      params.delete("to");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <BrandMark compact className="h-8 w-8" />
          <h2 className="text-sm font-semibold">Periodo del dashboard</h2>
          <Badge variant="outline">{range.label}</Badge>
          {isPending ? <Badge variant="warning">Actualizando</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Por defecto se muestra el mes en curso; al cambiar de mes empieza un periodo limpio automaticamente.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ranges.map((item) => (
          <button
            key={item.value}
            className={cn(
              "h-8 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted",
              range.preset === item.value && "border-primary bg-primary text-primary-foreground hover:bg-primary"
            )}
            type="button"
            onClick={() => apply({ preset: item.value, from, to })}
          >
            {item.label}
          </button>
        ))}
        <Input className="h-8 w-36 text-xs" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Input className="h-8 w-36 text-xs" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Button className="h-8" size="sm" variant="outline" onClick={() => apply({ preset: "custom", from, to })}>
          Aplicar
        </Button>
      </div>
    </section>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-card p-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
      ))}
    </div>
  );
}
