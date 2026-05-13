"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { BriefcaseBusiness, Pencil, Plus, Power, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import { createProject, deleteProject, refreshResourceCatalogs, toggleProjectStatus, updateProject } from "@/lib/actions/resource-actions";
import { projectSchema } from "@/lib/validators";
import { formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/data/data-table";

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  projectTypeId?: string | null;
  projectType?: { id: string; name: string; monthlyReset: boolean } | null;
  usesEstimatedTime: boolean;
  estimatedMinutes: number;
  consumedMinutes: number;
  description?: string | null;
  client: { id: string; name: string };
  members?: string[];
  entryCount?: number;
};

type ClientOption = { id: string; name: string };
type ProjectTypeOption = { id: string; name: string; active: boolean; monthlyReset: boolean };
type FormValues = z.input<typeof projectSchema>;

export function ProjectsClient({
  projects,
  clients,
  projectTypes
}: {
  projects: ProjectRow[];
  clients: ClientOption[];
  projectTypes: ProjectTypeOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [localProjects, setLocalProjects] = useState(projects);
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      clientId: clients.at(0)?.id ?? "",
      projectTypeId: projectTypes.at(0)?.id ?? "",
      status: "ACTIVE",
      usesEstimatedTime: false,
      estimatedMinutes: 0,
      description: ""
    }
  });
  const usesEstimatedTime = form.watch("usesEstimatedTime");
  const estimatedMinutes = Number(form.watch("estimatedMinutes") ?? 0);
  const editingProjectId = form.watch("id") ?? "";
  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const projectTypesById = useMemo(() => new Map(projectTypes.map((type) => [type.id, type])), [projectTypes]);
  const visibleProjects = useMemo(
    () => localProjects.filter((project) => statusFilter === "ALL" || project.status === statusFilter),
    [localProjects, statusFilter]
  );

  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  const columns: ColumnDef<ProjectRow>[] = [
    {
      accessorKey: "name",
      header: "Proyecto",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.client.name}</div>
        </div>
      )
    },
    {
      accessorFn: (row) => row.projectType?.name ?? "Sin tipo",
      header: "Tipo",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1">
          <span>{row.original.projectType?.name ?? "Sin tipo"}</span>
          {row.original.projectType?.monthlyReset ? <Badge variant="outline">Mensual</Badge> : null}
        </div>
      )
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <Badge variant={row.original.status === "ACTIVE" ? "success" : "muted"}>{row.original.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
    },
    {
      accessorKey: "consumedMinutes",
      header: "Consumido",
      cell: ({ row }) => formatMinutes(row.original.consumedMinutes)
    },
    {
      accessorKey: "estimatedMinutes",
      header: "Estimado",
      cell: ({ row }) => (row.original.usesEstimatedTime ? formatMinutes(row.original.estimatedMinutes) : "-")
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              startTransition(async () => {
                const result = await toggleProjectStatus(row.original.id);
                if (result.ok) {
                  toast.success(result.message);
                  router.refresh();
                } else {
                  toast.error(result.message);
                }
              });
            }}
          >
            <Power className="mr-1 h-3.5 w-3.5" />
            {row.original.status === "ACTIVE" ? "Desactivar" : "Activar"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => editProject(row.original)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!window.confirm("Eliminar proyecto? Solo se permite si no tiene minutos registrados.")) return;
              startTransition(async () => {
                const result = await deleteProject(row.original.id);
                if (result.ok) {
                  setLocalProjects((current) => current.filter((project) => project.id !== row.original.id));
                  toast.success(result.message);
                  router.refresh();
                } else {
                  toast.error(result.message);
                }
              });
            }}
          >
            Eliminar
          </Button>
        </div>
      )
    }
  ];

  function buildOptimisticProject(values: FormValues, current?: ProjectRow): ProjectRow {
    const client = clientsById.get(values.clientId) ?? current?.client ?? { id: values.clientId, name: "Cliente" };
    const projectType = values.projectTypeId ? projectTypesById.get(values.projectTypeId) ?? null : null;

    return {
      id: values.id ?? current?.id ?? `pending-${Date.now()}`,
      name: values.name.trim(),
      status: values.status ?? "ACTIVE",
      projectType: projectType ? { id: projectType.id, name: projectType.name, monthlyReset: projectType.monthlyReset } : null,
      projectTypeId: values.projectTypeId || null,
      usesEstimatedTime: Boolean(values.usesEstimatedTime),
      estimatedMinutes: values.usesEstimatedTime ? Number(values.estimatedMinutes ?? 0) : 0,
      consumedMinutes: current?.consumedMinutes ?? 0,
      description: values.description?.trim() || null,
      client,
      members: current?.members ?? [],
      entryCount: current?.entryCount ?? 0
    };
  }

  function editProject(project: ProjectRow) {
    form.reset({
      id: project.id,
      name: project.name,
      clientId: project.client.id,
      projectTypeId: project.projectTypeId ?? "",
      status: project.status as "ACTIVE" | "INACTIVE",
      usesEstimatedTime: project.usesEstimatedTime,
      estimatedMinutes: project.estimatedMinutes,
      description: project.description ?? ""
    });
  }

  function resetForm() {
    form.reset({
      id: undefined,
      name: "",
      clientId: clients.at(0)?.id ?? "",
      projectTypeId: projectTypes.at(0)?.id ?? "",
      status: "ACTIVE",
      usesEstimatedTime: false,
      estimatedMinutes: 0,
      description: ""
    });
  }

  function onSubmit(values: FormValues) {
    const isEditing = Boolean(values.id);
    const previous = localProjects;
    const current = values.id ? localProjects.find((project) => project.id === values.id) : undefined;
    const optimistic = buildOptimisticProject(values, current);

    if (isEditing) {
      setLocalProjects((items) => items.map((project) => (project.id === values.id ? optimistic : project)));
    }

    startTransition(async () => {
      const result = isEditing ? await updateProject(values) : await createProject(values);
      if (result.ok) {
        if (result.project) {
          setLocalProjects((items) =>
            isEditing
              ? items.map((project) => (project.id === result.project?.id ? (result.project as ProjectRow) : project))
              : [result.project as ProjectRow, ...items]
          );
        }
        toast.success(result.message);
        resetForm();
        router.refresh();
      } else {
        if (isEditing) setLocalProjects(previous);
        toast.error(result.message);
      }
    });
  }

  function refreshData() {
    startTransition(async () => {
      const result = await refreshResourceCatalogs();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-teal-600" />
            <CardTitle>{editingProjectId ? "Editar proyecto" : "Nuevo proyecto"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} placeholder="Nombre Proyecto" />
            </Field>
            <Field label="Cliente" error={form.formState.errors.clientId?.message}>
              <Select {...form.register("clientId")}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select {...form.register("projectTypeId")}>
                  <option value="">Sin tipo</option>
                  {projectTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                      {type.monthlyReset ? " mensual" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Minutos estimados">
                <Input disabled={!usesEstimatedTime} min={0} step={1} type="number" {...form.register("estimatedMinutes")} />
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" {...form.register("usesEstimatedTime")} />
                  Usar estimacion
                </label>
              </Field>
            </div>
            <Field label="Descripcion" error={form.formState.errors.description?.message}>
              <Textarea {...form.register("description")} placeholder="Contexto interno, alcance o notas operativas" />
            </Field>
            {usesEstimatedTime ? <p className="text-xs text-muted-foreground">Equivale a {formatMinutes(estimatedMinutes)}.</p> : null}
            <div className="flex gap-2">
              <Button disabled={isPending} className="flex-1" type="submit">
                {editingProjectId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingProjectId ? "Guardar cambios" : "Crear proyecto"}
              </Button>
              {editingProjectId ? (
                <Button disabled={isPending} type="button" variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Proyectos</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={isPending} size="sm" variant="outline" onClick={refreshData}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Actualizar
              </Button>
              <div className="flex rounded-md border p-1">
                {(["ACTIVE", "INACTIVE", "ALL"] as const).map((status) => (
                  <button
                    key={status}
                    className={`h-7 rounded px-2 text-xs font-medium ${statusFilter === status ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === "ACTIVE" ? "Activos" : status === "INACTIVE" ? "Inactivos" : "Todos"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={visibleProjects} searchPlaceholder="Buscar proyecto o cliente" />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
