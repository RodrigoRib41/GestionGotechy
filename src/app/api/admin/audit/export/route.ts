import { AuditAction, Role, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { auditFilterSchema } from "@/lib/validators";

export const runtime = "nodejs";

const pageSize = 500;

export async function GET(request: NextRequest) {
  const session = await auth();

  if (session?.user.role !== Role.SUPERADMIN) {
    return NextResponse.json({ message: "Permisos insuficientes" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const format = params.format === "xlsx" ? "xlsx" : "csv";
  const parsed = auditFilterSchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros invalidos" }, { status: 400 });
  }

  const where = buildWhere(parsed.data);

  await prisma.auditLog.create({
    data: {
      action: "EXPORT",
      entity: "AuditLog",
      actorId: session.user.id,
      metadata: { format, filters: parsed.data }
    }
  });

  if (format === "xlsx") {
    return exportXlsx(where);
  }

  return exportCsv(where);
}

function buildWhere(filters: { from?: string; to?: string; actorId?: string; action?: string; entity?: string }) {
  return {
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999`) } : {})
          }
        }
      : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.action ? { action: filters.action as AuditAction } : {}),
    ...(filters.entity ? { entity: filters.entity } : {})
  } satisfies Prisma.AuditLogWhereInput;
}

function exportCsv(where: Prisma.AuditLogWhereInput) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("Fecha,Accion,Modulo,Usuario,Detalle\n"));
      let cursor: string | undefined;

      while (true) {
        const rows = await prisma.auditLog.findMany({
          where,
          select: {
            id: true,
            createdAt: true,
            action: true,
            entity: true,
            metadata: true,
            actor: { select: { email: true, name: true } }
          },
          orderBy: { id: "asc" },
          take: pageSize,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
        });

        if (!rows.length) break;

        for (const row of rows) {
          controller.enqueue(
            encoder.encode(
              [
                row.createdAt.toISOString(),
                row.action,
                row.entity,
                row.actor?.email ?? row.actor?.name ?? "Sistema",
                JSON.stringify(row.metadata ?? {})
              ]
                .map(csvCell)
                .join(",") + "\n"
            )
          );
        }

        cursor = rows.at(-1)?.id;
        if (rows.length < pageSize) break;
      }

      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gotechy-auditoria.csv"'
    }
  });
}

async function exportXlsx(where: Prisma.AuditLogWhereInput) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Auditoria");
  sheet.columns = [
    { header: "Fecha", key: "createdAt", width: 24 },
    { header: "Accion", key: "action", width: 18 },
    { header: "Modulo", key: "entity", width: 24 },
    { header: "Usuario", key: "actor", width: 34 },
    { header: "Detalle", key: "metadata", width: 64 }
  ];

  const rows = await prisma.auditLog.findMany({
    where,
    select: {
      createdAt: true,
      action: true,
      entity: true,
      metadata: true,
      actor: { select: { email: true, name: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 5000
  });

  for (const row of rows) {
    sheet.addRow({
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      entity: row.entity,
      actor: row.actor?.email ?? row.actor?.name ?? "Sistema",
      metadata: JSON.stringify(row.metadata ?? {})
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="gotechy-auditoria.xlsx"'
    }
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
