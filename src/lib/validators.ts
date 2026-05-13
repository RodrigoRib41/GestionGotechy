import { z } from "zod";

export const roleValues = ["SUPERADMIN", "ADMINISTRADOR", "COLABORADOR"] as const;
export const userStatusValues = ["ACTIVE", "DISABLED", "PENDING", "ARCHIVED", "DELETED"] as const;
export const clientStatusValues = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export const projectStatusValues = ["ACTIVE", "INACTIVE"] as const;
export const trackingPriorityValues = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const goalPeriodValues = ["WEEKLY", "MONTHLY"] as const;
export const goalHistoryPeriodValues = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export const goalMetricKindValues = [
  "MIN_EXPECTED_PERCENT",
  "DAILY_MIN_PERCENT",
  "MIN_WEEKLY_MINUTES",
  "MAX_OVERTIME_MINUTES",
  "MIN_ACTIVE_DAYS",
  "PRIORITY_PROJECT_PERCENT",
  "PRODUCTIVE_PERCENT",
  "REDUCE_INTERNAL_MINUTES",
  "AVG_ENTRY_DELAY_MINUTES",
  "CLIENT_MINUTES",
  "CATEGORY_MINUTES"
] as const;
export const auditActionValues = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "DENIED_LOGIN",
  "EXPORT",
  "ROLE_CHANGE",
  "STATUS_CHANGE",
  "CONFIG_CHANGE"
] as const;

export const timeEntrySchema = z.object({
  date: z.string().min(1, "Selecciona una fecha"),
  projectId: z.string().min(1, "Selecciona un proyecto"),
  categoryId: z.string().min(1, "Selecciona una categoria"),
  detail: z.string().min(3, "Agrega un detalle breve").max(500),
  observations: z.string().max(800).optional(),
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  overtimeMinutes: z.coerce.number().int().min(0).max(12 * 60).default(0)
});

export const timeEntryPatchSchema = z
  .object({
    date: z.string().min(1, "Selecciona una fecha").optional(),
    projectId: z.string().min(1, "Selecciona un proyecto").optional(),
    categoryId: z.string().min(1, "Selecciona una categoria").optional(),
    detail: z.string().min(3, "Agrega un detalle breve").max(500).optional(),
    observations: z.string().max(800).optional(),
    minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
    overtimeMinutes: z.coerce.number().int().min(0).max(12 * 60).optional()
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "No hay cambios para guardar");

export const projectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  clientId: z.string().min(1),
  projectTypeId: z.string().optional(),
  status: z.enum(projectStatusValues).default("ACTIVE"),
  usesEstimatedTime: z.coerce.boolean().default(false),
  estimatedMinutes: z.coerce.number().int().min(0).max(20_000 * 60).default(0),
  description: z.string().max(400).optional()
});

export const clientSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  status: z.enum(clientStatusValues).default("ACTIVE"),
  description: z.string().max(400).optional()
});

export const projectTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  active: z.coerce.boolean().default(true),
  monthlyReset: z.coerce.boolean().default(false)
});

export const timeEntryFavoriteSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  projectId: z.string().min(1, "Selecciona un proyecto"),
  categoryId: z.string().min(1, "Selecciona una categoria"),
  detail: z.string().min(3, "Agrega un detalle breve").max(500),
  observations: z.string().max(800).optional(),
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  overtimeMinutes: z.coerce.number().int().min(0).max(12 * 60).default(0)
});

export const allowedEmailSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(roleValues)
});

export const roleAssignmentSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(roleValues),
  status: z.enum(userStatusValues).optional()
});

export const themeVariantValues = ["DEFAULT", "MIDNIGHT", "EMERALD", "CORPORATE"] as const;

export const themeVariantSchema = z.object({
  themeVariant: z.enum(themeVariantValues)
});

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  kind: z.enum(["PRODUCTIVE", "INTERNAL", "ADMINISTRATIVE", "TRAINING"]),
  active: z.coerce.boolean().default(true)
});

export const workScheduleSchema = z.object({
  userId: z.string().min(1),
  weeklyMinutes: z.coerce.number().int().min(60).max(7 * 24 * 60),
  dailyMinutes: z.coerce.number().int().min(30).max(24 * 60),
  modality: z.enum(["ONSITE", "REMOTE", "HYBRID", "FLEX"]),
  workdays: z.array(z.coerce.number().int().min(0).max(6)).min(1)
});

