"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Pin, PinOff, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { pinDashboard, unpinDashboard } from "@/lib/actions/dashboard-actions";
import { getCategoryKindMeta } from "@/lib/category-kind";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatMinutes } from "@/lib/utils";

type DashboardData = Awaited<ReturnType<typeof import("@/lib/data/dashboard").getDashboardData>>;
type DashboardCategory = "Operativo" | "Productividad" | "Financiero" | "Proyectos" | "Empleados" | "Tendencias" | "Comparativas";
type DashboardDefinition = {
  id: string;
  title: string;
  subtitle: string;
  category: DashboardCategory;
  render: (data: DashboardData) => ReactNode;
};

const palette = ["#14B8A6", "#2563EB", "#F97316", "#8B5CF6", "#10B981", "#F43F5E", "#0EA5E9", "#64748B"];
const standardDashboardIds = ["weekly-evolution", "hours-by-employee", "hours-by-project", "estimated-progress", "productivity", "recent-activity"];
const storageKey = "gotechy:dashboard-manual";
const tooltipMinutes = (value: unknown) => formatMinutes(Number(value ?? 0));
const axisHours = (value: unknown) => `${Math.round(Number(value) / 60)}h`;

export function DashboardCharts({ data }: { data: DashboardData }) {
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(data.pinnedDashboardIds ?? []);
  const [query, setQuery] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const definitions = useMemo(() => getDashboardDefinitions(), []);
  const definitionById = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
  const baseIds = pinnedIds.length ? pinnedIds : standardDashboardIds;
  const activeIds = useMemo(
    () => [...baseIds, ...manualIds.filter((id) => !baseIds.includes(id))],
    [baseIds, manualIds]
  );
  const activeDefinitions = activeIds.map((id) => definitionById.get(id)).filter(Boolean) as DashboardDefinition[];
  const filteredDefinitions = definitions.filter((definition) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return `${definition.title} ${definition.subtitle} ${definition.category}`.toLowerCase().includes(normalizedQuery);
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { date: string; ids: string[] };
      if (parsed.date === today) {
        setManualIds(parsed.ids);
      } else {
        window.localStorage.removeItem(storageKey);
        setManualIds([]);
      }
    } catch {
      return;
    }
  }, [today]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ date: today, ids: manualIds.filter((id) => !pinnedIds.includes(id)) }));
    } catch {
      return;
    }
  }, [manualIds, pinnedIds, today]);

  function activate(id: string) {
    if (!baseIds.includes(id)) {
      setManualIds((current) => (current.includes(id) ? current : [...current, id]));
    }

    window.setTimeout(() => document.getElementById(`dashboard-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function toggleManual(id: string) {
    if (baseIds.includes(id)) return;
    setManualIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function togglePin(id: string) {
    const isPinned = pinnedIds.includes(id);

    if (!isPinned && pinnedIds.length >= 6) {
      toast.error("Solo podes fijar hasta 6 dashboards");
      return;
    }

    setPinnedIds((current) => (isPinned ? current.filter((item) => item !== id) : [...current, id].slice(0, 6)));
    setManualIds((current) => current.filter((item) => item !== id));

    const result = isPinned ? await unpinDashboard({ dashboardId: id }) : await pinDashboard({ dashboardId: id, position: pinnedIds.length });

    if (!result.ok) {
      setPinnedIds((current) => (isPinned ? [...current, id].slice(0, 6) : current.filter((item) => item !== id)));
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Buscar dashboard" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Button className="h-9" variant="outline" onClick={() => setSelectorOpen((current) => !current)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Dashboards
          </Button>
          <Badge variant="outline">{pinnedIds.length} / 6 fijados</Badge>
        </div>

        {(selectorOpen || query.trim()) ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredDefinitions.map((definition) => {
              const active = activeIds.includes(definition.id);
              const pinned = pinnedIds.includes(definition.id);
              const base = baseIds.includes(definition.id);

              return (
                <div
                  key={definition.id}
                  className={cn(
                    "rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50",
                    active && "border-primary bg-primary/5"
                  )}
                  onClick={() => activate(definition.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{definition.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{definition.subtitle}</div>
                    </div>
                    <Badge variant={pinned ? "success" : active ? "outline" : "muted"}>{pinned ? "Fijo" : active ? "Activo" : definition.category}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!base ? (
                      <Button
                        className="h-7"
                        size="sm"
                        variant={active ? "ghost" : "outline"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleManual(definition.id);
                        }}
                      >
                        {active ? "Ocultar" : "Activar"}
                      </Button>
                    ) : null}
                    <Button
                      className="h-7"
                      size="sm"
                      variant={pinned ? "ghost" : "outline"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void togglePin(definition.id);
                      }}
                    >
                      {pinned ? <PinOff className="mr-1.5 h-3.5 w-3.5" /> : <Pin className="mr-1.5 h-3.5 w-3.5" />}
                      {pinned ? "Desfijar" : "Fijar dashboard"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        {activeDefinitions.map((definition) => (
          <ChartCard
            key={definition.id}
            id={definition.id}
            title={definition.title}
            subtitle={definition.subtitle}
            category={definition.category}
            pinned={pinnedIds.includes(definition.id)}
            pinDisabled={!pinnedIds.includes(definition.id) && pinnedIds.length >= 6}
            onPinToggle={() => void togglePin(definition.id)}
          >
            {definition.render(data)}
          </ChartCard>
        ))}
      </div>
    </div>
  );
}

function getDashboardDefinitions(): DashboardDefinition[] {
  return [
    {
      id: "weekly-evolution",
      title: "Evolucion semanal",
      subtitle: "Minutos normales y extra por semana",
      category: "Tendencias",
      render: (data) => <AreaWidget data={data.weeklyEvolution} />
    },
    {
      id: "hours-by-employee",
      title: "Horas por empleado",
      subtitle: "Ranking operativo del periodo",
      category: "Empleados",
      render: (data) => <VerticalBarWidget data={data.hoursByEmployee.slice(0, 10)} nameKey="name" />
    },
    {
      id: "hours-by-project",
      title: "Horas por proyecto",
      subtitle: "Top proyectos por esfuerzo",
      category: "Proyectos",
      render: (data) => <VerticalBarWidget data={data.hoursByProject.slice(0, 10)} nameKey="name" fill="#2563EB" />
    },
    {
      id: "estimated-progress",
      title: "Consumido vs Estimado",
      subtitle: "Avance, restante y alertas por proyecto",
      category: "Proyectos",
      render: (data) => <EstimatedProgress rows={data.estimatedProgress} />
    },
    {
      id: "productivity",
      title: "Productividad promedio",
      subtitle: "Relacion entre categorias productivas y total",
      category: "Productividad",
      render: (data) => (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricPill label="Productividad" value={`${data.metrics.productivity}%`} />
            <MetricPill label="Productivas" value={formatMinutes(data.metrics.productiveMinutes)} />
            <MetricPill label="Internas/Admin" value={formatMinutes(data.metrics.internalMinutes)} />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, data.metrics.productivity)}%` }} />
          </div>
        </>
      )
    },
    {
      id: "recent-activity",
      title: "Ultima actividad",
      subtitle: "Cargas recientes del periodo",
      category: "Operativo",
      render: (data) => (
        <div className="space-y-2">
          {data.recentActivity.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{entry.detail}</div>
                <div className="mt-1 truncate text-muted-foreground">
                  {entry.collaborator} - {entry.project}
                </div>
              </div>
              <Badge variant="outline">{formatMinutes(entry.minutes + entry.overtimeMinutes)}</Badge>
            </div>
          ))}
        </div>
      )
    },
    {
      id: "monthly-evolution",
      title: "Evolucion mensual",
      subtitle: "Consumo del periodo agrupado por mes",
      category: "Tendencias",
      render: (data) => <BarWidget data={data.monthlyEvolution} />
    },
    {
      id: "overtime-by-employee",
      title: "Horas extra por empleado",
      subtitle: "Tendencia de sobrecarga individual",
      category: "Empleados",
      render: (data) => <VerticalBarWidget data={data.overtimeByEmployee.slice(0, 10)} dataKey="overtimeMinutes" nameKey="name" fill="#F97316" />
    },
    {
      id: "hours-by-client",
      title: "Horas por cliente",
      subtitle: "Consumo agregado por cliente",
      category: "Financiero",
      render: (data) => <VerticalBarWidget data={data.hoursByClient.slice(0, 10)} nameKey="name" fill="#8B5CF6" />
    },
    {
      id: "categories",
      title: "Distribucion por categorias",
      subtitle: "Peso relativo de cada categoria",
      category: "Productividad",
      render: (data) => <CategoryDistribution data={data} />
    },
    {
      id: "overtime-trend",
      title: "Tendencia de horas extra",
      subtitle: "Evolucion diaria de extras",
      category: "Tendencias",
      render: (data) => <LineWidget data={data.overtimeTrend} dataKey="minutes" fill="#F97316" />
    },
    {
      id: "average-by-day",
      title: "Promedio por dia",
      subtitle: "Carga diaria total del periodo",
      category: "Operativo",
      render: (data) => <LineWidget data={data.averageHoursByDay} dataKey="minutes" fill="#14B8A6" />
    },
    {
      id: "utilization",
      title: "Utilizacion por empleado",
      subtitle: "Minutos cargados contra capacidad estimada",
      category: "Empleados",
      render: (data) => <BarPercentWidget data={data.utilizationByEmployee.slice(0, 10)} />
    },
    {
      id: "month-comparison",
      title: "Comparativa entre meses",
      subtitle: "Ultimos meses con minutos y extras",
      category: "Comparativas",
      render: (data) => <BarWidget data={data.monthComparison} />
    },
    {
      id: "heatmap",
      title: "Heatmap de carga",
      subtitle: "Intensidad diaria del periodo",
      category: "Tendencias",
      render: (data) => <Heatmap data={data} />
    },
    {
      id: "employee-ranking",
      title: "Ranking de empleados",
      subtitle: "Mas tiempo cargado",
      category: "Empleados",
      render: (data) => <RankingList rows={data.employeeRanking.map((item) => ({ name: item.name, value: item.minutes, helper: `${formatMinutes(item.overtimeMinutes)} extras` }))} />
    },
    {
      id: "client-ranking",
      title: "Ranking de clientes",
      subtitle: "Mayor consumo",
      category: "Financiero",
      render: (data) => <RankingList rows={data.clientRanking.map((item) => ({ name: item.name, value: item.minutes, helper: `${item.entryCount} registros` }))} />
    },
    {
      id: "active-projects",
      title: "Top proyectos activos",
      subtitle: "Proyectos activos con mas consumo",
      category: "Proyectos",
      render: (data) => <RankingList rows={data.topProjectsActive.map((item) => ({ name: item.name, value: item.minutes, helper: item.client }))} />
    }
  ];
}

