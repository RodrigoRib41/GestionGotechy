import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryKind, PrismaClient, Role } from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/gotechy_hours?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "rodrigorib41@gmail.com").toLowerCase();

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
  }

  const projectTypes = [
    { name: "Soporte", description: "Bolsa mensual de horas disponible por cliente o proyecto.", monthlyReset: true },
    { name: "Implementacion", description: "Proyectos con alcance inicial definido.", monthlyReset: false },
    { name: "Evolutivo", description: "Mejoras continuas y nuevas funcionalidades.", monthlyReset: false },
    { name: "Correctivo", description: "Correcciones y mantenimiento puntual.", monthlyReset: false },
    { name: "Consultoria", description: "Acompanamiento tecnico o funcional.", monthlyReset: false },
    { name: "Basis", description: "Administración tecnica recurrente.", monthlyReset: false },
    { name: "Desarrollo", description: "Construccion de software a medida.", monthlyReset: false },
    { name: "Interno", description: "Trabajo interno no facturable.", monthlyReset: false }
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

  const clients = ["Gotechy Consulting", "Cliente Demo", "Cliente Operativo"];

  for (const name of clients) {
    const existing = await prisma.client.findFirst({ where: { name } });
    if (existing) {
      await prisma.client.update({ where: { id: existing.id }, data: { name } });
    } else {
      await prisma.client.create({ data: { name } });
    }
  }

  const categories = [
    { name: "Basis", color: "#2563EB", kind: CategoryKind.PRODUCTIVE },
    { name: "Desarrollo", color: "#16A34A", kind: CategoryKind.PRODUCTIVE },
    { name: "Gestion", color: "#F97316", kind: CategoryKind.ADMINISTRATIVE },
    { name: "Comunicacion interna", color: "#7C3AED", kind: CategoryKind.INTERNAL },
    { name: "Soporte", color: "#0891B2", kind: CategoryKind.PRODUCTIVE },
    { name: "Capacitacion", color: "#DB2777", kind: CategoryKind.TRAINING },
    { name: "Investigacion", color: "#9333EA", kind: CategoryKind.PRODUCTIVE },
    { name: "Consultoria", color: "#0F766E", kind: CategoryKind.PRODUCTIVE }
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { color: category.color, kind: category.kind, active: true },
      create: category
    });
  }

  const gotechy = await prisma.client.findFirstOrThrow({ where: { name: "Gotechy Consulting" } });
  const clienteDemo = await prisma.client.findFirstOrThrow({ where: { name: "Cliente Demo" } });
  const clienteOperativo = await prisma.client.findFirstOrThrow({ where: { name: "Cliente Operativo" } });
  const interno = await prisma.projectType.findUniqueOrThrow({ where: { name: "Interno" } });
  const soporte = await prisma.projectType.findUniqueOrThrow({ where: { name: "Soporte" } });
  const desarrollo = await prisma.projectType.findUniqueOrThrow({ where: { name: "Desarrollo" } });

  const projects = [
    {
      name: "Comunicacion interna",
      clientId: gotechy.id,
      projectTypeId: interno.id,
      usesEstimatedTime: true,
      estimatedMinutes: 40 * 60
    },
    {
      name: "Soporte Demo",
      clientId: clienteDemo.id,
      projectTypeId: soporte.id,
      usesEstimatedTime: true,
      estimatedMinutes: 160 * 60
    },
    {
      name: "Desarrollo Demo",
      clientId: clienteOperativo.id,
      projectTypeId: desarrollo.id,
      usesEstimatedTime: true,
      estimatedMinutes: 220 * 60
    }
  ];

  for (const project of projects) {
    const existing = await prisma.project.findFirst({ where: { name: project.name, clientId: project.clientId } });
    if (existing) {
      await prisma.project.update({ where: { id: existing.id }, data: project });
    } else {
      await prisma.project.create({ data: project });
    }
  }

  const defaultGoal = await prisma.goalObjective.findFirst({
    where: { name: "Mantener 60% del total esperado", metricKind: "MIN_EXPECTED_PERCENT", period: "WEEKLY" },
    select: { id: true }
  });
  const goalData = {
    name: "Mantener 60% del total esperado",
    description: "Todos los días laborales deben tener al menos 50% registrado.",
    metricKind: "MIN_EXPECTED_PERCENT" as const,
    period: "WEEKLY" as const,
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
