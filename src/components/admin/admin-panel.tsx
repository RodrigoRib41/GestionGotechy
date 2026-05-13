"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ChevronDown, Database, Download, Settings2, ShieldPlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { deleteAuditLogs, loadDatabaseState, previewAuditLogDelete } from "@/lib/actions/admin-actions";
import {
  addAllowedEmail,
  assignUserRole,
  deleteAllowedEmail,
  deleteDisabledUser,
  deleteCategory,
  deleteProjectType,
  previewDisabledUserDeletion,
  previewAllowedEmailDeletion,
  upsertCategory,
  upsertProjectType
} from "@/lib/actions/resource-actions";
import { allowedEmailSchema, roleValues } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type AdminData = Awaited<ReturnType<typeof import("@/lib/data/resources").getAdminData>>;
type FormValues = z.input<typeof allowedEmailSchema>;
type RoleValue = (typeof roleValues)[number];
type DeleteSummary = { count: number; actions: number; modules: number; label: string; from?: string; to?: string };
type AllowedEmailRow = { id: string; email: string; role: RoleValue; displayName?: string | null; status: string };
type UserRow = AdminData["users"][number];
type AllowedDeleteImpact = {
  email: string;
  userFound: boolean;
  sessions: number;
  accounts: number;
  projectLinks: number;
  favorites: number;
  dashboardPreferences: number;
  ownedGoals: number;
  historicalTimeEntries: number;
  assignedTrackingTasks: number;
  createdTrackingTasks: number;
  goalHistorySnapshots: number;
};
type DisabledUserImpact = {
  user: { id: string; name: string | null; email: string; status: string; role: string };
  sessions: number;
  accounts: number;
  projectLinks: number;
  favorites: number;
  dashboardPreferences: number;
  workSchedule: number;
  auditLogs: number;
  timeEntries: number;
  assignedTrackingTasks: number;
  createdTrackingTasks: number;
  trackingHistory: number;
  trackingAttachments: number;
  ownedGoals: number;
  goalExclusions: number;
  goalMetrics: number;
  goalCompliances: number;
  goalHistorySnapshots: number;
  goalCheckpoints: number;
  blockingReferences: number;
  canDeletePhysically: boolean;
};
type DisabledUserStrategy = "PHYSICAL" | "ARCHIVE" | "SOFT_DELETE" | "ANONYMIZE";

