import { subDays } from "date-fns";

const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

export const demoProjects = [
  {
    id: "demo-project-1",
    name: "Comunicacion interna",
    status: "ACTIVE",
    projectType: { id: "type-interno", name: "Interno", monthlyReset: false },
    usesEstimatedTime: true,
    estimatedMinutes: 2400,
    client: { id: "demo-client-1", name: "Gotechy Consulting" },
    consumedMinutes: 1320
  },
  {
    id: "demo-project-2",
    name: "Soporte Demo",
    status: "ACTIVE",
    projectType: { id: "type-soporte", name: "Soporte", monthlyReset: true },
    usesEstimatedTime: true,
    estimatedMinutes: 9600,
    client: { id: "demo-client-2", name: "Cliente Demo" },
    consumedMinutes: 5160
  },
  {
    id: "demo-project-3",
    name: "Desarrollo Demo",
    status: "ACTIVE",
    projectType: { id: "type-desarrollo", name: "Desarrollo", monthlyReset: false },
    usesEstimatedTime: true,
    estimatedMinutes: 13200,
    client: { id: "demo-client-3", name: "Cliente Operativo" },
    consumedMinutes: 7380
  }
];

export const demoClients = [
  { id: "demo-client-1", name: "Gotechy Consulting", status: "ACTIVE", consumedMinutes: 1320, projects: 1 },
  { id: "demo-client-2", name: "Cliente Demo", status: "ACTIVE", consumedMinutes: 5160, projects: 1 },
  { id: "demo-client-3", name: "Cliente Operativo", status: "ACTIVE", consumedMinutes: 7380, projects: 1 }
];

export const demoCategories = [
  { id: "demo-category-1", name: "Basis", color: "#2563EB" },
  { id: "demo-category-2", name: "Desarrollo", color: "#16A34A" },
  { id: "demo-category-3", name: "Gestion", color: "#F97316" },
  { id: "demo-category-4", name: "Comunicacion interna", color: "#7C3AED" }
];

export const demoTimeEntries = [
  {
    id: "entry-1",
    date: subDays(new Date(), 0).toISOString(),
    collaborator: "Bruno Fregona",
    project: "Comunicacion interna",
    projectId: "demo-project-1",
    client: "Gotechy Consulting",
    clientId: "demo-client-1",
    category: "Comunicacion interna",
    categoryId: "demo-category-4",
    detail: "Reunion bienvenida",
    observations: "",
    minutes: 40,
    overtimeMinutes: 0
  },
  {
    id: "entry-2",
    date: subDays(new Date(), 1).toISOString(),
    collaborator: "Sofia Peralta",
    project: "Soporte Demo",
    projectId: "demo-project-2",
    client: "Cliente Demo",
    clientId: "demo-client-2",
    category: "Basis",
    categoryId: "demo-category-1",
    detail: "Monitoreo y ajustes de jobs",
    observations: "",
    minutes: 180,
    overtimeMinutes: 30
  },
  {
    id: "entry-3",
    date: subDays(new Date(), 2).toISOString(),
    collaborator: "Marcos Vidal",
    project: "Desarrollo Demo",
    projectId: "demo-project-3",
    client: "Cliente Operativo",
    clientId: "demo-client-3",
    category: "Desarrollo",
    categoryId: "demo-category-2",
    detail: "Integracion de reportes internos",
    observations: "",
    minutes: 240,
    overtimeMinutes: 45
  }
];

const demoEmployees = [
  { id: "u1", name: "Bruno Fregona", minutes: 6480, overtimeMinutes: 120, entryCount: 14, averageDailyMinutes: 309, utilizationPercent: 77 },
  { id: "u2", name: "Sofia Peralta", minutes: 5940, overtimeMinutes: 240, entryCount: 13, averageDailyMinutes: 283, utilizationPercent: 71 },
  { id: "u3", name: "Marcos Vidal", minutes: 5520, overtimeMinutes: 210, entryCount: 12, averageDailyMinutes: 263, utilizationPercent: 66 },
  { id: "u4", name: "Ana Costa", minutes: 3900, overtimeMinutes: 60, entryCount: 9, averageDailyMinutes: 186, utilizationPercent: 46 }
];

const demoClientsAnalytics = [
  { id: "c3", name: "Cliente Operativo", minutes: 7380, overtimeMinutes: 210, entryCount: 16 },
  { id: "c2", name: "Cliente Demo", minutes: 5160, overtimeMinutes: 270, entryCount: 18 },
  { id: "c1", name: "Gotechy Consulting", minutes: 1320, overtimeMinutes: 0, entryCount: 6 }
];

const demoProjectsAnalytics = [
  { id: "p3", name: "Desarrollo Demo", client: "Cliente Operativo", status: "ACTIVE", minutes: 7380, overtimeMinutes: 210, entryCount: 16 },
  { id: "p2", name: "Soporte Demo", client: "Cliente Demo", status: "ACTIVE", minutes: 5160, overtimeMinutes: 270, entryCount: 18 },
  { id: "p1", name: "Comunicacion interna", client: "Gotechy Consulting", status: "ACTIVE", minutes: 1320, overtimeMinutes: 0, entryCount: 6 }
];

