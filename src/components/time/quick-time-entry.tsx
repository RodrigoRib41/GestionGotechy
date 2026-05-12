"use client";

import { Calendar, Check, Clock3, Save, Star, TimerReset } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { toast } from "sonner";

import { createTimeEntry, patchTimeEntry } from "@/lib/actions/time-entry-actions";
import { cn, formatMinutes, toDateInputValue } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ProjectOption = {
  id: string;
  name: string;
  code: string;
  client: { id: string; name: string; code: string };
};

type CategoryOption = { id: string; name: string; color?: string };

type EntryRow = {
  id: string;
  date: string;
  collaborator: string;
  project: string;
  projectId: string;
  client: string;
  clientId: string;
  category: string;
  categoryId: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
};

type TemplateOption = {
  id: string;
  name: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
  projectId?: string | null;
  categoryId?: string | null;
};

type FormState = {
  date: string;
  projectId: string;
  categoryId: string;
  detail: string;
  observations: string;
  hours: string;
  overtimeHours: string;
};

type EntryPatch = Partial<{
  date: string;
  projectId: string;
  categoryId: string;
  detail: string;
  observations: string;
  minutes: number;
  overtimeMinutes: number;
}>;

type DraftField = keyof FormState;

const autosaveDelay = 700;

export function QuickTimeEntry({
  projects,
  categories,
  favoriteProjects,
  templates,
  personalMetrics,
  workSchedule,
  recentEntries
}: {
  projects: ProjectOption[];
  categories: CategoryOption[];
  favoriteProjects: ProjectOption[];
  templates: TemplateOption[];
  personalMetrics: {
    todayPercent: number;
    weekPercent: number;
    monthPercent: number;
    pendingMinutes: number;
    overtimeMinutes: number;
    todayMinutes: number;
    weekMinutes: number;
    monthMinutes: number;
  };
  workSchedule: { dailyMinutes: number; weeklyMinutes: number; workdays: number[]; modality: string };
  recentEntries: EntryRow[];
}) {
  const [entries, setEntries] = useState(recentEntries);
  const [isPending, startTransition] = useTransition();
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const defaultProjectId = favoriteProjects.at(0)?.id ?? projects.at(0)?.id ?? "";
  const defaultCategoryId = categories.at(0)?.id ?? "";
  const [form, setForm] = useState<FormState>({
    date: toDateInputValue(),
    projectId: defaultProjectId,
    categoryId: defaultCategoryId,
    detail: "",
    observations: "",
    hours: "1",
    overtimeHours: "0"
  });
  const selectedProject = projectById.get(form.projectId);

  const applyEntryPatch = useCallback(
    (entry: EntryRow, patch: EntryPatch): EntryRow => {
      const project = patch.projectId ? projectById.get(patch.projectId) : null;
      const category = patch.categoryId ? categoryById.get(patch.categoryId) : null;

      return {
        ...entry,
        date: patch.date ? new Date(`${patch.date}T12:00:00`).toISOString() : entry.date,
        projectId: patch.projectId ?? entry.projectId,
        project: project?.name ?? entry.project,
        clientId: project?.client.id ?? entry.clientId,
        client: project?.client.name ?? entry.client,
        categoryId: patch.categoryId ?? entry.categoryId,
        category: category?.name ?? entry.category,
        detail: patch.detail ?? entry.detail,
        observations: patch.observations ?? entry.observations,
        minutes: patch.minutes ?? entry.minutes,
        overtimeMinutes: patch.overtimeMinutes ?? entry.overtimeMinutes
      };
    },
    [categoryById, projectById]
  );

  const updateEntryOptimistically = useCallback(
    (entryId: string, patch: EntryPatch) => {
      setEntries((current) => current.map((entry) => (entry.id === entryId ? applyEntryPatch(entry, patch) : entry)));
    },
    [applyEntryPatch]
  );

  const commitEntry = useCallback((entry: EntryRow) => {
    setEntries((current) => current.map((item) => (item.id === entry.id ? entry : item)));
  }, []);

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyTemplate(template: TemplateOption) {
    setForm((current) => ({
      ...current,
      projectId: template.projectId ?? current.projectId,
      categoryId: template.categoryId ?? current.categoryId,
      detail: template.detail,
      observations: template.observations ?? "",
      hours: minutesToHoursInput(template.minutes),
      overtimeHours: minutesToHoursInput(template.overtimeMinutes)
    }));
  }

  function submit() {
    const minutes = hoursInputToMinutes(form.hours);
    const overtimeMinutes = hoursInputToMinutes(form.overtimeHours, true);

    startTransition(async () => {
      const result = await createTimeEntry({
        date: form.date,
        projectId: form.projectId,
        categoryId: form.categoryId,
        detail: form.detail,
        observations: form.observations,
        minutes,
        overtimeMinutes
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setEntries((current) => [result.entry, ...current.filter((entry) => entry.id !== result.entry.id)]);
      setForm((current) => ({
        ...current,
        detail: "",
        observations: "",
        hours: "1",
        overtimeHours: "0"
      }));
    });
  }

  const canSubmit = Boolean(form.date && form.projectId && form.categoryId && form.detail.trim().length >= 3);

  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MiniKpi label="Hoy" value={`${personalMetrics.todayPercent}%`} helper={`${formatMinutes(personalMetrics.todayMinutes)} / ${formatMinutes(workSchedule.dailyMinutes)}`} />
        <MiniKpi label="Semana" value={`${personalMetrics.weekPercent}%`} helper={formatMinutes(personalMetrics.weekMinutes)} />
        <MiniKpi label="Mes" value={`${personalMetrics.monthPercent}%`} helper={formatMinutes(personalMetrics.monthMinutes)} />
        <MiniKpi label="Pendiente" value={formatMinutes(personalMetrics.pendingMinutes)} helper={`${formatMinutes(personalMetrics.overtimeMinutes)} extras`} />
      </section>

      <section className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Carga rapida</h2>
            <p className="text-xs text-muted-foreground">Tres lineas, tabulacion natural y Enter para guardar.</p>
          </div>
          {selectedProject ? <Badge variant="outline">{selectedProject.client.name}</Badge> : null}
        </div>

        {(templates.length || favoriteProjects.length) ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                type="button"
                onClick={() => applyTemplate(template)}
              >
                <Check className="h-3.5 w-3.5" />
                {template.name}
              </button>
            ))}
            {favoriteProjects.map((project) => (
              <button
                key={project.id}
                className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                type="button"
                onClick={() => updateForm("projectId", project.id)}
              >
                <Star className="h-3.5 w-3.5" />
                {project.name}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) submit();
          }}
        >
          <div className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)_220px]">
            <CompactField icon={Calendar}>
              <Input
                aria-label="Fecha"
                className="h-9"
                type="date"
                value={form.date}
                onChange={(event) => updateForm("date", event.target.value)}
              />
            </CompactField>
            <Select
              aria-label="Proyecto"
              className="h-9"
              value={form.projectId}
              onChange={(event) => updateForm("projectId", event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} - {project.client.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Categoria"
              className="h-9"
              value={form.categoryId}
              onChange={(event) => updateForm("categoryId", event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)]">
            <Input
              aria-label="Detalle"
              className="h-9"
              placeholder="Detalle / observaciones"
              value={form.detail}
              onChange={(event) => updateForm("detail", event.target.value)}
            />
            <Input
              aria-label="Observaciones"
              className="h-9"
              placeholder="Notas opcionales"
              value={form.observations}
              onChange={(event) => updateForm("observations", event.target.value)}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-[150px_150px_auto]">
            <CompactField icon={Clock3}>
              <Input
                aria-label="Horas trabajadas"
                className="h-9"
                min="0.25"
                step="0.25"
                type="number"
                value={form.hours}
                onChange={(event) => updateForm("hours", event.target.value)}
              />
            </CompactField>
            <CompactField icon={TimerReset}>
              <Input
                aria-label="Horas extra"
                className="h-9"
                min="0"
                step="0.25"
                type="number"
                value={form.overtimeHours}
                onChange={(event) => updateForm("overtimeHours", event.target.value)}
              />
            </CompactField>
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground md:justify-end">
              <span>Total {formatMinutes(hoursInputToMinutes(form.hours) + hoursInputToMinutes(form.overtimeHours, true))}</span>
              <Button className="h-9" disabled={!canSubmit || isPending} type="submit">
                <Save className="mr-2 h-4 w-4" />
                {isPending ? "Guardando" : "Guardar"}
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <h2 className="text-sm font-semibold">Ultimos 30 dias</h2>
            <p className="text-xs text-muted-foreground">Edicion inline con autosave debounce. Enter guarda y Escape cancela.</p>
          </div>
          <Badge variant="muted">{entries.length} cargas</Badge>
        </div>
        <div className="divide-y">
          {entries.length ? (
            entries.map((entry) => (
              <EditableEntryRow
                key={entry.id}
                categories={categories}
                entry={entry}
                projects={projects}
                onCommit={commitEntry}
                onOptimisticUpdate={updateEntryOptimistically}
              />
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No hay cargas en los ultimos 30 dias.</div>
          )}
        </div>
      </section>
    </div>
  );
}

const EditableEntryRow = memo(function EditableEntryRow({
  entry,
  projects,
  categories,
  onOptimisticUpdate,
  onCommit
}: {
  entry: EntryRow;
  projects: ProjectOption[];
  categories: CategoryOption[];
  onOptimisticUpdate: (entryId: string, patch: EntryPatch) => void;
  onCommit: (entry: EntryRow) => void;
}) {
  const [draft, setDraft] = useState<FormState>(() => entryToDraft(entry));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyFieldsRef = useRef(new Set<DraftField>());
  const draftRef = useRef(draft);
  const savedDraftRef = useRef(draft);
  const savedEntryRef = useRef(entry);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const saveNow = useCallback(async () => {
    if (!dirtyFieldsRef.current.size) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const fields = Array.from(dirtyFieldsRef.current);
    const patch = draftToPatch(draftRef.current, fields);

    if (!Object.keys(patch).length) return;

    setStatus("saving");
    const result = await patchTimeEntry(entry.id, patch);

    if (!result.ok) {
      toast.error(result.message);
      dirtyFieldsRef.current.clear();
      setDraft(savedDraftRef.current);
      onCommit(savedEntryRef.current);
      setStatus("error");
      return;
    }

    dirtyFieldsRef.current.clear();
    savedDraftRef.current = entryToDraft(result.entry);
    savedEntryRef.current = result.entry;
    setDraft(savedDraftRef.current);
    onCommit(result.entry);
    setStatus("saved");
    window.setTimeout(() => setStatus("idle"), 1100);
  }, [entry.id, onCommit]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveNow();
    }, autosaveDelay);
  }, [saveNow]);

  function updateDraft<Key extends DraftField>(field: Key, value: FormState[Key]) {
    const next = { ...draftRef.current, [field]: value };
    setDraft(next);
    draftRef.current = next;
    dirtyFieldsRef.current.add(field);
    onOptimisticUpdate(entry.id, draftToPatch(next, [field]));
    scheduleSave();
  }

  function cancelEdit() {
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyFieldsRef.current.clear();
    setDraft(savedDraftRef.current);
    onCommit(savedEntryRef.current);
    setStatus("idle");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveNow();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  return (
    <div className={cn("grid gap-1 px-3 py-2 text-sm transition-colors hover:bg-muted/30", status === "saving" && "bg-amber-500/5")}>
      <div className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)_190px]">
        <Input className="h-8 text-xs" type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} onKeyDown={onKeyDown} />
        <Select className="h-8 text-xs" value={draft.projectId} onChange={(event) => updateDraft("projectId", event.target.value)} onKeyDown={onKeyDown}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} - {project.client.name}
            </option>
          ))}
        </Select>
        <Select className="h-8 text-xs" value={draft.categoryId} onChange={(event) => updateDraft("categoryId", event.target.value)} onKeyDown={onKeyDown}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]">
        <Input className="h-8 text-xs" value={draft.detail} onChange={(event) => updateDraft("detail", event.target.value)} onKeyDown={onKeyDown} />
        <Input
          className="h-8 text-xs"
          placeholder="Notas"
          value={draft.observations}
          onChange={(event) => updateDraft("observations", event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="grid gap-1 md:grid-cols-[110px_110px_1fr]">
        <Input
          className="h-8 text-xs"
          min="0.25"
          step="0.25"
          type="number"
          value={draft.hours}
          onChange={(event) => updateDraft("hours", event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Input
          className="h-8 text-xs"
          min="0"
          step="0.25"
          type="number"
          value={draft.overtimeHours}
          onChange={(event) => updateDraft("overtimeHours", event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground md:justify-end">
          <span>{formatMinutes(hoursInputToMinutes(draft.hours) + hoursInputToMinutes(draft.overtimeHours, true))}</span>
          <span className={cn("w-20 text-right", status === "error" && "text-destructive", status === "saved" && "text-emerald-600")}>
            {status === "saving" ? "Guardando" : status === "saved" ? "Guardado" : status === "error" ? "Error" : ""}
          </span>
        </div>
      </div>
    </div>
  );
});

function MiniKpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <div className="mt-1 text-xl font-semibold tracking-normal">{value}</div>
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function CompactField({ icon: Icon, children }: { icon: typeof Calendar; children: ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <div className="[&_input]:pl-8">{children}</div>
    </div>
  );
}

function entryToDraft(entry: EntryRow): FormState {
  return {
    date: entry.date.slice(0, 10),
    projectId: entry.projectId,
    categoryId: entry.categoryId,
    detail: entry.detail,
    observations: entry.observations ?? "",
    hours: minutesToHoursInput(entry.minutes),
    overtimeHours: minutesToHoursInput(entry.overtimeMinutes)
  };
}

function draftToPatch(draft: FormState, fields: DraftField[]) {
  const patch: EntryPatch = {};

  for (const field of fields) {
    if (field === "date") patch.date = draft.date;
    if (field === "projectId") patch.projectId = draft.projectId;
    if (field === "categoryId") patch.categoryId = draft.categoryId;
    if (field === "detail") patch.detail = draft.detail;
    if (field === "observations") patch.observations = draft.observations;
    if (field === "hours" && draft.hours.trim()) patch.minutes = hoursInputToMinutes(draft.hours);
    if (field === "overtimeHours" && draft.overtimeHours.trim()) patch.overtimeMinutes = hoursInputToMinutes(draft.overtimeHours, true);
  }

  return patch;
}

function minutesToHoursInput(minutes: number) {
  return Number((Math.max(0, minutes) / 60).toFixed(2)).toString();
}

function hoursInputToMinutes(value: string, allowZero = false) {
  const hours = Number(value);
  const minutes = Number.isFinite(hours) ? Math.round(hours * 60) : 0;
  return allowZero ? Math.max(0, minutes) : Math.max(1, minutes);
}
