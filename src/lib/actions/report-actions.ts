"use server";

import { CategoryKind, ClientStatus, Prisma, ProjectStatus } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { reportDeletePreviewSchema, reportDeleteSchema, timeImportCommitSchema, timeImportPreviewSchema } from "@/lib/validators";

type DeleteRange = {
  where: Prisma.TimeEntryWhereInput;
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

type ImportIssue = {
  rowNumber: number;
  field: string;
  message: string;
};

const defaultImportCategoryName = "Importacion historica";
const defaultImportClientName = "Cliente importado";
const importChunkSize = 500;

function revalidateReportSurfaces() {
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/time");
  revalidatePath("/projects");
  revalidatePath("/clients");
  revalidatePath("/objectives");
  revalidateTag("dashboard-metrics");
  revalidateTag("time-entry-context");
  revalidateTag("objectives-dashboard");
}

export async function previewTimeHistoryDelete(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`report-delete-preview:${session.user.id}`, 20, 60_000);

  const parsed = reportDeletePreviewSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Rango inválido" };
  }

  const range = buildDeleteRange(parsed.data);
  const summary = await getDeleteSummary(range.where);

  return { ok: true, message: "Resumen calculado", summary: { ...summary, label: range.label, from: range.from, to: range.to } };
}

export async function deleteTimeHistory(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`report-delete:${session.user.id}`, 5, 60_000);

  const parsed = reportDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Datos inválidos" };
  }

  if (parsed.data.confirmation !== "BORRAR") {
    return { ok: false, message: "Escribí BORRAR para confirmar" };
  }

  const configuredPin = process.env.REPORT_DELETE_PIN;

  if (!configuredPin) {
    return { ok: false, message: "REPORT_DELETE_PIN no está configurado en el servidor" };
  }

  if (parsed.data.pin !== configuredPin) {
    return { ok: false, message: "PIN inválido" };
  }

  const range = buildDeleteRange(parsed.data);
  const summary = await getDeleteSummary(range.where);

  if (summary.count === 0) {
    return { ok: false, message: "No hay registros para borrar" };
  }

  const deleted = await prisma.timeEntry.deleteMany({ where: range.where });

  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/time");
  revalidatePath("/objectives");
  revalidateTag("dashboard-metrics");
  revalidateTag("time-entry-context");
  revalidateTag("objectives-dashboard");

  return { ok: true, message: `${deleted.count} registros borrados`, deletedCount: deleted.count };
}

export async function previewTimeImport(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`report-import-preview:${session.user.id}`, 20, 60_000);

  const parsed = timeImportPreviewSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Archivo inválido" };
  }

  const preview = await buildImportPreview(parsed.data.rows);

  return { ok: true, message: "Preview calculado", preview: toPublicImportPreview(preview) };
}