const demoEstimatedProgress = [
  {
    id: "p2",
    name: "Soporte Demo",
    client: "Cliente Demo",
    type: "Soporte",
    monthlyReset: true,
    estimatedMinutes: 9600,
    consumedMinutes: 5430,
    remainingMinutes: 4170,
    percent: 57
  },
  {
    id: "p3",
    name: "Desarrollo Demo",
    client: "Cliente Operativo",
    type: "Desarrollo",
    monthlyReset: false,
    estimatedMinutes: 13200,
    consumedMinutes: 7590,
    remainingMinutes: 5610,
    percent: 58
  },
  {
    id: "p1",
    name: "Comunicacion interna",
    client: "Gotechy Consulting",
    type: "Interno",
    monthlyReset: false,
    estimatedMinutes: 2400,
    consumedMinutes: 1320,
    remainingMinutes: 1080,
    percent: 55
  }
];

export const demoDashboardData = {
  range: {
    preset: "month",
    label: "Este mes",
    from: currentMonthStart.toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  },
  metrics: {
    totalMinutes: 21840,
    totalOvertimeMinutes: 690,
    activeClients: 3,
    activeProjects: 3,
    averageDailyMinutes: 1040,
    activeEmployees: 4,
    entryCount: 48,
    productivity: 82,
    productiveMinutes: 17880,
    internalMinutes: 3960,
    previousMinutes: 18900,
    previousDeltaPercent: 16,
    todayMinutes: 420,
    weekMinutes: 6120,
    monthMinutes: 21840,
    overtimeMinutes: 690,
    missingUsers: 2,
    loadCompletion: 86
  },
  hoursByEmployee: demoEmployees,
  hoursByClient: demoClientsAnalytics,
  hoursByProject: demoProjectsAnalytics,
  estimatedProgress: demoEstimatedProgress,
  overtimeByEmployee: [...demoEmployees].sort((a, b) => b.overtimeMinutes - a.overtimeMinutes),
  employeeRanking: demoEmployees,
  clientRanking: demoClientsAnalytics,
  collaborators: demoEmployees,
  projects: demoProjectsAnalytics,
  weekly: [
    { label: "Sem 1", minutes: 4080, overtimeMinutes: 120 },
    { label: "Sem 2", minutes: 5520, overtimeMinutes: 210 },
    { label: "Sem 3", minutes: 6120, overtimeMinutes: 240 },
    { label: "Sem 4", minutes: 6120, overtimeMinutes: 120 }
  ],
  weeklyEvolution: [
    { label: "Sem 1", minutes: 4080, overtimeMinutes: 120 },
    { label: "Sem 2", minutes: 5520, overtimeMinutes: 210 },
    { label: "Sem 3", minutes: 6120, overtimeMinutes: 240 },
    { label: "Sem 4", minutes: 6120, overtimeMinutes: 120 }
  ],
  monthlyEvolution: [{ label: "May 26", minutes: 21840, overtimeMinutes: 690 }],
  categories: [
    { id: "cat1", name: "Basis", value: 5160, overtimeMinutes: 270, color: "#2563EB", kind: "PRODUCTIVE" },
    { id: "cat2", name: "Desarrollo", value: 7380, overtimeMinutes: 210, color: "#16A34A", kind: "PRODUCTIVE" },
    { id: "cat3", name: "Gestion", value: 2220, overtimeMinutes: 90, color: "#F97316", kind: "ADMINISTRATIVE" },
    { id: "cat4", name: "Comunicacion", value: 1320, overtimeMinutes: 0, color: "#7C3AED", kind: "INTERNAL" }
  ],
  productivityByEmployee: [
    { name: "Bruno Fregona", value: 77 },
    { name: "Sofia Peralta", value: 71 },
    { name: "Marcos Vidal", value: 66 },
    { name: "Ana Costa", value: 46 }
  ],
  heatmap: [
    {
      week: "04/05",
      days: [
        { date: "2026-05-04", day: "Mon", minutes: 1080, intensity: 75 },
        { date: "2026-05-05", day: "Tue", minutes: 1260, intensity: 88 },
        { date: "2026-05-06", day: "Wed", minutes: 960, intensity: 67 },
        { date: "2026-05-07", day: "Thu", minutes: 1440, intensity: 100 },
        { date: "2026-05-08", day: "Fri", minutes: 1380, intensity: 96 }
      ]
    }
  ],
  overtimeTrend: [
    { label: "04/05", minutes: 30 },
    { label: "05/05", minutes: 90 },
    { label: "06/05", minutes: 0 },
    { label: "07/05", minutes: 180 },
    { label: "08/05", minutes: 120 }
  ],
  averageHoursByDay: [
    { label: "04/05", minutes: 1080 },
    { label: "05/05", minutes: 1260 },
    { label: "06/05", minutes: 960 },
    { label: "07/05", minutes: 1440 },
    { label: "08/05", minutes: 1380 }
  ],
  topProjectsActive: demoProjectsAnalytics.slice(0, 2),
  utilizationByEmployee: demoEmployees.map((employee) => ({
    name: employee.name,
    value: employee.utilizationPercent,
    minutes: employee.minutes
  })),
  monthComparison: [
    { label: "Ene 26", minutes: 14220, overtimeMinutes: 320 },
    { label: "Feb 26", minutes: 16800, overtimeMinutes: 420 },
    { label: "Mar 26", minutes: 18900, overtimeMinutes: 510 },
    { label: "Abr 26", minutes: 20400, overtimeMinutes: 610 },
    { label: "May 26", minutes: 21840, overtimeMinutes: 690 }
  ],
  recentActivity: demoTimeEntries
};
