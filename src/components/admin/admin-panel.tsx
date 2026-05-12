"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Settings2, ShieldPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  addAllowedEmail,
  assignUserRoles,
  deleteCategory,
  upsertCategory
} from "@/lib/actions/resource-actions";
import { allowedEmailSchema, roleValues } from "@/lib/validators";
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

export function AdminPanel({ data }: { data: AdminData }) {
  const [isPending, startTransition] = useTransition();
  const [selectedRoles, setSelectedRoles] = useState<RoleValue[]>(["COLLABORATOR"]);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", color: "#2563EB", kind: "PRODUCTIVE", active: true });
  const form = useForm<FormValues>({
    resolver: zodResolver(allowedEmailSchema),
    defaultValues: { email: "", roles: ["COLLABORATOR"] }
  });

  const userColumns: ColumnDef<AdminData["users"][number]>[] = [
    { accessorKey: "name", header: "Nombre", cell: ({ row }) => row.original.name ?? "Sin nombre" },
    { accessorKey: "email", header: "Email" },
    {
      accessorKey: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.roles?.length ? row.original.roles : [row.original.role]).map((role) => (
            <Badge key={role} variant={role === "SUPERADMIN" ? "success" : "muted"}>
              {role}
            </Badge>
          ))}
        </div>
      )
    },
    { accessorKey: "status", header: "Estado" },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {[
            { label: "Colab+Reporte", roles: ["COLLABORATOR", "REPORTER"] as RoleValue[] },
            { label: "Admin+Reporte", roles: ["ADMINISTRATOR", "REPORTER"] as RoleValue[] },
            { label: "Superadmin", roles: ["SUPERADMIN"] as RoleValue[] }
          ].map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const result = await assignUserRoles({ userId: row.original.id, roles: preset.roles, status: "ACTIVE" });
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                })
              }
            >
              {preset.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              startTransition(async () => {
                const result = await assignUserRoles({
                  userId: row.original.id,
                  roles: row.original.roles?.length ? row.original.roles : ["COLLABORATOR"],
                  status: "DISABLED"
                });
                if (result.ok) toast.success("Usuario bloqueado");
                else toast.error(result.message);
              })
            }
          >
            Bloquear
          </Button>
        </div>
      )
    }
  ];

  const allowedColumns: ColumnDef<AdminData["allowedEmails"][number]>[] = [
    { accessorKey: "email", header: "Email" },
    {
      accessorKey: "roles",
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.roles?.length ? row.original.roles : [row.original.role]).map((role) => (
            <Badge key={role} variant={role === "SUPERADMIN" ? "success" : "muted"}>
              {role}
            </Badge>
          ))}
        </div>
      )
    },
    { accessorKey: "displayName", header: "Alias", cell: ({ row }) => row.original.displayName ?? "-" }
  ];

  const logColumns: ColumnDef<AdminData["logs"][number]>[] = [
    { accessorKey: "action", header: "Accion" },
    { accessorKey: "entity", header: "Entidad" },
    { accessorKey: "actor", header: "Actor" },
    { accessorKey: "createdAt", header: "Fecha", cell: ({ row }) => new Date(row.original.createdAt).toLocaleString("es-AR") }
  ];

  function toggleRole(role: RoleValue) {
    setSelectedRoles((current) => {
      const next = current.includes(role) ? current.filter((item) => item !== role) : [...current, role];
      return next.length ? next : ["COLLABORATOR"];
    });
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await addAllowedEmail({ email: values.email, roles: selectedRoles });
      if (result.ok) {
        toast.success(result.message);
        form.reset({ email: "", roles: ["COLLABORATOR"] });
        setSelectedRoles(["COLLABORATOR"]);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldPlus className="h-5 w-5 text-teal-600" />
            <CardTitle>Habilitar acceso y roles</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto]" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>Email Google</Label>
              <Input placeholder="persona@gotechy.com" {...form.register("email")} />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roleValues.map((role) => (
                  <button
                    key={role}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      selectedRoles.includes(role) ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                    }`}
                    type="button"
                    onClick={() => toggleRole(role)}
                  >
                    {role}
                  </button>
                ))}
              </div>
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
            <CardTitle>Emails habilitados</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={allowedColumns} data={data.allowedEmails} searchPlaceholder="Buscar email" />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={logColumns} data={data.logs} searchPlaceholder="Buscar log" />
        </CardContent>
      </Card>
    </div>
  );
}
