import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { CategoryKind, PrismaClient, ProjectType, Role } from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/gotechy_hours?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const superadminEmail = (process.env.SUPERADMIN_EMAIL || "rodrigorib41@gmail.com").toLowerCase();

  await prisma.allowedEmail.upsert({
    where: { email: superadminEmail },
    update: { role: Role.SUPERADMIN, roles: [Role.SUPERADMIN], displayName: "Gotechy Superadmin" },
    create: {
      email: superadminEmail,
      role: Role.SUPERADMIN,
      roles: [Role.SUPERADMIN],
      displayName: "Gotechy Superadmin"
    }
  });

  const superadmin = await prisma.user.findUnique({ where: { email: superadminEmail } });

  if (superadmin) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: superadmin.id, role: Role.SUPERADMIN } },
      update: {},
      create: { userId: superadmin.id, role: Role.SUPERADMIN }
    });
  }

  const clients = [
    { name: "Gotechy Consulting", code: "GOTECHY" },
    { name: "MSP", code: "MSP" },
    { name: "CARSA", code: "CARSA" }
  ];

  for (const client of clients) {
    await prisma.client.upsert({
      where: { code: client.code },
      update: { name: client.name },
      create: client
    });
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

  const gotechy = await prisma.client.findUniqueOrThrow({ where: { code: "GOTECHY" } });
  const msp = await prisma.client.findUniqueOrThrow({ where: { code: "MSP" } });
  const carsa = await prisma.client.findUniqueOrThrow({ where: { code: "CARSA" } });

  const projects = [
    {
      name: "Comunicacion interna",
      code: "GOT-COM",
      clientId: gotechy.id,
      type: ProjectType.INTERNAL,
      estimatedMinutes: 40 * 60
    },
    {
      name: "MSP Basis",
      code: "MSP-BASIS",
      clientId: msp.id,
      type: ProjectType.BASIS,
      estimatedMinutes: 160 * 60
    },
    {
      name: "CARSA Desarrollo",
      code: "CARSA-DEV",
      clientId: carsa.id,
      type: ProjectType.DEVELOPMENT,
      estimatedMinutes: 220 * 60
    }
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { code: project.code },
      update: project,
      create: project
    });
  }

  const basis = await prisma.category.findUnique({ where: { name: "Basis" } });
  const mspBasis = await prisma.project.findUnique({ where: { code: "MSP-BASIS" } });

  if (basis && mspBasis) {
    await prisma.timeEntryTemplate.upsert({
      where: { id: "template-soporte-basis" },
      update: {
        name: "Soporte Basis",
        detail: "Seguimiento operativo y resolucion de incidentes",
        projectId: mspBasis.id,
        categoryId: basis.id,
        active: true
      },
      create: {
        id: "template-soporte-basis",
        name: "Soporte Basis",
        detail: "Seguimiento operativo y resolucion de incidentes",
        minutes: 60,
        projectId: mspBasis.id,
        categoryId: basis.id
      }
    });
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