export function AdminPanel({ data }: { data: AdminData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmailRow[]>(data.allowedEmails as AllowedEmailRow[]);
  const [allowedToDelete, setAllowedToDelete] = useState<AllowedEmailRow | null>(null);
  const [allowedDeleteImpact, setAllowedDeleteImpact] = useState<AllowedDeleteImpact | null>(null);
  const [disabledToDelete, setDisabledToDelete] = useState<UserRow | null>(null);
  const [disabledDeleteImpact, setDisabledDeleteImpact] = useState<DisabledUserImpact | null>(null);
  const [disabledDeleteStrategy, setDisabledDeleteStrategy] = useState<DisabledUserStrategy>("ARCHIVE");
  const [disabledDeleteConfirmation, setDisabledDeleteConfirmation] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditEntity, setAuditEntity] = useState("");
  const [auditDeleteOpen, setAuditDeleteOpen] = useState(false);
  const [auditDeleteMode, setAuditDeleteMode] = useState<"range" | "all">("range");
  const [auditDeleteFrom, setAuditDeleteFrom] = useState("");
  const [auditDeleteTo, setAuditDeleteTo] = useState("");
  const [auditDeletePin, setAuditDeletePin] = useState("");
  const [auditDeleteConfirmation, setAuditDeleteConfirmation] = useState("");
  const [auditDeleteSummary, setAuditDeleteSummary] = useState<DeleteSummary | null>(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", color: "#2563EB", kind: "PRODUCTIVE", active: true });
  const [projectTypeDraft, setProjectTypeDraft] = useState({ id: "", name: "", description: "", active: true, monthlyReset: false });
  const form = useForm<FormValues>({
    resolver: zodResolver(allowedEmailSchema),
    defaultValues: { email: "", role: "COLABORADOR" }
  });

  const filteredLogs = useMemo(() => {
    return data.logs.filter((log) => {
      const date = log.createdAt.slice(0, 10);
      return (
        (!auditFrom || date >= auditFrom) &&
        (!auditTo || date <= auditTo) &&
        (!auditActor || log.actorId === auditActor) &&
        (!auditAction || log.action === auditAction) &&
        (!auditEntity || log.entity === auditEntity)
      );
    });
  }, [auditAction, auditActor, auditEntity, auditFrom, auditTo, data.logs]);
  const auditActors = useMemo(() => unique(data.logs.map((log) => ({ id: log.actorId ?? "", label: log.actor })).filter((item) => item.id)), [data.logs]);
  const auditActions = useMemo(() => uniqueStrings(data.logs.map((log) => log.action)), [data.logs]);
  const auditEntities = useMemo(() => uniqueStrings(data.logs.map((log) => log.entity)), [data.logs]);

  const userColumns: ColumnDef<UserRow>[] = [
    { accessorKey: "name", header: "Nombre", cell: ({ row }) => row.original.name ?? "Sin nombre" },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "role", header: "Rol", cell: ({ row }) => <RoleBadge role={row.original.role as RoleValue} /> },
    { accessorKey: "status", header: "Estado" },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {roleValues.map((role) => (
            <Button
              disabled={isPending || row.original.role === role}
              key={role}
              size="sm"
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const result = await assignUserRole({ userId: row.original.id, role, status: "ACTIVE" });
                  if (result.ok) {
                    toast.success(result.message);
                    router.refresh();
                  } else {
                    toast.error(result.message);
                  }
                })
              }
            >
              {roleLabel(role)}
            </Button>
          ))}
          <Button
            disabled={isPending}
            size="sm"
            variant="ghost"
            onClick={() =>
              startTransition(async () => {
                const result = await assignUserRole({ userId: row.original.id, role: row.original.role, status: "DISABLED" });
                if (result.ok) {
                  toast.success("Usuario bloqueado");
                  router.refresh();
                } else {
                  toast.error(result.message);
                }
              })
            }
          >
            Bloquear
          </Button>
          {row.original.status === "DISABLED" ? (
            <Button disabled={isPending} size="sm" variant="destructive" onClick={() => prepareDisabledDelete(row.original)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar
            </Button>
          ) : null}
        </div>
      )
    }
  ];

  const allowedColumns: ColumnDef<AllowedEmailRow>[] = [
    { accessorKey: "email", header: "Email" },
    { accessorKey: "role", header: "Rol", cell: ({ row }) => <RoleBadge role={row.original.role} /> },
    { accessorKey: "displayName", header: "Alias", cell: ({ row }) => row.original.displayName ?? "-" },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => prepareAllowedDelete(row.original)}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Eliminar
        </Button>
      )
    }
  ];

  const logColumns: ColumnDef<AdminData["logs"][number]>[] = [
    { accessorKey: "action", header: "Accion" },
    { accessorKey: "entity", header: "Modulo" },
    { accessorKey: "actor", header: "Usuario" },
    { accessorKey: "createdAt", header: "Fecha", cell: ({ row }) => new Date(row.original.createdAt).toLocaleString("es-AR") }
  ];

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await addAllowedEmail(values);
      if (result.ok) {
        toast.success(result.message);
        if (result.allowedEmail) {
          setAllowedEmails((current) => [result.allowedEmail as AllowedEmailRow, ...current.filter((item) => item.id !== result.allowedEmail?.id)]);
        }
        form.reset({ email: "", role: "COLABORADOR" });
      } else {
        toast.error(result.message);
      }
    });
  }

  function prepareAllowedDelete(row: AllowedEmailRow) {
    setAllowedToDelete(row);
    setAllowedDeleteImpact(null);
    startTransition(async () => {
      const result = await previewAllowedEmailDeletion(row.id);
      if (result.ok && result.impact) {
        setAllowedDeleteImpact(result.impact as AllowedDeleteImpact);
      } else {
        toast.error(result.message);
        setAllowedToDelete(null);
      }
    });
  }

  function confirmAllowedDelete() {
    if (!allowedToDelete) return;
    const previous = allowedEmails;
    setAllowedEmails((current) => current.filter((item) => item.id !== allowedToDelete.id));
    setAllowedToDelete(null);
    setAllowedDeleteImpact(null);

    startTransition(async () => {
      const result = await deleteAllowedEmail(allowedToDelete.id);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        setAllowedEmails(previous);
        toast.error(result.message);
      }
    });
  }

  function prepareDisabledDelete(row: UserRow) {
    setDisabledToDelete(row);
    setDisabledDeleteImpact(null);
    setDisabledDeleteConfirmation("");
    setDisabledDeleteStrategy("ARCHIVE");
    startTransition(async () => {
      const result = await previewDisabledUserDeletion(row.id);
      if (result.ok && result.impact) {
        const impact = result.impact as DisabledUserImpact;
        setDisabledDeleteImpact(impact);
        setDisabledDeleteStrategy(impact.canDeletePhysically ? "PHYSICAL" : "ARCHIVE");
      } else {
        toast.error(result.message);
        setDisabledToDelete(null);
      }
    });
  }

  function confirmDisabledDelete() {
    if (!disabledToDelete) return;
    startTransition(async () => {
      const result = await deleteDisabledUser({
        userId: disabledToDelete.id,
        strategy: disabledDeleteStrategy,
        confirmation: disabledDeleteConfirmation
      });

      if (result.ok) {
        toast.success(result.message);
        setDisabledToDelete(null);
        setDisabledDeleteImpact(null);
        setDisabledDeleteConfirmation("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function exportAudit(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (auditFrom) params.set("from", auditFrom);
    if (auditTo) params.set("to", auditTo);
    if (auditActor) params.set("actorId", auditActor);
    if (auditAction) params.set("action", auditAction);
    if (auditEntity) params.set("entity", auditEntity);
    window.location.href = `/api/admin/audit/export?${params.toString()}`;
  }

  function previewAuditDelete() {
    startTransition(async () => {
      const result = await previewAuditLogDelete({ mode: auditDeleteMode, from: auditDeleteFrom, to: auditDeleteTo });
      if (!result.ok || !result.summary) {
        toast.error(result.message);
        return;
      }
      setAuditDeleteSummary(result.summary);
      toast.success("Resumen listo");
    });
  }

  function confirmAuditDelete() {
    startTransition(async () => {
      const result = await deleteAuditLogs({
        mode: auditDeleteMode,
        from: auditDeleteFrom,
        to: auditDeleteTo,
        pin: auditDeletePin,
        confirmation: auditDeleteConfirmation
      });
      if (result.ok) {
        toast.success(result.message);
        setAuditDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <DatabaseState state={data.databaseState} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldPlus className="h-5 w-5 text-teal-600" />
            <CardTitle>Habilitar acceso</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[1fr_220px_auto]" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>Email Google</Label>
              <Input placeholder="persona@gotechy.com" {...form.register("email")} />
            </div>
            <div className="space-y-2">
              <Label>Rol unico</Label>
              <Select {...form.register("role")}>
                {roleValues.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            </div>
            <Button disabled={isPending} className="self-end" type="submit">
              Habilitar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={userColumns} data={data.users} searchPlaceholder="Buscar usuario" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mails habilitados y bloqueados</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={allowedColumns} data={allowedEmails} searchPlaceholder="Buscar email" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-teal-600" />
            <CardTitle>Configuracion de carga de horas</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Categorias</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_180px_auto]">
              <Input placeholder="Capacitacion" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />
              <Input type="color" value={categoryDraft.color} onChange={(event) => setCategoryDraft({ ...categoryDraft, color: event.target.value })} />
              <Select value={categoryDraft.kind} onChange={(event) => setCategoryDraft({ ...categoryDraft, kind: event.target.value })}>
                <option value="PRODUCTIVE">Productiva</option>
                <option value="INTERNAL">Interna</option>
                <option value="ADMINISTRATIVE">Administrativa</option>
                <option value="TRAINING">Capacitacion</option>
              </Select>
              <Button
                onClick={() =>
                  startTransition(async () => {
                    const result = await upsertCategory(categoryDraft);
                    if (result.ok) {
                      toast.success(result.message);
                      setCategoryDraft({ name: "", color: "#2563EB", kind: "PRODUCTIVE", active: true });
                    } else {
                      toast.error(result.message);
                    }
                  })
                }
                type="button"
              >
                Guardar
              </Button>
            </div>
            <div className="grid gap-2">
              {data.categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                    <span className="font-medium">{category.name}</span>
                    <Badge variant={category.active ? "success" : "muted"}>{category.kind}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteCategory(category.id);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                      })
                    }
                  >
                    Eliminar
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-sm font-semibold">Tipos de proyecto</h3>
            <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_120px_140px_auto]">
              <Input placeholder="Soporte" value={projectTypeDraft.name} onChange={(event) => setProjectTypeDraft({ ...projectTypeDraft, name: event.target.value })} />
              <Input
                placeholder="Descripcion breve"
                value={projectTypeDraft.description}
                onChange={(event) => setProjectTypeDraft({ ...projectTypeDraft, description: event.target.value })}
              />
              <label className="flex items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground">
                <input type="checkbox" checked={projectTypeDraft.active} onChange={(event) => setProjectTypeDraft({ ...projectTypeDraft, active: event.target.checked })} />
                Activo
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={projectTypeDraft.monthlyReset}
                  onChange={(event) => setProjectTypeDraft({ ...projectTypeDraft, monthlyReset: event.target.checked })}
                />
                Reinicio mensual
              </label>
              <Button
                onClick={() =>
                  startTransition(async () => {
                    const result = await upsertProjectType({ ...projectTypeDraft, id: projectTypeDraft.id || undefined });
                    if (result.ok) {
                      toast.success(result.message);
                      setProjectTypeDraft({ id: "", name: "", description: "", active: true, monthlyReset: false });
                    } else {
                      toast.error(result.message);
                    }
                  })
                }
                type="button"
              >
                Guardar
              </Button>
            </div>
            <div className="grid gap-2">
              {data.projectTypes.map((projectType) => (
                <div key={projectType.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{projectType.name}</span>
                      <Badge variant={projectType.active ? "success" : "muted"}>{projectType.active ? "Activo" : "Inactivo"}</Badge>
                      {projectType.monthlyReset ? <Badge variant="outline">Mensual</Badge> : null}
                    </div>
                    {projectType.description ? <div className="mt-1 truncate text-xs text-muted-foreground">{projectType.description}</div> : null}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setProjectTypeDraft({
                          id: projectType.id,
                          name: projectType.name,
                          description: projectType.description ?? "",
                          active: projectType.active,
                          monthlyReset: projectType.monthlyReset
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        startTransition(async () => {
                          const result = await deleteProjectType(projectType.id);
                          if (result.ok) toast.success(result.message);
                          else toast.error(result.message);
                        })
                      }
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Auditoria</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Historial descargable, filtrable y limpiable solo por superadmin.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportAudit("csv")}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => exportAudit("xlsx")}>
                <Download className="mr-2 h-4 w-4" />
                XLSX
              </Button>
              <Button variant="destructive" onClick={() => setAuditDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar logs de auditoria
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <Filter label="Desde">
              <Input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} />
            </Filter>
            <Filter label="Hasta">
              <Input type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} />
            </Filter>
            <Filter label="Usuario">
              <Select value={auditActor} onChange={(event) => setAuditActor(event.target.value)}>
                <option value="">Todos</option>
                {auditActors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.label}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Accion">
              <Select value={auditAction} onChange={(event) => setAuditAction(event.target.value)}>
                <option value="">Todas</option>
                {auditActions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Modulo">
              <Select value={auditEntity} onChange={(event) => setAuditEntity(event.target.value)}>
                <option value="">Todos</option>
                {auditEntities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </Select>
            </Filter>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={logColumns} data={filteredLogs} searchPlaceholder="Buscar log" />
        </CardContent>
      </Card>

      {allowedToDelete ? (
        <ConfirmModal
          title="Eliminar mail habilitado"
          message={`Se eliminara ${allowedToDelete.email}, se archivara el usuario relacionado y se revocaran sesiones/cuentas. Las horas, auditoria, tracking e historial quedan preservados.`}
          impact={allowedDeleteImpact}
          loading={isPending && !allowedDeleteImpact}
          onCancel={() => {
            setAllowedToDelete(null);
            setAllowedDeleteImpact(null);
          }}
          onConfirm={confirmAllowedDelete}
        />
      ) : null}

      {disabledToDelete ? (
        <DisabledUserDeleteModal
          confirmation={disabledDeleteConfirmation}
          impact={disabledDeleteImpact}
          isPending={isPending}
          strategy={disabledDeleteStrategy}
          user={disabledToDelete}
          onCancel={() => {
            setDisabledToDelete(null);
            setDisabledDeleteImpact(null);
            setDisabledDeleteConfirmation("");
          }}
          onConfirm={confirmDisabledDelete}
          onConfirmationChange={setDisabledDeleteConfirmation}
          onStrategyChange={setDisabledDeleteStrategy}
        />
      ) : null}

      {auditDeleteOpen ? (
        <CriticalDeleteModal
          mode={auditDeleteMode}
          setMode={setAuditDeleteMode}
          from={auditDeleteFrom}
          setFrom={setAuditDeleteFrom}
          to={auditDeleteTo}
          setTo={setAuditDeleteTo}
          pin={auditDeletePin}
          setPin={setAuditDeletePin}
          confirmation={auditDeleteConfirmation}
          setConfirmation={setAuditDeleteConfirmation}
          summary={auditDeleteSummary}
          isPending={isPending}
          onPreview={previewAuditDelete}
          onCancel={() => setAuditDeleteOpen(false)}
          onConfirm={confirmAuditDelete}
        />
      ) : null}
    </div>
  );
}

function DatabaseState({ state }: { state: AdminData["databaseState"] }) {
  const [open, setOpen] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [loadedState, setLoadedState] = useState(state);
  const percent = loadedState.percentUsed ?? 0;

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (nextOpen && !loadedState.tables.length && !loadedState.usedBytes) {
      startLoading(async () => {
        const result = await loadDatabaseState();
        if (result.ok) setLoadedState(result.state);
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <button className="flex w-full items-center justify-between gap-3 text-left" type="button" onClick={toggleOpen}>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-teal-600" />
            <CardTitle>Estado de la Base de Datos</CardTitle>
            <Badge variant={loadedState.health === "warning" ? "warning" : "success"}>{loadedState.health === "warning" ? "Atencion" : "Saludable"}</Badge>
            {isLoading ? <Badge variant="warning">Cargando</Badge> : null}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </CardHeader>
      <CardContent className={cn("grid transition-[grid-template-rows] duration-200", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Uso estimado" value={formatBytes(loadedState.usedBytes)} />
          <Metric label="Registros estimados" value={String(loadedState.totalRecords)} />
          <Metric label="Mayor tabla" value={loadedState.largestTable} />
          <Metric label="Crecimiento 30d" value={formatBytes(loadedState.growthEstimateBytes30d)} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", percent > 85 ? "bg-amber-500" : "bg-teal-500")} style={{ width: `${Math.min(100, percent || 8)}%` }} />
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {loadedState.tables.slice(0, 6).map((table) => (
            <div key={table.name} className="rounded-md border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{table.name}</span>
                <span className="text-muted-foreground">{formatBytes(table.totalBytes)}</span>
              </div>
              <div className="mt-1 text-muted-foreground">{table.rowEstimate} filas estimadas</div>
            </div>
          ))}
        </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CriticalDeleteModal({
  mode,
  setMode,
  from,
  setFrom,
  to,
  setTo,
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
  pin: string;
  setPin: (value: string) => void;
  confirmation: string;
  setConfirmation: (value: string) => void;
  summary: DeleteSummary | null;
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
            <h2 className="text-lg font-semibold">Eliminar logs de auditoria</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Operacion critica con PIN server-side, resumen previo y confirmacion doble.</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Filter label="Alcance">
              <Select value={mode} onChange={(event) => setMode(event.target.value as "range" | "all")}>
                <option value="range">Rango</option>
                <option value="all">Todo</option>
              </Select>
            </Filter>
            <Filter label="Desde">
              <Input disabled={mode === "all"} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Filter>
            <Filter label="Hasta">
              <Input disabled={mode === "all"} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Filter>
          </div>
          <Button disabled={isPending} variant="outline" onClick={onPreview}>
            Calcular afectados
          </Button>
          {summary ? (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
              <Metric label="Logs" value={String(summary.count)} />
              <Metric label="Acciones" value={String(summary.actions)} />
              <Metric label="Modulos" value={String(summary.modules)} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Filter label="PIN">
              <Input autoComplete="off" type="password" value={pin} onChange={(event) => setPin(event.target.value)} />
            </Filter>
            <Filter label='Escribi "BORRAR"'>
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </Filter>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button disabled={isPending} variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button disabled={isPending || !summary || summary.count === 0 || confirmation.trim().toUpperCase() !== "BORRAR"} variant="destructive" onClick={onConfirm}>
              {isPending ? "Procesando..." : "Eliminar logs"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  impact,
  loading,
  onCancel,
  onConfirm
}: {
  title: string;
  message: string;
  impact: AllowedDeleteImpact | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {loading ? <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Calculando impacto...</div> : null}
        {impact ? (
          <div className="mt-4 grid gap-2 rounded-md border bg-muted/30 p-3 text-xs">
            <div className="font-medium">Resumen de impacto</div>
            <div className="grid grid-cols-2 gap-2">
              <span>Usuario encontrado</span>
              <strong>{impact.userFound ? "Si" : "No"}</strong>
              <span>Sesiones/cuentas a revocar</span>
              <strong>{impact.sessions + impact.accounts}</strong>
              <span>Relaciones operativas</span>
              <strong>{impact.projectLinks + impact.favorites + impact.dashboardPreferences}</strong>
              <span>Objetivos propios</span>
              <strong>{impact.ownedGoals}</strong>
              <span>Horas historicas preservadas</span>
              <strong>{impact.historicalTimeEntries}</strong>
              <span>Tracking preservado</span>
              <strong>{impact.assignedTrackingTasks + impact.createdTrackingTasks}</strong>
            </div>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={loading || !impact} variant="destructive" onClick={onConfirm}>
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}

function DisabledUserDeleteModal({
  user,
  impact,
  strategy,
  confirmation,
  isPending,
  onStrategyChange,
  onConfirmationChange,
  onCancel,
  onConfirm
}: {
  user: UserRow;
  impact: DisabledUserImpact | null;
  strategy: DisabledUserStrategy;
  confirmation: string;
  isPending: boolean;
  onStrategyChange: (strategy: DisabledUserStrategy) => void;
  onConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const canConfirm = Boolean(impact) && confirmation.trim().toUpperCase() === "ELIMINAR" && (strategy !== "PHYSICAL" || impact?.canDeletePhysically);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-card shadow-xl">
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Resolver usuario DISABLED</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {user.name ?? user.email} esta deshabilitado. La eliminacion fisica solo se habilita si no hay referencias historicas.
          </p>
        </div>
        <div className="space-y-4 p-5">
          {!impact ? <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Calculando impacto...</div> : null}
          {impact ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Referencias" value={String(impact.blockingReferences)} />
                <Metric label="Horas" value={String(impact.timeEntries)} />
                <Metric label="Auditoria" value={String(impact.auditLogs)} />
                <Metric label="Objetivos" value={String(impact.goalMetrics + impact.goalCompliances + impact.goalHistorySnapshots + impact.goalCheckpoints)} />
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                {impact.canDeletePhysically
                  ? "No se detectaron referencias historicas: podes eliminar el usuario definitivamente."
                  : "Hay referencias historicas. La app impide el borrado fisico para preservar auditoria, reportes, horas, tracking y objetivos."}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { value: "PHYSICAL", label: "Eliminar definitivo", disabled: !impact?.canDeletePhysically },
              { value: "ARCHIVE", label: "Archivar" },
              { value: "SOFT_DELETE", label: "Soft delete" },
              { value: "ANONYMIZE", label: "Anonimizar" }
            ].map((option) => (
              <button
                key={option.value}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  strategy === option.value && "border-primary bg-primary text-primary-foreground",
                  option.disabled && "cursor-not-allowed opacity-50"
                )}
                disabled={option.disabled}
                type="button"
                onClick={() => onStrategyChange(option.value as DisabledUserStrategy)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Filter label='Confirmacion: escribi "ELIMINAR"'>
            <Input value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} />
          </Filter>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button disabled={isPending} variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button disabled={isPending || !canConfirm} variant="destructive" onClick={onConfirm}>
              {isPending ? "Procesando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
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

function RoleBadge({ role }: { role: RoleValue }) {
  return <Badge variant={role === "SUPERADMIN" ? "success" : "muted"}>{roleLabel(role)}</Badge>;
}

function roleLabel(role: RoleValue) {
  if (role === "SUPERADMIN") return "Superadmin";
  if (role === "ADMINISTRADOR") return "Administrador";
  return "Colaborador";
}

function unique(items: Array<{ id: string; label: string }>) {
  const map = new Map<string, string>();
  for (const item of items) map.set(item.id, item.label);
  return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items)).sort();
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
