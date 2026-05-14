"use client";

import { format, startOfWeek } from "date-fns";
import {
  Archive,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  KanbanSquare,
  ListFilter,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Search,
  TimerReset,
  Trash2
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  addTrackingComment,
  archiveTrackingTask,
  changeTrackingTaskStatus,
  createTrackingTask,
  deleteTrackingTask,
  deleteTrackingStatus,
  logTrackingExport,
  logTrackingTaskTime,
  patchTrackingTask,
  restoreTrackingTask,
  upsertTrackingStatus
} from "@/lib/actions/tracking-actions";
import { cn, formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TrackingData = Awaited<ReturnType<typeof import("@/lib/data/tracking").getTrackingData>>;
type ViewMode = "kanban" | "list" | "timeline" | "dashboard" | "states";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TrackingStatus = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  sortOrder: number;
  isFinal: boolean;
  isBlocked: boolean;
};
type TrackingTask = {
  id: string;
  title: string;
  description: string;
  priority: string;
  dueDate: string | null;
  estimatedMinutes: number;
  consumedMinutes: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  client: { id: string; name: string };
  project: { id: string; name: string };
  assignee: { id: string; name: string; email: string };
  status: TrackingStatus;
};
type TrackingHistory = {
  id: string;
  taskId: string;
  action: string;
  message: string | null;
  minutes: number | null;
  createdAt: string;
  actor: string;
};

const filterKey = "gotechy:tracking-filters";
const priorityLabels: Record<Priority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente"
};

const priorityVariants: Record<Priority, "muted" | "outline" | "warning" | "destructive"> = {
  LOW: "muted",
  MEDIUM: "outline",
  HIGH: "warning",
  URGENT: "destructive"
};

