"use client";

import { AlertTriangle, Download, FileSpreadsheet, Goal, Power, Save, Search, Trash2, TrendingUp, UsersRound } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteGoalHistory, previewGoalHistoryDelete, toggleGoalObjective, updateGoalHistorySettings, upsertGoalObjective } from "@/lib/actions/goal-actions";
import { buildGoalCopy } from "@/lib/goal-copy";
import { goalMetricKindValues, goalPeriodValues } from "@/lib/validators";
import { cn, formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type ObjectivesData = Awaited<ReturnType<typeof import("@/lib/data/objectives").getObjectivesData>>;
type Draft = {
  id: string;
  name: string;
  description: string;
  metricKind: (typeof goalMetricKindValues)[number];
  period: (typeof goalPeriodValues)[number];
  targetPercent: string;
  targetMinutes: string;
  tolerancePercent: string;
  minDailyPercent: string;
  active: boolean;
  global: boolean;
  ownerId: string;
  clientId: string;
  projectId: string;
  categoryId: string;
  excludedUserIds: string[];
};

const emptyDraft: Draft = {
  id: "",
  name: "",
  description: "",
  metricKind: "MIN_EXPECTED_PERCENT",
  period: "WEEKLY",
  targetPercent: "60",
  targetMinutes: "",
  tolerancePercent: "0",
  minDailyPercent: "50",
  active: true,
  global: true,
  ownerId: "",
  clientId: "",
  projectId: "",
  categoryId: "",
  excludedUserIds: []
};

const metricLabels: Record<(typeof goalMetricKindValues)[number], string> = {
  MIN_EXPECTED_PERCENT: "% minimo esperado",
  DAILY_MIN_PERCENT: "Dias con minimo diario",
  MIN_WEEKLY_MINUTES: "Minutos minimos",
  MAX_OVERTIME_MINUTES: "Maximo extra",
  MIN_ACTIVE_DAYS: "Dias activos minimos",
  PRIORITY_PROJECT_PERCENT: "% proyecto prioritario",
  PRODUCTIVE_PERCENT: "% productivo",
  REDUCE_INTERNAL_MINUTES: "Reducir interno",
  AVG_ENTRY_DELAY_MINUTES: "Demora promedio de carga",
  CLIENT_MINUTES: "Objetivo por cliente",
  CATEGORY_MINUTES: "Objetivo por categoria"
};

export function ObjectivesClient({ data }: { data: ObjectivesData }) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("");
  const [collaborator, setCollaborator] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [historyDeleteOpen, setHistoryDeleteOpen] = useState(false);
  const [historyDeleteMode, setHistoryDeleteMode] = useState<"range" | "all">("range");
  const [historyDeleteFrom, setHistoryDeleteFrom] = useState("");
  const [historyDeleteTo, setHistoryDeleteTo] = useState("");
  const [historyDeletePeriod, setHistoryDeletePeriod] = useState("");
  const [historyDeletePin, setHistoryDeletePin] = useState("");
  const [historyDeleteConfirmation, setHistoryDeleteConfirmation] = useState("");
  const [historyDeleteSummary, setHistoryDeleteSummary] = useState<{ count: number; checkpoints: number; periods: number; unmet: number; label: string } | null>(null);
  const [historySettings, setHistorySettings] = useState(data.historySettings);
  const generatedCopy = useMemo(() => buildGoalCopy(draft), [draft]);

  const filteredEvaluations = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return data.evaluations.filter((item) => {
      return (
        (!period || item.period === period) &&
        (!collaborator || item.userId === collaborator) &&
        (!normalized || `${item.goalName} ${item.collaborator} ${item.reason}`.toLowerCase().includes(normalized))
      );
    });
  }, [collaborator, data.evaluations, period, query]);

  function saveGoal() {
    startTransition(async () => {
      const result = await upsertGoalObjective({
        ...draft,
        id: draft.id || undefined,
        name: undefined,
        description: undefined,
        targetPercent: draft.targetPercent || undefined,
        targetMinutes: draft.targetMinutes || undefined,
        minDailyPercent: draft.minDailyPercent || undefined
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setDraft(emptyDraft);
    });
  }

  function editGoal(goal: ObjectivesData["goals"][number]) {
    setDraft({
      id: goal.id,
      name: goal.name,
      description: goal.description ?? "",
      metricKind: goal.metricKind,
      period: goal.period === "MONTHLY" ? "MONTHLY" : "WEEKLY",
      targetPercent: String(goal.targetPercent ?? ""),
      targetMinutes: String(goal.targetMinutes ?? ""),
      tolerancePercent: String(goal.tolerancePercent ?? 0),
      minDailyPercent: String(goal.minDailyPercent ?? ""),
      active: goal.active,
      global: goal.global,
      ownerId: goal.ownerId ?? "",
      clientId: goal.clientId ?? "",
      projectId: goal.projectId ?? "",
      categoryId: goal.categoryId ?? "",
      excludedUserIds: goal.excludedUserIds
    });
  }

  function toggleExcluded(userId: string) {
    setDraft((current) => ({
      ...current,
      excludedUserIds: current.excludedUserIds.includes(userId)
        ? current.excludedUserIds.filter((item) => item !== userId)
        : [...current.excludedUserIds, userId]
    }));
  }

  function previewHistoryDelete() {
    startTransition(async () => {
      const result = await previewGoalHistoryDelete({
        mode: historyDeleteMode,
        from: historyDeleteFrom,
        to: historyDeleteTo,
        period: historyDeletePeriod || undefined
      });
      if (!result.ok || !result.summary) {
        toast.error(result.message);
        return;
      }
      setHistoryDeleteSummary(result.summary);
      toast.success("Resumen listo");
    });
  }

  function confirmHistoryDelete() {
    startTransition(async () => {
      const result = await deleteGoalHistory({
        mode: historyDeleteMode,
        from: historyDeleteFrom,
        to: historyDeleteTo,
        period: historyDeletePeriod || undefined,
        pin: historyDeletePin,
        confirmation: historyDeleteConfirmation
      });
      if (result.ok) {
        toast.success(result.message);
        setHistoryDeleteOpen(false);
        setHistoryDeleteSummary(null);
      } else {
        toast.error(result.message);
      }
    });
  }

  function saveHistorySettings() {
    startTransition(async () => {
      const result = await updateGoalHistorySettings({ settings: historySettings });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function toggleHistorySetting(frequency: string) {
    setHistorySettings((current) =>
      current.map((setting) => (setting.frequency === frequency ? { ...setting, enabled: !setting.enabled } : setting))
    );
  }

  function exportHistory(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (period) params.set("period", period);
    if (collaborator) params.set("collaboratorId", collaborator);
    window.location.href = `/api/goals/history/export?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Goal} label="Cumplimiento semanal" value={`${data.summary.weeklyPercent}%`} helper={data.period.week} tone={scoreTone(data.summary.weeklyPercent)} />
        <MetricCard icon={TrendingUp} label="Cumplimiento mensual" value={`${data.summary.monthlyPercent}%`} helper={data.period.month} tone={scoreTone(data.summary.monthlyPercent)} />
        <MetricCard icon={AlertTriangle} label="Incumplidos" value={String(data.summary.unmetCount)} helper={`${data.summary.activeGoals} objetivos activos`} tone={data.summary.unmetCount ? "warning" : "success"} />
        <MetricCard icon={UsersRound} label="Sin registros" value={String(data.summary.noRecordUsers)} helper="Colaboradores activos" tone={data.summary.noRecordUsers ? "warning" : "success"} />
        <MetricCard icon={TrendingUp} label="Snapshots" value={String(data.historySummary.snapshots)} helper={`${data.historySummary.checkpoints} checkpoints`} tone="muted" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="gap-3 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Dashboard de objetivos</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Cumplimiento por colaborador activo, cliente, proyecto y tendencia mensual.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.canManage ? (
                  <Button className="h-9" variant="outline" onClick={() => setHistoryDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar historial
                  </Button>
                ) : null}
                <Button className="h-9" variant="outline" onClick={() => exportHistory("csv")}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
                <Button className="h-9" variant="outline" onClick={() => exportHistory("xlsx")}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  XLSX
                </Button>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="h-9 w-64 pl-8" placeholder="Buscar objetivo o colaborador" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <Select className="h-9 w-40" value={period} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="">Periodo</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="MONTHLY">Mensual</option>
                </Select>
                <Select className="h-9 w-52" value={collaborator} onChange={(event) => setCollaborator(event.target.value)}>
                  <option value="">Colaborador</option>
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0">
            <div className="grid gap-3 lg:grid-cols-2">
              <Panel title="Ranking de colaboradores">
                {data.ranking.slice(0, 8).map((row, index) => (
                  <ProgressRow key={row.id} label={`${index + 1}. ${row.name}`} value={row.percent} helper={formatMinutes(row.minutes)} />
                ))}
              </Panel>
              <Panel title="Evolucion semanal">
                {data.trend.map((row) => (
                  <ProgressRow key={row.label} label={row.label} value={Math.min(100, Math.round(row.minutes / 48))} helper={formatMinutes(row.minutes)} />
                ))}
              </Panel>
              <Panel title="Cumplimiento por cliente">
                {data.clientRows.map((row) => (
                  <ProgressRow key={row.id} label={row.name} value={Math.min(100, Math.round(row.minutes / 60))} helper={formatMinutes(row.minutes)} />
                ))}
              </Panel>
              <Panel title="Historial de periodos">
                {data.historyRows.slice(0, 8).map((row) => (
                  <ProgressRow
                    key={row.id}
                    label={`${row.collaborator} / ${periodLabel(row.period)}`}
                    value={row.percent}
                    helper={`${row.met ? "Cumplido" : "Pendiente"} - ${formatMinutes(row.actualMinutes)}`}
                  />
                ))}
                {!data.historyRows.length ? <div className="text-xs text-muted-foreground">Sin snapshots historicos todavia.</div> : null}
              </Panel>
              <Panel title="Checkpoints semanales">
                {data.checkpointRows.slice(0, 8).map((row) => (
                  <ProgressRow
                    key={row.id}
                    label={row.collaborator}
                    value={row.percent}
                    helper={`${row.reachedGoals}/${row.reachedGoals + row.missedGoals} objetivos - ${formatMinutes(row.actualMinutes)}`}
                  />
                ))}
                {!data.checkpointRows.length ? <div className="text-xs text-muted-foreground">Sin checkpoints cerrados todavia.</div> : null}
              </Panel>
            </div>

            <div className="rounded-lg border">
              <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Objetivo</span>
                <span>Colaborador</span>
                <span>Periodo</span>
                <span>Estado</span>
              </div>
              <div className="max-h-[440px] overflow-y-auto">
                {filteredEvaluations.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr] gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.goalName}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.reason}</div>
                    </div>
                    <span className="min-w-0 truncate">{item.collaborator}</span>
                    <span>{item.period === "WEEKLY" ? "Semanal" : "Mensual"}</span>
                    <Badge variant={item.met ? "success" : "warning"}>{item.percent}%</Badge>
                  </div>
                ))}
                {!filteredEvaluations.length ? <div className="p-6 text-center text-sm text-muted-foreground">Sin evaluaciones para los filtros activos.</div> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {data.canManage ? (
            <Card>
              <CardHeader className="p-4">
                <CardTitle>{draft.id ? "Editar objetivo" : "Nuevo objetivo"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="rounded-lg border bg-muted/35 p-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Generado automaticamente</div>
                  <div className="mt-1 text-sm font-semibold">{generatedCopy.title}</div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{generatedCopy.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Metrica">
                    <Select value={draft.metricKind} onChange={(event) => setDraft({ ...draft, metricKind: event.target.value as Draft["metricKind"] })}>
                      {goalMetricKindValues.map((kind) => (
                        <option key={kind} value={kind}>
                          {metricLabels[kind]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Periodicidad">
                    <Select value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value as Draft["period"] })}>
                      <option value="WEEKLY">Semanal</option>
                      <option value="MONTHLY">Mensual</option>
                    </Select>
                  </Field>
                  <Field label="% objetivo">
                    <Input inputMode="numeric" value={draft.targetPercent} onChange={(event) => setDraft({ ...draft, targetPercent: event.target.value })} />
                  </Field>
                  <Field label="Minutos objetivo">
                    <Input inputMode="numeric" value={draft.targetMinutes} onChange={(event) => setDraft({ ...draft, targetMinutes: event.target.value })} />
                  </Field>
                  <Field label="Tolerancia %">
                    <Input inputMode="numeric" value={draft.tolerancePercent} onChange={(event) => setDraft({ ...draft, tolerancePercent: event.target.value })} />
                  </Field>
                  <Field label="% minimo diario">
                    <Input inputMode="numeric" value={draft.minDailyPercent} onChange={(event) => setDraft({ ...draft, minDailyPercent: event.target.value })} />
                  </Field>
                </div>
                <Field label="Alcance">
                  <Select value={draft.global ? "global" : "user"} onChange={(event) => setDraft({ ...draft, global: event.target.value === "global" })}>
                    <option value="global">Global</option>
                    <option value="user">Colaborador especifico</option>
                  </Select>
                </Field>
                {!draft.global ? (
                  <Field label="Colaborador">
                    <Select value={draft.ownerId} onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}>
                      <option value="">Seleccionar</option>
                      {data.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cliente">
                    <Select value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value, projectId: "" })}>
                      <option value="">Todos</option>
                      {data.clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Proyecto">
                    <Select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
                      <option value="">Todos</option>
                      {data.projects
                        .filter((project) => !draft.clientId || project.clientId === draft.clientId)
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Categoria">
                  <Select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                    <option value="">Todas</option>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Excepciones">
                  <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                    {data.users.map((user) => (
                      <button
                        key={user.id}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs transition-colors",
                          draft.excludedUserIds.includes(user.id) && "border-primary bg-primary text-primary-foreground"
                        )}
                        type="button"
                        onClick={() => toggleExcluded(user.id)}
                      >
                        {user.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isPending} onClick={saveGoal}>
                    <Save className="mr-2 h-4 w-4" />
                    {isPending ? "Guardando..." : "Guardar objetivo"}
                  </Button>
                  <Button disabled={isPending} variant="outline" onClick={() => setDraft(emptyDraft)}>
                    Limpiar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.canManage ? (
            <Card>
              <CardHeader className="p-4">
                <CardTitle>Historiales activables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="grid gap-2">
                  {historySettings.map((setting) => (
                    <button
                      key={setting.frequency}
                      className={cn(
                        "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                        setting.enabled && "border-primary bg-primary/5"
                      )}
                      type="button"
                      onClick={() => toggleHistorySetting(setting.frequency)}
                    >
                      <span>{periodLabel(setting.frequency)}</span>
                      <Badge variant={setting.enabled ? "success" : "muted"}>{setting.enabled ? "Activo" : "Inactivo"}</Badge>
                    </button>
                  ))}
                </div>
                <Button disabled={isPending} variant="outline" onClick={saveHistorySettings}>
                  Guardar configuracion
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="p-4">
              <CardTitle>Objetivos configurados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {data.goals.map((goal) => (
                <div key={goal.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{goal.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {metricLabels[goal.metricKind]} / {goal.period === "WEEKLY" ? "Semanal" : "Mensual"}
                      </div>
                    </div>
                    <Badge variant={goal.active ? "success" : "muted"}>{goal.active ? "Activo" : "Inactivo"}</Badge>
                  </div>
                  {goal.description ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{goal.description}</p> : null}
                  {data.canManage ? (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => editGoal(goal)}>
                        Editar
                      </Button>
                      <Button
                        disabled={isPending}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          startTransition(async () => {
                            const result = await toggleGoalObjective(goal.id);
                            if (result.ok) toast.success(result.message);
                            else toast.error(result.message);
                          })
                        }
                      >
                        <Power className="mr-1.5 h-3.5 w-3.5" />
                        {goal.active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!data.goals.length ? <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Sin objetivos configurados todavia.</div> : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {historyDeleteOpen ? (
        <HistoryDeleteModal
          mode={historyDeleteMode}
          setMode={setHistoryDeleteMode}
          from={historyDeleteFrom}
          setFrom={setHistoryDeleteFrom}
          to={historyDeleteTo}
          setTo={setHistoryDeleteTo}
          period={historyDeletePeriod}
          setPeriod={setHistoryDeletePeriod}
          pin={historyDeletePin}
          setPin={setHistoryDeletePin}
          confirmation={historyDeleteConfirmation}
          setConfirmation={setHistoryDeleteConfirmation}
          summary={historyDeleteSummary}
          isPending={isPending}
          onPreview={previewHistoryDelete}
          onCancel={() => setHistoryDeleteOpen(false)}
          onConfirm={confirmHistoryDelete}
        />
      ) : null}
    </div>
  );
}

function HistoryDeleteModal({
  mode,
  setMode,
  from,
  setFrom,
  to,
  setTo,
  period,
  setPeriod,
  pin,
  setPin,
  confirmation,
  setConfirmation,
  summary,
  isPending,
  onPreview,
  onCancel,
  onConfirm
}: {
  mode: "range" | "all";
  setMode: (mode: "range" | "all") => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
  period: string;
  setPeriod: (value: string) => void;
  pin: string;
  setPin: (value: string) => void;
  confirmation: string;
  setConfirmation: (value: string) => void;
  summary: { count: number; checkpoints: number; periods: number; unmet: number; label: string } | null;
  isPending: boolean;
  onPreview: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-lg border bg-card shadow-xl">
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Eliminar historial de objetivos</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">El PIN se valida en servidor. Los objetivos configurados no se eliminan.</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Alcance">
              <Select value={mode} onChange={(event) => setMode(event.target.value as "range" | "all")}>
                <option value="range">Rango</option>
                <option value="all">Todo</option>
              </Select>
            </Field>
            <Field label="Desde">
              <Input disabled={mode === "all"} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input disabled={mode === "all"} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <Field label="Periodo">
              <Select value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="">Todos</option>
                <option value="DAILY">Diario</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensual</option>
              </Select>
            </Field>
          </div>
          <Button disabled={isPending} variant="outline" onClick={onPreview}>
            Calcular afectados
          </Button>
          {summary ? (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
              <Metric label="Snapshots" value={String(summary.count)} />
              <Metric label="Checkpoints" value={String(summary.checkpoints)} />
              <Metric label="Incumplidos" value={String(summary.unmet)} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="PIN">
              <Input autoComplete="off" type="password" value={pin} onChange={(event) => setPin(event.target.value)} />
            </Field>
            <Field label='Escribi "BORRAR"'>
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button disabled={isPending} variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button disabled={isPending || !summary || (summary.count === 0 && summary.checkpoints === 0) || confirmation.trim().toUpperCase() !== "BORRAR"} variant="destructive" onClick={onConfirm}>
              {isPending ? "Procesando..." : "Eliminar historial"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone }: { icon: typeof Goal; label: string; value: string; helper: string; tone: "success" | "warning" | "muted" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <div className="mt-1 truncate text-2xl font-semibold">{value}</div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className={cn("rounded-md p-2", tone === "success" ? "bg-emerald-100 text-emerald-700" : tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-muted")}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ProgressRow({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="text-muted-foreground">{helper}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function scoreTone(value: number) {
  return value >= 80 ? "success" : value >= 50 ? "warning" : "muted";
}

function periodLabel(period: string) {
  if (period === "DAILY") return "Diario";
  if (period === "WEEKLY") return "Semanal";
  return "Mensual";
}
