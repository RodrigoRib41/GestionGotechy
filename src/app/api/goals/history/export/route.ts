import { GoalPeriod, Role } from "@prisma/client";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  await requireRole([Role.ADMINISTRADOR]);
  const params = request.nextUrl.searchParams;
  const format = params.get("format") === "xlsx" ? "xlsx" : "csv";
  const period = parsePeriod(params.get("period"));
  const collaboratorId = params.get("collaboratorId") || undefined;
  const goalId = params.get("goalId") || undefined;
  const state = params.get("state");
  const from = params.get("from");
  const to = params.get("to");

  const rows = await prisma.goalComplianceHistory.findMany({
    where: {
      ...(period ? { period } : {}),
      ...(collaboratorId ? { userId: collaboratorId } : {}),
      ...(goalId ? { goalId } : {}),
      ...(state === "met" ? { met: true } : state === "unmet" ? { met: false } : {}),
      ...(from && to
        ? {
            periodStart: {
              gte: new Date(`${from}T00:00:00`),
              lte: new Date(`${to}T23:59:59.999`)
            }
          }
        : {})
    },
    select: {
      goalName: true,
      userName: true,
      metricKind: true,
      period: true,
      periodStart: true,
      periodEnd: true,
      percent: true,
      met: true,
      reason: true,
      expectedMinutes: true,
      actualMinutes: true,
      overtimeMinutes: true,
      activeDays: true,
      calculatedAt: true
    },
    orderBy: [{ periodStart: "desc" }, { userName: "asc" }],
    take: 5000
  });

  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Historial objetivos");
    worksheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(32, Math.max(14, header.length + 4)) }));
    rows.forEach((row) => worksheet.addRow(toExportRow(row)));
    worksheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="gotechy-historial-objetivos.xlsx"'
      }
    });
  }

  const csv = [headers.join(","), ...rows.map((row) => {
    const exportRow = toExportRow(row);
    return headers.map((header) => JSON.stringify(exportRow[header] ?? "")).join(",");
  })].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gotechy-historial-objetivos.csv"'
    }
  });
}

const headers = [
  "Colaborador",
  "Objetivo",
  "Metrica",
  "Periodicidad",
  "Desde",
  "Hasta",
  "Cumplimiento",
  "Estado",
  "Motivo",
  "Minutos esperados",
  "Minutos reales",
  "Minutos extra",
  "Días activos",
  "Calculado"
];

function toExportRow(row: {
  goalName: string;
  userName: string;
  metricKind: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  percent: number;
  met: boolean;
  reason: string | null;
  expectedMinutes: number;
  actualMinutes: number;
  overtimeMinutes: number;
  activeDays: number;
  calculatedAt: Date;
}): Record<string, string | number> {
  return {
    Colaborador: row.userName,
    Objetivo: row.goalName,
    Metrica: row.metricKind,
    Periodicidad: row.period,
    Desde: row.periodStart.toISOString().slice(0, 10),
    Hasta: row.periodEnd.toISOString().slice(0, 10),
    Cumplimiento: Math.round(row.percent),
    Estado: row.met ? "Cumplido" : "Pendiente",
    Motivo: row.reason ?? "",
    "Minutos esperados": row.expectedMinutes,
    "Minutos reales": row.actualMinutes,
    "Minutos extra": row.overtimeMinutes,
    "Días activos": row.activeDays,
    Calculado: row.calculatedAt.toISOString()
  };
}

function parsePeriod(value: string | null) {
  if (value === "DAILY" || value === "WEEKLY" || value === "MONTHLY") {
    return value as GoalPeriod;
  }
  return undefined;
}
