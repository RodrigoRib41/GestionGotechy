"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Building2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import { createClient, deleteClient, deleteClients, refreshResourceCatalogs, updateClient } from "@/lib/actions/resource-actions";
import { clientSchema } from "@/lib/validators";
import { formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ClientRow = {
  id: string;
  name: string;
  status: string;
  description?: string | null;
  projects: number;
  activeProjects?: number;
  entryCount?: number;
  consumedMinutes: number;
};

type FormValues = z.input<typeof clientSchema>;

export function ClientsClient({ clients, canDelete = false }: { clients: ClientRow[]; canDelete?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [localClients, setLocalClients] = useState(clients);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(() => new Set());
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", status: "ACTIVE", description: "" }
  });
  const editingClientId = form.watch("id") ?? "";

  useEffect(() => {
    setLocalClients(clients);
    setSelectedClientIds(new Set());
  }, [clients]);

  const columns: ColumnDef<ClientRow>[] = [
    ...(canDelete
      ? [{
      id: "select",
      enableSorting: false,
      header: () => (
        <input
          aria-label="Seleccionar clientes"
          checked={localClients.length > 0 && localClients.every((client) => selectedClientIds.has(client.id))}
          type="checkbox"
          onChange={(event) =>
            setSelectedClientIds((current) => {
              const next = new Set(current);
              if (event.target.checked) localClients.forEach((client) => next.add(client.id));
              else localClients.forEach((client) => next.delete(client.id));
              return next;
            })
          }
        />
      ),
      cell: ({ row }) => (
        <input
          aria-label={`Seleccionar ${row.original.name}`}
          checked={selectedClientIds.has(row.original.id)}
          type="checkbox"
          onChange={(event) =>
            setSelectedClientIds((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(row.original.id);
              else next.delete(row.original.id);
              return next;
            })
          }
        />
      )
    } satisfies ColumnDef<ClientRow>]
      : []),
    {
      accessorKey: "name",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.projects} proyectos</div>
        </div>
      )
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <Badge variant={row.original.status === "ACTIVE" ? "success" : "muted"}>{statusLabel(row.original.status)}</Badge>
    },
    { accessorKey: "activeProjects", header: "Activos", cell: ({ row }) => row.original.activeProjects ?? 0 },
    {
      accessorKey: "consumedMinutes",
      header: "Tiempo consumido",
      cell: ({ row }) => formatMinutes(row.original.consumedMinutes)
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => editClient(row.original)}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Editar
          </Button>
          {canDelete ? <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!window.confirm("Eliminar cliente? Solo se permite si no tiene minutos ni proyectos activos.")) return;
              const previous = localClients;
              setLocalClients((current) => current.filter((client) => client.id !== row.original.id));
              startTransition(async () => {
                const result = await deleteClient(row.original.id);
                if (result.ok) {
                  toast.success(result.message);
                  router.refresh();
                } else {
                  setLocalClients(previous);
                  toast.error(result.message);
                }
              });
            }}
          >
            Eliminar
          </Button> : null}
        </div>
      )
    }
  ];

  function editClient(client: ClientRow) {
    form.reset({
      id: client.id,
      name: client.name,
      status: client.status as "ACTIVE" | "PAUSED" | "ARCHIVED",
      description: client.description ?? ""
    });
  }

  function resetForm() {
    form.reset({ id: undefined, name: "", status: "ACTIVE", description: "" });
  }

  function onSubmit(values: FormValues) {
    const isEditing = Boolean(values.id);
    const previous = localClients;

    if (isEditing) {
      setLocalClients((current) =>
        current.map((client) =>
          client.id === values.id
            ? {
                ...client,
                name: values.name.trim(),
                status: values.status ?? "ACTIVE",
                description: values.description?.trim() || null
              }
            : client
        )
      );
    }

    startTransition(async () => {
      const result = isEditing ? await updateClient(values) : await createClient(values);
      if (result.ok) {
        if (result.client) {
          setLocalClients((current) =>
            isEditing
              ? current.map((client) => (client.id === result.client?.id ? (result.client as ClientRow) : client))
              : [result.client as ClientRow, ...current]
          );
        }
        toast.success(result.message);
        resetForm();
        router.refresh();
      } else {
        if (isEditing) setLocalClients(previous);
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

  function deleteSelectedClients() {
    const ids = Array.from(selectedClientIds);
    if (!ids.length) return;
    if (!window.confirm(`¿Eliminar ${ids.length} clientes seleccionados? Solo se eliminarán los que no tengan proyectos ni horas asociadas.`)) return;

    startTransition(async () => {
      const result = await deleteClients({ clientIds: ids });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setLocalClients((current) => current.filter((client) => !result.deletedIds?.includes(client.id)));
      setSelectedClientIds(new Set());
      toast.success(result.message);
      if (result.blocked?.length) toast.warning(`Bloqueados: ${result.blocked.slice(0, 3).join(", ")}${result.blocked.length > 3 ? "..." : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            <CardTitle>{editingClientId ? "Editar cliente" : "Nuevo cliente"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} placeholder="Nombre Cliente" />
            </Field>
            <Field label="Estado" error={form.formState.errors.status?.message}>
              <Select {...form.register("status")}>
                <option value="ACTIVE">Activo</option>
                <option value="PAUSED">Pausado</option>
                <option value="ARCHIVED">Archivado</option>
              </Select>
            </Field>
            <Field label="Descripcion" error={form.formState.errors.description?.message}>
              <Textarea {...form.register("description")} placeholder="Notas internas del cliente" />
            </Field>
            <div className="flex gap-2">
              <Button disabled={isPending} className="flex-1" type="submit">
                {editingClientId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingClientId ? "Guardar cambios" : "Crear cliente"}
              </Button>
              {editingClientId ? (
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
            <CardTitle>Clientes</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {canDelete && selectedClientIds.size ? <Badge variant="warning">{selectedClientIds.size} seleccionados</Badge> : null}
              {canDelete ? (
                <Button disabled={isPending || !selectedClientIds.size} size="sm" variant="destructive" onClick={deleteSelectedClients}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Eliminar seleccionados
                </Button>
              ) : null}
              <Button disabled={isPending} size="sm" variant="outline" onClick={refreshData}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={localClients} searchPlaceholder="Buscar cliente" />
        </CardContent>
      </Card>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "Activo";
  if (status === "PAUSED") return "Pausado";
  return "Archivado";
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