export async function importTimeEntries(input: unknown) {
  const session = await requireSuperadmin();
  assertRateLimit(`report-import:${session.user.id}`, 5, 60_000);

  const parsed = timeImportCommitSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.at(0)?.message ?? "Archivo inválido" };
  }

  const configuredPin = process.env.REPORT_DELETE_PIN;

  if (!configuredPin) {
    return { ok: false, message: "REPORT_DELETE_PIN no estÃ¡ configurado en el servidor" };
  }

  if (parsed.data.pin !== configuredPin) {
    return { ok: false, message: "PIN invÃ¡lido" };
  }

  const initialPreview = await buildImportPreview(parsed.data.rows);

  if (initialPreview.invalidRows > 0) {
    return { ok: false, message: "Corregí las filas inválidas antes de importar", preview: initialPreview };
  }

  if ((initialPreview.missingProjects.length > 0 || initialPreview.missingClients.length > 0) && !parsed.data.autoCreateMissing) {
    return { ok: false, message: "Confirma la creacion automatica de proyectos/clientes para continuar", preview: initialPreview };
  }

  await ensureDefaultImportCategory();

  if (parsed.data.autoCreateMissing) {
    await createMissingImportResources(initialPreview);
  }

  const finalPreview = await buildImportPreview(parsed.data.rows, true);
  const importableRows = finalPreview.allRows.filter((row) => row.status === "VALID" && row.userId && row.projectId && row.clientId && row.categoryId);

  if (!importableRows.length) {
    return { ok: false, message: "No hay registros nuevos para importar", preview: finalPreview };
  }

  let importedRows = 0;

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < importableRows.length; index += importChunkSize) {
      const chunk = importableRows.slice(index, index + importChunkSize);
      const created = await tx.timeEntry.createMany({
        data: chunk.map((row) => ({
          date: new Date(`${row.date}T12:00:00`),
          detail: row.detail.trim(),
          observations: null,
          minutes: row.minutes,
          overtimeMinutes: row.overtimeMinutes,
          userId: row.userId!,
          projectId: row.projectId!,
          clientId: row.clientId!,
          categoryId: row.categoryId!,
          status: "SUBMITTED" as const
        }))
      });
      importedRows += created.count;
    }

    await tx.timeImportBatch.create({
      data: {
        fileName: parsed.data.fileName?.trim() || null,
        totalRows: finalPreview.totalRows,
        validRows: finalPreview.validRows,
        invalidRows: finalPreview.invalidRows,
        duplicateRows: finalPreview.duplicateRows,
        importedRows,
        skippedRows: finalPreview.duplicateRows + finalPreview.invalidRows,
        errors: finalPreview.errors,
        createdProjects: initialPreview.missingProjects,
        createdClients: initialPreview.missingClients,
        importedById: session.user.id
      }
    });

  });

  revalidateReportSurfaces();
  const publicPreview = toPublicImportPreview(finalPreview);

  return {
    ok: true,
    message: `${importedRows} registros importados`,
    summary: {
      importedRows,
      skippedRows: finalPreview.duplicateRows + finalPreview.invalidRows,
      duplicateRows: finalPreview.duplicateRows,
      invalidRows: finalPreview.invalidRows,
      createdProjects: initialPreview.missingProjects.length,
      createdClients: initialPreview.missingClients.length
    },
    preview: publicPreview
  };
}

function buildDeleteRange(input: { mode: "all" | "range"; from?: string; to?: string }): DeleteRange {
  if (input.mode === "all") {
    return { where: {}, label: "Todo el historial" };
  }

  const start = new Date(`${input.from}T00:00:00`);
  const end = new Date(`${input.to}T23:59:59.999`);

  return {
    where: { date: { gte: start, lte: end } },
    label: `${input.from} a ${input.to}`,
    from: input.from,
    to: input.to
  };
}

