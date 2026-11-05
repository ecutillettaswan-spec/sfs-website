import { getRawDb } from '@/db';
import {
  chicagoToday,
  addDays,
  dayPhase,
  formatChicagoDateTime,
  formatMonthDay,
  formatRange,
  isDateOnly,
  nameKey,
  stockingWeek,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  weekdayOf,
  type StockingClosure,
  type StockingDay,
  type StockingHistory,
  type StockingHistoryDay,
  type StockingHistoryPerson,
  type StockingLogEntry,
  type StockingPerson,
  type StockingState,
  type StockingStatus,
} from '@/lib/stocking-shared';

/** Errors with a message that is safe and useful to show on the page. */
export class StockingError extends Error {}

const MAX_LINEUP_PER_DAY = 20;
const MAX_EXTRAS_PER_DAY = 30;
const MAX_CHANGES_PER_MINUTE = 60;
const LOG_RETENTION_DAYS = 120;
const MAX_UPCOMING_CLOSURES = 60;
const MAX_CLOSURE_DAYS = 120;

const schema = [
  `CREATE TABLE IF NOT EXISTS stocking_roster (
    id TEXT PRIMARY KEY, weekday INTEGER NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL,
    is_lead INTEGER NOT NULL DEFAULT 0, phone TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_stocking_roster_day_name ON stocking_roster(weekday, name_key)',
  `CREATE TABLE IF NOT EXISTS stocking_rsvps (
    shift_date TEXT NOT NULL, name_key TEXT NOT NULL, name TEXT NOT NULL, status TEXT,
    is_extra INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (shift_date, name_key)
  )`,
  `CREATE TABLE IF NOT EXISTS stocking_log (
    id TEXT PRIMARY KEY, shift_date TEXT, weekday INTEGER, action TEXT NOT NULL,
    actor_name TEXT, details TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_stocking_log_created ON stocking_log(created_at)',
  `CREATE TABLE IF NOT EXISTS stocking_meta (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stocking_closures (
    id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_stocking_closures_end ON stocking_closures(end_date)',
];

// The weekly lineup from the "Stocking Schedule" sheet. Only used to fill an
// empty database the first time; after that the lineup is edited on the page.
const sheetLineup = [
  { weekday: 1, lead: 'Victor', phone: null, crew: ['Nolan', 'Erik', 'Logan', 'Joe', 'Ryne'] },
  { weekday: 2, lead: 'Joaquin', phone: null, crew: ['Camila', 'Nolan', 'Elliot', 'Logan', 'Joe'] },
  { weekday: 3, lead: 'Joe', phone: null, crew: ['Rabi', 'Victor', 'Logan', 'Ryne', 'Eve'] },
  { weekday: 4, lead: 'Eve', phone: null, crew: ['Camila', 'Erik', 'Nolan', 'Logan', 'Joe', 'Joaquin'] },
  { weekday: 5, lead: 'Rei', phone: '7087960842', crew: ['Laney', 'Rabi', 'Lucy', 'Erik', 'Nolan'] },
] as const;

// 2026–27 breaks, added once so they show up without anyone typing them in.
// Thanksgiving is the holiday itself; the winter and spring break dates come from
// District 90's calendar, which says it lines up with D200. Edit on the page if OPRF differs.
const presetClosures = [
  { id: 'preset-2026-thanksgiving', start: '2026-11-26', end: '2026-11-27', reason: 'Thanksgiving break' },
  { id: 'preset-2026-winter', start: '2026-12-21', end: '2027-01-01', reason: 'Winter break' },
  { id: 'preset-2027-spring', start: '2027-03-29', end: '2027-04-02', reason: 'Spring break' },
] as const;

let ready: Promise<void> | null = null;

export function ensureStocking() {
  ready ??= (async () => {
    const db = getRawDb();
    await db.batch(schema.map((sql) => db.prepare(sql)));
    // Each seed runs once, so deleting a seeded person or break never brings it back.
    const done = await db.prepare("SELECT key FROM stocking_meta WHERE key IN ('seed','closures-seed')").all<{ key: string }>();
    const seeded = new Set((done.results ?? []).map((row) => row.key));
    if (seeded.has('seed') && seeded.has('closures-seed')) return;
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    if (!seeded.has('seed')) {
      statements.push(
        ...sheetLineup.flatMap((day) => [day.lead, ...day.crew].map((name, index) => db.prepare(`INSERT OR IGNORE INTO stocking_roster
          (id,weekday,name,name_key,is_lead,phone,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
          `seed-${day.weekday}-${nameKey(name)}`, day.weekday, name, nameKey(name),
          index === 0 ? 1 : 0, index === 0 ? day.phone : null, index, now, now,
        ))),
        db.prepare("INSERT OR IGNORE INTO stocking_meta (key,value,updated_at) VALUES ('seed','stocking-sheet-v1',?)").bind(now),
      );
    }
    if (!seeded.has('closures-seed')) {
      statements.push(
        ...presetClosures.map((closure) => db.prepare(`INSERT OR IGNORE INTO stocking_closures
          (id,start_date,end_date,reason,created_at) VALUES (?,?,?,?,?)`).bind(closure.id, closure.start, closure.end, closure.reason, now)),
        db.prepare("INSERT OR IGNORE INTO stocking_meta (key,value,updated_at) VALUES ('closures-seed','2026-27-v1',?)").bind(now),
      );
    }
    statements.push(db.prepare(`INSERT INTO stocking_meta (key,value,updated_at) VALUES ('version',?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).bind(crypto.randomUUID(), now));
    await db.batch(statements);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

type RosterRow = { id: string; weekday: number; name: string; name_key: string; is_lead: number; phone: string | null };
type RsvpRow = { shift_date: string; name_key: string; name: string; status: string | null; is_extra: number; updated_at: string };
type LogRow = { id: string; actor_name: string | null; details: string; created_at: string };
type ClosureRow = { id: string; start_date: string; end_date: string; reason: string };

function asStatus(value: string | null): StockingStatus | null {
  return value === 'in' || value === 'out' ? value : null;
}

export async function getStockingVersion(now = new Date()) {
  await ensureStocking();
  const row = await getRawDb().prepare("SELECT value FROM stocking_meta WHERE key='version'").first<{ value: string }>();
  return { version: row?.value ?? '0', today: chicagoToday(now) };
}

export async function getStockingState(now = new Date()): Promise<StockingState> {
  await ensureStocking();
  const db = getRawDb();
  const today = chicagoToday(now);
  const dates = stockingWeek(today);
  // One batch = one consistent snapshot of the lineup, answers, log and version.
  const [rosterResult, rsvpResult, logResult, versionResult, closureResult] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id,weekday,name,name_key,is_lead,phone FROM stocking_roster ORDER BY weekday, is_lead DESC, sort_order, created_at'),
    db.prepare('SELECT shift_date,name_key,name,status,is_extra,updated_at FROM stocking_rsvps WHERE shift_date BETWEEN ? AND ? ORDER BY created_at').bind(dates[0], dates[4]),
    db.prepare('SELECT id,actor_name,details,created_at FROM stocking_log ORDER BY created_at DESC LIMIT 25'),
    db.prepare("SELECT value FROM stocking_meta WHERE key='version'"),
    db.prepare('SELECT id,start_date,end_date,reason FROM stocking_closures WHERE end_date >= ? ORDER BY start_date, end_date LIMIT ?')
      .bind(dates[0], MAX_UPCOMING_CLOSURES + 10),
  ]);
  const closures: StockingClosure[] = ((closureResult.results ?? []) as ClosureRow[]).map((row) => ({
    id: row.id, start: row.start_date, end: row.end_date, reason: row.reason,
  }));
  const roster = (rosterResult.results ?? []) as RosterRow[];
  const rsvps = (rsvpResult.results ?? []) as RsvpRow[];
  const answers = new Map(rsvps.map((row) => [`${row.shift_date}|${row.name_key}`, row]));

  const days: StockingDay[] = dates.map((date) => {
    const weekday = weekdayOf(date);
    const lineup = roster.filter((row) => row.weekday === weekday);
    const onLineup = new Set(lineup.map((row) => row.name_key));
    const people: StockingPerson[] = lineup.map((row) => {
      const answer = answers.get(`${date}|${row.name_key}`);
      return {
        key: row.name_key,
        name: row.name,
        role: row.is_lead ? 'lead' : 'regular',
        rosterId: row.id,
        phone: row.is_lead ? row.phone : null,
        status: asStatus(answer?.status ?? null),
        statusAt: answer?.status ? answer.updated_at : null,
      };
    });
    for (const row of rsvps) {
      if (row.shift_date !== date || !row.is_extra || onLineup.has(row.name_key)) continue;
      people.push({
        key: row.name_key,
        name: row.name,
        role: 'extra',
        rosterId: null,
        phone: null,
        status: asStatus(row.status),
        statusAt: row.status ? row.updated_at : null,
      });
    }
    const closure = closures.find((item) => item.start <= date && item.end >= date);
    return {
      date,
      weekday,
      phase: dayPhase(date, today),
      closed: closure ? { id: closure.id, reason: closure.reason } : null,
      people,
    };
  });

  const log: StockingLogEntry[] = ((logResult.results ?? []) as LogRow[]).map((row) => ({
    id: row.id,
    at: row.created_at,
    actor: row.actor_name,
    text: row.details,
  }));
  const version = String((versionResult.results?.[0] as { value?: string } | undefined)?.value ?? '0');
  return { version, today, days, closures, log };
}

function cleanName(raw: unknown) {
  let name = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) throw new StockingError('Type a name first.');
  if (name.length > 40) throw new StockingError('Keep names under 40 characters.');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'’-]*$/u.test(name)) {
    throw new StockingError('Names can only use letters, spaces, apostrophes, periods, and dashes.');
  }
  // "nolan" -> "Nolan", but leave deliberate capitalization ("McKenna", "DJ") alone.
  if (name === name.toLocaleLowerCase('en-US')) {
    name = name.replace(/(^|[\s'’-])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase('en-US'));
  }
  return name;
}

function optionalName(raw: unknown) {
  try { return raw ? cleanName(raw) : null; } catch { return null; }
}

function cleanPhone(raw: unknown) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (text.length > 24 || !/^[+\d\s().-]+$/.test(text)) throw new StockingError('Use digits for the phone number, like 708-555-0123.');
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) throw new StockingError('Phone numbers need 10 digits, like 708-555-0123.');
  return digits;
}

function cleanWeekday(raw: unknown) {
  const weekday = Number(raw);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) throw new StockingError('Pick a day from Monday to Friday.');
  return weekday;
}

function cleanRosterId(raw: unknown) {
  const id = String(raw ?? '');
  if (!/^[\w-]{1,80}$/.test(id)) throw new StockingError('That person could not be found. Refresh the page.');
  return id;
}

function cleanReason(raw: unknown) {
  const reason = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (reason.length > 60) throw new StockingError('Keep the reason under 60 characters.');
  if (reason && !/^[\p{L}\p{M}\p{N} .,'’&()/:!?-]+$/u.test(reason)) throw new StockingError('Use letters and numbers for the reason.');
  return reason;
}

function dayLabel(date: string) {
  return `${WEEKDAY_SHORT[weekdayOf(date)]} ${formatMonthDay(date)}`;
}

function weekDate(raw: unknown, week: string[]) {
  if (!isDateOnly(raw) || !week.includes(raw)) throw new StockingError('That day is not on this week’s schedule anymore. Refresh the page.');
  return raw;
}

export async function mutateStocking(input: Record<string, unknown>, now = new Date()) {
  await ensureStocking();
  const db = getRawDb();
  const stamp = now.toISOString();
  const today = chicagoToday(now);
  const week = stockingWeek(today);
  const action = String(input.action ?? '');
  const actor = optionalName(input.actor);

  const recent = await db.prepare('SELECT COUNT(*) AS count FROM stocking_log WHERE created_at >= ?')
    .bind(new Date(now.getTime() - 60_000).toISOString()).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= MAX_CHANGES_PER_MINUTE) throw new StockingError('Too many changes at once. Wait a minute and try again.');

  const statements: D1PreparedStatement[] = [];
  let details = '';
  let shiftDate: string | null = null;
  let weekday: number | null = null;

  const upsertAnswer = (date: string, key: string, name: string, status: StockingStatus | null) => db.prepare(`INSERT INTO stocking_rsvps
    (shift_date,name_key,name,status,is_extra,created_at,updated_at) VALUES (?,?,?,?,0,?,?)
    ON CONFLICT(shift_date,name_key) DO UPDATE SET name=excluded.name, status=excluded.status, updated_at=excluded.updated_at`)
    .bind(date, key, name, status, stamp, stamp);
  const lineupEntry = (day: number, key: string) => db.prepare('SELECT id,name FROM stocking_roster WHERE weekday=? AND name_key=?')
    .bind(day, key).first<{ id: string; name: string }>();
  const extraEntry = (date: string, key: string) => db.prepare('SELECT name FROM stocking_rsvps WHERE shift_date=? AND name_key=? AND is_extra=1')
    .bind(date, key).first<{ name: string }>();
  const assertOpen = async (date: string) => {
    const closure = await db.prepare('SELECT reason FROM stocking_closures WHERE start_date <= ? AND end_date >= ? LIMIT 1')
      .bind(date, date).first<{ reason: string }>();
    if (closure) throw new StockingError(`No stocking on ${WEEKDAY_NAMES[weekdayOf(date)]}${closure.reason ? ` (${closure.reason})` : ''}.`);
  };

  switch (action) {
    case 'respond': {
      shiftDate = weekDate(input.date, week);
      weekday = weekdayOf(shiftDate);
      const phase = dayPhase(shiftDate, today);
      const status = input.status === 'in' || input.status === 'out' ? input.status : null;
      if (input.status != null && status === null) throw new StockingError('Pick “I can make it” or “I can’t make it”.');
      if (phase === 'past') throw new StockingError(`${WEEKDAY_NAMES[weekday]} is already over, so it can’t be changed.`);
      await assertOpen(shiftDate);
      if (status === 'in' && phase === 'future') {
        throw new StockingError(`Too early to check in. Come back on ${WEEKDAY_NAMES[weekday]} to say you can make it.`);
      }
      const name = cleanName(input.name);
      const key = nameKey(name);
      const person = await lineupEntry(weekday, key) ?? await extraEntry(shiftDate, key);
      if (!person) throw new StockingError(`${name} isn’t on the list for ${WEEKDAY_NAMES[weekday]}. Refresh the page.`);
      statements.push(upsertAnswer(shiftDate, key, person.name, status));
      details = status === 'in'
        ? `${person.name} can make it ${dayLabel(shiftDate)}`
        : status === 'out'
          ? `${person.name} can’t make it ${dayLabel(shiftDate)}`
          : `${person.name} cleared their answer for ${dayLabel(shiftDate)}`;
      break;
    }

    case 'add-extra': {
      shiftDate = weekDate(input.date, week);
      weekday = weekdayOf(shiftDate);
      const phase = dayPhase(shiftDate, today);
      if (phase === 'past') throw new StockingError(`${WEEKDAY_NAMES[weekday]} is already over.`);
      if (phase === 'future') throw new StockingError(`You can add yourself on ${WEEKDAY_NAMES[weekday]}, the day you’re going.`);
      await assertOpen(shiftDate);
      const name = cleanName(input.name);
      const key = nameKey(name);
      const regular = await lineupEntry(weekday, key);
      if (regular) {
        statements.push(upsertAnswer(shiftDate, key, regular.name, 'in'));
        details = `${regular.name} can make it ${dayLabel(shiftDate)}`;
        break;
      }
      const extras = await db.prepare('SELECT COUNT(*) AS count FROM stocking_rsvps WHERE shift_date=? AND is_extra=1')
        .bind(shiftDate).first<{ count: number }>();
      if (Number(extras?.count ?? 0) >= MAX_EXTRAS_PER_DAY) throw new StockingError('That day already has a lot of extra people.');
      statements.push(db.prepare(`INSERT INTO stocking_rsvps
        (shift_date,name_key,name,status,is_extra,created_at,updated_at) VALUES (?,?,?,'in',1,?,?)
        ON CONFLICT(shift_date,name_key) DO UPDATE SET name=excluded.name, status='in', is_extra=1, updated_at=excluded.updated_at`)
        .bind(shiftDate, key, name, stamp, stamp));
      details = `${name} added for ${dayLabel(shiftDate)} only`;
      break;
    }

    case 'remove-extra': {
      shiftDate = weekDate(input.date, week);
      weekday = weekdayOf(shiftDate);
      if (dayPhase(shiftDate, today) === 'past') throw new StockingError(`${WEEKDAY_NAMES[weekday]} is already over.`);
      const key = nameKey(cleanName(input.name));
      const extra = await extraEntry(shiftDate, key);
      if (!extra) throw new StockingError('That person was already removed. Refresh the page.');
      statements.push(db.prepare('DELETE FROM stocking_rsvps WHERE shift_date=? AND name_key=? AND is_extra=1').bind(shiftDate, key));
      details = `${extra.name} removed from ${dayLabel(shiftDate)}`;
      break;
    }

    case 'roster-add': {
      weekday = cleanWeekday(input.weekday);
      const name = cleanName(input.name);
      const key = nameKey(name);
      if (await lineupEntry(weekday, key)) throw new StockingError(`${name} is already on ${WEEKDAY_NAMES[weekday]}s.`);
      const size = await db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(sort_order),0) AS last FROM stocking_roster WHERE weekday=?')
        .bind(weekday).first<{ count: number; last: number }>();
      if (Number(size?.count ?? 0) >= MAX_LINEUP_PER_DAY) throw new StockingError(`${WEEKDAY_NAMES[weekday]} already has ${MAX_LINEUP_PER_DAY} people.`);
      statements.push(db.prepare(`INSERT OR IGNORE INTO stocking_roster
        (id,weekday,name,name_key,is_lead,phone,sort_order,created_at,updated_at) VALUES (?,?,?,?,0,NULL,?,?,?)`)
        .bind(crypto.randomUUID(), weekday, name, key, Number(size?.last ?? 0) + 1, stamp, stamp));
      details = `${name} added to the ${WEEKDAY_NAMES[weekday]} lineup`;
      break;
    }

    case 'roster-remove': {
      const id = cleanRosterId(input.id);
      const row = await db.prepare('SELECT weekday,name,is_lead FROM stocking_roster WHERE id=?').bind(id)
        .first<{ weekday: number; name: string; is_lead: number }>();
      if (!row) throw new StockingError('That person was already removed. Refresh the page.');
      weekday = row.weekday;
      statements.push(db.prepare('DELETE FROM stocking_roster WHERE id=?').bind(id));
      details = `${row.name} removed from the ${WEEKDAY_NAMES[row.weekday]} lineup${row.is_lead ? ' (was lead)' : ''}`;
      break;
    }

    case 'roster-lead': {
      const id = cleanRosterId(input.id);
      const row = await db.prepare('SELECT weekday,name,is_lead FROM stocking_roster WHERE id=?').bind(id)
        .first<{ weekday: number; name: string; is_lead: number }>();
      if (!row) throw new StockingError('That person isn’t on the lineup anymore. Refresh the page.');
      if (row.is_lead) return getStockingState(now);
      weekday = row.weekday;
      statements.push(
        db.prepare('UPDATE stocking_roster SET is_lead=0, updated_at=? WHERE weekday=? AND is_lead=1').bind(stamp, row.weekday),
        db.prepare('UPDATE stocking_roster SET is_lead=1, updated_at=? WHERE id=?').bind(stamp, id),
      );
      details = `${row.name} is now the ${WEEKDAY_NAMES[row.weekday]} lead`;
      break;
    }

    case 'roster-phone': {
      const id = cleanRosterId(input.id);
      const row = await db.prepare('SELECT weekday,name,is_lead,phone FROM stocking_roster WHERE id=?').bind(id)
        .first<{ weekday: number; name: string; is_lead: number; phone: string | null }>();
      if (!row) throw new StockingError('That person isn’t on the lineup anymore. Refresh the page.');
      if (!row.is_lead) throw new StockingError('Only the lead’s number is shown. Make them the lead first.');
      const phone = cleanPhone(input.phone);
      if (phone === row.phone) return getStockingState(now);
      weekday = row.weekday;
      statements.push(db.prepare('UPDATE stocking_roster SET phone=?, updated_at=? WHERE id=?').bind(phone, stamp, id));
      details = phone ? `${row.name}’s phone number was updated` : `${row.name}’s phone number was removed`;
      break;
    }

    case 'closure-add': {
      if (!isDateOnly(input.start)) throw new StockingError('Pick the first day with no stocking.');
      const start = input.start;
      const end = input.end ? input.end : start;
      if (!isDateOnly(end)) throw new StockingError('Pick a valid last day.');
      if (end < start) throw new StockingError('The last day has to be on or after the first day.');
      if (end < today) throw new StockingError('Those days have already passed.');
      if (end > addDays(start, MAX_CLOSURE_DAYS)) throw new StockingError(`Keep it under ${MAX_CLOSURE_DAYS} days at a time.`);
      if (end <= addDays(start, 1) && [0, 6].includes(weekdayOf(start)) && [0, 6].includes(weekdayOf(end))) {
        throw new StockingError('That’s only a weekend. There’s no stocking on weekends anyway.');
      }
      const reason = cleanReason(input.reason);
      const upcoming = await db.prepare('SELECT COUNT(*) AS count FROM stocking_closures WHERE end_date >= ?').bind(today).first<{ count: number }>();
      if (Number(upcoming?.count ?? 0) >= MAX_UPCOMING_CLOSURES) throw new StockingError('That’s a lot of no-stocking days. Remove some old ones first.');
      statements.push(db.prepare('INSERT INTO stocking_closures (id,start_date,end_date,reason,created_at) VALUES (?,?,?,?,?)')
        .bind(crypto.randomUUID(), start, end, reason, stamp));
      shiftDate = start;
      details = `No stocking ${formatRange(start, end)}${reason ? ` (${reason})` : ''}`;
      break;
    }

    case 'closure-remove': {
      const id = cleanRosterId(input.id);
      const row = await db.prepare('SELECT start_date,end_date,reason FROM stocking_closures WHERE id=?').bind(id)
        .first<{ start_date: string; end_date: string; reason: string }>();
      if (!row) throw new StockingError('That was already removed. Refresh the page.');
      statements.push(db.prepare('DELETE FROM stocking_closures WHERE id=?').bind(id));
      shiftDate = row.start_date;
      details = `Stocking back on ${formatRange(row.start_date, row.end_date)}${row.reason ? ` (was ${row.reason})` : ''}`;
      break;
    }

    default:
      throw new StockingError('Unknown action.');
  }

  statements.push(
    db.prepare('INSERT INTO stocking_log (id,shift_date,weekday,action,actor_name,details,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), shiftDate, weekday, action, actor, details, stamp),
    db.prepare('DELETE FROM stocking_log WHERE created_at < ?')
      .bind(new Date(now.getTime() - LOG_RETENTION_DAYS * 86_400_000).toISOString()),
    db.prepare(`INSERT INTO stocking_meta (key,value,updated_at) VALUES ('version',?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).bind(crypto.randomUUID(), stamp),
  );
  await db.batch(statements);
  return getStockingState(now);
}

