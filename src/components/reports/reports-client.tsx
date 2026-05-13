"use client";

import { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { logReportExport } from "@/lib/actions/resource-actions";
import { deleteTimeHistory, previewTimeHistoryDelete } from "@/lib/actions/report-actions";
import { formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type ReportRow = {
  id: string;
  date: string;
  collaborator: string;
  collaboratorId: string;
  project: string;
  projectId: string;
  client: string;
  clientId: string;
  category: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
  createdAt: string;
  updatedAt: string;
};

type DeleteSummary = {
  count: number;
  minutes: number;
  overtimeMinutes: number;
  collaborators: number;
  projects: number;
  label: string;
  from?: string;
  to?: string;
};

export function ReportsClient({ rows, canDeleteHistory = false }: { rows: ReportRow[]; canDeleteHistory?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [collaborator, setCollaborator] = useState("");
  const [category, setCategory] = useState("");
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"range" | "all">("range");
  const [deleteFrom, setDeleteFrom] = useState("");
  const [deleteTo, setDeleteTo] = useState("");
  const [deletePin, setDeletePin] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummary | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const date = row.date.slice(0, 10);
      return (
        (!from || date >= from) &&
        (!to || date <= to) &&
        (!client || row.client === client) &&
        (!project || row.project === project) &&
        (!collaborator || row.collaborator === collaborator) &&
        (!category || row.category === category) &&
        (!onlyOvertime || row.overtimeMinutes > 0)
      );
    });
  }, [category, client, collaborator, from, onlyOvertime, project, rows, to]);

  const clients = Array.from(new Set(rows.map((row) => row.client))).sort();
  const projects = Array.from(new Set(rows.map((row) => row.project))).sort();
  const collaborators = Array.from(new Set(rows.map((row) => row.collaborator))).sort();
  const categories = Array.from(new Set(rows.map((row) => row.category))).sort();
  const totalMinutes = filtered.reduce((total, row) => total + row.minutes, 0);
  const totalOvertime = filtered.reduce((total, row) => total + row.overtimeMinutes, 0);

  const columns: ColumnDef<ReportRow>[] = [
    { accessorKey: "collaborator", header: "Colaborador" },
    { accessorKey: "date", header: "Fecha", cell: ({ row }) => new Date(row.original.date).toLocaleDateString("es-AR") },
    { accessorKey: "client", header: "Cliente" },
    { accessorKey: "project", header: "Proyecto" },
    { accessorKey: "category", header: "Categoria" },
    { accessorKey: "detail", header: "Detalle" },
    { accessorKey: "minutes", header: "Minutos", cell: ({ row }) => row.original.minutes },
    { accessorKey: "overtimeMinutes", header: "Fuera horario", cell: ({ row }) => row.original.overtimeMinutes },
    { accessorKey: "createdAt", header: "Creacion", cell: ({ row }) => new Date(row.original.createdAt).toLocaleString("es-AR") },
    { accessorKey: "updatedAt", header: "Modificacion", cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString("es-AR") }
  ];

  const exportableRows = filtered.map((row) => ({
    Fecha: new Date(row.date).toLocaleDateString("es-AR"),
    Colaborador: row.collaborator,
    Cliente: row.client,
    Proyecto: row.project,
    Categoria: row.category,
    Detalle: row.detail,
    Observaciones: row.observations ?? "",
    Minutos: row.minutes,
    "Minutos extra": row.overtimeMinutes,
    Creacion: new Date(row.createdAt).toLocaleString("es-AR"),
    Modificacion: new Date(row.updatedAt).toLocaleString("es-AR")
  }));

  async function exportCsv() {
    const header = Object.keys(exportableRows.at(0) ?? { Fecha: "", Colaborador: "" });
    const csv = [
      header.join(","),
      ...exportableRows.map((row) => header.map((key) => JSON.stringify(row[key as keyof typeof row] ?? "")).join(","))
    ].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "gotechy-reporte-maestro.csv");
    await logReportExport("CSV");
    toast.success("CSV exportado");
  }

  async function exportMasterXlsx() {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Gotechy Consulting";
    workbook.created = new Date();
    const grouped = filtered.reduce((map, row) => {
      const list = map.get(row.collaborator) ?? [];
      list.push(row);
      map.set(row.collaborator, list);
      return map;
    }, new Map<string, ReportRow[]>());

    for (const [name, entries] of grouped) {
      const worksheet = workbook.addWorksheet(cleanSheetName(name));
      worksheet.mergeCells("A1:F1");
      worksheet.getCell("A1").value = "Gotechy Consulting - Reporte Maestro de Tiempo";
      worksheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
      worksheet.addRow([]);
      worksheet.addRow(["Colaborador", "Fecha", "Proyecto", "Detalle", "Minutos", "Minutos fuera de horario"]);
      const header = worksheet.getRow(3);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

      entries.forEach((entry) => {
        worksheet.addRow([
          entry.collaborator,
          new Date(entry.date).toLocaleDateString("es-AR"),
          entry.project,
          entry.detail,
          entry.minutes,
          entry.overtimeMinutes
        ]);
      });

      const totalRow = worksheet.addRow(["", "", "", "Totales", entries.reduce((total, entry) => total + entry.minutes, 0), entries.reduce((total, entry) => total + entry.overtimeMinutes, 0)]);
      totalRow.font = { bold: true };
      totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6FFFA" } };

      worksheet.columns.forEach((column) => {
        let maxLength = 12;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          maxLength = Math.max(maxLength, String(cell.value ?? "").length + 2);
        });
        column.width = Math.min(maxLength, 48);
      });
      worksheet.views = [{ state: "frozen", ySplit: 3 }];
    }

    if (grouped.size === 0) {
      workbook.addWorksheet("Sin datos").addRow(["No hay datos para los filtros seleccionados"]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "gotechy-reporte-maestro.xlsx");
    await logReportExport("MASTER_XLSX");
    toast.success("Excel maestro exportado");
  }

  async function exportPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Gotechy Consulting - Reporte maestro de tiempo", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Colaborador", "Fecha", "Cliente", "Proyecto", "Categoria", "Min", "Extra"]],
      body: filtered.map((row) => [
        row.collaborator,
        new Date(row.date).toLocaleDateString("es-AR"),
        row.client,
        row.project,
        row.category,
        row.minutes,
        row.overtimeMinutes
      ])
    });
    doc.save("gotechy-reporte-maestro.pdf");
    await logReportExport("PDF");
    toast.success("PDF exportado");
  }

  function openDeleteModal() {
    setDeleteFrom(from);
    setDeleteTo(to);
    setDeleteMode(from && to ? "range" : "all");
    setDeletePin("");
    setDeleteConfirmation("");
    setDeleteSummary(null);
    setDeleteOpen(true);
  }

  function previewDelete() {
    startTransition(async () => {
      const result = await previewTimeHistoryDelete({ mode: deleteMode, from: deleteFrom, to: deleteTo });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      if (result.summary) {
        setDeleteSummary(result.summary);
      }
      toast.success("Resumen listo");
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteTimeHistory({
        mode: deleteMode,
        from: deleteFrom,
        to: deleteTo,
        pin: deletePin,
        confirmation: deleteConfirmation
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Tiempo filtrado</p>
            <div className="mt-2 text-2xl font-semibold">{formatMinutes(totalMinutes)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Tiempo fuera de horario</p>
            <div className="mt-2 text-2xl font-semibold">{formatMinutes(totalOvertime)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Registros</p>
            <div className="mt-2 text-2xl font-semibold">{filtered.length}</div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Reporte Maestro de Tiempo</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Todas las cargas con filtros avanzados y exportacion corporativa por colaborador.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canDeleteHistory ? (
              <Button onClick={openDeleteModal} variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Borrar historial de horas
              </Button>
            ) : null}
            <Button onClick={exportCsv} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button onClick={exportMasterXlsx} variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel maestro
            </Button>
            <Button onClick={exportPdf} variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
            <Filter label="Desde">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Filter>
            <Filter label="Hasta">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Filter>
            <Filter label="Colaborador">
              <Select value={collaborator} onChange={(event) => setCollaborator(event.target.value)}>
                <option value="">Todos</option>
                {collaborators.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Cliente">
              <Select value={client} onChange={(event) => setClient(event.target.value)}>
                <option value="">Todos</option>
                {clients.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Proyecto">
              <Select value={project} onChange={(event) => setProject(event.target.value)}>
                <option value="">Todos</option>
                {projects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Categoria">
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Todas</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
          </div>
          <button
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${onlyOvertime ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            type="button"
            onClick={() => setOnlyOvertime((value) => !value)}
          >
            Solo tiempo fuera de horario
          </button>
          <div className="flex flex-wrap gap-2">
            {[client, project, collaborator, category].filter(Boolean).map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
            {onlyOvertime ? <Badge variant="warning">Fuera de horario</Badge> : null}
          </div>
          <DataTable columns={columns} data={filtered} searchPlaceholder="Buscar en reporte maestro" />
        </CardContent>
      </Card>
      {deleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-lg border bg-card shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <h2 className="text-lg font-semibold">Borrar historial de horas</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Esta accion elimina registros de carga horaria y queda auditada. No afecta usuarios, clientes ni proyectos.
                </p>
              </div>
              <Button disabled={isPending} size="sm" variant="ghost" onClick={() => setDeleteOpen(false)}>
                Cerrar
              </Button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Confirmacion doble requerida: calcula el resumen, ingresa el PIN del servidor y escribi BORRAR.
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Filter label="Alcance">
                  <Select value={deleteMode} onChange={(event) => setDeleteMode(event.target.value as "range" | "all")}>
                    <option value="range">Rango de fechas</option>
                    <option value="all">Todo el historial</option>
                  </Select>
                </Filter>
                <Filter label="Desde">
                  <Input disabled={deleteMode === "all"} type="date" value={deleteFrom} onChange={(event) => setDeleteFrom(event.target.value)} />
                </Filter>
                <Filter label="Hasta">
                  <Input disabled={deleteMode === "all"} type="date" value={deleteTo} onChange={(event) => setDeleteTo(event.target.value)} />
                </Filter>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={isPending} variant="outline" onClick={previewDelete}>
                  Calcular registros afectados
                </Button>
                {deleteSummary ? (
                  <Badge variant={deleteSummary.count ? "warning" : "success"}>{deleteSummary.count} registros afectados</Badge>
                ) : null}
              </div>

              {deleteSummary ? (
                <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                  <SummaryItem label="Alcance" value={deleteSummary.label} />
                  <SummaryItem label="Tiempo" value={formatMinutes(deleteSummary.minutes)} />
                  <SummaryItem label="Extra" value={formatMinutes(deleteSummary.overtimeMinutes)} />
                  <SummaryItem label="Colaboradores" value={String(deleteSummary.collaborators)} />
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <Filter label="PIN de seguridad">
                  <Input autoComplete="off" type="password" value={deletePin} onChange={(event) => setDeletePin(event.target.value)} />
                </Filter>
                <Filter label='Confirmacion: escribi "BORRAR"'>
                  <Input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                </Filter>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button disabled={isPending} variant="ghost" onClick={() => setDeleteOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={isPending || !deleteSummary || deleteSummary.count === 0 || !deletePin || deleteConfirmation.trim().toUpperCase() !== "BORRAR"}
                  variant="destructive"
                  onClick={confirmDelete}
                >
                  {isPending ? "Procesando..." : "Eliminar historial"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function cleanSheetName(name: string) {
  return name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Colaborador";
}
