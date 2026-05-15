"use client";

import { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, MessageSquare, Trash2, Upload, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { logReportExport } from "@/lib/actions/resource-actions";
import { deleteTimeHistory, importTimeEntries, previewTimeHistoryDelete, previewTimeImport } from "@/lib/actions/report-actions";
import { createTimeEntryThreadComment, markTimeEntryThreadRead, resolveTimeEntryThread } from "@/lib/actions/time-comment-actions";
import { categoryKindMeta, categoryKindValues, getCategoryKindMeta, type CategoryKindKey } from "@/lib/category-kind";
import { cn, formatMinutes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  categoryKind: string;
  detail: string;
  observations?: string | null;
  minutes: number;
  overtimeMinutes: number;
  createdAt: string;
  updatedAt: string;
  commentThread?: TimeCommentThread | null;
};

type TimeCommentThread = {
  id: string;
  status: string;
  createdById: string;
  createdBy: string;
  resolvedAt: string | null;
  createdAt: string;
  unread: boolean;
  comments: Array<{
    id: string;
    message: string;
    authorId: string;
    author: string;
    createdAt: string;
    mine: boolean;
  }>;
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

type ImportRow = {
  rowNumber: number;
  collaborator: string;
  date: string;
  client?: string;
  project: string;
  category?: string;
  detail: string;
  minutes: number;
  overtimeMinutes: number;
};

type ImportPreview = {
  totalRows: number;
  validRows: number;
  readyRows: number;
  invalidRows: number;
  duplicateRows: number;
  pendingResourceRows: number;
  missingProjects: Array<{ project: string; client: string }>;
  missingClients: Array<{ name: string }>;
  errors: Array<{ rowNumber: number; field: string; message: string }>;
  rows: Array<{
    rowNumber: number;
    collaborator: string;
    date: string;
    client: string;
    project: string;
    category: string;
    detail: string;
    minutes: number;
    overtimeMinutes: number;
    status: string;
    errors: Array<{ rowNumber: number; field: string; message: string }>;
  }>;
};

export function ReportsClient({
  rows,
  canDeleteHistory = false,
  currentUserId
}: {
  rows: ReportRow[];
  canDeleteHistory?: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localRows, setLocalRows] = useState(rows);
  const [isPending, startTransition] = useTransition();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [collaborator, setCollaborator] = useState("");
  const [category, setCategory] = useState("");
  const [categoryKind, setCategoryKind] = useState<"" | CategoryKindKey>("");
  const [onlyOvertime, setOnlyOvertime] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"range" | "all">("range");
  const [deleteFrom, setDeleteFrom] = useState("");
  const [deleteTo, setDeleteTo] = useState("");
  const [deletePin, setDeletePin] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteSummary, setDeleteSummary] = useState<DeleteSummary | null>(null);
  const [commentRow, setCommentRow] = useState<ReportRow | null>(null);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  useEffect(() => {
    const entryId = searchParams.get("entry");
    if (!entryId) return;
    const row = localRows.find((item) => item.id === entryId);
    if (row) setCommentRow(row);
  }, [localRows, searchParams]);

  const filtered = useMemo(() => {
    return localRows.filter((row) => {
      const date = row.date.slice(0, 10);
      return (
        (!from || date >= from) &&
        (!to || date <= to) &&
        (!client || row.client === client) &&
        (!project || row.project === project) &&
        (!collaborator || row.collaborator === collaborator) &&
        (!category || row.category === category) &&
        (!categoryKind || row.categoryKind === categoryKind) &&
        (!onlyOvertime || row.overtimeMinutes > 0)
      );
    });
  }, [category, categoryKind, client, collaborator, from, localRows, onlyOvertime, project, to]);

  const clients = Array.from(new Set(localRows.map((row) => row.client))).sort();
  const projects = Array.from(new Set(localRows.map((row) => row.project))).sort();
  const collaborators = Array.from(new Set(localRows.map((row) => row.collaborator))).sort();
  const categories = Array.from(new Set(localRows.map((row) => row.category))).sort();
  const totalMinutes = filtered.reduce((total, row) => total + row.minutes, 0);
  const totalOvertime = filtered.reduce((total, row) => total + row.overtimeMinutes, 0);
  const typeStats = useMemo(() => buildCategoryTypeStats(filtered), [filtered]);

  const columns: ColumnDef<ReportRow>[] = [
    { accessorKey: "collaborator", header: "Colaborador" },
    { accessorKey: "date", header: "Fecha", cell: ({ row }) => new Date(row.original.date).toLocaleDateString("es-AR") },
    { accessorKey: "client", header: "Cliente" },
    { accessorKey: "project", header: "Proyecto" },
    { accessorKey: "category", header: "Categoría" },
    { accessorKey: "categoryKind", header: "Tipo", cell: ({ row }) => <CategoryTypeBadge kind={row.original.categoryKind} /> },
    { accessorKey: "detail", header: "Detalle" },
    { accessorKey: "minutes", header: "Minutos", cell: ({ row }) => row.original.minutes },
    { accessorKey: "overtimeMinutes", header: "Fuera horario", cell: ({ row }) => row.original.overtimeMinutes },
    { accessorKey: "createdAt", header: "Creación", cell: ({ row }) => new Date(row.original.createdAt).toLocaleString("es-AR") },
    { accessorKey: "updatedAt", header: "Modificación", cell: ({ row }) => new Date(row.original.updatedAt).toLocaleString("es-AR") },
    {
      id: "comments",
      enableSorting: false,
      header: "",
      cell: ({ row }) => {
        const thread = row.original.commentThread;
        const disabled = !thread && !isWithinLastDays(row.original.date, 30);

        return (
          <Button disabled={disabled} size="sm" variant={thread?.status === "OPEN" ? "outline" : "ghost"} onClick={() => setCommentRow(row.original)}>
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            {thread?.status === "OPEN" ? "Ver hilo" : "Comentar"}
          </Button>
        );
      }
    }
  ];

  const exportableRows = filtered.map((row) => ({
    Fecha: new Date(row.date).toLocaleDateString("es-AR"),
    Colaborador: row.collaborator,
    Cliente: row.client,
    Proyecto: row.project,
    Categoría: row.category,
    "Tipo categoría": getCategoryKindMeta(row.categoryKind).label,
    Detalle: row.detail,
    Observaciones: row.observations ?? "",
    Minutos: row.minutes,
    "Minutos extra": row.overtimeMinutes,
    Creación: new Date(row.createdAt).toLocaleString("es-AR"),
    Modificación: new Date(row.updatedAt).toLocaleString("es-AR")
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
      worksheet.addRow(["Colaborador", "Fecha", "Proyecto", "Categoría", "Tipo", "Detalle", "Minutos", "Minutos fuera de horario"]);
      const header = worksheet.getRow(3);
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

      entries.forEach((entry) => {
        worksheet.addRow([
          entry.collaborator,
          new Date(entry.date).toLocaleDateString("es-AR"),
          entry.project,
          entry.category,
          getCategoryKindMeta(entry.categoryKind).label,
          entry.detail,
          entry.minutes,
          entry.overtimeMinutes
        ]);
      });

      const totalRow = worksheet.addRow(["", "", "", "", "", "Totales", entries.reduce((total, entry) => total + entry.minutes, 0), entries.reduce((total, entry) => total + entry.overtimeMinutes, 0)]);
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
      head: [["Colaborador", "Fecha", "Cliente", "Proyecto", "Categoría", "Tipo", "Min", "Extra"]],
      body: filtered.map((row) => [
        row.collaborator,
        new Date(row.date).toLocaleDateString("es-AR"),
        row.client,
        row.project,
        row.category,
        getCategoryKindMeta(row.categoryKind).label,
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
            <p className="mt-1 text-sm text-muted-foreground">Todas las cargas con filtros avanzados y exportación corporativa por colaborador.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setImportOpen(true)} variant="default">
              <Upload className="mr-2 h-4 w-4" />
              Importar registros
            </Button>
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
          <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
            <Filter label="Desde">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Filter>
            <Filter label="Hasta">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Filter>
            <Filter label="Colaborador">
              <Select value={collaborator} onChange={(event) => setCollaborator(event.target.value)}>
                <option value="">Todos los colaboradores</option>
                {collaborators.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Cliente">
              <Select value={client} onChange={(event) => setClient(event.target.value)}>
                <option value="">Todos los clientes</option>
                {clients.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Proyecto">
              <Select value={project} onChange={(event) => setProject(event.target.value)}>
                <option value="">Todos los proyectos</option>
                {projects.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Categoría">
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">Todas las categorías</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Filter>
            <Filter label="Tipo">
              <Select value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as "" | CategoryKindKey)}>
                <option value="">Todos los tipos de hora</option>
                {categoryKindValues.map((kind) => (
                  <option key={kind} value={kind}>
                    {categoryKindMeta[kind].label}
                  </option>
                ))}
              </Select>
            </Filter>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {typeStats.map((item) => (
              <div key={item.kind} className={cn("rounded-md border p-3", getCategoryKindMeta(item.kind).bgClass, getCategoryKindMeta(item.kind).borderClass)}>
                <div className="flex items-center justify-between gap-2">
                  <CategoryTypeBadge kind={item.kind} />
                  <span className="text-xs text-muted-foreground">{item.percent}%</span>
                </div>
                <div className="mt-2 text-lg font-semibold">{formatMinutes(item.minutes)}</div>
                <div className="text-xs text-muted-foreground">{item.count} registros</div>
              </div>
            ))}
          </div>
          <button
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${onlyOvertime ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            type="button"
            onClick={() => setOnlyOvertime((value) => !value)}
          >
            Solo tiempo fuera de horario
          </button>
          <div className="flex flex-wrap gap-2">
            {[client, project, collaborator, category, categoryKind ? getCategoryKindMeta(categoryKind).label : ""].filter(Boolean).map((item) => (
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
                  Esta acción elimina registros de carga horaria. No afecta usuarios, clientes ni proyectos.
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
      {commentRow ? (
        <ReportCommentModal
          currentUserId={currentUserId}
          isPending={isPending}
          row={commentRow}
          onClose={() => setCommentRow(null)}
          onResolved={(thread) => {
            setLocalRows((current) => current.map((row) => (row.id === commentRow.id ? { ...row, commentThread: thread } : row)));
            setCommentRow((current) => (current ? { ...current, commentThread: thread } : current));
          }}
          onSaved={(thread) => {
            setLocalRows((current) => current.map((row) => (row.id === commentRow.id ? { ...row, commentThread: thread } : row)));
            setCommentRow((current) => (current ? { ...current, commentThread: thread } : current));
          }}
        />
      ) : null}
      {importOpen ? <ImportRecordsModal onClose={() => setImportOpen(false)} onImported={() => router.refresh()} /> : null}
    </div>
  );
}

function ReportCommentModal({
  currentUserId,
  isPending,
  row,
  onClose,
  onResolved,
  onSaved
}: {
  currentUserId: string;
  isPending: boolean;
  row: ReportRow;
  onClose: () => void;
  onResolved: (thread: TimeCommentThread) => void;
  onSaved: (thread: TimeCommentThread) => void;
}) {
  const [message, setMessage] = useState("");
  const [isSubmitting, startSubmitTransition] = useTransition();
  const thread = row.commentThread;
  const canResolve = thread?.status === "OPEN" && thread.createdById === currentUserId;
  const busy = isPending || isSubmitting;

  useEffect(() => {
    if (!thread?.id) return;
    void markTimeEntryThreadRead({ threadId: thread.id });
  }, [thread?.id]);

  function submit() {
    startSubmitTransition(async () => {
      const result = await createTimeEntryThreadComment({ timeEntryId: row.id, message });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      onSaved(result.thread as TimeCommentThread);
      setMessage("");
      toast.success(result.message);
    });
  }

  function resolveThread() {
    if (!thread) return;
    startSubmitTransition(async () => {
      const result = await resolveTimeEntryThread({ threadId: thread.id });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      onResolved(result.thread as TimeCommentThread);
      toast.success(result.message);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-teal-600" />
              <h2 className="text-lg font-semibold">Comentarios del registro</h2>
              {thread?.status === "RESOLVED" ? <Badge variant="success">Resuelto</Badge> : thread ? <Badge variant="warning">Abierto</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.collaborator} · {new Date(row.date).toLocaleDateString("es-AR")} · {row.project}
            </p>
          </div>
          <Button disabled={busy} size="sm" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {thread?.comments.length ? (
            thread.comments.map((comment) => (
              <div key={comment.id} className={cn("flex", comment.mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-lg border px-3 py-2 text-sm", comment.mine ? "bg-primary text-primary-foreground" : "bg-background")}>
                  <div className="text-xs font-medium opacity-80">{comment.author}</div>
                  <div className="mt-1 whitespace-pre-wrap">{comment.message}</div>
                  <div className="mt-1 text-[11px] opacity-70">{new Date(comment.createdAt).toLocaleString("es-AR")}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">Todavia no hay comentarios en este registro.</div>
          )}
        </div>

        <footer className="space-y-3 border-t p-4">
          {thread?.status === "RESOLVED" ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">El hilo está resuelto y no admite nuevos comentarios.</div>
          ) : (
            <div className="space-y-2">
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escribe un comentario para el colaborador" />
              <div className="flex flex-wrap justify-between gap-2">
                {canResolve ? (
                  <Button disabled={busy} variant="outline" onClick={resolveThread}>
                    Marcar resuelto
                  </Button>
                ) : <span />}
                <Button disabled={busy || !message.trim()} onClick={submit}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Enviar comentario
                </Button>
              </div>
            </div>
          )}
        </footer>
      </div>
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

function ImportRecordsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [autoCreateMissing, setAutoCreateMissing] = useState(true);
  const [phase, setPhase] = useState<"idle" | "parsing" | "preview" | "ready" | "importing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{
    importedRows: number;
    skippedRows: number;
    duplicateRows: number;
    invalidRows: number;
    createdProjects: number;
    createdClients: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setFileName(file.name);
    setPhase("parsing");
    setProgress(20);
    setSummary(null);

    try {
      const parsedRows = await parseImportFile(file);
      setRows(parsedRows);
      setProgress(45);
      setPhase("preview");
      startTransition(async () => {
        const result = await previewTimeImport({ rows: parsedRows });
        if (!result.ok) {
          toast.error(result.message);
          setPhase("error");
          return;
        }
        setPreview(result.preview as ImportPreview);
        setProgress(70);
        setPhase("ready");
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
      setPhase("error");
    }
  }

  function confirmImport() {
    if (!rows.length || !preview || preview.invalidRows > 0) return;

    setPhase("importing");
    setProgress(82);
    startTransition(async () => {
      const result = await importTimeEntries({ rows, fileName, autoCreateMissing });
      if (!result.ok) {
        toast.error(result.message);
        if ("preview" in result && result.preview) setPreview(result.preview as ImportPreview);
        setPhase("error");
        return;
      }

      setSummary(result.summary ?? null);
      setProgress(100);
      setPhase("done");
      toast.success(result.message);
      onImported();
    });
  }

  const busy = isPending || phase === "parsing" || phase === "preview" || phase === "importing";
  const needsCreation = Boolean(preview && (preview.missingProjects.length > 0 || preview.missingClients.length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-teal-600" />
              <h2 className="text-lg font-semibold">Importar registros</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Acepta XLSX o CSV con Colaborador, Fecha, Proyecto, Detalle, Minutos y Minutos fuera de horario. Cliente y Categoría son opcionales.
            </p>
          </div>
          <Button disabled={busy} size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          <label
            className={cn(
              "flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-background p-6 text-center transition-colors hover:bg-muted/40",
              busy && "pointer-events-none opacity-70"
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files.item(0);
              if (file) void handleFile(file);
            }}
          >
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <span className="mt-3 text-sm font-medium">{fileName || "Arrastra un archivo o hacé clic para seleccionarlo"}</span>
            <span className="mt-1 text-xs text-muted-foreground">Maximo 10000 filas por lote. Los registros duplicados se omiten.</span>
            <input
              className="sr-only"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.item(0);
                if (file) void handleFile(file);
              }}
            />
          </label>

          {phase !== "idle" ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{phaseLabel(phase)}</span>
                <span className="text-xs text-muted-foreground">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}

          {preview ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <ImportMetric label="Validos" value={preview.readyRows + preview.pendingResourceRows} tone="success" />
                <ImportMetric label="Invalidos" value={preview.invalidRows} tone={preview.invalidRows ? "danger" : "default"} />
                <ImportMetric label="Duplicados" value={preview.duplicateRows} tone={preview.duplicateRows ? "warning" : "default"} />
                <ImportMetric label="Proyectos nuevos" value={preview.missingProjects.length} tone={preview.missingProjects.length ? "warning" : "default"} />
                <ImportMetric label="Clientes nuevos" value={preview.missingClients.length} tone={preview.missingClients.length ? "warning" : "default"} />
              </div>

              {needsCreation ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <div className="font-medium">Se detectaron proyectos o clientes inexistentes.</div>
                  <p className="mt-1 text-muted-foreground">
                    Se pueden crear automaticamente antes de importar. Si el archivo no trae Cliente, se usara {defaultImportClientNameForUi()}.
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-xs font-medium">
                    <input checked={autoCreateMissing} type="checkbox" onChange={(event) => setAutoCreateMissing(event.target.checked)} />
                    Crear proyectos/clientes automaticamente
                  </label>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                  <div className="text-sm font-medium">Preview de filas</div>
                  {preview.errors.length ? (
                    <Button size="sm" variant="outline" onClick={() => downloadImportErrors(preview)}>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Descargar errores
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[980px] text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr>
                        {["Fila", "Estado", "Colaborador", "Fecha", "Cliente", "Proyecto", "Detalle", "Min", "Extra", "Error"].map((header) => (
                          <th key={header} className="border-b px-3 py-2 text-left font-medium text-muted-foreground">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 120).map((row) => (
                        <tr key={row.rowNumber} className="border-b">
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2"><ImportStatusBadge status={row.status} /></td>
                          <td className="px-3 py-2">{row.collaborator}</td>
                          <td className="px-3 py-2">{row.date}</td>
                          <td className="px-3 py-2">{row.client}</td>
                          <td className="px-3 py-2">{row.project}</td>
                          <td className="max-w-[260px] truncate px-3 py-2">{row.detail}</td>
                          <td className="px-3 py-2">{row.minutes}</td>
                          <td className="px-3 py-2">{row.overtimeMinutes}</td>
                          <td className="max-w-[280px] px-3 py-2 text-destructive">{row.errors.map((item) => item.message).join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {summary ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Importacion finalizada
              </div>
              <p className="mt-1 text-muted-foreground">
                {summary.importedRows} importados, {summary.skippedRows} omitidos, {summary.createdProjects} proyectos y {summary.createdClients} clientes creados.
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t p-4">
          <Button disabled={busy} variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button disabled={busy || !preview || preview.invalidRows > 0 || (needsCreation && !autoCreateMissing)} onClick={confirmImport}>
            {phase === "importing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importar registros
          </Button>
        </footer>
      </div>
    </div>
  );
}

function ImportMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warning" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3",
        tone === "success" && "border-emerald-500/30 bg-emerald-500/10",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10",
        tone === "danger" && "border-destructive/30 bg-destructive/10"
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function ImportStatusBadge({ status }: { status: string }) {
  if (status === "VALID") return <Badge variant="success">Valido</Badge>;
  if (status === "DUPLICATE") return <Badge variant="warning">Duplicado</Badge>;
  if (status === "PENDING_RESOURCE") return <Badge variant="outline">Crear recurso</Badge>;
  return <Badge variant="destructive">Invalido</Badge>;
}

function CategoryTypeBadge({ kind }: { kind: string }) {
  const meta = getCategoryKindMeta(kind);
  return <Badge className={cn(meta.bgClass, meta.textClass, meta.borderClass)} variant="outline">{meta.label}</Badge>;
}

async function parseImportFile(file: File): Promise<ImportRow[]> {
  const extension = file.name.toLowerCase().split(".").pop();

  if (extension === "csv") {
    return rowsFromMatrix(parseCsv(await file.text()));
  }

  if (extension === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("El Excel no tiene hojas");
    const matrix: string[][] = [];
    worksheet.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = excelCellToString(cell.value);
      });
      matrix.push(values);
    });
    return rowsFromMatrix(matrix);
  }

  throw new Error("Formato no soportado. Usa XLSX o CSV");
}

function rowsFromMatrix(matrix: string[][]): ImportRow[] {
  const [headerRow, ...bodyRows] = matrix.filter((row) => row.some((cell) => cell.trim()));
  if (!headerRow) throw new Error("El archivo está vacío");
  const headers = headerRow.map(normalizeHeader);
  const index = {
    collaborator: findHeader(headers, ["colaborador", "usuario", "email"]),
    date: findHeader(headers, ["fecha", "date"]),
    client: findHeader(headers, ["cliente", "client"]),
    project: findHeader(headers, ["proyecto", "project"]),
    category: findHeader(headers, ["categoria", "category"]),
    detail: findHeader(headers, ["detalle", "descripcion", "detail"]),
    minutes: findHeader(headers, ["minutos", "minutes", "min"]),
    overtimeMinutes: findHeader(headers, ["minutosfueradehorario", "fueradehorario", "minutosextra", "extra", "overtime"])
  };

  const required = [
    ["Colaborador", index.collaborator],
    ["Fecha", index.date],
    ["Proyecto", index.project],
    ["Detalle", index.detail],
    ["Minutos", index.minutes],
    ["Minutos fuera de horario", index.overtimeMinutes]
  ] as const;
  const missing = required.filter(([, value]) => value === -1).map(([label]) => label);
  if (missing.length) throw new Error(`Faltan columnas requeridas: ${missing.join(", ")}`);

  return bodyRows
    .map((row, position) => ({
      rowNumber: position + 2,
      collaborator: valueAt(row, index.collaborator),
      date: normalizeDateCell(valueAt(row, index.date)),
      client: index.client >= 0 ? valueAt(row, index.client) : undefined,
      project: valueAt(row, index.project),
      category: index.category >= 0 ? valueAt(row, index.category) : undefined,
      detail: valueAt(row, index.detail),
      minutes: parseIntegerCell(valueAt(row, index.minutes)),
      overtimeMinutes: parseIntegerCell(valueAt(row, index.overtimeMinutes), true)
    }))
    .filter((row) => row.collaborator || row.project || row.detail || row.minutes || row.overtimeMinutes);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  rows.push(row);
  return rows;
}

function excelCellToString(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value) return String((value as { text?: unknown }).text ?? "");
  if (value && typeof value === "object" && "result" in value) return String((value as { result?: unknown }).result ?? "");
  return String(value ?? "");
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function findHeader(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function valueAt(row: string[], index: number) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function parseIntegerCell(value: string, allowZero = false) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return allowZero ? 0 : Number.NaN;
  const rounded = Math.round(parsed);
  return allowZero ? Math.max(0, rounded) : rounded;
}

function normalizeDateCell(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial > 20_000 && serial < 80_000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + serial);
    return excelEpoch.toISOString().slice(0, 10);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString().slice(0, 10);
}

function downloadImportErrors(preview: ImportPreview) {
  const rows = preview.errors.map((error) => ({
    Fila: error.rowNumber,
    Campo: error.field,
    Error: error.message
  }));
  const header = ["Fila", "Campo", "Error"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => JSON.stringify(row[key as keyof typeof row] ?? "")).join(","))].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "errores-importacion-horas.csv");
}

function phaseLabel(phase: "idle" | "parsing" | "preview" | "ready" | "importing" | "done" | "error") {
  if (phase === "parsing") return "Leyendo archivo";
  if (phase === "preview") return "Validando datos";
  if (phase === "ready") return "Preview listo";
  if (phase === "importing") return "Importando registros";
  if (phase === "done") return "Importacion finalizada";
  if (phase === "error") return "Revisar archivo";
  return "Esperando archivo";
}

function defaultImportClientNameForUi() {
  return "Cliente importado";
}

function buildCategoryTypeStats(rows: ReportRow[]) {
  const totals = new Map<string, { kind: string; minutes: number; count: number }>();
  for (const kind of categoryKindValues) totals.set(kind, { kind, minutes: 0, count: 0 });
  for (const row of rows) {
    const current = totals.get(row.categoryKind) ?? { kind: row.categoryKind, minutes: 0, count: 0 };
    current.minutes += row.minutes + row.overtimeMinutes;
    current.count += 1;
    totals.set(row.categoryKind, current);
  }
  const total = Math.max(1, Array.from(totals.values()).reduce((sum, item) => sum + item.minutes, 0));
  return Array.from(totals.values()).map((item) => ({ ...item, percent: Math.round((item.minutes / total) * 100) }));
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

function isWithinLastDays(dateValue: string, days: number) {
  const date = new Date(dateValue);
  const min = new Date();
  min.setDate(min.getDate() - days);
  min.setHours(0, 0, 0, 0);
  return date >= min;
}
