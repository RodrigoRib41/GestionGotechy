import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryKind, PrismaClient, Role } from "@prisma/client";

if (process.env.CONFIRM_RESET_DB !== "RESET_GOTECHY_DB") {
  throw new Error('Operacion bloqueada. Ejecuta con CONFIRM_RESET_DB="RESET_GOTECHY_DB".');
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL es requerido para reset-db.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const superadminEmail = (process.env.SUPERADMIN_EMAIL || "rodrigorib41@gmail.com").trim().toLowerCase();

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Notification",
        "TimeEntryThreadRead",
        "TimeEntryComment",
        "TimeEntryThread",
        "TimeEntry",
        "TimeEntryFavorite",
        "UserProjectVisibility",
        "TrackingTaskAttachment",
        "TrackingTaskHistory",
        "TrackingTask",
        "GoalComplianceHistory",
        "GoalCompliance",
        "GoalMetric",
        "GoalObjectiveExclusion",
        "GoalObjective",
        "UserDashboardPreference",
        "ProjectMember",
        "Project",
        "Client"
      RESTART IDENTITY CASCADE;
    `);

    await tx.user.deleteMany({ where: { email: { not: superadminEmail } } });

    await tx.allowedEmail.deleteMany({ where: { email: { not: superadminEmail } } });

    await tx.allowedEmail.upsert({
      where: { email: superadminEmail },
      update: { role: Role.SUPERADMIN, displayName: "Gotechy Superadmin" },
      create: {
        email: superadminEmail,
        role: Role.SUPERADMIN,
        displayName: "Gotechy Superadmin"
      }
    });

    const superadmin = await tx.user.findUnique({ where: { email: superadminEmail }, select: { id: true } });

    if (superadmin) {
      await tx.user.update({ where: { id: superadmin.id }, data: { role: Role.SUPERADMIN, status: "ACTIVE" } });
      await tx.workSchedule.upsert({ where: { userId: superadmin.id }, update: {}, create: { userId: superadmin.id } });
    }
  });

  await seedConfiguration();
}

async function seedConfiguration() {
  const projectTypes = [
    { name: "Soporte", description: "Bolsa mensual de horas disponible por cliente o proyecto.", monthlyReset: true },
    { name: "Implementacion", description: "Proyectos con alcance inicial definido.", monthlyReset: false },
    { name: "Evolutivo", description: "Mejoras continuas y nuevas funcionalidades.", monthlyReset: false },
    { name: "Correctivo", description: "Correcciones y mantenimiento puntual.", monthlyReset: false },
    { name: "Consultoria", description: "Acompanamiento tecnico o funcional.", monthlyReset: false }
  ];

  for (const type of projectTypes) {
    await prisma.projectType.upsert({
      where: { name: type.name },
      update: { ...type, active: true },
      create: { ...type, active: true }
    });
  }

  const statuses = [
    { name: "Pendiente", color: "#64748B", sortOrder: 10, isFinal: false, isBlocked: false },
    { name: "En progreso", color: "#2563EB", sortOrder: 20, isFinal: false, isBlocked: false },
    { name: "Bloqueada", color: "#F97316", sortOrder: 30, isFinal: false, isBlocked: true },
    { name: "Finalizada", color: "#16A34A", sortOrder: 50, isFinal: true, isBlocked: false },
    { name: "Archivada", color: "#64748B", sortOrder: 60, isFinal: true, isBlocked: false }
  ];

  for (const status of statuses) {
    await prisma.trackingTaskStatus.upsert({
      where: { name: status.name },
      update: { ...status, active: true },
      create: { ...status, active: true }
    });
  }

  const categories = [
    { name: "Soporte", color: "#0891B2", kind: CategoryKind.PRODUCTIVE },
    { name: "Desarrollo", color: "#16A34A", kind: CategoryKind.PRODUCTIVE },
    { name: "Consultoria", color: "#0F766E", kind: CategoryKind.PRODUCTIVE },
    { name: "Gestion", color: "#F97316", kind: CategoryKind.ADMINISTRATIVE },
    { name: "Comunicacion interna", color: "#7C3AED", kind: CategoryKind.INTERNAL },
    { name: "Capacitacion", color: "#DB2777", kind: CategoryKind.TRAINING }
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { color: category.color, kind: category.kind, active: true },
      create: category
    });
  }

  await prisma.goalObjective.create({
    data: {
      name: "Mantener 60% del total esperado",
      description: "Todos los días laborales deben tener al menos 50% registrado.",
      metricKind: "MIN_EXPECTED_PERCENT",
      period: "WEEKLY",
      targetPercent: 60,
      minDailyPercent: 50,
      tolerancePercent: 0,
      active: true,
      global: true
    }
  });
}

main()
  .then(() => {
    console.log("Base limpiada y seed productiva minima aplicada.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