export function TrackingClient({ data }: { data: TrackingData }) {
  const [tasks, setTasks] = useState<TrackingTask[]>(data.tasks as TrackingTask[]);
  const [history, setHistory] = useState<TrackingHistory[]>(data.history as TrackingHistory[]);
  const [view, setView] = useState<ViewMode>("kanban");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const [filters, setFilters] = useState({
    q: "",
    clientId: "ALL",
    projectId: "ALL",
    assigneeId: "ALL",
    statusId: "ALL",
    priority: "ALL",
    lifecycle: "ACTIVE",
    date: ""
  });
  const deferredQuery = useDeferredValue(filters.q.trim().toLowerCase());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const activeStatuses = useMemo(() => data.statuses.filter((status) => status.active).sort((a, b) => a.sortOrder - b.sortOrder), [data.statuses]);
  const visibleProjects = useMemo(
    () => data.projects.filter((project) => filters.clientId === "ALL" || project.clientId === filters.clientId),
    [data.projects, filters.clientId]
  );
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const queryHit =
        !deferredQuery ||
        `${task.title} ${task.description} ${task.client.name} ${task.project.name} ${task.assignee.name} ${task.tags.join(" ")}`
          .toLowerCase()
          .includes(deferredQuery);
      const dateHit = !filters.date || task.dueDate?.slice(0, 10) === filters.date || task.createdAt.slice(0, 10) === filters.date;
      const lifecycleHit =
        filters.lifecycle === "ALL" ||
        (filters.lifecycle === "ACTIVE" && !task.archivedAt && !task.deletedAt) ||
        (filters.lifecycle === "ARCHIVED" && Boolean(task.archivedAt) && !task.deletedAt) ||
        (filters.lifecycle === "DELETED" && Boolean(task.deletedAt));

      return (
        queryHit &&
        dateHit &&
        lifecycleHit &&
        (filters.clientId === "ALL" || task.client.id === filters.clientId) &&
        (filters.projectId === "ALL" || task.project.id === filters.projectId) &&
        (filters.assigneeId === "ALL" || task.assignee.id === filters.assigneeId) &&
        (filters.statusId === "ALL" || task.status.id === filters.statusId) &&
        (filters.priority === "ALL" || task.priority === filters.priority)
      );
    });
  }, [deferredQuery, filters, tasks]);
  const visibleTasks = filteredTasks.slice(0, visibleCount);
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null;
  const historyTaskIds = useMemo(() => new Set(filteredTasks.map((task) => task.id)), [filteredTasks]);
  const filteredHistory = useMemo(() => history.filter((item) => historyTaskIds.has(item.taskId)), [history, historyTaskIds]);
  const dashboard = useMemo(() => buildDashboard(filteredTasks, activeStatuses), [activeStatuses, filteredTasks]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(filterKey);
      if (raw) setFilters((current) => ({ ...current, ...JSON.parse(raw) }));
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(filterKey, JSON.stringify(filters));
    } catch {
      return;
    }
  }, [filters]);

  useEffect(() => {
    setVisibleCount(80);
  }, [filters, deferredQuery, view]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "clientId") next.projectId = "ALL";
      return next;
    });
  }

  function moveTask(taskId: string, status: TrackingStatus) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status.id === status.id) return;

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((item) =>
        item.id === taskId
          ? {
              ...item,
              status,
              closedAt: status.isFinal ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
    setHistory((current) => [
      {
        id: `local-${Date.now()}`,
        taskId,
        action: status.isFinal ? "CLOSE" : task.status.isFinal ? "REOPEN" : "STATUS_CHANGE",
        message: `Estado: ${task.status.name} -> ${status.name}`,
        minutes: null,
        createdAt: new Date().toISOString(),
        actor: "Vos"
      },
      ...current
    ]);

    startTransition(async () => {
      const result = await changeTrackingTaskStatus({ taskId, statusId: status.id });
      if (!result.ok) {
        setTasks(previousTasks);
        toast.error(result.message);
      } else {
        toast.success(result.message);
      }
    });
  }

  async function exportCsv() {
    const rows = exportRows(filteredTasks, filteredHistory);
    const csv = [Object.keys(rows[0] ?? { Tarea: "" }).join(","), ...rows.map((row) => Object.values(row).map((value) => JSON.stringify(value ?? "")).join(","))].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "gotechy-seguimiento.csv");
    await logTrackingExport("CSV");
    toast.success("CSV exportado");
  }

  async function exportExcel() {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const tasksSheet = workbook.addWorksheet("Tareas");
    const historySheet = workbook.addWorksheet("Historial");
    const rows = exportRows(filteredTasks, filteredHistory);
    tasksSheet.columns = Object.keys(rows[0] ?? { Tarea: "" }).map((key) => ({ header: key, key, width: 24 }));
    tasksSheet.addRows(rows);
    historySheet.columns = [
      { header: "Tarea", key: "task", width: 28 },
      { header: "Accion", key: "action", width: 18 },
      { header: "Actor", key: "actor", width: 24 },
      { header: "Mensaje", key: "message", width: 42 },
      { header: "Minutos", key: "minutes", width: 12 },
      { header: "Fecha", key: "createdAt", width: 24 }
    ];
    historySheet.addRows(
      filteredHistory.map((item) => ({
        task: filteredTasks.find((task) => task.id === item.taskId)?.title ?? item.taskId,
        action: item.action,
        actor: item.actor,
        message: item.message ?? "",
        minutes: item.minutes ?? "",
        createdAt: item.createdAt
      }))
    );
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "gotechy-seguimiento.xlsx");
    await logTrackingExport("XLSX");
    toast.success("Excel exportado");
  }

  async function exportPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Gotechy Consulting - Seguimiento", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Tarea", "Cliente", "Proyecto", "Responsable", "Estado", "Prioridad", "Estimado", "Consumido"]],
      body: filteredTasks.map((task) => [
        task.title,
        task.client.name,
        task.project.name,
        task.assignee.name,
        task.status.name,
        priorityLabels[task.priority as Priority],
        task.estimatedMinutes,
        task.consumedMinutes
      ]),
      styles: { fontSize: 8 }
    });
    doc.save("gotechy-seguimiento.pdf");
    await logTrackingExport("PDF");
    toast.success("PDF exportado");
  }

  return (
    <div className="space-y-4">
      <TrackingHeader
        canExport={data.permissions.canExport}
        canManage={data.permissions.canManage}
        isPending={isPending}
        onExportCsv={exportCsv}
        onExportExcel={exportExcel}
        onExportPdf={exportPdf}
        onRefresh={() => router.refresh()}
      />

      <TrackingFilters
        clients={data.clients}
        filters={filters}
        projects={visibleProjects}
        statuses={data.statuses}
        users={data.users}
        onChange={updateFilter}
      />

      {data.permissions.canManage ? (
        <TaskCreator clients={data.clients} projects={data.projects} statuses={activeStatuses} users={data.users} onCreated={() => router.refresh()} />
      ) : null}

      <div className="flex gap-2 overflow-x-auto">
        {[
          { id: "kanban", label: "Kanban", icon: KanbanSquare },
          { id: "list", label: "Lista", icon: ListFilter },
          { id: "timeline", label: "Timeline", icon: CalendarDays },
          { id: "dashboard", label: "Dashboard", icon: BarChart3 },
          ...(data.permissions.canManage ? [{ id: "states", label: "Estados", icon: CheckCircle2 }] : [])
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium",
                view === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              )}
              type="button"
              onClick={() => setView(item.id as ViewMode)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {view === "kanban" ? (
        <KanbanView
          draggedTaskId={draggedTaskId}
          onDragStart={setDraggedTaskId}
          onDrop={(status) => {
            if (draggedTaskId) moveTask(draggedTaskId, status);
            setDraggedTaskId(null);
          }}
          onSelect={setSelectedTaskId}
          statuses={activeStatuses}
          tasks={filteredTasks}
        />
      ) : null}

      {view === "list" ? (
        <ListView onMove={moveTask} onSelect={setSelectedTaskId} statuses={activeStatuses} tasks={visibleTasks} />
      ) : null}

      {view === "timeline" ? <TimelineView history={filteredHistory} tasks={filteredTasks} /> : null}

      {view === "dashboard" ? <TrackingDashboard dashboard={dashboard} /> : null}

      {view === "states" && data.permissions.canManage ? <StatusManager statuses={data.statuses} onSaved={() => router.refresh()} /> : null}

      {view === "list" && visibleCount < filteredTasks.length ? (
        <div className="text-center">
          <Button variant="outline" onClick={() => setVisibleCount((current) => current + 80)}>
            Ver mas
          </Button>
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailPanel
          canManage={data.permissions.canManage}
          clients={data.clients}
          history={history.filter((item) => item.taskId === selectedTask.id)}
          onClose={() => setSelectedTaskId(null)}
          onComment={(item) => setHistory((current) => [item, ...current])}
          onLifecycleChanged={(taskId, lifecycle) => {
            setTasks((current) =>
              current.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      archivedAt: lifecycle === "ARCHIVED" ? new Date().toISOString() : lifecycle === "ACTIVE" ? null : task.archivedAt,
                      deletedAt: lifecycle === "DELETED" ? new Date().toISOString() : lifecycle === "ACTIVE" ? null : task.deletedAt,
                      updatedAt: new Date().toISOString()
                    }
                  : task
              )
            );
            router.refresh();
          }}
          onPatched={() => router.refresh()}
          onTimeLogged={(minutes, item) => {
            setTasks((current) => current.map((task) => (task.id === selectedTask.id ? { ...task, consumedMinutes: task.consumedMinutes + minutes } : task)));
            setHistory((current) => [item, ...current]);
          }}
          projects={data.projects}
          statuses={activeStatuses}
          task={selectedTask}
          users={data.users}
        />
      ) : null}
    </div>
  );
}

