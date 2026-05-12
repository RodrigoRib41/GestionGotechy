import { z } from "zod";

export const roleValues = ["SUPERADMIN", "ADMINISTRATOR", "REPORTER", "COLLABORATOR"] as const;
export const userStatusValues = ["ACTIVE", "DISABLED", "PENDING"] as const;

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
  code: z.string().min(2).max(32).transform((value) => value.trim().toUpperCase()),
  clientId: z.string().min(1),
  type: z.enum(["BASIS", "DEVELOPMENT", "MANAGEMENT", "SUPPORT", "INTERNAL", "OTHER"]),
  estimatedHours: z.coerce.number().min(0).max(20_000)
});

export const clientSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(32).transform((value) => value.trim().toUpperCase()),
  description: z.string().max(400).optional()
});

export const allowedEmailSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  roles: z.array(z.enum(roleValues)).min(1)
});

export const roleAssignmentSchema = z.object({
  userId: z.string().min(1),
  roles: z.array(z.enum(roleValues)).min(1),
  status: z.enum(userStatusValues).optional()
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
