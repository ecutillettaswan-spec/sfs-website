// Types and pure helpers shared by the stocking page (client) and its API (server).
// Nothing in here may touch the database, so the browser bundle can import it.

export type StockingStatus = 'in' | 'out';
export type StockingPhase = 'past' | 'today' | 'future';

export type StockingPerson = {
  key: string;
  name: string;
  role: 'lead' | 'regular' | 'extra';
  rosterId: string | null;
  phone: string | null;
  status: StockingStatus | null;
  statusAt: string | null;
};

export type StockingDay = {
  date: string;
  weekday: number;
  phase: StockingPhase;
  /** Set when the day falls inside a no-stocking range (break, holiday). */
  closed: { id: string; reason: string } | null;
  people: StockingPerson[];
};

export type StockingClosure = {
  id: string;
  start: string;
  end: string;
  reason: string;
};

export type StockingLogEntry = {
  id: string;
  at: string;
  actor: string | null;
  text: string;
};

export type StockingState = {
  version: string;
  today: string;
  days: StockingDay[];
  /** No-stocking ranges that end on or after this week's Monday. */
  closures: StockingClosure[];
  log: StockingLogEntry[];
};

export type StockingHistoryDay = {
  date: string;
  stocked: string[];
  out: string[];
};

export type StockingHistoryPerson = {
  name: string;
  stocked: number;
  out: number;
  lastStocked: string | null;
};

export type StockingHistory = {
  today: string;
  /** First day of the school year shown (Aug 1). */
  since: string;
  days: StockingHistoryDay[];
  people: StockingHistoryPerson[];
};

export const STOCKING_TIME_ZONE = 'America/Chicago';
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const pad = (value: number) => String(value).padStart(2, '0');

function dateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = dateParts(value);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function addDays(date: string, amount: number) {
  const { year, month, day } = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date: string) {
  const { year, month, day } = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

let chicagoFormatter: Intl.DateTimeFormat | null = null;

// Wall-clock parts in Chicago. Built from numeric parts only, so the server and
// the browser always produce identical strings (no hydration mismatches).
function chicagoParts(instant: Date) {
  chicagoFormatter ??= new Intl.DateTimeFormat('en-US', {
    timeZone: STOCKING_TIME_ZONE,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  });
  const parts: Record<string, number> = {};
  for (const part of chicagoFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    hour: parts.hour % 24,
    minute: parts.minute,
  };
}

export function chicagoToday(now = new Date()) {
  return chicagoParts(now).date;
}

/** Monday–Friday of the current school week. On weekends it's the coming week. */
export function stockingWeek(today: string) {
  const weekday = weekdayOf(today);
  const offset = weekday === 0 ? 1 : weekday === 6 ? 2 : 1 - weekday;
  const monday = addDays(today, offset);
  return [0, 1, 2, 3, 4].map((index) => addDays(monday, index));
}

export function dayPhase(date: string, today: string): StockingPhase {
  if (date < today) return 'past';
  return date === today ? 'today' : 'future';
}

/** "Nov 4" */
export function formatMonthDay(date: string) {
  const { month, day } = dateParts(date);
  return `${MONTH_SHORT[month - 1]} ${day}`;
}

/** "Thu Nov 26" for one day, "Dec 21 – Jan 1" for a range. */
export function formatRange(start: string, end: string) {
  if (start === end) return `${WEEKDAY_SHORT[weekdayOf(start)]} ${formatMonthDay(start)}`;
  return `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
}

/**
 * Chicago time. "3:05 PM" for today; other days get "Tue 3:05 PM",
 * or "Nov 2, 3:05 PM" when `withDate` is set (for things older than this week).
 */
export function formatStamp(iso: string, today: string, withDate = false) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const { date, hour, minute } = chicagoParts(instant);
  const clock = `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
  if (date === today) return clock;
  return withDate ? `${formatMonthDay(date)}, ${clock}` : `${WEEKDAY_SHORT[weekdayOf(date)]} ${clock}`;
}

/** "2026-11-04 15:05" in Chicago time, for exports. */
export function formatChicagoDateTime(iso: string) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';
  const { date, hour, minute } = chicagoParts(instant);
  return `${date} ${pad(hour)}:${pad(minute)}`;
}

export function formatPhone(digits: string) {
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

export function nameKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
