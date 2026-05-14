"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ClipboardList,
  Maximize2,
  Play,
  RotateCcw,
  Save,
  Search,
  Star,
  Square,
  Target,
  TimerReset,
  Trash2,
  X
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { toast } from "sonner";

import {
  createTimeEntry,
  deleteTimeEntryFavorite,
  patchTimeEntry,
  saveTimeEntryFavorite,
  updateTimeEntryFavorite
} from "@/lib/actions/time-entry-actions";
import { categoryKindMeta, categoryKindValues, getCategoryKindMeta, type CategoryKindKey } from "@/lib/category-kind";
import { cn, formatMinutes, toDateInputValue } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ProjectOption = {
  id: string;
  name: string;
  status: string;
  client: { id: string; name: string };
  projectType?: { id: string; name: string; monthlyReset: boolean } | null;
  usesEstimatedTime: boolean;
  estimatedMinutes: number;
  consumedMinutes: number;
};

type CategoryOption = { id: string; name: string; color?: string; kind: string; description?: string | null };

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
  categoryKind: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
};

type FavoriteOption = {
  id: string;
  name: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
  projectId: string;
  categoryId: string;
  project: string;
  client: string;
  category: string;
  categoryKind: string;
};

type FormState = {
  date: string;
  projectId: string;
  categoryId: string;
  detail: string;
  observations: string;
  minutes: string;
  overtimeMinutes: string;
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
type StopwatchState = {
  startedAt: number | null;
  finishedAt: number | null;
  elapsedMs: number;
};

const autosaveDelay = 700;
const lowAvailabilityThreshold = 4 * 60;
const categoryKindIcons = {
  PRODUCTIVE: BriefcaseBusiness,
  INTERNAL: Clock3,
  ADMINISTRATIVE: ClipboardList,
  TRAINING: BookOpenCheck
} satisfies Record<CategoryKindKey, typeof Clock3>;

export function QuickTimeEntry({
  userId,
  projects,
  categories,
  favorites: initialFavorites,
  personalMetrics,
  goalProgress,
  workSchedule,
  recentEntries
}: {
  userId: string;
  projects: ProjectOption[];
  categories: CategoryOption[];
  favorites: FavoriteOption[];
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
  goalProgress: Array<{
    id: string;
    name: string;
    period: string;
    percent: number;
    actualMinutes: number;
    targetMinutes: number;
    missingMinutes: number;
    met: boolean;
    tone: string;
    message: string;
  }>;
  workSchedule: { dailyMinutes: number; weeklyMinutes: number; workdays: number[]; modality: string };
  recentEntries: EntryRow[];
}) {
  const [entries, setEntries] = useState(recentEntries);
  const [localProjects, setLocalProjects] = useState(projects);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [categoryKindFilter, setCategoryKindFilter] = useState<"ALL" | CategoryKindKey>("ALL");
  const [isPending, startTransition] = useTransition();
  const projectById = useMemo(() => new Map(localProjects.map((project) => [project.id, project])), [localProjects]);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleCategories = useMemo(
    () => categories.filter((category) => categoryKindFilter === "ALL" || category.kind === categoryKindFilter),
    [categories, categoryKindFilter]
  );
  const defaultProjectId = favorites.at(0)?.projectId ?? localProjects.at(0)?.id ?? "";
  const defaultCategoryId = favorites.at(0)?.categoryId ?? categories.at(0)?.id ?? "";
  const favoriteCacheKey = `gotechy:time-favorites:${userId}`;
  const stopwatchCacheKey = `gotechy:time-stopwatch:${userId}`;
  const [form, setForm] = useState<FormState>({
    date: toDateInputValue(),
    projectId: defaultProjectId,
    categoryId: defaultCategoryId,
    detail: "",
    observations: "",
    minutes: "30",
    overtimeMinutes: "0"
  });
  const [stopwatch, setStopwatch] = useState<StopwatchState>({ startedAt: null, finishedAt: null, elapsedMs: 0 });
  const [stopwatchNow, setStopwatchNow] = useState(() => Date.now());
  const selectedProject = projectById.get(form.projectId);
  const selectedCategory = categoryById.get(form.categoryId);
  const selectedFavorite = selectedFavoriteId ? favorites.find((favorite) => favorite.id === selectedFavoriteId) : null;
  const isStopwatchRunning = Boolean(stopwatch.startedAt && !stopwatch.finishedAt);
  const stopwatchElapsedMs =
    isStopwatchRunning && stopwatch.startedAt ? Math.max(0, stopwatchNow - stopwatch.startedAt) : stopwatch.elapsedMs;
  const stopwatchElapsedMinutes = elapsedMsToMinutes(stopwatchElapsedMs);
  const workedMinutes = minutesInputToMinutes(form.minutes);
  const extraMinutes = minutesInputToMinutes(form.overtimeMinutes, true);
  const canSubmit = Boolean(
    form.date &&
      form.projectId &&
      form.categoryId &&
      form.detail.trim().length >= 3 &&
      workedMinutes !== null &&
      extraMinutes !== null
  );
  const projectAvailability = useMemo(() => {
    if (!selectedProject?.usesEstimatedTime || selectedProject.estimatedMinutes <= 0) return null;

    const consumedMinutes = selectedProject.consumedMinutes;
    const remainingMinutes = Math.max(0, selectedProject.estimatedMinutes - consumedMinutes);
    const percent = Math.round((consumedMinutes / selectedProject.estimatedMinutes) * 100);

    return { consumedMinutes, remainingMinutes, percent, low: remainingMinutes < lowAvailabilityThreshold };
  }, [selectedProject]);
  const groupedDays = useMemo(() => groupEntriesByDay(entries), [entries]);
  const categoryKindStats = useMemo(() => buildCategoryKindStats(entries, categoryById), [categoryById, entries]);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set(groupEntriesByDay(recentEntries).slice(0, 3).map((group) => group.key)));

  useEffect(() => {
    if (!visibleCategories.length) return;
    if (!visibleCategories.some((category) => category.id === form.categoryId)) {
      setForm((current) => ({ ...current, categoryId: visibleCategories[0].id }));
    }
  }, [form.categoryId, visibleCategories]);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(favoriteCacheKey);
      if (cached && !initialFavorites.length) {
        const parsed = JSON.parse(cached) as FavoriteOption[];
        setFavorites(parsed.slice(0, 5));
      }
    } catch {
      return;
    }
  }, [favoriteCacheKey, initialFavorites.length]);

  useEffect(() => {
    try {
      window.localStorage.setItem(favoriteCacheKey, JSON.stringify(favorites));
    } catch {
      return;
    }
  }, [favoriteCacheKey, favorites]);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(stopwatchCacheKey);
      if (!cached) return;

      const parsed = JSON.parse(cached) as Partial<StopwatchState>;
      const startedAt = toTimestamp(parsed.startedAt);
      const finishedAt = toTimestamp(parsed.finishedAt);
      const elapsedMs =
        typeof parsed.elapsedMs === "number" && Number.isFinite(parsed.elapsedMs)
          ? Math.max(0, parsed.elapsedMs)
          : startedAt && finishedAt
            ? Math.max(0, finishedAt - startedAt)
            : 0;

      if (startedAt || elapsedMs > 0) {
        setStopwatch({ startedAt, finishedAt, elapsedMs });
        setStopwatchNow(Date.now());
      }
    } catch {
      return;
    }
  }, [stopwatchCacheKey]);

  useEffect(() => {
    if (!isStopwatchRunning) return;

    const timer = window.setInterval(() => setStopwatchNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isStopwatchRunning]);

  useEffect(() => {
    try {
      if (!stopwatch.startedAt && !stopwatch.finishedAt && stopwatch.elapsedMs === 0) {
        window.localStorage.removeItem(stopwatchCacheKey);
        return;
      }

      window.localStorage.setItem(stopwatchCacheKey, JSON.stringify(stopwatch));
    } catch {
      return;
    }
  }, [stopwatch, stopwatchCacheKey]);

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
        categoryKind: category?.kind ?? entry.categoryKind,
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

  function applyFavorite(favorite: FavoriteOption) {
    setSelectedFavoriteId(favorite.id);
    setForm((current) => ({
      ...current,
      projectId: favorite.projectId,
      categoryId: favorite.categoryId,
      detail: favorite.detail,
      observations: favorite.observations ?? "",
      minutes: minutesToInput(favorite.minutes),
      overtimeMinutes: minutesToInput(favorite.overtimeMinutes)
    }));
  }

  function favoritePayload() {
    const project = projectById.get(form.projectId);
    const category = categoryById.get(form.categoryId);
    const baseName = form.detail.trim() || `${project?.name ?? "Proyecto"} / ${category?.name ?? "Categoria"}`;

    return {
      name: baseName.slice(0, 80),
      date: form.date,
      projectId: form.projectId,
      categoryId: form.categoryId,
      detail: form.detail,
      observations: form.observations,
      minutes: workedMinutes ?? 0,
      overtimeMinutes: extraMinutes ?? 0
    };
  }

  function saveFavorite() {
    if (!canSubmit) {
      toast.error("Completa proyecto, categoria, detalle y minutos");
      return;
    }

    startTransition(async () => {
      const result = await saveTimeEntryFavorite(favoritePayload());
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setFavorites((current) => [result.favorite, ...current.filter((favorite) => favorite.id !== result.favorite.id)].slice(0, 5));
      setSelectedFavoriteId(result.favorite.id);
      toast.success(result.message);
    });
  }

  function updateFavorite() {
    if (!selectedFavoriteId || !canSubmit) return;

    startTransition(async () => {
      const result = await updateTimeEntryFavorite(selectedFavoriteId, favoritePayload());
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setFavorites((current) => current.map((favorite) => (favorite.id === result.favorite.id ? result.favorite : favorite)));
      toast.success(result.message);
    });
  }

  function removeFavorite() {
    if (!selectedFavoriteId) return;

    startTransition(async () => {
      const result = await deleteTimeEntryFavorite(selectedFavoriteId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setFavorites((current) => current.filter((favorite) => favorite.id !== selectedFavoriteId));
      setSelectedFavoriteId(null);
      toast.success(result.message);
    });
  }

  function startStopwatch() {
    const startedAt = Date.now();
    const startedLine = buildStopwatchStartLine(startedAt);

    setStopwatch({ startedAt, finishedAt: null, elapsedMs: 0 });
    setStopwatchNow(startedAt);
    setForm((current) => ({
      ...current,
      date: current.date || toDateInputValue(new Date(startedAt)),
      detail: current.detail.trim() ? current.detail : "Tarea cronometrada",
      observations: appendObservationLines(current.observations, [startedLine])
    }));
    toast.success("Cronometro iniciado");
  }

  function finishStopwatch() {
    if (!stopwatch.startedAt || stopwatch.finishedAt) return;

    const startedAt = stopwatch.startedAt;
    const finishedAt = Date.now();
    const elapsedMs = Math.max(0, finishedAt - startedAt);
    const elapsedMinutes = elapsedMsToMinutes(elapsedMs);

    setStopwatch({ startedAt, finishedAt, elapsedMs });
    setStopwatchNow(finishedAt);
    setForm((current) => ({
      ...current,
      date: current.date || toDateInputValue(new Date(startedAt)),
      detail: current.detail.trim() ? current.detail : "Tarea cronometrada",
      minutes: minutesToInput(elapsedMinutes),
      observations: appendObservationLines(current.observations, [
        buildStopwatchStartLine(startedAt),
        buildStopwatchFinishLine(finishedAt),
        `Duracion cronometrada: ${formatMinutes(elapsedMinutes)}`
      ])
    }));
    toast.success(`Cronometro finalizado: ${formatMinutes(elapsedMinutes)}`);
  }

  function resetStopwatch() {
    setStopwatch({ startedAt: null, finishedAt: null, elapsedMs: 0 });
    setStopwatchNow(Date.now());
  }

  function submit() {
    if (isStopwatchRunning) {
      toast.error("Finaliza el cronometro antes de guardar");
      return;
    }

    if (!canSubmit || workedMinutes === null || extraMinutes === null) {
      toast.error("Ingresa minutos positivos y validos");
      return;
    }

    startTransition(async () => {
      const result = await createTimeEntry({
        date: form.date,
        projectId: form.projectId,
        categoryId: form.categoryId,
        detail: form.detail,
        observations: form.observations,
        minutes: workedMinutes,
        overtimeMinutes: extraMinutes
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setEntries((current) => [result.entry, ...current.filter((entry) => entry.id !== result.entry.id)]);
      setLocalProjects((current) =>
        current.map((project) =>
          project.id === result.entry.projectId
            ? { ...project, consumedMinutes: project.consumedMinutes + result.entry.minutes + result.entry.overtimeMinutes }
            : project
        )
      );
      setExpandedDays((current) => new Set(current).add(result.entry.date.slice(0, 10)));
      setForm((current) => ({
        ...current,
        detail: "",
        observations: "",
        minutes: "30",
        overtimeMinutes: "0"
      }));
      if (stopwatch.startedAt) resetStopwatch();
    });
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MiniKpi label="Hoy" value={`${personalMetrics.todayPercent}%`} helper={`${formatMinutes(personalMetrics.todayMinutes)} / ${formatMinutes(workSchedule.dailyMinutes)}`} />
        <MiniKpi label="Semana" value={`${personalMetrics.weekPercent}%`} helper={formatMinutes(personalMetrics.weekMinutes)} />
        <MiniKpi label="Mes" value={`${personalMetrics.monthPercent}%`} helper={formatMinutes(personalMetrics.monthMinutes)} />
        <MiniKpi label="Pendiente" value={formatMinutes(personalMetrics.pendingMinutes)} helper={`${formatMinutes(personalMetrics.overtimeMinutes)} extras`} />
      </section>

      <CategoryKindOverview stats={categoryKindStats} />

      {goalProgress.length ? <GoalProgressPanel goals={goalProgress} /> : null}

      <section className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Carga rapida</h2>
            <p className="text-xs text-muted-foreground">El tipo de categoria queda visible para evitar imputaciones confusas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCategory ? <CategoryKindBadge kind={selectedCategory.kind} /> : null}
            {selectedProject ? <Badge variant="outline">{selectedProject.client.name}</Badge> : null}
          </div>
        </div>

        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-8" disabled={isPending || favorites.length >= 5} size="sm" type="button" variant="outline" onClick={saveFavorite}>
              <Star className="mr-2 h-3.5 w-3.5" />
              Guardar en favoritos
            </Button>
            {selectedFavorite ? (
              <>
                <Button className="h-8" disabled={isPending} size="sm" type="button" variant="outline" onClick={updateFavorite}>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Actualizar
                </Button>
                <Button className="h-8" disabled={isPending} size="sm" type="button" variant="ghost" onClick={removeFavorite}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Eliminar
                </Button>
              </>
            ) : null}
            <Badge variant="muted">{favorites.length}/5</Badge>
          </div>
          {favorites.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {favorites.map((favorite) => (
                <button
                  key={favorite.id}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted",
                    selectedFavoriteId === favorite.id && "border-primary bg-primary text-primary-foreground hover:bg-primary"
                  )}
                  type="button"
                  onClick={() => applyFavorite(favorite)}
                >
                  <Star className="h-3.5 w-3.5" />
                  <span className="max-w-44 truncate">{favorite.name}</span>
                  <span className="text-[11px] opacity-80">{formatMinutes(favorite.minutes + favorite.overtimeMinutes)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <StopwatchPanel
          elapsedMs={stopwatchElapsedMs}
          elapsedMinutes={stopwatchElapsedMinutes}
          finishedAt={stopwatch.finishedAt}
          isRunning={isStopwatchRunning}
          startedAt={stopwatch.startedAt}
          onFinish={finishStopwatch}
          onReset={resetStopwatch}
          onStart={startStopwatch}
        />

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (isStopwatchRunning) {
              toast.error("Finaliza el cronometro antes de guardar");
              return;
            }
            if (canSubmit) submit();
          }}
        >
          <div className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)_170px_220px]">
            <CompactField icon={Calendar}>
              <Input aria-label="Fecha" className="h-9" type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} />
            </CompactField>
            <Select aria-label="Proyecto" className="h-9" value={form.projectId} onChange={(event) => updateForm("projectId", event.target.value)}>
              {localProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} - {project.client.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Filtrar tipo de categoria" className="h-9" value={categoryKindFilter} onChange={(event) => setCategoryKindFilter(event.target.value as "ALL" | CategoryKindKey)}>
              <option value="ALL">Todos los tipos</option>
              {categoryKindValues.map((kind) => (
                <option key={kind} value={kind}>
                  {categoryKindMeta[kind].label}
                </option>
              ))}
            </Select>
            <Select aria-label="Categoria" className="h-9" value={form.categoryId} onChange={(event) => updateForm("categoryId", event.target.value)}>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} - {getCategoryKindMeta(category.kind).label}
                </option>
              ))}
            </Select>
          </div>

          {selectedCategory ? <SelectedCategoryHint category={selectedCategory} /> : null}

          {projectAvailability ? <ProjectAvailability project={selectedProject} availability={projectAvailability} /> : null}

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)]">
            <Input aria-label="Detalle" className="h-9" placeholder="Detalle" value={form.detail} onChange={(event) => updateForm("detail", event.target.value)} />
            <Input
              aria-label="Observaciones"
              className="h-9"
              placeholder="Observaciones"
              value={form.observations}
              onChange={(event) => updateForm("observations", event.target.value)}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-[150px_150px_auto]">
            <CompactField icon={Clock3}>
              <Input
                aria-label="Minutos trabajados"
                className="h-9"
                min="1"
                step="1"
                type="number"
                value={form.minutes}
                onChange={(event) => updateForm("minutes", event.target.value)}
              />
            </CompactField>
            <CompactField icon={TimerReset}>
              <Input
                aria-label="Minutos extra"
                className="h-9"
                min="0"
                step="1"
                type="number"
                value={form.overtimeMinutes}
                onChange={(event) => updateForm("overtimeMinutes", event.target.value)}
              />
            </CompactField>
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground md:justify-end">
              <span>Total {formatMinutes((workedMinutes ?? 0) + (extraMinutes ?? 0))}</span>
              <Button className="h-9" disabled={!canSubmit || isPending || isStopwatchRunning} type="submit">
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
            <p className="text-xs text-muted-foreground">
              {entries.length} registros / {formatMinutes(entries.reduce((total, entry) => total + entry.minutes + entry.overtimeMinutes, 0))}
            </p>
          </div>
          <Button className="h-8" size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
            <Maximize2 className="mr-2 h-3.5 w-3.5" />
            Expandir historial
          </Button>
        </div>
        <div className="divide-y">
          {groupedDays.length ? (
            groupedDays.map((group) => (
              <WorklogDay
                key={group.key}
                categories={categories}
                expanded={expandedDays.has(group.key)}
                group={group}
                projects={localProjects}
                onCommit={commitEntry}
                onOptimisticUpdate={updateEntryOptimistically}
                onToggle={() =>
                  setExpandedDays((current) => {
                    const next = new Set(current);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
              />
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No hay cargas en los ultimos 30 dias.</div>
          )}
        </div>
      </section>

      {historyOpen ? (
        <HistoryModal
          categories={categories}
          entries={entries}
          projects={localProjects}
          onClose={() => setHistoryOpen(false)}
          onCommit={commitEntry}
          onOptimisticUpdate={updateEntryOptimistically}
        />
      ) : null}
    </div>
  );
}

function CategoryKindOverview({ stats }: { stats: Array<{ kind: string; minutes: number; entries: number; percent: number }> }) {
  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-teal-600" />
          <h2 className="text-sm font-semibold">Tiempo por tipo de categoria</h2>
        </div>
        <CategoryKindLegend />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const meta = getCategoryKindMeta(item.kind);
          return (
            <div key={item.kind} className={cn("rounded-md border p-3", meta.bgClass, meta.borderClass)}>
              <div className="flex items-center justify-between gap-2">
                <CategoryKindBadge kind={item.kind} />
                <span className="text-xs font-medium text-muted-foreground">{item.percent}%</span>
              </div>
              <div className="mt-2 text-lg font-semibold">{formatMinutes(item.minutes)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.entries} registros recientes</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CategoryKindLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {categoryKindValues.map((kind) => (
        <CategoryKindBadge key={kind} compact kind={kind} />
      ))}
    </div>
  );
}

function SelectedCategoryHint({ category }: { category: CategoryOption }) {
  const meta = getCategoryKindMeta(category.kind);

  return (
    <div className={cn("flex flex-col gap-2 rounded-md border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between", meta.bgClass, meta.borderClass)}>
      <div className="flex min-w-0 items-center gap-2">
        <CategoryKindBadge kind={category.kind} />
        <span className="truncate font-medium">{category.name}</span>
      </div>
      <span className="text-muted-foreground">{category.description || meta.description}</span>
    </div>
  );
}

function CategoryKindBadge({ kind, compact = false, suffix }: { kind?: string | null; compact?: boolean; suffix?: string }) {
  const meta = getCategoryKindMeta(kind);
  const Icon = categoryKindIcons[(kind as CategoryKindKey) || "PRODUCTIVE"] ?? BriefcaseBusiness;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium", meta.bgClass, meta.textClass, meta.borderClass)}>
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {compact ? meta.shortLabel : meta.label}
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

function ProjectAvailability({
  project,
  availability
}: {
  project?: ProjectOption;
  availability: { consumedMinutes: number; remainingMinutes: number; percent: number; low: boolean };
}) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border px-3 py-2 text-xs md:grid-cols-[1fr_auto]",
        availability.low ? "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100" : "bg-muted/40"
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {availability.low ? <AlertTriangle className="h-4 w-4" /> : null}
          <span>{project?.projectType?.monthlyReset ? "Disponible mensual" : "Disponible del proyecto"}</span>
          {availability.low ? <span>Quedan solo {formatMinutes(availability.remainingMinutes)}</span> : null}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/70">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, availability.percent)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-right">
        <span>
          <b>{formatMinutes(availability.consumedMinutes)}</b>
          <br />
          consumido
        </span>
        <span>
          <b>{formatMinutes(availability.remainingMinutes)}</b>
          <br />
          restante
        </span>
        <span>
          <b>{availability.percent}%</b>
          <br />
          usado
        </span>
      </div>
    </div>
  );
}

function StopwatchPanel({
  elapsedMs,
  elapsedMinutes,
  finishedAt,
  isRunning,
  startedAt,
  onFinish,
  onReset,
  onStart
}: {
  elapsedMs: number;
  elapsedMinutes: number;
  finishedAt: number | null;
  isRunning: boolean;
  startedAt: number | null;
  onFinish: () => void;
  onReset: () => void;
  onStart: () => void;
}) {
  const hasTiming = Boolean(startedAt);

  return (
    <div
      className={cn(
        "mb-3 grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]",
        isRunning ? "border-teal-500/50 bg-teal-500/5" : "bg-muted/30"
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-teal-500/10 text-teal-700">
            <TimerReset className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Cronometro opcional</div>
            <div className="text-xs text-muted-foreground">
              {isRunning ? "En curso" : finishedAt ? "Listo para guardar" : "Inactivo"}
            </div>
          </div>
          <Badge variant={isRunning ? "success" : finishedAt ? "warning" : "muted"}>{formatMinutes(elapsedMinutes)}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
          <div className="font-mono text-3xl font-semibold tracking-normal tabular-nums" aria-live="polite">
            {formatStopwatchDuration(elapsedMs)}
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Inicio de tarea {startedAt ? formatStopwatchTime(startedAt) : "--:--"}</span>
            <span>Fin de tarea {finishedAt ? formatStopwatchTime(finishedAt) : isRunning ? "En curso" : "--:--"}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Button className="h-9" disabled={isRunning} size="sm" type="button" variant={hasTiming ? "outline" : "default"} onClick={onStart}>
          <Play className="mr-2 h-4 w-4" />
          Iniciar
        </Button>
        <Button className="h-9" disabled={!isRunning} size="sm" type="button" variant="outline" onClick={onFinish}>
          <Square className="mr-2 h-4 w-4" />
          Finalizar
        </Button>
        <Button className="h-9" disabled={!hasTiming} size="sm" type="button" variant="ghost" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reiniciar
        </Button>
      </div>
    </div>
  );
}

function GoalProgressPanel({
  goals
}: {
  goals: Array<{
    id: string;
    name: string;
    period: string;
    percent: number;
    actualMinutes: number;
    targetMinutes: number;
    missingMinutes: number;
    met: boolean;
    tone: string;
    message: string;
  }>;
}) {
  return (
    <section className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-teal-600" />
        <h2 className="text-sm font-semibold">Objetivos activos</h2>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {goals.map((goal) => (
          <div key={goal.id} className="rounded-md border bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{goal.name}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Llevas {goal.percent}% del objetivo {goal.period === "WEEKLY" ? "semanal" : "mensual"}.
                </p>
              </div>
              <Badge variant={goal.met ? "success" : goal.percent >= 70 ? "warning" : "muted"}>
                {goal.met ? "Cumplido" : `${formatMinutes(goal.missingMinutes)} faltan`}
              </Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
              <div
                className={cn("h-full rounded-full", goal.met ? "bg-emerald-500" : goal.percent >= 70 ? "bg-amber-500" : "bg-rose-500")}
                style={{ width: `${Math.min(100, goal.percent)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{goal.met ? "Excelente progreso esta semana." : `Te faltan ${formatMinutes(goal.missingMinutes)} para alcanzar el objetivo.`}</span>
              <span>
                {formatMinutes(goal.actualMinutes)} / {formatMinutes(goal.targetMinutes)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorklogDay({
  group,
  expanded,
  projects,
  categories,
  onToggle,
  onOptimisticUpdate,
  onCommit
}: {
  group: WorklogGroup;
  expanded: boolean;
  projects: ProjectOption[];
  categories: CategoryOption[];
  onToggle: () => void;
  onOptimisticUpdate: (entryId: string, patch: EntryPatch) => void;
  onCommit: (entry: EntryRow) => void;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <div>
      <button className="grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/30 md:grid-cols-[1fr_auto]" type="button" onClick={onToggle}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-500/10 text-teal-700">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold capitalize">{group.label}</div>
            <div className="text-xs text-muted-foreground">{group.entryCount} registros</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Badge variant="outline">{formatMinutes(group.totalMinutes)} trabajadas</Badge>
          {group.overtimeMinutes > 0 ? <Badge variant="warning">{formatMinutes(group.overtimeMinutes)} extras</Badge> : null}
          {group.kindBreakdown.slice(0, 2).map((item) => (
            <CategoryKindBadge key={item.kind} compact kind={item.kind} suffix={formatMinutes(item.minutes)} />
          ))}
        </div>
      </button>
      {expanded ? (
        <div className="border-t bg-muted/10">
          {group.entries.map((entry) => (
            <EditableEntryRow
              key={entry.id}
              categories={categories}
              entry={entry}
              projects={projects}
              onCommit={onCommit}
              onOptimisticUpdate={onOptimisticUpdate}
            />
          ))}
        </div>
      ) : null}
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
  const projectOptions = useMemo(() => {
    if (projects.some((project) => project.id === entry.projectId)) return projects;
    return [
      {
        id: entry.projectId,
        name: entry.project,
        status: "INACTIVE",
        client: { id: entry.clientId, name: entry.client },
        projectType: null,
        usesEstimatedTime: false,
        estimatedMinutes: 0,
        consumedMinutes: 0
      },
      ...projects
    ];
  }, [entry, projects]);
  const selectedCategory = useMemo(() => categories.find((category) => category.id === draft.categoryId), [categories, draft.categoryId]);

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
      <div className="grid gap-1 md:grid-cols-[140px_minmax(0,1fr)_190px_auto]">
        <Input className="h-8 text-xs" type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} onKeyDown={onKeyDown} />
        <Select className="h-8 text-xs" value={draft.projectId} onChange={(event) => updateDraft("projectId", event.target.value)} onKeyDown={onKeyDown}>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id} disabled={project.status !== "ACTIVE"}>
              {project.name} - {project.client.name}
            </option>
          ))}
        </Select>
        <Select className="h-8 text-xs" value={draft.categoryId} onChange={(event) => updateDraft("categoryId", event.target.value)} onKeyDown={onKeyDown}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} - {getCategoryKindMeta(category.kind).label}
            </option>
          ))}
        </Select>
        {selectedCategory ? <CategoryKindBadge compact kind={selectedCategory.kind} /> : null}
      </div>
      <div className="grid gap-1 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]">
        <Input className="h-8 text-xs" value={draft.detail} onChange={(event) => updateDraft("detail", event.target.value)} onKeyDown={onKeyDown} />
        <Input className="h-8 text-xs" placeholder="Observaciones" value={draft.observations} onChange={(event) => updateDraft("observations", event.target.value)} onKeyDown={onKeyDown} />
      </div>
      <div className="grid gap-1 md:grid-cols-[110px_110px_1fr]">
        <Input className="h-8 text-xs" min="1" step="1" type="number" value={draft.minutes} onChange={(event) => updateDraft("minutes", event.target.value)} onKeyDown={onKeyDown} />
        <Input
          className="h-8 text-xs"
          min="0"
          step="1"
          type="number"
          value={draft.overtimeMinutes}
          onChange={(event) => updateDraft("overtimeMinutes", event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground md:justify-end">
          <span>{formatMinutes((minutesInputToMinutes(draft.minutes) ?? 0) + (minutesInputToMinutes(draft.overtimeMinutes, true) ?? 0))}</span>
          <span className={cn("w-20 text-right", status === "error" && "text-destructive", status === "saved" && "text-emerald-600")}>
            {status === "saving" ? "Guardando" : status === "saved" ? "Guardado" : status === "error" ? "Error" : ""}
          </span>
        </div>
      </div>
    </div>
  );
});

function HistoryModal({
  entries,
  projects,
  categories,
  onClose,
  onOptimisticUpdate,
  onCommit
}: {
  entries: EntryRow[];
  projects: ProjectOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onOptimisticUpdate: (entryId: string, patch: EntryPatch) => void;
  onCommit: (entry: EntryRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("ALL");
  const [categoryId, setCategoryId] = useState("ALL");
  const [categoryKind, setCategoryKind] = useState<"ALL" | CategoryKindKey>("ALL");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [visibleCount, setVisibleCount] = useState(80);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filteredEntries = useMemo(() => {
    const list = entries.filter((entry) => {
      const matchesText =
        !deferredQuery ||
        entry.detail.toLowerCase().includes(deferredQuery) ||
        (entry.observations ?? "").toLowerCase().includes(deferredQuery) ||
        entry.project.toLowerCase().includes(deferredQuery) ||
        entry.client.toLowerCase().includes(deferredQuery);
      const matchesProject = projectId === "ALL" || entry.projectId === projectId;
      const matchesCategory = categoryId === "ALL" || entry.categoryId === categoryId;
      const matchesKind = categoryKind === "ALL" || entry.categoryKind === categoryKind;
      const matchesDate = !date || entry.date.slice(0, 10) === date;

      return matchesText && matchesProject && matchesCategory && matchesKind && matchesDate;
    });

    return [...list].sort((a, b) => (sort === "desc" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [categoryId, categoryKind, date, deferredQuery, entries, projectId, sort]);
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const groups = useMemo(() => groupEntriesByDay(visibleEntries, sort), [sort, visibleEntries]);

  useEffect(() => {
    setVisibleCount(80);
  }, [categoryId, categoryKind, date, deferredQuery, projectId, sort]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Historial de 30 dias</h2>
            <p className="text-xs text-muted-foreground">{filteredEntries.length} registros filtrados</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="grid gap-2 border-b bg-card/80 p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_170px_150px_130px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Select className="h-9" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="ALL">Proyecto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <Select className="h-9" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="ALL">Categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select className="h-9" value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as "ALL" | CategoryKindKey)}>
            <option value="ALL">Tipo</option>
            {categoryKindValues.map((kind) => (
              <option key={kind} value={kind}>
                {categoryKindMeta[kind].label}
              </option>
            ))}
          </Select>
          <Input className="h-9" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Select className="h-9" value={sort} onChange={(event) => setSort(event.target.value as "desc" | "asc")}>
            <option value="desc">Recientes</option>
            <option value="asc">Antiguos</option>
          </Select>
        </div>

        <main className="flex-1 overflow-y-auto">
          {groups.length ? (
            <div className="divide-y">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
                    <div className="text-sm font-semibold capitalize">{group.label}</div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{group.entryCount} registros</Badge>
                      <Badge variant="muted">{formatMinutes(group.totalMinutes)}</Badge>
                      {group.overtimeMinutes > 0 ? <Badge variant="warning">{formatMinutes(group.overtimeMinutes)} extras</Badge> : null}
                    </div>
                  </div>
                  {group.entries.map((entry) => (
                    <EditableEntryRow
                      key={entry.id}
                      categories={categories}
                      entry={entry}
                      projects={projects}
                      onCommit={onCommit}
                      onOptimisticUpdate={onOptimisticUpdate}
                    />
                  ))}
                </div>
              ))}
              {visibleCount < filteredEntries.length ? (
                <div className="p-4 text-center">
                  <Button variant="outline" onClick={() => setVisibleCount((current) => current + 80)}>
                    Ver mas
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No hay registros con esos filtros.</div>
          )}
        </main>
      </div>
    </div>
  );
}

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

type WorklogGroup = {
  key: string;
  label: string;
  entryCount: number;
  totalMinutes: number;
  overtimeMinutes: number;
  kindBreakdown: Array<{ kind: string; minutes: number }>;
  entries: EntryRow[];
};

function groupEntriesByDay(entries: EntryRow[], sort: "desc" | "asc" = "desc"): WorklogGroup[] {
  const map = new Map<string, WorklogGroup>();

  for (const entry of entries) {
    const key = entry.date.slice(0, 10);
    const date = parseISO(entry.date);
    const current =
      map.get(key) ??
      ({
        key,
        label: format(date, "EEEE dd MMMM", { locale: es }),
        entryCount: 0,
        totalMinutes: 0,
        overtimeMinutes: 0,
        kindBreakdown: [],
        entries: []
      } satisfies WorklogGroup);

    current.entryCount += 1;
    current.totalMinutes += entry.minutes;
    current.overtimeMinutes += entry.overtimeMinutes;
    current.entries.push(entry);
    const kind = entry.categoryKind || "PRODUCTIVE";
    const kindRow = current.kindBreakdown.find((item) => item.kind === kind);
    if (kindRow) kindRow.minutes += entry.minutes + entry.overtimeMinutes;
    else current.kindBreakdown.push({ kind, minutes: entry.minutes + entry.overtimeMinutes });
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((group) => ({ ...group, kindBreakdown: [...group.kindBreakdown].sort((a, b) => b.minutes - a.minutes) }))
    .sort((a, b) => (sort === "desc" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
}

function buildCategoryKindStats(entries: EntryRow[], categoryById: Map<string, CategoryOption>) {
  const totals = new Map<string, { kind: string; minutes: number; entries: number }>();

  for (const kind of categoryKindValues) {
    totals.set(kind, { kind, minutes: 0, entries: 0 });
  }

  for (const entry of entries) {
    const kind = categoryById.get(entry.categoryId)?.kind ?? entry.categoryKind ?? "PRODUCTIVE";
    const current = totals.get(kind) ?? { kind, minutes: 0, entries: 0 };
    current.minutes += entry.minutes + entry.overtimeMinutes;
    current.entries += 1;
    totals.set(kind, current);
  }

  const totalMinutes = Math.max(1, Array.from(totals.values()).reduce((sum, item) => sum + item.minutes, 0));

  return Array.from(totals.values()).map((item) => ({
    ...item,
    percent: Math.round((item.minutes / totalMinutes) * 100)
  }));
}

function entryToDraft(entry: EntryRow): FormState {
  return {
    date: entry.date.slice(0, 10),
    projectId: entry.projectId,
    categoryId: entry.categoryId,
    detail: entry.detail,
    observations: entry.observations ?? "",
    minutes: minutesToInput(entry.minutes),
    overtimeMinutes: minutesToInput(entry.overtimeMinutes)
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
    if (field === "minutes" && draft.minutes.trim()) {
      const minutes = minutesInputToMinutes(draft.minutes);
      if (minutes !== null) patch.minutes = minutes;
    }
    if (field === "overtimeMinutes" && draft.overtimeMinutes.trim()) {
      const minutes = minutesInputToMinutes(draft.overtimeMinutes, true);
      if (minutes !== null) patch.overtimeMinutes = minutes;
    }
  }

  return patch;
}

function minutesToInput(minutes: number) {
  return Math.max(0, Math.round(minutes)).toString();
}

function minutesInputToMinutes(value: string, allowZero = false) {
  const normalized = value.trim();
  if (!normalized) return null;
  const minutes = Number(normalized);
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) return null;
  if (allowZero) return minutes >= 0 ? minutes : null;
  return minutes > 0 ? minutes : null;
}

function elapsedMsToMinutes(elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.max(1, Math.round(elapsedMs / 60_000));
}

function formatStopwatchDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");
}

function formatStopwatchTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function buildStopwatchStartLine(timestamp: number) {
  return `Inicio de tarea: ${formatStopwatchTime(timestamp)}`;
}

function buildStopwatchFinishLine(timestamp: number) {
  return `Fin de tarea: ${formatStopwatchTime(timestamp)}`;
}

function appendObservationLines(current: string, lines: string[]) {
  const trimmed = current.trim();
  const uniqueLines = lines.filter((line) => line && !trimmed.includes(line));
  if (!uniqueLines.length) return current;

  const next = [trimmed, ...uniqueLines].filter(Boolean).join("\n");
  if (next.length <= 800) return next;

  const fallback = uniqueLines.join("\n");
  return fallback.length <= 800 ? fallback : current;
}

function toTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