async function buildImportPreview(rows: ImportRow[], includeAllRows = false) {
  const catalogs = await getImportCatalogs();
  const errors: ImportIssue[] = [];
  const missingProjectMap = new Map<string, { project: string; client: string }>();
  const missingClientMap = new Map<string, { name: string }>();
  const normalizedRows = rows.map((row) => normalizeImportRow(row));
  const duplicateKeysInFile = new Set<string>();
  const seenKeysInFile = new Set<string>();

  const possibleDates = normalizedRows.map((row) => row.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const minDate = possibleDates.sort().at(0);
  const maxDate = possibleDates.sort().at(-1);
  const userIds = new Set<string>();

  for (const row of normalizedRows) {
    validateNormalizedImportRow(row, errors);
    const user = resolveUser(row, catalogs, errors);
    if (user) userIds.add(user.id);
  }

  const existingEntries =
    minDate && maxDate && userIds.size
      ? await prisma.timeEntry.findMany({
          where: {
            date: { gte: new Date(`${minDate}T00:00:00`), lte: new Date(`${maxDate}T23:59:59.999`) },
            userId: { in: Array.from(userIds) }
          },
          select: {
            date: true,
            userId: true,
            projectId: true,
            detail: true,
            minutes: true,
            overtimeMinutes: true
          }
        })
      : [];
  const existingKeys = new Set(
    existingEntries.map((entry) =>
      duplicateKey({
        date: entry.date.toISOString().slice(0, 10),
        userId: entry.userId,
        projectId: entry.projectId,
        detail: entry.detail,
        minutes: entry.minutes,
        overtimeMinutes: entry.overtimeMinutes
      })
    )
  );

  const previewRows = normalizedRows.map((row) => {
    const rowErrors = errors.filter((issue) => issue.rowNumber === row.rowNumber);
    const user = resolveUser(row, catalogs, rowErrors);
    const category = resolveCategory(row, catalogs, rowErrors);
    const projectResult = resolveProject(row, catalogs, rowErrors);
    const fileKey = duplicateKey({
      date: row.date,
      userId: user?.id ?? normalizeText(row.collaborator),
      projectId: projectResult.project?.id ?? `${normalizeText(projectResult.clientName)}:${normalizeText(row.project)}`,
      detail: row.detail,
      minutes: row.minutes,
      overtimeMinutes: row.overtimeMinutes
    });

    if (seenKeysInFile.has(fileKey)) duplicateKeysInFile.add(fileKey);
    seenKeysInFile.add(fileKey);

    const isDuplicate = Boolean(projectResult.project && user && existingKeys.has(fileKey)) || duplicateKeysInFile.has(fileKey);

    if (projectResult.missingProject) {
      const clientName = projectResult.clientName || defaultImportClientName;
      const key = `${normalizeText(clientName)}:${normalizeText(row.project)}`;
      missingProjectMap.set(key, { project: row.project, client: clientName });
      if (!catalogs.clientsByName.has(normalizeText(clientName))) {
        missingClientMap.set(normalizeText(clientName), { name: clientName });
      }
    }

    const uniqueErrors = uniqueIssues(rowErrors);
    const status = uniqueErrors.length ? "INVALID" : isDuplicate ? "DUPLICATE" : projectResult.missingProject ? "PENDING_RESOURCE" : "VALID";

    return {
      rowNumber: row.rowNumber,
      collaborator: row.collaborator,
      date: row.date,
      client: projectResult.clientName || row.client || projectResult.project?.client.name || defaultImportClientName,
      project: row.project,
      category: category?.name ?? defaultImportCategoryName,
      detail: row.detail,
      minutes: row.minutes,
      overtimeMinutes: row.overtimeMinutes,
      status,
      errors: uniqueErrors,
      userId: user?.id ?? null,
      projectId: projectResult.project?.id ?? null,
      clientId: projectResult.project?.clientId ?? projectResult.client?.id ?? null,
      categoryId: category?.id ?? catalogs.defaultCategory?.id ?? null
    };
  });

  const allErrors = previewRows.flatMap((row) => row.errors.map((issue) => ({ ...issue, rowNumber: row.rowNumber })));

  return {
    totalRows: previewRows.length,
    validRows: previewRows.filter((row) => row.status === "VALID" || row.status === "PENDING_RESOURCE").length,
    readyRows: previewRows.filter((row) => row.status === "VALID").length,
    invalidRows: previewRows.filter((row) => row.status === "INVALID").length,
    duplicateRows: previewRows.filter((row) => row.status === "DUPLICATE").length,
    pendingResourceRows: previewRows.filter((row) => row.status === "PENDING_RESOURCE").length,
    missingProjects: Array.from(missingProjectMap.values()).sort((a, b) => a.project.localeCompare(b.project)),
    missingClients: Array.from(missingClientMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    errors: allErrors,
    rows: previewRows.slice(0, 500),
    allRows: includeAllRows ? previewRows : []
  };
}

async function getImportCatalogs() {
  const [users, clients, projects, categories] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, email: true }
    }),
    prisma.client.findMany({
      where: { status: ClientStatus.ACTIVE },
      select: { id: true, name: true }
    }),
    prisma.project.findMany({
      where: { status: ProjectStatus.ACTIVE },
      select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true } } }
    }),
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true, kind: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    })
  ]);
  const usersByEmail = new Map(users.map((user) => [normalizeText(user.email), user]));
  const usersByName = new Map<string, typeof users>();
  for (const user of users) {
    const key = normalizeText(user.name ?? user.email);
    usersByName.set(key, [...(usersByName.get(key) ?? []), user]);
  }
  const clientsByName = new Map(clients.map((client) => [normalizeText(client.name), client]));
  const projectsByName = new Map<string, typeof projects>();
  for (const project of projects) {
    const key = normalizeText(project.name);
    projectsByName.set(key, [...(projectsByName.get(key) ?? []), project]);
  }
  const categoriesByName = new Map(categories.map((category) => [normalizeText(category.name), category]));
  const defaultCategory = categoriesByName.get(normalizeText(defaultImportCategoryName)) ?? categories.find((category) => category.kind === CategoryKind.PRODUCTIVE) ?? categories.at(0) ?? null;

  return { usersByEmail, usersByName, clientsByName, projectsByName, categoriesByName, defaultCategory };
}

