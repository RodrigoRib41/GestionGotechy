import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";

export const dashboardRangePresets = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "last-month", label: "Ultimo mes" },
  { value: "quarter", label: "Ultimos 3 meses" },
  { value: "custom", label: "Rango" }
] as const;

export type DashboardRangePreset = (typeof dashboardRangePresets)[number]["value"];

export type DashboardRangeInput = {
  preset?: string;
  from?: string;
  to?: string;
};

export function resolveDashboardRange(input: DashboardRangeInput = {}, now = new Date()) {
  const preset = normalizePreset(input.preset);

  if (preset === "today") {
    const start = startOfDay(now);
    const end = endOfDay(now);
    return rangePayload(preset, start, end, "Hoy");
  }

  if (preset === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return rangePayload(preset, start, end, "Esta semana");
  }

  if (preset === "last-month") {
    const target = subMonths(now, 1);
    const start = startOfMonth(target);
    const end = endOfMonth(target);
    return rangePayload(preset, start, end, "Ultimo mes");
  }

  if (preset === "quarter") {
    const start = startOfMonth(subMonths(now, 2));
    const end = endOfDay(now);
    return rangePayload(preset, start, end, "Ultimos 3 meses");
  }

  if (preset === "custom" && input.from && input.to) {
    const rawStart = startOfDay(new Date(`${input.from}T00:00:00`));
    const rawEnd = endOfDay(new Date(`${input.to}T23:59:59`));
    const start = rawStart <= rawEnd ? rawStart : startOfDay(rawEnd);
    const end = rawStart <= rawEnd ? rawEnd : endOfDay(rawStart);
    return rangePayload(preset, start, end, `${format(start, "dd/MM/yyyy")} - ${format(end, "dd/MM/yyyy")}`);
  }

  const start = startOfMonth(now);
  const end = endOfDay(now);
  return rangePayload("month", start, end, "Este mes");
}

function normalizePreset(value?: string): DashboardRangePreset {
  return dashboardRangePresets.some((preset) => preset.value === value) ? (value as DashboardRangePreset) : "month";
}

function rangePayload(preset: DashboardRangePreset, start: Date, end: Date, label: string) {
  return {
    preset,
    start,
    end,
    label,
    from: format(start, "yyyy-MM-dd"),
    to: format(end, "yyyy-MM-dd")
  };
}