function TrackingHeader({
  canExport,
  canManage,
  isPending,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onRefresh
}: {
  canExport: boolean;
  canManage: boolean;
  isPending: boolean;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-sm font-semibold">Seguimiento operativo</h2>
        <p className="text-xs text-muted-foreground">
          {canManage ? "Creacion, asignacion, estados e historial completo." : "Tus tareas, avances y comentarios internos."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="h-8" size="sm" variant="outline" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {isPending ? "Actualizando" : "Actualizar"}
        </Button>
        {canExport ? (
          <>
            <Button className="h-8" size="sm" variant="outline" onClick={onExportCsv}>
              <Download className="mr-2 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button className="h-8" size="sm" variant="outline" onClick={onExportExcel}>
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
              Excel
            </Button>
            <Button className="h-8" size="sm" variant="outline" onClick={onExportPdf}>
              <FileText className="mr-2 h-3.5 w-3.5" />
              PDF
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function TrackingFilters({
  filters,
  clients,
  projects,
  users,
  statuses,
  onChange
}: {
  filters: Record<string, string>;
  clients: TrackingData["clients"];
  projects: TrackingData["projects"];
  users: TrackingData["users"];
  statuses: TrackingData["statuses"];
  onChange: (key: "q" | "clientId" | "projectId" | "assigneeId" | "statusId" | "priority" | "lifecycle" | "date", value: string) => void;
}) {
  return (
    <section className="grid gap-2 rounded-lg border bg-card p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_170px_170px_150px_130px_150px_140px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="h-9 pl-8" placeholder="Buscar tarea, etiqueta o descripcion" value={filters.q} onChange={(event) => onChange("q", event.target.value)} />
      </div>
      <Select className="h-9" value={filters.clientId} onChange={(event) => onChange("clientId", event.target.value)}>
        <option value="ALL">Cliente</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </Select>
      <Select className="h-9" value={filters.projectId} onChange={(event) => onChange("projectId", event.target.value)}>
        <option value="ALL">Proyecto</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
      <Select className="h-9" value={filters.assigneeId} onChange={(event) => onChange("assigneeId", event.target.value)}>
        <option value="ALL">Colaborador</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </Select>
      <Select className="h-9" value={filters.statusId} onChange={(event) => onChange("statusId", event.target.value)}>
        <option value="ALL">Estado</option>
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </Select>
      <Select className="h-9" value={filters.priority} onChange={(event) => onChange("priority", event.target.value)}>
        <option value="ALL">Prioridad</option>
        {Object.entries(priorityLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Select className="h-9" value={filters.lifecycle} onChange={(event) => onChange("lifecycle", event.target.value)}>
        <option value="ACTIVE">Activas</option>
        <option value="ARCHIVED">Archivadas</option>
        <option value="DELETED">Eliminadas</option>
        <option value="ALL">Todas</option>
      </Select>
      <Input className="h-9" type="date" value={filters.date} onChange={(event) => onChange("date", event.target.value)} />
    </section>
  );
}

function TaskCreator({
  clients,
  projects,
  users,
  statuses,
  onCreated
}: {
  clients: TrackingData["clients"];
  projects: TrackingData["projects"];
  users: TrackingData["users"];
  statuses: TrackingStatus[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => ({
    title: "",
    description: "",
    clientId: clients.at(0)?.id ?? "",
    projectId: projects.find((project) => project.clientId === clients.at(0)?.id)?.id ?? "",
    assigneeId: users.at(0)?.id ?? "",
    statusId: statuses.at(0)?.id ?? "",
    priority: "MEDIUM",
    dueDate: "",
    estimatedMinutes: "0",
    tags: ""
  }));
  const availableProjects = projects.filter((project) => project.clientId === draft.clientId);

  function update(key: keyof typeof draft, value: string) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "clientId") next.projectId = projects.find((project) => project.clientId === value)?.id ?? "";
      return next;
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await createTrackingTask({ ...draft, estimatedMinutes: Number(draft.estimatedMinutes) });
      if (result.ok) {
        toast.success(result.message);
        setDraft((current) => ({ ...current, title: "", description: "", estimatedMinutes: "0", tags: "" }));
        setOpen(false);
        onCreated();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Nueva tarea</h3>
          <p className="text-xs text-muted-foreground">Asignacion rapida por cliente, proyecto y responsable.</p>
        </div>
        <Button className="h-8" size="sm" onClick={() => setOpen((current) => !current)}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Crear
        </Button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr_160px_160px]">
          <TrackingFormField className="lg:col-span-2" helper="Resumen concreto de lo que debe completarse." label="Titulo">
            <Input className="h-9" placeholder="Ej: Revisar jobs nocturnos" value={draft.title} onChange={(event) => update("title", event.target.value)} />
          </TrackingFormField>
          <TrackingFormField helper="Cliente relacionado con la tarea." label="Cliente">
            <Select className="h-9" value={draft.clientId} onChange={(event) => update("clientId", event.target.value)}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </TrackingFormField>
          <TrackingFormField helper="Proyecto relacionado con la tarea." label="Proyecto">
            <Select className="h-9" value={draft.projectId} onChange={(event) => update("projectId", event.target.value)}>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </TrackingFormField>
          <TrackingFormField className="lg:col-span-2" helper="Contexto, alcance, criterio de finalizacion o bloqueo conocido." label="Descripcion">
            <Textarea placeholder="Describe el objetivo, entregable esperado y contexto relevante" value={draft.description} onChange={(event) => update("description", event.target.value)} />
          </TrackingFormField>
          <TrackingFormField helper="Usuario responsable de completar la tarea." label="Colaborador">
            <Select className="h-9" value={draft.assigneeId} onChange={(event) => update("assigneeId", event.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </TrackingFormField>
          <TrackingFormField helper="Estado inicial dentro del flujo." label="Estado">
            <Select className="h-9" value={draft.statusId} onChange={(event) => update("statusId", event.target.value)}>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </Select>
          </TrackingFormField>
          <TrackingFormField helper="Define el nivel de urgencia de la tarea." label="Prioridad">
            <Select className="h-9" value={draft.priority} onChange={(event) => update("priority", event.target.value)}>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </TrackingFormField>
          <TrackingFormField helper="Fecha objetivo o compromiso interno." label="Vencimiento">
            <Input className="h-9" type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} />
          </TrackingFormField>
          <TrackingFormField helper="Cantidad estimada de minutos." label="Tiempo estimado">
            <Input className="h-9" min={0} step={15} type="number" value={draft.estimatedMinutes} onChange={(event) => update("estimatedMinutes", event.target.value)} />
          </TrackingFormField>
          <TrackingFormField helper="Palabras clave separadas por coma." label="Etiquetas">
            <Input className="h-9" placeholder="basis, reporte, urgente" value={draft.tags} onChange={(event) => update("tags", event.target.value)} />
          </TrackingFormField>
          <Button className="h-9" disabled={isPending} onClick={submit}>
            <Save className="mr-2 h-4 w-4" />
            Guardar tarea
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function TrackingFormField({
  label,
  helper,
  className,
  children
}: {
  label: string;
  helper: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      <p className="text-[11px] text-muted-foreground">{helper}</p>
    </div>
  );
}

function KanbanView({
  statuses,
  tasks,
  draggedTaskId,
  onDragStart,
  onDrop,
  onSelect
}: {
  statuses: TrackingStatus[];
  tasks: TrackingTask[];
  draggedTaskId: string | null;
  onDragStart: (taskId: string | null) => void;
  onDrop: (status: TrackingStatus) => void;
  onSelect: (taskId: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[960px] gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, statuses.length)}, minmax(260px, 1fr))` }}>
        {statuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.status.id === status.id);

          return (
            <section
              key={status.id}
              className={cn("min-h-[360px] rounded-lg border bg-card", draggedTaskId && "ring-1 ring-primary/20")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(status)}
            >
              <div className="flex items-center justify-between border-b p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                  <h3 className="text-sm font-semibold">{status.name}</h3>
                </div>
                <Badge variant="muted">{columnTasks.length}</Badge>
              </div>
              <div className="space-y-2 p-2">
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} draggable={!task.archivedAt && !task.deletedAt} onDragStart={() => onDragStart(task.id)} onSelect={onSelect} task={task} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  draggable,
  onDragStart,
  onSelect
}: {
  task: TrackingTask;
  draggable?: boolean;
  onDragStart?: () => void;
  onSelect: (taskId: string) => void;
}) {
  const flags = getTaskFlags(task);

  return (
    <button
      className={cn("block w-full rounded-md border bg-background p-3 text-left text-sm shadow-sm transition-colors hover:bg-muted/40", flags.overdue && "border-destructive/40")}
      draggable={draggable}
      type="button"
      onClick={() => onSelect(task.id)}
      onDragStart={onDragStart}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 font-medium">{task.title}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {task.client.name} / {task.project.name}
          </div>
        </div>
        <Badge variant={priorityVariants[task.priority as Priority]}>{priorityLabels[task.priority as Priority]}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <Badge variant="outline">{task.assignee.name}</Badge>
        <LifecycleBadge task={task} />
        {flags.overdue ? <Badge variant="destructive">Vencida</Badge> : null}
        {flags.dueSoon ? <Badge variant="warning">Proxima</Badge> : null}
        {flags.blocked ? <Badge variant="warning">Bloqueada</Badge> : null}
        {flags.stale ? <Badge variant="muted">Sin movimiento</Badge> : null}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, progress(task))}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatMinutes(task.consumedMinutes)}</span>
        <span>{task.dueDate ? formatDate(task.dueDate) : "Sin limite"}</span>
      </div>
    </button>
  );
}

function ListView({
  tasks,
  statuses,
  onMove,
  onSelect
}: {
  tasks: TrackingTask[];
  statuses: TrackingStatus[];
  onMove: (taskId: string, status: TrackingStatus) => void;
  onSelect: (taskId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              {["Tarea", "Cliente / Proyecto", "Responsable", "Estado", "Prioridad", "Fechas", "Tiempo", ""].map((header) => (
                <th key={header} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t hover:bg-muted/30" style={{ contentVisibility: "auto" }}>
                <td className="max-w-[280px] px-3 py-2">
                  <button className="text-left font-medium hover:underline" type="button" onClick={() => onSelect(task.id)}>
                    {task.title}
                  </button>
                  <div className="truncate text-xs text-muted-foreground">{task.description}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {task.client.name}
                  <div className="text-muted-foreground">{task.project.name}</div>
                </td>
                <td className="px-3 py-2 text-xs">{task.assignee.name}</td>
                <td className="px-3 py-2">
                  <Select className="h-8 text-xs" disabled={Boolean(task.archivedAt || task.deletedAt)} value={task.status.id} onChange={(event) => {
                    const status = statuses.find((item) => item.id === event.target.value);
                    if (status) onMove(task.id, status);
                  }}>
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={priorityVariants[task.priority as Priority]}>{priorityLabels[task.priority as Priority]}</Badge>
                  <div className="mt-1"><LifecycleBadge task={task} /></div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {task.dueDate ? formatDate(task.dueDate) : "-"}
                  <div className="text-muted-foreground">Act. {formatDate(task.updatedAt)}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {formatMinutes(task.consumedMinutes)}
                  <div className="text-muted-foreground">Est. {formatMinutes(task.estimatedMinutes)}</div>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onSelect(task.id)}>
                    Ver
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineView({ history, tasks }: { history: TrackingHistory[]; tasks: TrackingTask[] }) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div className="rounded-lg border bg-card">
      {history.length ? (
        <div className="divide-y">
          {history.map((item) => {
            const task = taskById.get(item.taskId);
            return (
              <div key={item.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[180px_1fr_auto]">
                <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("es-AR")}</div>
                <div>
                  <div className="font-medium">{task?.title ?? item.taskId}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.actor} / {item.action} {item.minutes ? `/ ${formatMinutes(item.minutes)}` : ""}
                  </div>
                  {item.message ? <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">{item.message}</div> : null}
                </div>
                <Badge variant="outline">{task?.status.name ?? "Historial"}</Badge>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-10 text-center text-sm text-muted-foreground">No hay historial para los filtros activos.</div>
      )}
    </div>
  );
}

function TrackingDashboard({ dashboard }: { dashboard: ReturnType<typeof buildDashboard> }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total" value={String(dashboard.total)} />
        <Metric label="Abiertas" value={String(dashboard.open)} />
        <Metric label="Vencidas" value={String(dashboard.overdue)} tone={dashboard.overdue ? "warning" : "default"} />
        <Metric label="Bloqueadas" value={String(dashboard.blocked)} tone={dashboard.blocked ? "warning" : "default"} />
        <Metric label="Estimado" value={formatMinutes(dashboard.estimatedMinutes)} />
        <Metric label="Consumido" value={formatMinutes(dashboard.consumedMinutes)} />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <DashboardList title="Tareas por estado" rows={dashboard.byStatus} />
        <DashboardList title="Carga por colaborador" rows={dashboard.byAssignee} />
        <DashboardList title="Productividad por proyecto" rows={dashboard.byProject} />
      </div>
      <Card>
        <CardHeader className="p-3 pb-0">
          <CardTitle className="text-sm">Evolucion semanal</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid gap-2">
            {dashboard.weekly.map((item) => (
              <div key={item.label} className="grid grid-cols-[80px_1fr_70px] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${item.percent}%` }} />
                </div>
                <span className="text-right font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardList({ title, rows }: { title: string; rows: Array<{ label: string; value: number; helper?: string; percent?: number }> }) {
  return (
    <Card>
      <CardHeader className="p-3 pb-0">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        {rows.length ? rows.slice(0, 8).map((row) => (
          <div key={row.label} className="rounded-md border p-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="truncate font-medium">{row.label}</span>
              <span>{row.value}</span>
            </div>
            {row.percent !== undefined ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, row.percent)}%` }} />
              </div>
            ) : null}
            {row.helper ? <div className="mt-1 text-muted-foreground">{row.helper}</div> : null}
          </div>
        )) : <div className="text-sm text-muted-foreground">Sin datos.</div>}
      </CardContent>
    </Card>
  );
}

function StatusManager({ statuses, onSaved }: { statuses: TrackingData["statuses"]; onSaved: () => void }) {
  const [draft, setDraft] = useState({ id: "", name: "", color: "#64748B", active: true, sortOrder: 0, isFinal: false, isBlocked: false });
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await upsertTrackingStatus({ ...draft, id: draft.id || undefined });
      if (result.ok) {
        toast.success(result.message);
        setDraft({ id: "", name: "", color: "#64748B", active: true, sortOrder: 0, isFinal: false, isBlocked: false });
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <section className="grid gap-3 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Estado de tarea</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nombre" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} />
            <Input type="number" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Activo</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isFinal} onChange={(event) => setDraft({ ...draft, isFinal: event.target.checked })} /> Estado final</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isBlocked} onChange={(event) => setDraft({ ...draft, isBlocked: event.target.checked })} /> Bloqueado</label>
          </div>
          <Button disabled={isPending} className="w-full" onClick={save}>Guardar estado</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Estados administrables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {statuses.map((status) => (
            <div key={status.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} />
                <span className="font-medium">{status.name}</span>
                <Badge variant={status.active ? "success" : "muted"}>{status.active ? "Activo" : "Inactivo"}</Badge>
                {status.isFinal ? <Badge variant="outline">Final</Badge> : null}
                {status.isBlocked ? <Badge variant="warning">Bloqueado</Badge> : null}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setDraft(status)}>Editar</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startTransition(async () => {
                    const result = await deleteTrackingStatus(status.id);
                    if (result.ok) {
                      toast.success(result.message);
                      onSaved();
                    } else {
                      toast.error(result.message);
                    }
                  })}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function TaskDetailPanel({
  task,
  clients,
  projects,
  users,
  statuses,
  history,
  canManage,
  onClose,
  onComment,
  onLifecycleChanged,
  onTimeLogged,
  onPatched
}: {
  task: TrackingTask;
  clients: TrackingData["clients"];
  projects: TrackingData["projects"];
  users: TrackingData["users"];
  statuses: TrackingStatus[];
  history: TrackingHistory[];
  canManage: boolean;
  onClose: () => void;
  onComment: (item: TrackingHistory) => void;
  onLifecycleChanged: (taskId: string, lifecycle: "ACTIVE" | "ARCHIVED" | "DELETED") => void;
  onTimeLogged: (minutes: number, item: TrackingHistory) => void;
  onPatched: () => void;
}) {
  const [comment, setComment] = useState("");
  const [time, setTime] = useState("30");
  const [timeNote, setTimeNote] = useState("");
  const [draft, setDraft] = useState({
    title: task.title,
    description: task.description,
    clientId: task.client.id,
    projectId: task.project.id,
    assigneeId: task.assignee.id,
    statusId: task.status.id,
    priority: task.priority,
    dueDate: task.dueDate?.slice(0, 10) ?? "",
    estimatedMinutes: String(task.estimatedMinutes),
    tags: task.tags.join(", ")
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autosaveSignatureRef = useRef(JSON.stringify(draft));
  const [isPending, startTransition] = useTransition();
  const availableProjects = projects.filter((project) => project.clientId === draft.clientId);

  useEffect(() => {
    if (!canManage || task.deletedAt) return;
    const signature = JSON.stringify(draft);
    if (signature === autosaveSignatureRef.current) return;

    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      const result = await patchTrackingTask({ ...draft, id: task.id, estimatedMinutes: Number(draft.estimatedMinutes) });
      if (result.ok) {
        autosaveSignatureRef.current = signature;
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1200);
      } else {
        setSaveState("error");
        toast.error(result.message);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [canManage, draft, task.deletedAt, task.id]);

  function submitComment() {
    startTransition(async () => {
      const result = await addTrackingComment({ taskId: task.id, message: comment });
      if (result.ok) {
        onComment({
          id: `local-${Date.now()}`,
          taskId: task.id,
          action: "COMMENT",
          message: comment,
          minutes: null,
          createdAt: new Date().toISOString(),
          actor: "Vos"
        });
        setComment("");
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  function submitTime() {
    const minutes = Math.max(1, Math.round(Number(time)));
    startTransition(async () => {
      const result = await logTrackingTaskTime({ taskId: task.id, minutes, message: timeNote });
      if (result.ok) {
        onTimeLogged(minutes, {
          id: `local-${Date.now()}`,
          taskId: task.id,
          action: "TIME_LOGGED",
          message: timeNote || `Tiempo imputado: ${minutes}m`,
          minutes,
          createdAt: new Date().toISOString(),
          actor: "Vos"
        });
        setTimeNote("");
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  function saveEdit() {
    startTransition(async () => {
      const result = await patchTrackingTask({ ...draft, id: task.id, estimatedMinutes: Number(draft.estimatedMinutes) });
      if (result.ok) {
        toast.success(result.message);
        onPatched();
      } else {
        toast.error(result.message);
      }
    });
  }

  function changeLifecycle(action: "ARCHIVE" | "DELETE" | "RESTORE") {
    const question =
      action === "DELETE"
        ? "Esta accion mueve la tarea a eliminadas y conserva auditoria. ¿Continuar?"
        : action === "ARCHIVE"
          ? "¿Archivar esta tarea?"
          : "¿Restaurar esta tarea?";

    if (!window.confirm(question)) return;

    startTransition(async () => {
      const result =
        action === "ARCHIVE"
          ? await archiveTrackingTask(task.id)
          : action === "DELETE"
            ? await deleteTrackingTask(task.id)
            : await restoreTrackingTask(task.id);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      onLifecycleChanged(task.id, action === "ARCHIVE" ? "ARCHIVED" : action === "DELETE" ? "DELETED" : "ACTIVE");
      if (action === "DELETE") onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/35" onClick={onClose}>
      <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-background p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{task.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{task.client.name} / {task.project.name}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Metric label="Estado" value={task.status.name} />
          <Metric label="Prioridad" value={priorityLabels[task.priority as Priority]} />
          <Metric label="Estimado" value={formatMinutes(task.estimatedMinutes)} />
          <Metric label="Consumido" value={formatMinutes(task.consumedMinutes)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <LifecycleBadge task={task} />
          {task.dueDate ? <Badge variant={getTaskFlags(task).overdue ? "destructive" : "outline"}>Vence {formatDate(task.dueDate)}</Badge> : null}
        </div>
        <p className="mt-4 rounded-md border bg-card p-3 text-sm">{task.description}</p>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="p-3 pb-0"><CardTitle className="text-sm">Comentario interno</CardTitle></CardHeader>
            <CardContent className="space-y-2 p-3">
              <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Registrar avance, bloqueo o decision" />
              <Button disabled={isPending || !comment.trim()} onClick={submitComment}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Comentar
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-0"><CardTitle className="text-sm">Tiempo consumido</CardTitle></CardHeader>
            <CardContent className="space-y-2 p-3">
              <Input min={1} step={5} type="number" value={time} onChange={(event) => setTime(event.target.value)} />
              <Input value={timeNote} onChange={(event) => setTimeNote(event.target.value)} placeholder="Nota opcional" />
              <Button disabled={isPending} onClick={submitTime}>
                <TimerReset className="mr-2 h-4 w-4" />
                Imputar
              </Button>
            </CardContent>
          </Card>
        </section>

        {canManage ? (
          <Card className="mt-4">
            <CardHeader className="flex-row items-center justify-between p-3 pb-0">
              <CardTitle className="text-sm">Editar tarea</CardTitle>
              <span className={cn("text-xs text-muted-foreground", saveState === "error" && "text-destructive", saveState === "saved" && "text-emerald-600")}>
                {saveState === "saving" ? "Guardando..." : saveState === "saved" ? "Guardado" : saveState === "error" ? "Error al guardar" : "Autosave activo"}
              </span>
            </CardHeader>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
              <Input className="sm:col-span-2" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <Textarea className="sm:col-span-2" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              <Select value={draft.clientId} onChange={(event) => {
                const clientId = event.target.value;
                setDraft({ ...draft, clientId, projectId: projects.find((project) => project.clientId === clientId)?.id ?? "" });
              }}>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </Select>
              <Select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
                {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </Select>
              <Select value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </Select>
              <Select value={draft.statusId} onChange={(event) => setDraft({ ...draft, statusId: event.target.value })}>
                {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
              </Select>
              <Select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
              <Input min={0} step={15} type="number" value={draft.estimatedMinutes} onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value })} />
              <Input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="Etiquetas" />
              <Button className="sm:col-span-2" disabled={isPending} onClick={saveEdit}>Guardar cambios</Button>
              <div className="flex flex-wrap gap-2 border-t pt-3 sm:col-span-2">
                {task.archivedAt || task.deletedAt ? (
                  <Button disabled={isPending} size="sm" variant="outline" onClick={() => changeLifecycle("RESTORE")}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restaurar
                  </Button>
                ) : (
                  <Button disabled={isPending} size="sm" variant="outline" onClick={() => changeLifecycle("ARCHIVE")}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archivar
                  </Button>
                )}
                {!task.deletedAt ? (
                  <Button disabled={isPending} size="sm" variant="destructive" onClick={() => changeLifecycle("DELETE")}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mt-4">
          <CardHeader className="p-3 pb-0"><CardTitle className="text-sm">Historial</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-md border p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{item.action}</span>
                  <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("es-AR")}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{item.actor}</div>
                {item.message ? <div className="mt-2">{item.message}</div> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className={cn("rounded-md border bg-card px-3 py-2", tone === "warning" && "border-amber-300 bg-amber-50 dark:bg-amber-950/20")}>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

function LifecycleBadge({ task }: { task: TrackingTask }) {
  if (task.deletedAt) return <Badge variant="destructive">Eliminada</Badge>;
  if (task.archivedAt) return <Badge variant="muted">Archivada</Badge>;
  return <Badge variant="success">Activa</Badge>;
}

function buildDashboard(tasks: TrackingTask[], statuses: TrackingStatus[]) {
  const total = tasks.length;
  const overdue = tasks.filter((task) => getTaskFlags(task).overdue).length;
  const blocked = tasks.filter((task) => task.status.isBlocked).length;
  const open = tasks.filter((task) => !task.status.isFinal).length;
  const estimatedMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const consumedMinutes = tasks.reduce((sum, task) => sum + task.consumedMinutes, 0);
  const byStatus = statuses.map((status) => ({ label: status.name, value: tasks.filter((task) => task.status.id === status.id).length }));
  const byAssignee = aggregate(tasks, (task) => task.assignee.name, () => 1).sort((a, b) => b.value - a.value);
  const byProject = aggregate(tasks, (task) => task.project.name, (task) => task.consumedMinutes).map((row) => ({
    ...row,
    helper: formatMinutes(row.value),
    percent: Math.round((row.value / Math.max(1, consumedMinutes)) * 100)
  }));
  const weeklyMap = new Map<string, number>();
  for (const task of tasks) {
    const label = format(startOfWeek(new Date(task.createdAt), { weekStartsOn: 1 }), "dd/MM");
    weeklyMap.set(label, (weeklyMap.get(label) ?? 0) + 1);
  }
  const maxWeek = Math.max(1, ...weeklyMap.values());
  const weekly = Array.from(weeklyMap.entries()).map(([label, count]) => ({ label, count, percent: Math.round((count / maxWeek) * 100) }));

  return { total, overdue, blocked, open, estimatedMinutes, consumedMinutes, byStatus, byAssignee, byProject, weekly };
}

function aggregate(tasks: TrackingTask[], labelFor: (task: TrackingTask) => string, valueFor: (task: TrackingTask) => number) {
  const map = new Map<string, number>();
  for (const task of tasks) {
    const label = labelFor(task);
    map.set(label, (map.get(label) ?? 0) + valueFor(task));
  }
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

function getTaskFlags(task: TrackingTask) {
  const now = new Date();
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const updated = new Date(task.updatedAt);
  const msDay = 24 * 60 * 60 * 1000;
  const overdue = Boolean(due && due < now && !task.status.isFinal);
  const dueSoon = Boolean(due && !overdue && due.getTime() - now.getTime() <= 3 * msDay && !task.status.isFinal);
  const stale = !task.status.isFinal && now.getTime() - updated.getTime() > 7 * msDay;

  return { overdue, dueSoon, stale, blocked: task.status.isBlocked };
}

function progress(task: TrackingTask) {
  return task.estimatedMinutes > 0 ? Math.round((task.consumedMinutes / task.estimatedMinutes) * 100) : task.consumedMinutes > 0 ? 100 : 0;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function exportRows(tasks: TrackingTask[], history: TrackingHistory[]) {
  const historyCount = new Map<string, number>();
  for (const item of history) {
    historyCount.set(item.taskId, (historyCount.get(item.taskId) ?? 0) + 1);
  }

  return tasks.map((task) => ({
    Tarea: task.title,
    Cliente: task.client.name,
    Proyecto: task.project.name,
    Responsable: task.assignee.name,
    Estado: task.status.name,
    Prioridad: priorityLabels[task.priority as Priority],
    "Fecha limite": task.dueDate?.slice(0, 10) ?? "",
    "Minutos estimados": task.estimatedMinutes,
    "Minutos consumidos": task.consumedMinutes,
    Etiquetas: task.tags.join(", "),
    Historial: historyCount.get(task.id) ?? 0
  }));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