function normalizeImportRow(row: ImportRow): ImportRow {
  return {
    rowNumber: row.rowNumber,
    collaborator: row.collaborator.trim(),
    date: normalizeImportDate(row.date),
    client: row.client?.trim() || undefined,
    project: row.project.trim(),
    category: row.category?.trim() || undefined,
    detail: row.detail.trim(),
    minutes: row.minutes,
    overtimeMinutes: row.overtimeMinutes
  };
}

function resolveUser(row: ImportRow, catalogs: Awaited<ReturnType<typeof getImportCatalogs>>, errors: ImportIssue[]) {
  const key = normalizeText(row.collaborator);
  const byEmail = catalogs.usersByEmail.get(key);
  if (byEmail) return byEmail;

  const byName = catalogs.usersByName.get(key) ?? [];
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    errors.push({ rowNumber: row.rowNumber, field: "Colaborador", message: "Colaborador ambiguo; usa el email" });
    return null;
  }

  errors.push({ rowNumber: row.rowNumber, field: "Colaborador", message: "Colaborador activo no encontrado" });
  return null;
}

function resolveCategory(row: ImportRow, catalogs: Awaited<ReturnType<typeof getImportCatalogs>>, errors: ImportIssue[]) {
  if (!row.category) return catalogs.defaultCategory;
  const category = catalogs.categoriesByName.get(normalizeText(row.category));
  if (category) return category;
  errors.push({ rowNumber: row.rowNumber, field: "Categoría", message: "Categoría activa no encontrada" });
  return null;
}

function resolveProject(row: ImportRow, catalogs: Awaited<ReturnType<typeof getImportCatalogs>>, errors: ImportIssue[]) {
  const clientName = row.client?.trim() || defaultImportClientName;
  const client = catalogs.clientsByName.get(normalizeText(clientName)) ?? null;
  const matches = catalogs.projectsByName.get(normalizeText(row.project)) ?? [];
  const project = row.client ? matches.find((item) => normalizeText(item.client.name) === normalizeText(clientName)) ?? null : matches.length === 1 ? matches[0] : null;

  if (project) return { project, client: project.client, clientName: project.client.name, missingProject: false };
  if (!row.client && matches.length > 1) {
    errors.push({ rowNumber: row.rowNumber, field: "Proyecto", message: "Proyecto ambiguo; agrega columna Cliente" });
    return { project: null, client, clientName, missingProject: false };
  }

  return { project: null, client, clientName, missingProject: true };
}

async function ensureDefaultImportCategory() {
  const existing = await prisma.category.findFirst({
    where: { active: true, name: { equals: defaultImportCategoryName, mode: "insensitive" } },
    select: { id: true }
  });

  if (existing) return existing;

  return prisma.category.create({
    data: {
      name: defaultImportCategoryName,
      color: "#64748B",
      kind: CategoryKind.PRODUCTIVE,
      active: true,
      description: "Categoría usada para importaciones históricas sin columna Categoría"
    },
    select: { id: true }
  });
}

