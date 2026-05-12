"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useTransition } from "react";
import { toast } from "sonner";

import { updateWorkSchedule } from "@/lib/actions/resource-actions";
import { formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data/data-table";

type UserRow = Awaited<ReturnType<typeof import("@/lib/data/resources").getAdminData>>["users"][number];

export function TeamClient({ users }: { users: UserRow[] }) {
  const [isPending, startTransition] = useTransition();
  const columns: ColumnDef<UserRow>[] = [
    { accessorKey: "name", header: "Colaborador", cell: ({ row }) => row.original.name ?? row.original.email },
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
    {
      id: "daily",
      header: "Diarias",
      cell: ({ row }) => formatMinutes(row.original.workSchedule?.dailyMinutes ?? 480)
    },
    {
      id: "weekly",
      header: "Semanales",
      cell: ({ row }) => formatMinutes(row.original.workSchedule?.weeklyMinutes ?? 2400)
    },
    {
      id: "modality",
      header: "Modalidad",
      cell: ({ row }) => row.original.workSchedule?.modality ?? "HYBRID"
    },
    {
      id: "actions",
      header: "Preset",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {[
            { label: "40h L-V", weeklyMinutes: 2400, dailyMinutes: 480, workdays: [1, 2, 3, 4, 5], modality: "HYBRID" },
            { label: "30h L-V", weeklyMinutes: 1800, dailyMinutes: 360, workdays: [1, 2, 3, 4, 5], modality: "REMOTE" },
            { label: "Flex 20h", weeklyMinutes: 1200, dailyMinutes: 240, workdays: [1, 2, 3, 4, 5], modality: "FLEX" }
          ].map((preset) => (
            <Button
              disabled={isPending}
              key={preset.label}
              size="sm"
              variant="outline"
              onClick={() =>
                startTransition(async () => {
                  const result = await updateWorkSchedule({ userId: row.original.id, ...preset });
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                })
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Colaboradores y configuracion laboral</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={users} searchPlaceholder="Buscar colaborador" />
      </CardContent>
    </Card>
  );
}
