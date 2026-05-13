import { formatMinutes } from "@/lib/utils";

type GoalCopyInput = {
  metricKind: string;
  period: string;
  targetPercent?: number | string | null;
  targetMinutes?: number | string | null;
  tolerancePercent?: number | string | null;
  minDailyPercent?: number | string | null;
};

function numberValue(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function periodLabel(period: string) {
  return period === "MONTHLY" ? "mensual" : "semanal";
}

export function buildGoalCopy(input: GoalCopyInput) {
  const targetPercent = numberValue(input.targetPercent);
  const targetMinutes = numberValue(input.targetMinutes);
  const tolerancePercent = numberValue(input.tolerancePercent) ?? 0;
  const minDailyPercent = numberValue(input.minDailyPercent);
  const period = periodLabel(input.period);
  const tolerance = tolerancePercent > 0 ? ` con tolerancia del ${tolerancePercent}%` : "";
  const daily = minDailyPercent ? ` con un minimo diario del ${minDailyPercent}%` : "";

  switch (input.metricKind) {
    case "DAILY_MIN_PERCENT": {
      const percent = targetPercent ?? 50;
      return {
        title: `Cumplir minimo diario del ${percent}%`,
        description: `Mantener al menos ${percent}% de carga diaria en cada periodo ${period}${tolerance}.`,
        summary: `${percent}% diario / ${period}`
      };
    }
    case "MIN_WEEKLY_MINUTES": {
      const minutes = targetMinutes ?? 0;
      return {
        title: `Registrar al menos ${formatMinutes(minutes)}`,
        description: `Cumplir una carga minima ${period} de ${formatMinutes(minutes)}${tolerance}.`,
        summary: `${formatMinutes(minutes)} / ${period}`
      };
    }
    case "MAX_OVERTIME_MINUTES": {
      const minutes = targetMinutes ?? 0;
      return {
        title: `Limitar horas extra a ${formatMinutes(minutes)}`,
        description: `Mantener las horas extra por debajo de ${formatMinutes(minutes)} por periodo ${period}.`,
        summary: `Max ${formatMinutes(minutes)} extra`
      };
    }
    case "MIN_ACTIVE_DAYS": {
      const days = Math.max(1, targetMinutes ?? 5);
      return {
        title: `Registrar actividad al menos ${days} dias`,
        description: `Registrar actividad al menos ${days} dias por periodo ${period}.`,
        summary: `${days} dias activos`
      };
    }
    case "PRIORITY_PROJECT_PERCENT":
      return {
        title: `Cumplir ${targetPercent ?? 90}% en proyectos prioritarios`,
        description: `Cumplir ${targetPercent ?? 90}% de carga ${period} en proyectos prioritarios${tolerance}.`,
        summary: `${targetPercent ?? 90}% prioritario`
      };
    case "PRODUCTIVE_PERCENT":
      return {
        title: `Mantener ${targetPercent ?? 80}% de horas productivas`,
        description: `Mantener al menos ${targetPercent ?? 80}% de horas productivas en el periodo ${period}${tolerance}.`,
        summary: `${targetPercent ?? 80}% productivo`
      };
    case "REDUCE_INTERNAL_MINUTES": {
      const minutes = targetMinutes ?? 0;
      return {
        title: `Reducir horas internas a ${formatMinutes(minutes)}`,
        description: `Mantener tareas internas por debajo de ${formatMinutes(minutes)} en el periodo ${period}.`,
        summary: `Max ${formatMinutes(minutes)} interno`
      };
    }
    case "AVG_ENTRY_DELAY_MINUTES": {
      const minutes = targetMinutes ?? 0;
      return {
        title: `Cargar horas con demora maxima de ${formatMinutes(minutes)}`,
        description: `Mantener la demora promedio de carga por debajo de ${formatMinutes(minutes)} en el periodo ${period}.`,
        summary: `Demora ${formatMinutes(minutes)}`
      };
    }
    case "CLIENT_MINUTES": {
      const minutes = targetMinutes ?? 0;
      return {
        title: `Cumplir ${formatMinutes(minutes)} por cliente`,
        description: `Cumplir ${formatMinutes(minutes)} de carga ${period} para el cliente seleccionado${tolerance}.`,
        summary: `${formatMinutes(minutes)} cliente`
      };
    }
    case "CATEGORY_MINUTES": {
      const minutes = targetMinutes ?? 0;
      return {
        title: `Cumplir ${formatMinutes(minutes)} por categoria`,
        description: `Cumplir ${formatMinutes(minutes)} de carga ${period} en la categoria seleccionada${tolerance}.`,
        summary: `${formatMinutes(minutes)} categoria`
      };
    }
    default: {
      const percent = targetPercent ?? 60;
      return {
        title: `Mantener al menos ${percent}% de horas registradas`,
        description: `Mantener al menos ${percent}% de horas registradas ${period}mente${daily}${tolerance}.`,
        summary: `${percent}% esperado${daily ? ` / diario ${minDailyPercent}%` : ""}`
      };
    }
  }
}
