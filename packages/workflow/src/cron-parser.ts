const CRON_FIELD_COUNT = 5;
const MINUTE_MIN = 0;
const MINUTE_MAX = 59;
const HOUR_MIN = 0;
const HOUR_MAX = 23;
const DAY_MIN = 1;
const DAY_MAX = 31;
const MONTH_MIN = 1;
const MONTH_MAX = 12;
const WEEKDAY_MIN = 0;
const WEEKDAY_MAX = 6;

const PRESETS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
};

interface CronField {
  values: Set<number>;
  min: number;
  max: number;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  if (field === "*") {
    for (let i = min; i <= max; i++) {
      values.add(i);
    }
    return values;
  }

  const parts = field.split(",");
  for (const part of parts) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (Number.isNaN(step) || step < 1) {
        throw new Error(`Invalid step value: ${stepStr}`);
      }
      const start = range === "*" ? min : parseInt(range, 10);
      if (Number.isNaN(start)) {
        throw new Error(`Invalid range start: ${range}`);
      }
      for (let i = start; i <= max; i += step) {
        values.add(i);
      }
    } else if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        throw new Error(`Invalid range: ${part}`);
      }
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else {
      const value = parseInt(part, 10);
      if (Number.isNaN(value)) {
        throw new Error(`Invalid value: ${part}`);
      }
      values.add(value);
    }
  }

  return values;
}

export function isValid(expression: string): boolean {
  try {
    parse(expression);
    return true;
  } catch {
    return false;
  }
}

export function parse(expression: string): {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
} {
  const normalized = PRESETS[expression] ?? expression;
  const fields = normalized.trim().split(/\s+/);

  if (fields.length !== CRON_FIELD_COUNT) {
    throw new Error(`Cron expression must have ${CRON_FIELD_COUNT} fields, got ${fields.length}`);
  }

  const minutes = parseField(fields[0], MINUTE_MIN, MINUTE_MAX);
  const hours = parseField(fields[1], HOUR_MIN, HOUR_MAX);
  const days = parseField(fields[2], DAY_MIN, DAY_MAX);
  const months = parseField(fields[3], MONTH_MIN, MONTH_MAX);
  const weekdays = parseField(fields[4], WEEKDAY_MIN, WEEKDAY_MAX);

  return { minutes, hours, days, months, weekdays };
}

export function nextRun(expression: string, after?: Date): Date {
  const parsed = parse(expression);
  const base = after ?? new Date();
  const candidate = new Date(base);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxIterations = 525_960;

  for (let i = 0; i < maxIterations; i++) {
    const month = candidate.getMonth() + 1;
    const day = candidate.getDate();
    const hour = candidate.getHours();
    const minute = candidate.getMinutes();
    const weekday = candidate.getDay();

    if (!parsed.months.has(month)) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.days.has(day) && !parsed.weekdays.has(weekday)) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.hours.has(hour)) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (!parsed.minutes.has(minute)) {
      candidate.setMinutes(candidate.getMinutes() + 1, 0, 0);
      continue;
    }

    return new Date(candidate);
  }

  throw new Error("Could not find next run time within 1 year");
}