function ChartCard({
  id,
  title,
  subtitle,
  category,
  pinned,
  pinDisabled,
  onPinToggle,
  children
}: {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  pinned: boolean;
  pinDisabled: boolean;
  onPinToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card id={`dashboard-${id}`} className="scroll-mt-24">
      <CardHeader className="p-3 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{title}</CardTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={pinned ? "success" : "muted"}>{pinned ? "Fijo" : category}</Badge>
            <Button aria-label={pinned ? "Desfijar dashboard" : "Fijar dashboard"} disabled={pinDisabled} size="icon" variant="ghost" onClick={onPinToggle}>
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  );
}

function EstimatedProgress({
  rows
}: {
  rows: Array<{
    id: string;
    name: string;
    client: string;
    type: string;
    monthlyReset: boolean;
    estimatedMinutes: number;
    consumedMinutes: number;
    remainingMinutes: number;
    percent: number;
  }>;
}) {
  if (!rows.length) {
    return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Sin proyectos con estimacion activa.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((row) => {
        const warning = row.remainingMinutes < 4 * 60;

        return (
          <div key={row.id} className={cn("rounded-md border p-3", warning && "border-amber-300 bg-amber-50 dark:bg-amber-950/20")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{row.name}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                  <span>{row.client}</span>
                  <span>/</span>
                  <span>{row.type}</span>
                  {row.monthlyReset ? <Badge variant="outline">Mensual</Badge> : null}
                </div>
              </div>
              <Badge variant={warning ? "warning" : row.percent >= 100 ? "destructive" : "muted"}>{row.percent}%</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", warning ? "bg-amber-500" : "bg-teal-500")} style={{ width: `${Math.min(100, row.percent)}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <span>
                <b className="text-foreground">{formatMinutes(row.consumedMinutes)}</b>
                <br />
                consumido
              </span>
              <span>
                <b className="text-foreground">{formatMinutes(row.estimatedMinutes)}</b>
                <br />
                estimado
              </span>
              <span>
                <b className={warning ? "text-amber-700 dark:text-amber-200" : "text-foreground"}>{formatMinutes(row.remainingMinutes)}</b>
                <br />
                restante
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryDistribution({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_0.9fr]">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.categories} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={3}>
              {data.categories.map((entry, index) => (
                <Cell key={entry.id} fill={entry.color || palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={tooltipMinutes} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 self-center">
        {data.categories.slice(0, 8).map((category, index) => (
          <div key={category.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color || palette[index % palette.length] }} />
              {category.name}
              <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{getCategoryKindMeta(category.kind).shortLabel}</span>
            </span>
            <span className="font-medium">{formatMinutes(category.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ data }: { data: DashboardData }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[560px] gap-2">
        {data.heatmap.map((week) => (
          <div key={week.week} className="grid gap-1">
            <div className="h-4 text-[10px] text-muted-foreground">{week.week}</div>
            {week.days.map((day) => (
              <div
                key={day.date}
                className={cn("h-7 w-7 rounded-md border", day.intensity === 0 && "bg-muted/40")}
                style={{ backgroundColor: day.intensity ? `color-mix(in srgb, #14B8A6 ${Math.max(14, day.intensity)}%, transparent)` : undefined }}
                title={`${day.date}: ${formatMinutes(day.minutes)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaWidget({ data }: { data: Array<{ label: string; minutes: number; overtimeMinutes: number }> }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={axisHours} />
          <Tooltip formatter={tooltipMinutes} />
          <Area type="monotone" dataKey="minutes" stroke="#14B8A6" fill="#14B8A633" strokeWidth={2} />
          <Area type="monotone" dataKey="overtimeMinutes" stroke="#F97316" fill="#F9731633" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarWidget({ data }: { data: Array<{ label: string; minutes: number; overtimeMinutes: number }> }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={axisHours} />
          <Tooltip formatter={tooltipMinutes} />
          <Bar dataKey="minutes" fill="#14B8A6" radius={[5, 5, 0, 0]} />
          <Bar dataKey="overtimeMinutes" fill="#F97316" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VerticalBarWidget({
  data,
  dataKey = "minutes",
  nameKey,
  fill = "#14B8A6"
}: {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  nameKey: string;
  fill?: string;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" width={116} dataKey={nameKey} tickLine={false} axisLine={false} />
          <Tooltip formatter={tooltipMinutes} />
          <Bar dataKey={dataKey} fill={fill} radius={[0, 5, 5, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LineWidget({ data, dataKey, fill }: { data: Array<{ label: string; minutes: number }>; dataKey: string; fill: string }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={axisHours} />
          <Tooltip formatter={tooltipMinutes} />
          <Line type="monotone" dataKey={dataKey} stroke={fill} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarPercentWidget({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 18 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => `${value}%`} />
          <YAxis type="category" width={116} dataKey="name" tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => `${value}%`} />
          <Bar dataKey="value" fill="#0EA5E9" radius={[0, 5, 5, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function RankingList({ rows }: { rows: Array<{ name: string; value: number; helper: string }> }) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`${row.name}-${index}`} className="flex items-center gap-3 rounded-md border px-3 py-2 text-xs">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted font-semibold">{index + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{row.name}</div>
            <div className="truncate text-muted-foreground">{row.helper}</div>
          </div>
          <div className="font-semibold">{formatMinutes(row.value)}</div>
        </div>
      ))}
    </div>
  );
}