async function createMissingImportResources(preview: Awaited<ReturnType<typeof buildImportPreview>>) {
  const createdClients = new Map<string, string>();

  for (const client of preview.missingClients) {
    const existing = await prisma.client.findFirst({
      where: { name: { equals: client.name, mode: "insensitive" } },
      select: { id: true }
    });
    if (existing) {
      createdClients.set(normalizeText(client.name), existing.id);
      continue;
    }
    const created = await prisma.client.create({
      data: { name: client.name, status: ClientStatus.ACTIVE, description: "Creado automaticamente desde importacion de horas" },
      select: { id: true }
    });
    createdClients.set(normalizeText(client.name), created.id);
  }

  for (const item of preview.missingProjects) {
    const client =
      createdClients.get(normalizeText(item.client)) ??
      (
        await prisma.client.findFirst({
          where: { name: { equals: item.client, mode: "insensitive" } },
          select: { id: true }
        })
      )?.id;

    if (!client) continue;

    const existing = await prisma.project.findFirst({
      where: {
        name: { equals: item.project, mode: "insensitive" },
        clientId: client
      },
      select: { id: true }
    });

    if (existing) continue;

    await prisma.project.create({
      data: {
        name: item.project,
        clientId: client,
        status: ProjectStatus.ACTIVE,
        description: "Creado automaticamente desde importacion de horas"
      }
    });
  }
}

function normalizeImportDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toISOString().slice(0, 10);
}

function validateNormalizedImportRow(row: ImportRow, errors: ImportIssue[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    errors.push({ rowNumber: row.rowNumber, field: "Fecha", message: "Fecha inválida" });
    return;
  }

  const date = new Date(`${row.date}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) {
    errors.push({ rowNumber: row.rowNumber, field: "Fecha", message: "Fecha inválida" });
  }

  if (!Number.isFinite(row.minutes) || !Number.isInteger(row.minutes) || row.minutes <= 0) {
    errors.push({ rowNumber: row.rowNumber, field: "Minutos", message: "Los minutos deben ser enteros positivos" });
  }

  if (!Number.isFinite(row.overtimeMinutes) || !Number.isInteger(row.overtimeMinutes) || row.overtimeMinutes < 0) {
    errors.push({ rowNumber: row.rowNumber, field: "Minutos fuera de horario", message: "Los minutos fuera de horario no pueden ser negativos" });
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function duplicateKey(input: { date: string; userId: string; projectId: string; detail: string; minutes: number; overtimeMinutes: number }) {
  return [
    input.date,
    input.userId,
    input.projectId,
    normalizeText(input.detail),
    String(input.minutes),
    String(input.overtimeMinutes)
  ].join("|");
}

function uniqueIssues(issues: ImportIssue[]) {
  const map = new Map<string, ImportIssue>();
  for (const issue of issues) {
    map.set(`${issue.rowNumber}:${issue.field}:${issue.message}`, issue);
  }
  return Array.from(map.values());
}

function toPublicImportPreview(preview: Awaited<ReturnType<typeof buildImportPreview>>) {
  return {
    totalRows: preview.totalRows,
    validRows: preview.validRows,
    readyRows: preview.readyRows,
    invalidRows: preview.invalidRows,
    duplicateRows: preview.duplicateRows,
    pendingResourceRows: preview.pendingResourceRows,
    missingProjects: preview.missingProjects,
    missingClients: preview.missingClients,
    errors: preview.errors,
    rows: preview.rows
  };
}

async function getDeleteSummary(where: Prisma.TimeEntryWhereInput) {
  const [aggregate, users, projects] = await Promise.all([
    prisma.timeEntry.aggregate({
      where,
      _count: { _all: true },
      _sum: { minutes: true, overtimeMinutes: true }
    }),
    prisma.timeEntry.groupBy({ by: ["userId"], where }),
    prisma.timeEntry.groupBy({ by: ["projectId"], where })
  ]);

  return {
    count: aggregate._count._all,
    minutes: aggregate._sum.minutes ?? 0,
    overtimeMinutes: aggregate._sum.overtimeMinutes ?? 0,
    collaborators: users.length,
    projects: projects.length
  };
}
