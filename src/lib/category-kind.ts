export const categoryKindValues = ["PRODUCTIVE", "INTERNAL", "ADMINISTRATIVE", "TRAINING"] as const;

export type CategoryKindKey = (typeof categoryKindValues)[number];

export const categoryKindMeta: Record<
  CategoryKindKey,
  { label: string; shortLabel: string; description: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  PRODUCTIVE: {
    label: "Productiva",
    shortLabel: "Prod.",
    description: "Tiempo directo para clientes, proyectos o entregables.",
    color: "#16A34A",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-700 dark:text-emerald-300",
    borderClass: "border-emerald-500/30"
  },
  INTERNAL: {
    label: "Interna",
    shortLabel: "Interna",
    description: "Coordinacion, soporte interno o gestion del equipo.",
    color: "#2563EB",
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-700 dark:text-blue-300",
    borderClass: "border-blue-500/30"
  },
  ADMINISTRATIVE: {
    label: "Administrativa",
    shortLabel: "Admin.",
    description: "Administración, reportes, documentacion o gestion operativa.",
    color: "#CA8A04",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-700 dark:text-amber-300",
    borderClass: "border-amber-500/30"
  },
  TRAINING: {
    label: "Capacitacion",
    shortLabel: "Cap.",
    description: "Aprendizaje, onboarding, investigacion o mejora de habilidades.",
    color: "#9333EA",
    bgClass: "bg-violet-500/10",
    textClass: "text-violet-700 dark:text-violet-300",
    borderClass: "border-violet-500/30"
  }
};

export function getCategoryKindMeta(kind?: string | null) {
  return categoryKindMeta[(kind as CategoryKindKey) || "PRODUCTIVE"] ?? categoryKindMeta.PRODUCTIVE;
}
