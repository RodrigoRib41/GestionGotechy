"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createProject, deleteProject } from "@/lib/actions/resource-actions";
import { projectSchema } from "@/lib/validators";
import { formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/data/data-table";

type ProjectRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  type: string;
  estimatedMinutes: number;
  consumedMinutes: number;
  client: { id: string; name: string; code: string };
  members?: string[];
  entryCount?: number;
};

type ClientOption = { id: string; name: string; code: string };
type FormValues = z.input<typeof projectSchema>;

export function ProjectsClient({ projects, clients }: { projects: ProjectRow[]; clients: ClientOption[] }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      code: "",
      clientId: clients.at(0)?.id ?? "",
      type: "OTHER",
      estimatedHours: 0
    }
  });

  const columns: ColumnDef<ProjectRow>[] = [
    {
      accessorKey: "name",
      header: "Proyecto",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.code}</div>
        </div>
      )
    },
    { accessorFn: (row) => row.client.name, header: "Cliente" },
    { accessorKey: "type", header: "Tipo" },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <Badge variant={row.original.status === "ACTIVE" ? "success" : "muted"}>{row.original.status}</Badge>
    },
    {
      accessorKey: "consumedMinutes",
      header: "Consumidas",
      cell: ({ row }) => formatMinutes(row.original.consumedMinutes)
    },
    {
      accessorKey: "estimatedMinutes",
      header: "Estimadas",
      cell: ({ row }) => formatMinutes(row.original.estimatedMinutes)
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!window.confirm("Eliminar proyecto? Solo se permite si no tiene horas registradas.")) return;
            startTransition(async () => {
              const result = await deleteProject(row.original.id);
              if (result.ok) {
                toast.success(result.message);
              } else {
                toast.error(result.message);
              }
            });
          }}
        >
          Eliminar
        </Button>
      )
    }
  ];

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createProject(values);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }

      if (result.ok) {
        form.reset({ ...values, name: "", code: "", estimatedHours: 0 });
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-teal-600" />
            <CardTitle>Nuevo proyecto</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} placeholder="CARSA Desarrollo" />
            </Field>
            <Field label="Código" error={form.formState.errors.code?.message}>
              <Input {...form.register("code")} placeholder="CARSA-DEV" />
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
                <Select {...form.register("type")}>
                  {["BASIS", "DEVELOPMENT", "MANAGEMENT", "SUPPORT", "INTERNAL", "OTHER"].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horas estimadas">
                <Input min={0} type="number" {...form.register("estimatedHours")} />
              </Field>
            </div>
            <Button disabled={isPending} className="w-full" type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Crear proyecto
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proyectos activos y archivados</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={projects} searchPlaceholder="Buscar proyecto o cliente" />
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