export const trackingStatusSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  active: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  isFinal: z.coerce.boolean().default(false),
  isBlocked: z.coerce.boolean().default(false)
});

export const trackingTaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3, "Agrega un titulo").max(160),
  description: z.string().min(3, "Agrega una descripcion").max(1200),
  clientId: z.string().min(1, "Selecciona un cliente"),
  projectId: z.string().min(1, "Selecciona un proyecto"),
  assigneeId: z.string().min(1, "Selecciona un responsable"),
  statusId: z.string().min(1, "Selecciona un estado"),
  priority: z.enum(trackingPriorityValues).default("MEDIUM"),
  dueDate: z.string().optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(20_000 * 60).default(0),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      Array.isArray(value)
        ? value.map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
        : (value ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 12)
    )
});

export const trackingTaskPatchSchema = trackingTaskSchema.partial().extend({
  id: z.string().min(1)
});

export const trackingTaskStatusChangeSchema = z.object({
  taskId: z.string().min(1),
  statusId: z.string().min(1)
});

export const trackingCommentSchema = z.object({
  taskId: z.string().min(1),
  message: z.string().min(1).max(1000)
});

export const trackingTimeLogSchema = z.object({
  taskId: z.string().min(1),
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  message: z.string().max(800).optional()
});

export const dashboardPreferenceSchema = z.object({
  dashboardId: z.string().min(2).max(80),
  position: z.coerce.number().int().min(0).max(5).optional()
});

export const reportDeletePreviewSchema = z
  .object({
    mode: z.enum(["all", "range"]).default("range"),
    from: z.string().optional(),
    to: z.string().optional()
  })
  .refine((value) => value.mode === "all" || Boolean(value.from && value.to), "Selecciona un rango valido");

export const reportDeleteSchema = reportDeletePreviewSchema.extend({
  pin: z.string().min(4).max(32),
  confirmation: z.string().transform((value) => value.trim().toUpperCase())
});

export const auditFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  actorId: z.string().optional(),
  action: z.enum(auditActionValues).optional(),
  entity: z.string().optional()
});

export const auditDeletePreviewSchema = z
  .object({
    mode: z.enum(["all", "range"]).default("range"),
    from: z.string().optional(),
    to: z.string().optional()
  })
  .refine((value) => value.mode === "all" || Boolean(value.from && value.to), "Selecciona un rango valido");

export const auditDeleteSchema = auditDeletePreviewSchema.extend({
  pin: z.string().min(4).max(32),
  confirmation: z.string().transform((value) => value.trim().toUpperCase())
});

export const disabledUserDeleteSchema = z.object({
  userId: z.string().min(1),
  strategy: z.enum(["PHYSICAL", "ARCHIVE", "SOFT_DELETE", "ANONYMIZE"]),
  confirmation: z.string().transform((value) => value.trim().toUpperCase())
});

export const goalHistoryDeletePreviewSchema = z
  .object({
    mode: z.enum(["all", "range"]).default("range"),
    from: z.string().optional(),
    to: z.string().optional(),
    period: z.enum(goalHistoryPeriodValues).optional()
  })
  .refine((value) => value.mode === "all" || Boolean(value.from && value.to), "Selecciona un rango valido");

export const goalHistoryDeleteSchema = goalHistoryDeletePreviewSchema.extend({
  pin: z.string().min(4).max(32),
  confirmation: z.string().transform((value) => value.trim().toUpperCase())
});

export const goalHistorySettingsSchema = z.object({
  settings: z.array(
    z.object({
      frequency: z.enum(goalHistoryPeriodValues),
      enabled: z.coerce.boolean()
    })
  )
});

export const goalObjectiveSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
    metricKind: z.enum(goalMetricKindValues),
    period: z.enum(goalPeriodValues).default("WEEKLY"),
    targetPercent: z.coerce.number().min(0).max(300).optional(),
    targetMinutes: z.coerce.number().int().min(0).max(50_000 * 60).optional(),
    tolerancePercent: z.coerce.number().min(0).max(100).default(0),
    minDailyPercent: z.coerce.number().min(0).max(100).optional(),
    active: z.coerce.boolean().default(true),
    global: z.coerce.boolean().default(true),
    ownerId: z.string().optional(),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
    categoryId: z.string().optional(),
    excludedUserIds: z.array(z.string()).default([])
  })
  .refine((value) => value.global || Boolean(value.ownerId), "Selecciona un colaborador para objetivos individuales");