/** Aug 1 of the school year that contains `today`. */
function schoolYearStart(today: string) {
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 8 ? `${year}-08-01` : `${year - 1}-08-01`;
}

type HistoryRow = { shift_date: string; name_key: string; name: string; status: string; is_extra: number; updated_at: string };

/**
 * Who stocked (tapped "I can make it" on the day) and who said they couldn't,
 * for every day so far this school year. Answers are never deleted, so this is
 * the permanent record; only days up to today are included.
 */
export async function getStockingHistory(now = new Date()): Promise<StockingHistory> {
  await ensureStocking();
  const today = chicagoToday(now);
  const since = schoolYearStart(today);
  const result = await getRawDb().prepare(`SELECT shift_date,name_key,name,status,is_extra,updated_at FROM stocking_rsvps
    WHERE shift_date BETWEEN ? AND ? AND status IN ('in','out') ORDER BY shift_date DESC, updated_at`).bind(since, today).all<HistoryRow>();
  const rows = result.results ?? [];

  const days = new Map<string, StockingHistoryDay>();
  const people = new Map<string, StockingHistoryPerson>();
  for (const row of rows) {
    const day = days.get(row.shift_date) ?? { date: row.shift_date, stocked: [], out: [] };
    days.set(row.shift_date, day);
    // Rows come newest day first, so the first name seen is the most recent spelling.
    const person = people.get(row.name_key) ?? { name: row.name, stocked: 0, out: 0, lastStocked: null };
    people.set(row.name_key, person);
    if (row.status === 'in') {
      day.stocked.push(row.name);
      person.stocked += 1;
      person.lastStocked ??= row.shift_date;
    } else {
      day.out.push(row.name);
      person.out += 1;
    }
  }
  return {
    today,
    since,
    days: [...days.values()],
    people: [...people.values()].sort((a, b) => b.stocked - a.stocked || a.out - b.out || a.name.localeCompare(b.name)),
  };
}

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Every recorded answer up to today, oldest first, as CSV for Sheets or Excel. */
export async function getStockingHistoryCsv(now = new Date()) {
  await ensureStocking();
  const today = chicagoToday(now);
  const result = await getRawDb().prepare(`SELECT shift_date,name_key,name,status,is_extra,updated_at FROM stocking_rsvps
    WHERE shift_date <= ? AND status IN ('in','out') ORDER BY shift_date, name_key`).bind(today).all<HistoryRow>();
  const lines = [['date', 'day', 'name', 'answer', 'added just that day', 'answered at (Chicago)'].join(',')];
  for (const row of result.results ?? []) {
    lines.push([
      row.shift_date,
      WEEKDAY_NAMES[weekdayOf(row.shift_date)],
      row.name,
      row.status === 'in' ? 'stocked' : 'couldn’t make it',
      row.is_extra ? 'yes' : 'no',
      formatChicagoDateTime(row.updated_at),
    ].map(csvField).join(','));
  }
  // The BOM makes Excel read names with accents correctly; Sheets ignores it.
  return { today, csv: `\uFEFF${lines.join('\r\n')}\r\n` };
}
