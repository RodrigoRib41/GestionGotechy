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
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatMinutes } from "@/lib/utils";

type DashboardData = Awaited<ReturnType<typeof import("@/lib/data/dashboard").getDashboardData>>;

const palette = ["#14B8A6", "#2563EB", "#F97316", "#8B5CF6", "#10B981", "#F43F5E", "#0EA5E9", "#64748B"];
const tooltipMinutes = (value: unknown) => formatMinutes(Number(value ?? 0));
const axisHours = (value: unknown) => `${Math.round(Number(value) / 60)}h`;

export function DashboardCharts({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <ChartCard title="Evolucion semanal" subtitle="Horas normales y extras por semana">
        <AreaWidget data={data.weeklyEvolution} />
      </ChartCard>

      <ChartCard title="Evolucion mensual" subtitle="Consumo del periodo agrupado por mes">
        <BarWidget data={data.monthlyEvolution} />
      </ChartCard>

      <ChartCard title="Horas por empleado" subtitle="Ranking operativo del periodo">
        <VerticalBarWidget data={data.hoursByEmployee.slice(0, 10)} nameKey="name" />
      </ChartCard>

      <ChartCard title="Horas extra por empleado" subtitle="Tendencia de sobrecarga individual">
        <VerticalBarWidget data={data.overtimeByEmployee.slice(0, 10)} dataKey="overtimeMinutes" nameKey="name" fill="#F97316" />
      </ChartCard>

      <ChartCard title="Horas por cliente" subtitle="Consumo agregado por cliente">
        <VerticalBarWidget data={data.hoursByClient.slice(0, 10)} nameKey="name" fill="#2563EB" />
      </ChartCard>

      <ChartCard title="Horas por proyecto" subtitle="Top proyectos por esfuerzo">
        <VerticalBarWidget data={data.hoursByProject.slice(0, 10)} nameKey="name" fill="#8B5CF6" />
      </ChartCard>

      <ChartCard title="Distribucion por categorias" subtitle="Peso relativo de cada categoria">
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
                </span>
                <span className="font-medium">{formatMinutes(category.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Tendencia de horas extra" subtitle="Evolucion diaria de extras">
        <LineWidget data={data.overtimeTrend} dataKey="minutes" fill="#F97316" />
      </ChartCard>

      <ChartCard title="Promedio de horas por dia" subtitle="Carga diaria total del periodo">
        <LineWidget data={data.averageHoursByDay} dataKey="minutes" fill="#14B8A6" />
      </ChartCard>

      <ChartCard title="Utilizacion mensual por empleado" subtitle="Horas cargadas contra capacidad estimada">
        <BarPercentWidget data={data.utilizationByEmployee.slice(0, 10)} />
      </ChartCard>

      <ChartCard title="Comparativa entre meses" subtitle="Ultimos meses con horas y extras">
        <BarWidget data={data.monthComparison} />
      </ChartCard>

      <ChartCard title="Productividad promedio" subtitle="Relacion entre categorias productivas y total">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricPill label="Productividad" value={`${data.metrics.productivity}%`} />
          <MetricPill label="Productivas" value={formatMinutes(data.metrics.productiveMinutes)} />
          <MetricPill label="Internas/Admin" value={formatMinutes(data.metrics.internalMinutes)} />
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, data.metrics.productivity)}%` }} />
        </div>
      </ChartCard>

      <ChartCard title="Heatmap de carga horaria" subtitle="Intensidad diaria de los ultimos puntos del periodo">
        <div className="overflow-x-auto">
          <div className="flex min-w-[560px] gap-2">
            {data.heatmap.map((week) => (
              <div key={week.week} className="grid gap-1">
                <div className="h-4 text-[10px] text-muted-foreground">{week.week}</div>
                {week.days.map((day) => (
                  <div
                    key={day.date}
                    className={cn("h-7 w-7 rounded-md border", day.intensity === 0 && "bg-muted/40")}
                    style={{
                      backgroundColor: day.intensity ? `color-mix(in srgb, #14B8A6 ${Math.max(14, day.intensity)}%, transparent)` : undefined
                    }}
                    title={`${day.date}: ${formatMinutes(day.minutes)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </ChartCard>

      <ChartCard title="Ranking de empleados" subtitle="Mas horas cargadas">
        <RankingList rows={data.employeeRanking.map((item) => ({ name: item.name, value: item.minutes, helper: `${formatMinutes(item.overtimeMinutes)} extras` }))} />
      </ChartCard>

      <ChartCard title="Ranking de clientes" subtitle="Mayor consumo de horas">
        <RankingList rows={data.clientRanking.map((item) => ({ name: item.name, value: item.minutes, helper: `${item.entryCount} registros` }))} />
      </ChartCard>

      <ChartCard title="Top proyectos activos" subtitle="Proyectos activos con mas consumo">
        <RankingList rows={data.topProjectsActive.map((item) => ({ name: item.name, value: item.minutes, helper: item.client }))} />
      </ChartCard>

      <ChartCard title="Ultima actividad" subtitle="Cargas recientes del periodo">
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
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-3 pb-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
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
