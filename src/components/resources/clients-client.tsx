"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Building2, Plus } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createClient, deleteClient } from "@/lib/actions/resource-actions";
import { clientSchema } from "@/lib/validators";
import { formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ClientRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  projects: number;
  activeProjects?: number;
  entryCount?: number;
  consumedMinutes: number;
};

type FormValues = z.input<typeof clientSchema>;

export function ClientsClient({ clients }: { clients: ClientRow[] }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", code: "", description: "" }
  });

  const columns: ColumnDef<ClientRow>[] = [
    {
      accessorKey: "name",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.code}</div>
        </div>
      )
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <Badge variant={row.original.status === "ACTIVE" ? "success" : "muted"}>{row.original.status}</Badge>
    },
    { accessorKey: "projects", header: "Proyectos" },
    {
      accessorKey: "consumedMinutes",
      header: "Horas consumidas",
      cell: ({ row }) => formatMinutes(row.original.consumedMinutes)
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!window.confirm("Eliminar cliente? Solo se permite si no tiene horas ni proyectos activos.")) return;
            startTransition(async () => {
              const result = await deleteClient(row.original.id);
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
      const result = await createClient(values);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }

      if (result.ok) {
        form.reset({ name: "", code: "", description: "" });
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            <CardTitle>Nuevo cliente</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} placeholder="MSP" />
            </Field>
            <Field label="Código" error={form.formState.errors.code?.message}>
              <Input {...form.register("code")} placeholder="MSP" />
            </Field>
            <Field label="Descripción" error={form.formState.errors.description?.message}>
              <Textarea {...form.register("description")} placeholder="Notas internas del cliente" />
            </Field>
            <Button disabled={isPending} className="w-full" type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Crear cliente
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={clients} searchPlaceholder="Buscar cliente" />
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
