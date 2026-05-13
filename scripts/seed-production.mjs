import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryKind, PrismaClient, Role } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL es requerido para seed-production.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const superadminEmail = (process.env.SUPERADMIN_EMAIL || "rodrigorib41@gmail.com").trim().toLowerCase();

async function seedProduction() {
  await prisma.allowedEmail.upsert({
    where: { email: superadminEmail },
    update: { role: Role.SUPERADMIN, displayName: "Gotechy Superadmin" },
    create: {
      email: superadminEmail,
      role: Role.SUPERADMIN,
      displayName: "Gotechy Superadmin"
    }
  });

  const superadmin = await prisma.user.findUnique({ where: { email: superadminEmail } });

  if (superadmin) {
    await prisma.user.update({ where: { id: superadmin.id }, data: { role: Role.SUPERADMIN, status: "ACTIVE" } });
    await prisma.workSchedule.upsert({ where: { userId: superadmin.id }, update: {}, create: { userId: superadmin.id } });
  }

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

  const trackingStatuses = [
    { name: "Pendiente", color: "#64748B", sortOrder: 10, isFinal: false, isBlocked: false },
    { name: "En progreso", color: "#2563EB", sortOrder: 20, isFinal: false, isBlocked: false },
    { name: "Bloqueado", color: "#F97316", sortOrder: 30, isFinal: false, isBlocked: true },
    { name: "En revision", color: "#8B5CF6", sortOrder: 40, isFinal: false, isBlocked: false },
    { name: "Finalizado", color: "#16A34A", sortOrder: 50, isFinal: true, isBlocked: false },
    { name: "Cancelado", color: "#EF4444", sortOrder: 60, isFinal: true, isBlocked: false }
  ];

  for (const status of trackingStatuses) {
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

  const defaultGoal = await prisma.goalObjective.findFirst({
    where: { name: "Mantener 60% del total esperado", metricKind: "MIN_EXPECTED_PERCENT", period: "WEEKLY" },
    select: { id: true }
  });

  const goalData = {
    name: "Mantener 60% del total esperado",
    description: "Todos los dias laborales deben tener al menos 50% registrado.",
    metricKind: "MIN_EXPECTED_PERCENT",
    period: "WEEKLY",
    targetPercent: 60,
    minDailyPercent: 50,
    tolerancePercent: 0,
    active: true,
    global: true
  };

  if (defaultGoal) {
    await prisma.goalObjective.update({ where: { id: defaultGoal.id }, data: goalData });
  } else {
    await prisma.goalObjective.create({ data: goalData });
  }
}

seedProduction()
  .then(() => {
    console.log("Seed productiva aplicada.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
