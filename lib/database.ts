import { getRawDb } from '@/db';
import { buildForecastAnalytics } from '@/lib/forecast-analytics';

export type MissionRole = 'owner' | 'admin' | 'coordinator' | 'volunteer' | 'board_viewer';
export type FeatureMode = 'off' | 'review' | 'on';
// Raw D1 rows are progressively shaped into role-specific API payloads below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

export type MissionUser = {
  id: string;
  email: string;
  name: string;
  role: MissionRole;
  status: string;
};

const TRACKER_AUTO_SYNC_INTERVAL_MS = 5 * 60_000;
const TRACKER_AUTO_SYNC_LEASE_MS = 90_000;
const CABINET_BIN_COUNT = 5;
const SNACKS_PER_BIN = 50;
const FULL_CABINET_CAPACITY = CABINET_BIN_COUNT * SNACKS_PER_BIN;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'volunteer', status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approved_emails (
    email TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL, added_by TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cabinets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, floor INTEGER NOT NULL, location TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 250, status TEXT NOT NULL DEFAULT 'unknown',
    active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL,
    sensor_ready INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, supplier TEXT,
    package_size TEXT, units_per_case INTEGER, cost_per_case REAL,
    nutrition_score INTEGER NOT NULL DEFAULT 3, allergen_flags TEXT NOT NULL DEFAULT '[]',
    dietary_labels TEXT NOT NULL DEFAULT '[]', popularity_score INTEGER NOT NULL DEFAULT 50,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inventory (
    cabinet_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER,
    target_quantity INTEGER NOT NULL DEFAULT 40, last_counted_at TEXT, last_counted_by TEXT,
    PRIMARY KEY (cabinet_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cabinet_checks (
    id TEXT PRIMARY KEY, external_id TEXT UNIQUE, source_fingerprint TEXT UNIQUE,
    import_batch_id TEXT, source_row INTEGER, cabinet_id TEXT NOT NULL,
    checked_at TEXT NOT NULL, original_timestamp TEXT,
    source_timezone TEXT NOT NULL DEFAULT 'America/Chicago', checker_name TEXT, user_id TEXT, door_status TEXT,
    trash_present INTEGER NOT NULL DEFAULT 0, bg_needed INTEGER NOT NULL DEFAULT 0,
    is_empty INTEGER, snack_summary TEXT, notes TEXT,
    validation_issues TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'mission-control', created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, source_reference TEXT NOT NULL,
    imported_by TEXT, imported_at TEXT NOT NULL, parser_version TEXT NOT NULL,
    total_rows INTEGER NOT NULL, inserted_rows INTEGER NOT NULL, duplicate_rows INTEGER NOT NULL,
    warning_rows INTEGER NOT NULL, quarantined_rows INTEGER NOT NULL, status TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inventory_events (
    id TEXT PRIMARY KEY, cabinet_id TEXT NOT NULL, product_id TEXT,
    event_type TEXT NOT NULL, quantity_delta INTEGER, quantity_after INTEGER,
    notes TEXT, user_id TEXT, occurred_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, cabinet_id TEXT,
    priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open',
    assigned_to TEXT, due_at TEXT, completed_at TEXT, instructions TEXT,
    source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS volunteer_shifts (
    id TEXT PRIMARY KEY, user_id TEXT, volunteer_name TEXT NOT NULL, shift_date TEXT NOT NULL,
    start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY, donor_label TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    received_at TEXT NOT NULL, campaign TEXT, restriction TEXT,
    status TEXT NOT NULL DEFAULT 'received', attributed_snacks INTEGER NOT NULL DEFAULT 0,
    attribution_type TEXT NOT NULL DEFAULT 'estimated', notes TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY, vendor TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    purchased_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'recorded',
    receipt_url TEXT, snack_units INTEGER, donation_id TEXT, notes TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, cabinet_id TEXT NOT NULL, kind TEXT NOT NULL,
    submitted_name TEXT, product_request TEXT, message TEXT, status TEXT NOT NULL DEFAULT 'new', submitted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
    topic TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new', submitted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT NOT NULL,
    category TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'review',
    requires_setup INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', summary TEXT NOT NULL, metrics_json TEXT NOT NULL,
    created_at TEXT NOT NULL, published_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT, details TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sensors (
    id TEXT PRIMARY KEY, cabinet_id TEXT NOT NULL, label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned', last_seen_at TEXT, battery_percent INTEGER,
    tare_grams REAL, calibration_json TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_checks_cabinet_date ON cabinet_checks(cabinet_id, checked_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_checks_source ON cabinet_checks(source)`,
  `CREATE INDEX IF NOT EXISTS idx_events_cabinet_product_date ON inventory_events(cabinet_id, product_id, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_status_date ON feedback(status, submitted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_inquiries_status_date ON inquiries(status, submitted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_donation ON purchases(donation_id)`,
];

const cabinetSeeds = [
  ['cabinet-1', 'Cabinet 1', 2, 'Balcony · water fountain', 1],
  ['cabinet-2', 'Cabinet 2', 2, 'Math wing', 2],
  ['cabinet-3', 'Cabinet 3', 3, 'Northside · math hallway', 3],
  ['cabinet-4', 'Cabinet 4', 4, 'Main staircase', 4],
] as const;

const productSeeds = [
  ['nature-valley', 'Nature Valley bars', 'Granola & protein bars', 'Contains tree nuts', 36, null, 62],
  ['breakfast-bars', 'Breakfast bars', 'Breakfast bars', 'Varies by product', 48, null, 88],
  ['fruit-pouches', 'Fruit pouches', 'Fruit', 'None declared', 24, null, 84],
  ['goldfish', 'Goldfish crackers', 'Savory snacks', 'Contains wheat and milk', 30, null, 90],
  ['fig-bars', 'Fig bars', 'Breakfast bars', 'Contains wheat', 36, null, 78],
] as const;

const featureSeeds = [
  ['outbound_delivery', 'External delivery master gate', 'Emergency stop for every automated email or other external action.', 'Safety', 'off', 0],
  ['depletion_forecasts', 'Depletion forecasts', 'Predicts cabinet and product stockout risk as quantitative history grows.', 'Intelligence', 'review', 0],
  ['purchasing_recommendations', 'Purchasing recommendations', 'Balances price, nutrition, allergens, popularity, and stock need.', 'Intelligence', 'review', 0],
  ['email_alerts', 'Email alerts', 'Delivers approved low-stock and uncovered-route alerts.', 'Outbound', 'off', 1],
  ['weekly_reports', 'Weekly impact email', 'Prepares and sends the weekly internal operating report.', 'Outbound', 'review', 1],
  ['monthly_board_pdf', 'Monthly board PDF', 'Generates a board-ready monthly packet.', 'Reports', 'review', 0],
  ['public_impact', 'Public impact dashboard', 'Publishes approved aggregate impact numbers at /impact.', 'Public', 'review', 0],
  ['anonymous_feedback', 'QR feedback', 'Collects cabinet updates, snack requests, and optional notes.', 'Public', 'on', 0],
] as const;

let initialized: Promise<void> | null = null;

export async function ensureDatabase() {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = getRawDb();
    await db.batch(schemaStatements.map((sql) => db.prepare(sql)));
    const checkColumns = await db.prepare('PRAGMA table_info(cabinet_checks)').all<{ name: string }>();
    const existingColumns = new Set(checkColumns.results.map((column) => column.name));
    const columnMigrations = [
      ['source_fingerprint', 'TEXT'],
      ['import_batch_id', 'TEXT'],
      ['source_row', 'INTEGER'],
      ['original_timestamp', 'TEXT'],
      ['source_timezone', "TEXT NOT NULL DEFAULT 'America/Chicago'"],
      ['validation_issues', "TEXT NOT NULL DEFAULT '[]'"],
    ] as const;
    for (const [name, definition] of columnMigrations) {
      if (!existingColumns.has(name)) await db.prepare(`ALTER TABLE cabinet_checks ADD COLUMN ${name} ${definition}`).run();
    }
    const purchaseColumns = await db.prepare('PRAGMA table_info(purchases)').all<{ name: string }>();
    const existingPurchaseColumns = new Set(purchaseColumns.results.map((column) => column.name));
    if (!existingPurchaseColumns.has('snack_units')) await db.prepare('ALTER TABLE purchases ADD COLUMN snack_units INTEGER').run();
    if (!existingPurchaseColumns.has('donation_id')) await db.prepare('ALTER TABLE purchases ADD COLUMN donation_id TEXT').run();
    const feedbackColumns = await db.prepare('PRAGMA table_info(feedback)').all<{ name: string }>();
    if (!feedbackColumns.results.some((column) => column.name === 'submitted_name')) await db.prepare('ALTER TABLE feedback ADD COLUMN submitted_name TEXT').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_checks_import_batch ON cabinet_checks(import_batch_id, source_row)').run();
    const now = new Date().toISOString();
    await db.batch([
      ...cabinetSeeds.map((c) =>
        db.prepare(`INSERT OR IGNORE INTO cabinets
          (id,name,floor,location,capacity,status,active,sort_order,sensor_ready,created_at)
          VALUES (?,?,?,?,250,'unknown',1,?,0,?)`).bind(c[0], c[1], c[2], c[3], c[4], now),
      ),
      ...productSeeds.map((p) =>
        db.prepare(`INSERT OR IGNORE INTO products
          (id,name,category,supplier,package_size,units_per_case,cost_per_case,nutrition_score,allergen_flags,dietary_labels,popularity_score,active,created_at)
          VALUES (?,?,?,'To be confirmed','case',?,?,3,?, '[]',?,1,?)`)
          .bind(p[0], p[1], p[2], p[4], p[5], JSON.stringify(p[3] === 'None declared' ? [] : [p[3]]), p[6], now),
      ),
      ...featureSeeds.map((f) =>
        db.prepare(`INSERT OR IGNORE INTO feature_flags
          (key,label,description,category,mode,requires_setup,updated_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(...f, now),
      ),
      db.prepare(`INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES ('baseline_snacks','12000',?)`).bind(now),
      db.prepare(`INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES ('baseline_students','1300',?)`).bind(now),
      db.prepare(`INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES ('launch_date','2026-05-13',?)`).bind(now),
      db.prepare(`INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES ('estimated_cost_per_snack','0.50',?)`).bind(now),
      db.prepare("DELETE FROM feature_flags WHERE key='sensor_ingestion'"),
      db.prepare("DELETE FROM feature_flags WHERE key='ai_briefing'"),
      db.prepare("UPDATE feature_flags SET label='QR feedback',description='Collects cabinet updates, snack requests, and optional notes.',updated_at=? WHERE key='anonymous_feedback'").bind(now),
    ]);
    const cabinetLayout = await db.prepare("SELECT value FROM settings WHERE key='cabinet_layout_5x50_v1'").first<{ value: string }>();
    if (!cabinetLayout) {
      await db.batch([
        ...cabinetSeeds.map((cabinet) => db.prepare('UPDATE cabinets SET capacity=? WHERE id=?').bind(FULL_CABINET_CAPACITY, cabinet[0])),
        db.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('cabinet_layout_5x50_v1','complete',?)").bind(now),
      ]);
    }
    const inv: D1PreparedStatement[] = [];
    for (const c of cabinetSeeds) for (const p of productSeeds) {
      inv.push(db.prepare(`INSERT OR IGNORE INTO inventory
        (cabinet_id,product_id,quantity,target_quantity) VALUES (?,?,NULL,40)`).bind(c[0], p[0]));
    }
    await db.batch(inv);
    const priceCleanup = await db.prepare("SELECT value FROM settings WHERE key='seed_price_cleanup_v1'").first<{ value: string }>();
    if (!priceCleanup) {
      const seedIds = productSeeds.map((product) => product[0]);
      await db.batch([
        ...seedIds.map((id) => db.prepare("UPDATE products SET cost_per_case=NULL WHERE id=? AND supplier='To be confirmed'").bind(id)),
        db.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('seed_price_cleanup_v1','complete',?)").bind(now),
      ]);
    }
    await db.prepare('PRAGMA optimize').run();
  })().catch((error) => {
    initialized = null;
    throw error;
  });
  return initialized;
}

export async function logActivity(actorId: string | null, action: string, entityType: string, entityId?: string | null, details?: string | null) {
  const db = getRawDb();
  await db.prepare(`INSERT INTO activity_log (id,actor_id,action,entity_type,entity_id,details,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), actorId, action, entityType, entityId ?? null, details ?? null, new Date().toISOString()).run();
}

function safeJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

function clientIdempotencyKey(payload: Record<string, unknown>) {
  const key = String(payload.idempotencyKey ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new Error('This request is missing a valid confirmation key. Reopen the form and try again.');
  return key;
}

function isValidDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function chicagoDateOnly(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function chicagoDateTime(raw: string) {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return raw;
  const [, month, day, year, hour, minute, second] = m;
  const intended = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let instant = intended;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  // Iteratively convert a wall-clock Chicago time to UTC so winter checks use
  // CST and summer checks use CDT. Ambiguous fall-back times resolve to the
  // first occurrence, which preserves the form's chronological ordering.
  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    const correction = intended - represented;
    instant += correction;
    if (correction === 0) break;
  }
  return new Date(instant).toISOString();
}

function trackerCsvConfig() {
  const configured = process.env.TRACKER_CSV_URL?.trim();
  if (!configured) throw new Error('Tracker sync is not configured on this deployment.');
  const url = new URL(configured);
  if (url.protocol !== 'https:') throw new Error('Tracker sync requires an HTTPS source.');
  return {
    url: url.toString(),
    token: process.env.TRACKER_SYNC_BEARER_TOKEN?.trim() || null,
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cabinetIdFromLabel(label: string) {
  const numbered = label.match(/cabinet\s*(\d+)/i);
  if (numbered) return `cabinet-${numbered[1]}`;
  if (/balcony|water fountain/i.test(label)) return 'cabinet-1';
  if (/math wing/i.test(label)) return 'cabinet-2';
  if (/northside|math hallway/i.test(label)) return 'cabinet-3';
  if (/main staircase|floor 4/i.test(label)) return 'cabinet-4';
  return 'cabinet-1';
}

export async function importTrackerHistory(actorId: string | null) {
  await ensureDatabase();
  const tracker = trackerCsvConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(tracker.url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/csv',
        'User-Agent': 'SFS-Mission-Control/1.0',
        ...(tracker.token ? { Authorization: `Bearer ${tracker.token}` } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Tracker sync timed out. Try again shortly.');
    throw new Error('Tracker sync could not reach its private source.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Tracker import failed with status ${response.status}.`);
  const csv = await response.text();
  if (csv.length > 5_000_000) throw new Error('Tracker export is unexpectedly large.');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('The tracker sheet did not contain any rows.');
  const labels = rows[0].map((label) => label.toLowerCase().trim());
  const timestampIndex = labels.findIndex((label) => label === 'timestamp');
  const cabinetIndex = labels.findIndex((label) => label.startsWith('which cabinet'));
  const whoIndex = labels.findIndex((label) => label.startsWith('who is filling'));
  const indexes = (prefix: string) => labels.flatMap((label, index) => label.startsWith(prefix) ? [index] : []);
  const doorIndexes = indexes('are the doors closed');
  const trashIndexes = indexes('is there trash');
  const bgIndexes = indexes('if yes to previous');
  const emptyIndexes = indexes('is it empty');
  const snackIndexes = indexes('what snacks');
  const noteIndexes = indexes('provide specific info');
  if (timestampIndex < 0 || cabinetIndex < 0 || [doorIndexes, trashIndexes, bgIndexes, emptyIndexes, snackIndexes, noteIndexes].some((group) => !group.length)) {
    throw new Error('Tracker form columns changed. No rows were imported; review the source mapping.');
  }
  const db = getRawDb();
  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();
  let imported = 0;
  let warnings = 0;
  let quarantined = 0;
  let considered = 0;
  const statements: D1PreparedStatement[] = [];

  for (const [offset, row] of rows.slice(1).entries()) {
    if (!row.some((cell) => cell.trim())) continue;
    const rawCabinet = row[cabinetIndex]?.trim() ?? '';
    const rawTimestamp = row[timestampIndex]?.trim() ?? '';
    if (!rawCabinet || !rawTimestamp) { quarantined++; continue; }
    considered++;
    const cabinetMatch = rawCabinet.match(/cabinet\s*(\d+)/i);
    const cabinetNumber = cabinetMatch ? Number(cabinetMatch[1]) : /balcony|water fountain/i.test(rawCabinet) ? 1 : 0;
    const fieldsByBlock = [doorIndexes, trashIndexes, bgIndexes, emptyIndexes, snackIndexes, noteIndexes];
    const populatedBlocks = Array.from({ length: Math.min(...fieldsByBlock.map((group) => group.length)) }, (_, block) =>
      fieldsByBlock.some((group) => Boolean(row[group[block]]?.trim())),
    ).flatMap((populated, index) => populated ? [index] : []);
    let blockIndex = cabinetNumber >= 1 ? cabinetNumber - 1 : -1;
    const issues: string[] = [];
    if (blockIndex < 0 || !populatedBlocks.includes(blockIndex)) {
      if (populatedBlocks.length === 1) blockIndex = populatedBlocks[0];
      else { quarantined++; continue; }
    }
    if (populatedBlocks.length > 1) issues.push('multiple cabinet response sections contained data');
    if (cabinetNumber && blockIndex !== cabinetNumber - 1) issues.push('selected cabinet did not match populated response section');
    const at = (group: number[]) => row[group[blockIndex]]?.trim() ?? '';
    const emptyRaw = at(emptyIndexes);
    const snackSummary = at(snackIndexes);
    if (/^yes/i.test(emptyRaw) && snackSummary) issues.push('reported empty while also listing remaining snacks');
    if (/^no/i.test(emptyRaw) && !snackSummary) issues.push('reported not empty without listing remaining snacks');
    if (issues.length) warnings++;
    const fingerprint = `sheet-${stableHash(`sfs-tracker-v1|${row.join('|')}`)}`;
    const externalId = `tracker-${stableHash(row.join('|'))}`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO cabinet_checks
      (id,external_id,source_fingerprint,import_batch_id,source_row,cabinet_id,checked_at,original_timestamp,source_timezone,
       checker_name,user_id,door_status,trash_present,bg_needed,is_empty,snack_summary,notes,validation_issues,source,created_at)
      VALUES (?,?,?,?,?,?,?,?, 'America/Chicago', ?,NULL,?,?,?,?,?,?,?,'legacy-tracker',?)`)
      .bind(
        crypto.randomUUID(), externalId, fingerprint, batchId, offset + 2,
        cabinetIdFromLabel(rawCabinet), chicagoDateTime(rawTimestamp), rawTimestamp,
        row[whoIndex]?.trim() || null, at(doorIndexes) || null,
        /^yes/i.test(at(trashIndexes)) ? 1 : 0,
        /^yes/i.test(at(bgIndexes)) ? 1 : 0,
        /^yes/i.test(emptyRaw) ? 1 : /^no/i.test(emptyRaw) ? 0 : null,
        snackSummary || null, at(noteIndexes) || null, JSON.stringify(issues), now,
      ));
  }
  if (!considered || !statements.length) throw new Error('Tracker sync found no valid cabinet rows. Nothing was changed.');
  for (let index = 0; index < statements.length; index += 40) {
    const result = await db.batch(statements.slice(index, index + 40));
    imported += result.reduce((sum, item) => sum + Number(item.meta?.changes ?? 0), 0);
  }
  await db.prepare(`INSERT INTO import_batches
    (id,source,source_reference,imported_by,imported_at,parser_version,total_rows,inserted_rows,duplicate_rows,warning_rows,quarantined_rows,status)
    VALUES (?,'legacy-google-sheet','private-server-config',?,?,'2.1',?,?,?,?,?,'complete')`)
    .bind(batchId, actorId, now, considered, imported, considered - imported, warnings, quarantined).run();
  await db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('tracker_last_import',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).bind(now, now).run();
  await logActivity(actorId, 'imported tracker history', 'cabinet_check', null, `${imported} new of ${statements.length} total rows`);
  return { imported, total: statements.length, warnings, quarantined, at: now };
}

async function autoImportTrackerIfNeeded(actorId: string) {
  if (!process.env.TRACKER_CSV_URL?.trim()) return;
  const db = getRawDb();
  const lastSync = await db.prepare("SELECT MAX(updated_at) AS updated_at FROM settings WHERE key IN ('tracker_last_import','tracker_last_attempt')")
    .first<{ updated_at: string | null }>();
  const lastSyncMs = new Date(lastSync?.updated_at ?? '').getTime();
  if (Number.isFinite(lastSyncMs) && Date.now() - lastSyncMs < TRACKER_AUTO_SYNC_INTERVAL_MS) return;

  const now = new Date().toISOString();
  const leaseId = crypto.randomUUID();
  const staleBefore = new Date(Date.now() - TRACKER_AUTO_SYNC_LEASE_MS).toISOString();
  await db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('tracker_auto_sync_lease',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE settings.updated_at<?`).bind(leaseId, now, staleBefore).run();
  const lease = await db.prepare("SELECT value FROM settings WHERE key='tracker_auto_sync_lease'").first<{ value: string }>();
  if (lease?.value !== leaseId) return;
  await db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('tracker_last_attempt',?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(now, now).run();

  try {
    await importTrackerHistory(actorId);
  } catch (error) {
    await logActivity(actorId, 'tracker import needs attention', 'integration', 'legacy-tracker', error instanceof Error ? error.message : String(error));
  } finally {
    await db.prepare("DELETE FROM settings WHERE key='tracker_auto_sync_lease' AND value=?").bind(leaseId).run();
  }
}

function statusFromLatest(latest: Record<string, unknown> | undefined) {
  if (!latest) return { state: 'unknown', label: 'Needs first check', severity: 'unknown' };
  if (latest.source === 'after-school-restock') return { state: 'fully-restocked', label: 'Fully restocked', severity: 'good' };
  if (Number(latest.is_empty) === 1) return { state: 'empty', label: 'Reported empty', severity: 'critical' };
  if (Number(latest.bg_needed) === 1) return { state: 'facilities', label: 'Facilities needed', severity: 'warning' };
  if (Number(latest.trash_present) === 1) return { state: 'attention', label: 'Needs attention', severity: 'warning' };
  if (latest.is_empty !== null && Number(latest.is_empty) === 0) return { state: 'stocked', label: 'Snacks reported', severity: 'good' };
  if (String(latest.snack_summary ?? '').trim()) return { state: 'stocked', label: 'Snacks reported', severity: 'good' };
  return { state: 'unknown', label: 'Condition unanswered', severity: 'unknown' };
}

export async function getMissionControlData(user: MissionUser) {
  await ensureDatabase();
  await autoImportTrackerIfNeeded(user.id);
  const db = getRawDb();
  const [cabinetRows, productRows, inventoryRows, eventRows, checkRows, analyticsCheckRows, taskRows, donationRows, purchaseRows, feedbackRows, inquiryRows, featureRows, reportRows, shiftRows, activityRows, settingsRows, totals] = await Promise.all([
    db.prepare('SELECT * FROM cabinets WHERE active=1 ORDER BY sort_order').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM products WHERE active=1 ORDER BY popularity_score DESC, name').all<Record<string, unknown>>(),
    db.prepare(`SELECT i.*, p.name AS product_name, p.category, p.units_per_case, p.cost_per_case,
      p.popularity_score, p.nutrition_score, p.allergen_flags, p.dietary_labels
      FROM inventory i JOIN products p ON p.id=i.product_id ORDER BY i.cabinet_id,p.popularity_score DESC`).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM inventory_events ORDER BY occurred_at DESC LIMIT 5000').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM cabinet_checks ORDER BY checked_at DESC LIMIT 1200').all<Record<string, unknown>>(),
    db.prepare(`SELECT id,cabinet_id,checked_at,is_empty,source,snack_summary,validation_issues
      FROM cabinet_checks ORDER BY checked_at ASC LIMIT 10000`).all<Record<string, unknown>>(),
    db.prepare("SELECT t.*, c.name AS cabinet_name FROM tasks t LEFT JOIN cabinets c ON c.id=t.cabinet_id ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.due_at, t.created_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM donations ORDER BY received_at DESC LIMIT 100').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM purchases ORDER BY purchased_at DESC LIMIT 100').all<Record<string, unknown>>(),
    db.prepare("SELECT f.*, c.name AS cabinet_name FROM feedback f JOIN cabinets c ON c.id=f.cabinet_id ORDER BY submitted_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare("SELECT * FROM inquiries ORDER BY submitted_at DESC LIMIT 100").all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM feature_flags ORDER BY category,label').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 50').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM volunteer_shifts ORDER BY shift_date,start_time LIMIT 100').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 30').all<Record<string, unknown>>(),
    db.prepare('SELECT key,value,updated_at FROM settings').all<Record<string, unknown>>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM cabinet_checks) AS total_checks,
      (SELECT COUNT(*) FROM cabinet_checks WHERE source='legacy-tracker') AS tracker_checks,
      (SELECT COUNT(*) FROM cabinet_checks WHERE is_empty=1) AS empty_reports,
      (SELECT COALESCE(SUM(amount_cents),0) FROM donations) AS donation_cents,
      (SELECT COALESCE(SUM(attributed_snacks),0) FROM donations) AS donation_snacks,
      (SELECT COALESCE(SUM(CASE WHEN attribution_type='purchase-linked' THEN attributed_snacks ELSE 0 END),0) FROM donations) AS purchase_linked_donation_snacks,
      (SELECT COALESCE(SUM(CASE WHEN attribution_type='estimated' THEN attributed_snacks ELSE 0 END),0) FROM donations) AS estimated_donation_snacks,
      (SELECT COUNT(*) FROM tasks WHERE status='complete') AS completed_tasks,
      (SELECT COUNT(*) FROM tasks WHERE status!='complete') AS open_tasks,
      (SELECT COUNT(*) FROM feedback WHERE status='new') AS feedback_new,
      (SELECT COUNT(*) FROM inquiries WHERE status='new') AS inquiries_new`).first<Record<string, unknown>>(),
  ]);
  const cabinets = cabinetRows.results as DbRow[];
  const products = (productRows.results as DbRow[]).map((row) => ({
    ...row,
    allergen_flags: safeJson(row.allergen_flags, []),
    dietary_labels: safeJson(row.dietary_labels, []),
  }) as DbRow);
  const checks = checkRows.results as DbRow[];
  const inventory = inventoryRows.results as DbRow[];
  const inventoryEvents = eventRows.results as DbRow[];
  const featureModes = Object.fromEntries(featureRows.results.map((row) => [String(row.key), String(row.mode)]));
  const now = Date.now();
  const latestByCabinet = new Map<string, Record<string, unknown>>();
  for (const check of checks) if (!latestByCabinet.has(String(check.cabinet_id))) latestByCabinet.set(String(check.cabinet_id), check);
  const recentChecks = checks.filter((check) => {
    const time = new Date(String(check.checked_at)).getTime();
    return check.source !== 'after-school-restock' && Number.isFinite(time) && now - time < 30 * 86400000;
  });

  const cabinetCards = cabinets.map((cabinet) => {
    const id = String(cabinet.id);
    const latest = latestByCabinet.get(id);
    const recent = recentChecks.filter((check) => check.cabinet_id === id && check.is_empty !== null);
    const emptyCount = recent.filter((check) => Number(check.is_empty) === 1).length;
    const emptyRate = recent.length ? Math.round((emptyCount / recent.length) * 100) : null;
    const inv = inventory.filter((item) => item.cabinet_id === id);
    const known = inv.filter((item) => item.quantity !== null);
    const quantityKnown = known.length === inv.length && inv.length > 0;
    const countedTimes = known.map((item) => new Date(String(item.last_counted_at ?? '')).getTime());
    const completeSnapshot = quantityKnown && countedTimes.length === inv.length
      && countedTimes.every(Number.isFinite)
      && Math.max(...countedTimes) - Math.min(...countedTimes) <= 5 * 60_000;
    const inventoryCountMs = completeSnapshot ? Math.max(...countedTimes) : NaN;
    const inventoryAgeHours = Number.isFinite(inventoryCountMs) ? Math.max(0, Math.round((now - inventoryCountMs) / 3_600_000)) : null;
    const quantity = known.reduce((sum, item) => sum + Number(item.quantity), 0);
    const target = Number(cabinet.capacity) || FULL_CABINET_CAPACITY;
    const productForecasts = featureModes.depletion_forecasts === 'off' ? [] : known.flatMap((item) => {
      const itemCountMs = new Date(String(item.last_counted_at ?? '')).getTime();
      if (!Number.isFinite(itemCountMs) || now - itemCountMs > 24 * 3_600_000) return [];
      const history = inventoryEvents
        .filter((event) => event.cabinet_id === id && (
          event.event_type === 'full_restock'
          || (event.product_id === item.product_id && event.event_type === 'count')
        ))
        .sort((a, b) => new Date(String(a.occurred_at)).getTime() - new Date(String(b.occurred_at)).getTime());
      const intervals: Array<{ consumed: number; hours: number; date: string }> = [];
      let previousCount: DbRow | null = null;
      for (const event of history) {
        if (event.event_type === 'full_restock') {
          // A program-wide full restock proves the cabinet total, but not its
          // product mix. The first later product count starts a new cycle.
          previousCount = null;
          continue;
        }
        const occurredAt = new Date(String(event.occurred_at));
        const quantityAfter = Number(event.quantity_after);
        if (!Number.isFinite(occurredAt.getTime()) || !Number.isFinite(quantityAfter)) {
          previousCount = null;
          continue;
        }
        if (previousCount) {
          const previousAt = new Date(String(previousCount.occurred_at));
          const previousQuantity = Number(previousCount.quantity_after);
          const hours = (occurredAt.getTime() - previousAt.getTime()) / 3_600_000;
          const consumed = previousQuantity - quantityAfter;
          const sameChicagoDate = chicagoDateOnly(previousAt) === chicagoDateOnly(occurredAt);
          if (Number.isFinite(previousQuantity) && consumed > 0 && hours >= 4 && hours <= 12 && sameChicagoDate) {
            intervals.push({ consumed, hours, date: chicagoDateOnly(occurredAt) });
          }
        }
        previousCount = event;
      }
      const sampleDays = new Set(intervals.map((interval) => interval.date)).size;
      if (intervals.length < 3 || sampleDays < 3) return [];
      const totalConsumed = intervals.reduce((sum, interval) => sum + interval.consumed, 0);
      const totalDays = intervals.reduce((sum, interval) => sum + interval.hours / 24, 0);
      const dailyRate = totalDays > 0 ? totalConsumed / totalDays : 0;
      if (!Number.isFinite(dailyRate) || dailyRate <= 0) return [];
      const hoursRemaining = Number(item.quantity) <= 0 ? 0 : (Number(item.quantity) / dailyRate) * 24;
      return [{
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        daily_rate: Math.round(dailyRate * 10) / 10,
        hours_remaining: Math.round(hoursRemaining),
        predicted_at: new Date(now + hoursRemaining * 3_600_000).toISOString(),
        intervals: intervals.length,
        sample_days: sampleDays,
        confidence: intervals.length >= 6 && sampleDays >= 5 ? 'high' : 'medium',
      }];
    }).sort((a, b) => a.hours_remaining - b.hours_remaining);
    const forecast = productForecasts[0] ?? null;
    let status = statusFromLatest(latest);
    const latestTime = latest ? new Date(String(latest.checked_at)).getTime() : NaN;
    const latestIsFullRestock = latest?.source === 'after-school-restock';
    const inventoryCurrent = completeSnapshot && inventoryAgeHours !== null && inventoryAgeHours <= 24
      && (!Number.isFinite(latestTime) || inventoryCountMs >= latestTime);
    if (latestIsFullRestock) {
      status = { state: 'fully-restocked', label: 'Fully restocked', severity: 'good' };
    } else if (inventoryCurrent && target) {
      const fill = quantity / target;
      if (fill <= 0.08) status = { state: 'empty', label: 'Counted nearly empty', severity: 'critical' };
      else if (fill <= 0.3) status = { state: 'low', label: 'Low stock', severity: 'warning' };
      else status = { state: 'stocked', label: 'Inventory counted', severity: 'good' };
    }
    const ageHours = Number.isFinite(latestTime) ? Math.max(0, Math.round((now - latestTime) / 3600000)) : null;
    if (status.severity === 'critical' && ageHours !== null && ageHours > 24) {
      status = { state: 'stale-empty', label: 'Empty report needs recheck', severity: 'warning' };
    } else if (status.severity === 'good' && ageHours !== null && ageHours > 24) {
      status = { state: 'stale', label: 'Condition needs recheck', severity: 'unknown' };
    } else if (status.severity === 'warning' && ageHours !== null && ageHours > 24) {
      status = { state: 'stale-attention', label: 'Issue needs recheck', severity: 'warning' };
    }
    const visibleForecast = latestIsFullRestock ? null : forecast;
    const confidence = visibleForecast?.confidence ?? (recent.length >= 8 ? 'early' : 'low');
    return {
      ...cabinet,
      latest_check: latest ?? null,
      status,
      empty_rate_30d: emptyRate,
      check_count_30d: recent.length,
      known_products: known.length,
      quantity_known: completeSnapshot,
      inventory_current: inventoryCurrent,
      inventory_age_hours: inventoryAgeHours,
      inventory_counted_at: Number.isFinite(inventoryCountMs) ? new Date(inventoryCountMs).toISOString() : null,
      quantity,
      target,
      fill_percent: latestIsFullRestock ? 100 : inventoryCurrent && target ? Math.round((quantity / target) * 100) : null,
      age_hours: ageHours,
      forecast_confidence: confidence,
      forecast: visibleForecast,
      product_forecasts: latestIsFullRestock ? [] : productForecasts,
    } as DbRow;
  });

  const recommendations = cabinetCards.flatMap((cabinet) => {
    if (cabinet.status.severity === 'critical') return [{
      id: `restock-${cabinet.id}`, kind: 'restock', priority: 'urgent', cabinet_id: cabinet.id,
      title: `Plan ${cabinet.name}'s after-school full restock`,
      detail: cabinet.inventory_current
        ? `${cabinet.quantity} snacks remain across a current complete count, so student availability may be limited until today's after-school full restock.`
        : `The latest check reported this cabinet empty, so student availability is at risk until today's after-school full restock.`,
      confidence: cabinet.inventory_current ? 'medium' : cabinet.forecast_confidence,
      action: 'Create after-school restock task',
    }];
    if (cabinet.forecast && Number(cabinet.forecast.hours_remaining) <= 48) {
      const projected = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(String(cabinet.forecast.predicted_at)));
      return [{
        id: `forecast-${cabinet.id}-${cabinet.forecast.product_id}`,
        kind: 'restock',
        priority: Number(cabinet.forecast.hours_remaining) <= 24 ? 'urgent' : 'watch',
        cabinet_id: cabinet.id,
        title: `${cabinet.forecast.product_name} may run out by ${projected}`,
        detail: `Plan to refill ${cabinet.name} to par during the next after-school full restock; student availability may be at risk meanwhile. Confirm the current count after school before recording completion.`,
        confidence: cabinet.forecast.confidence,
        action: 'Create after-school restock task',
      }];
    }
    if (cabinet.age_hours === null || cabinet.age_hours > 20) return [{
      id: `check-${cabinet.id}`, kind: 'check', priority: 'normal', cabinet_id: cabinet.id,
      title: `Check ${cabinet.name}`,
      detail: cabinet.age_hours === null ? 'No check has been recorded yet.' : `The last check was ${cabinet.age_hours} hours ago.`,
      confidence: 'high', action: 'Create check task',
    }];
    if (cabinet.status.state !== 'fully-restocked' && featureModes.depletion_forecasts !== 'off' && cabinet.empty_rate_30d !== null && cabinet.empty_rate_30d >= 40) return [{
      id: `watch-${cabinet.id}`, kind: 'forecast', priority: 'watch', cabinet_id: cabinet.id,
      title: `${cabinet.name} is running lean`,
      detail: `It was empty in ${cabinet.empty_rate_30d}% of recent checks. Add unit counts to unlock a precise depletion time.`,
      confidence: cabinet.forecast_confidence, action: 'Open cabinet',
    }];
    return [];
  });

  const settings = Object.fromEntries(settingsRows.results.map((row) => [String(row.key), String(row.value)]));
  const analytics = buildForecastAnalytics({
    checks: analyticsCheckRows.results,
    cabinets,
    inventoryEvents,
    now,
  });
  const baselineSnacks = Number(settings.baseline_snacks ?? 12000);
  const baselineStudents = Number(settings.baseline_students ?? 1300);
  const donations = donationRows.results;
  const donationCents = Number(totals?.donation_cents ?? 0);
  const donationSnacks = Number(totals?.donation_snacks ?? 0);
  const completedTasks = Number(totals?.completed_tasks ?? 0);
  const openTasks = Number(totals?.open_tasks ?? 0);
  const emptyNow = cabinetCards.filter((cabinet) => cabinet.status.severity === 'critical').length;
  const urgent = recommendations.filter((item) => item.priority === 'urgent').length;
  const latestCheckAt = checks[0]?.checked_at ? String(checks[0].checked_at) : null;
  const weightedCategoryPresence = new Map(
    analytics.presenceSignals.categories.map((signal) => [signal.category.toLowerCase(), signal.weightedMentionRatePct]),
  );
  const knownUnitCosts = products.flatMap((product) => {
    const cost = Number(product.cost_per_case);
    const units = Number(product.units_per_case);
    return cost > 0 && units > 0 ? [cost / units] : [];
  });
  const minUnitCost = knownUnitCosts.length ? Math.min(...knownUnitCosts) : 0;
  const maxUnitCost = knownUnitCosts.length ? Math.max(...knownUnitCosts) : 0;
  const purchaseRecommendations = products.map((product) => {
    const category = String(product.category).toLowerCase();
    const name = String(product.name).toLowerCase();
    const analyticsCategory = category.includes('breakfast') ? 'breakfast'
      : category.includes('fruit') ? 'fruit'
      : category.includes('granola') || category.includes('protein') ? 'bars'
      : name.includes('goldfish') || name.includes('cracker') ? 'crackers'
      : category.includes('savory') ? 'savory snacks'
      : category.includes('nut') ? 'protein & nuts' : null;
    const presenceRate = analyticsCategory ? weightedCategoryPresence.get(analyticsCategory) : undefined;
    const scarcitySignal = presenceRate === undefined ? 50 : Math.round(100 - presenceRate);
    const caseCost = Number(product.cost_per_case ?? 0);
    const units = Number(product.units_per_case ?? 0);
    const costPerSnack = units && caseCost ? caseCost / units : null;
    const priceScore = costPerSnack === null ? 50 : maxUnitCost === minUnitCost ? 80 : Math.round(100 - ((costPerSnack - minUnitCost) / (maxUnitCost - minUnitCost)) * 60);
    const score = Math.round(Number(product.popularity_score) * 0.4 + scarcitySignal * 0.25 + Number(product.nutrition_score) * 5 + priceScore * 0.1);
    return {
      product_id: product.id, name: product.name, category: product.category,
      score, cost_per_case: caseCost, units_per_case: units,
      cost_per_snack: costPerSnack,
      signal: inventory.some((item) => item.product_id === product.id && item.quantity !== null)
        ? 'Based on live unit counts' : presenceRate === undefined
          ? 'No matching availability-history category yet'
          : `Availability signal weighted ${analytics.methodology.yearWeights[0]?.weight ?? 3}× toward ${analytics.overview.currentSchoolYear}`,
      recommendation: !costPerSnack ? 'Confirm a current case price before ordering' : score >= 78 ? 'Prioritize next order' : score >= 66 ? 'Keep in rotation' : 'Order after higher-demand items',
    };
  }).sort((a, b) => b.score - a.score);

  const isAdministrator = ['owner', 'admin'].includes(user.role);
  const isCoordinator = user.role === 'coordinator';
  const isSharedAccess = user.id === 'shared-owner';
  const scrubCheck = (check: DbRow) => ({
    ...check,
    checker_name: undefined,
    user_id: undefined,
    notes: undefined,
    validation_issues: undefined,
  });
  const visibleCabinets = cabinetCards.map((cabinet) => ({
    ...cabinet,
    latest_check: cabinet.latest_check ? scrubCheck(cabinet.latest_check as DbRow) : null,
  }) as DbRow);
  const visibleChecks = isAdministrator || isCoordinator ? checks.slice(0, 100).map((row) => scrubCheck(row))
    : user.role === 'volunteer' ? checks.slice(0, 40).map((row) => scrubCheck(row))
    : [];
  const visibleTasks = user.role === 'board_viewer' ? [] : taskRows.results.map((row) =>
    user.role === 'volunteer' && row.assigned_to && row.assigned_to !== user.id && row.assigned_to !== user.email
      ? { ...row, assigned_to: 'Another volunteer' }
      : row,
  );
  return {
    user,
    authMode: 'shared-password' as const,
    cabinets: user.role === 'board_viewer' ? [] : visibleCabinets,
    products: user.role === 'board_viewer' ? [] : products,
    inventory: user.role === 'board_viewer' ? [] : inventory,
    checks: visibleChecks,
    tasks: visibleTasks,
    shifts: isAdministrator || isCoordinator ? shiftRows.results : [],
    donations: isAdministrator ? donations : [],
    purchases: isAdministrator || isCoordinator ? purchaseRows.results : [],
    feedback: isAdministrator || isCoordinator ? feedbackRows.results : [],
    inquiries: isAdministrator || isCoordinator ? inquiryRows.results : [],
    reports: (user.role === 'board_viewer'
      ? reportRows.results.filter((row) => ['sent', 'published'].includes(String(row.status)))
      : reportRows.results).map((row) => ({ ...row, metrics: safeJson(row.metrics_json, {}) })),
    features: user.role === 'board_viewer' ? [] : featureRows.results,
    featureModes,
    users: [],
    approvedEmails: [],
    activity: isAdministrator ? activityRows.results.filter((row) => !isSharedAccess || !['user', 'approved_email'].includes(String(row.entity_type))) : [],
    recommendations: user.role === 'board_viewer' ? [] : recommendations,
    purchaseRecommendations: user.role === 'board_viewer' || featureModes.purchasing_recommendations === 'off' ? [] : purchaseRecommendations,
    analytics: user.role === 'board_viewer' ? null : analytics,
    settings: isAdministrator ? settings : {},
    metrics: user.role === 'board_viewer' ? {
      baselineSnacks, baselineStudents, donationCents, donationSnacks,
      purchaseLinkedDonationSnacks: Number(totals?.purchase_linked_donation_snacks ?? 0),
      estimatedDonationSnacks: Number(totals?.estimated_donation_snacks ?? 0),
      totalChecks: Number(totals?.total_checks ?? 0), trackerChecks: Number(totals?.tracker_checks ?? 0),
      activeCabinets: cabinets.length,
      completedTasks,
    } : {
      baselineSnacks, baselineStudents, donationCents, donationSnacks,
      purchaseLinkedDonationSnacks: Number(totals?.purchase_linked_donation_snacks ?? 0),
      estimatedDonationSnacks: Number(totals?.estimated_donation_snacks ?? 0),
      totalChecks: Number(totals?.total_checks ?? 0), trackerChecks: Number(totals?.tracker_checks ?? 0), emptyReports: Number(totals?.empty_reports ?? 0),
      activeCabinets: cabinets.length, emptyNow, urgent, openTasks, completedTasks,
      feedbackNew: Number(totals?.feedback_new ?? 0),
      inquiriesNew: Number(totals?.inquiries_new ?? 0),
      latestCheckAt, trackerLastImport: settings.tracker_last_import ?? null,
      trackerSyncConfigured: Boolean(process.env.TRACKER_CSV_URL?.trim()),
    },
  };
}

export async function getPublicImpact() {
  await ensureDatabase();
  const db = getRawDb();
  const [cabinets, checks, settingsRows, donationRows, taskRows, feature] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM cabinets WHERE active=1').first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM cabinet_checks').first<{ count: number }>(),
    db.prepare('SELECT key,value FROM settings').all<Record<string, unknown>>(),
    db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cents, COALESCE(SUM(attributed_snacks),0) AS snacks FROM donations').first<{ cents: number; snacks: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status='complete'").first<{ count: number }>(),
    db.prepare("SELECT mode FROM feature_flags WHERE key='public_impact'").first<{ mode: FeatureMode }>(),
  ]);
  const settings = Object.fromEntries(settingsRows.results.map((row) => [String(row.key), String(row.value)]));
  return {
    published: feature?.mode === 'on',
    mode: feature?.mode ?? 'review',
    launchDate: settings.launch_date ?? '2026-05-13',
    snacks: Number(settings.baseline_snacks ?? 12000),
    students: Number(settings.baseline_students ?? 1300),
    cabinets: Number(cabinets?.count ?? 4),
    checks: Number(checks?.count ?? 0),
    routesCompleted: Number(taskRows?.count ?? 0),
    donationsCents: Number(donationRows?.cents ?? 0),
    attributedSnacks: Number(donationRows?.snacks ?? 0),
  };
}

export async function getCabinetForFeedback(cabinetId: string) {
  await ensureDatabase();
  return getRawDb().prepare(`SELECT id,name,floor,location,
    (SELECT mode FROM feature_flags WHERE key='anonymous_feedback') AS feedback_mode
    FROM cabinets WHERE id=? AND active=1`).bind(cabinetId).first<Record<string, unknown>>();
}

export async function submitAnonymousFeedback(input: { cabinetId: string; kind: string; name?: string; productRequest?: string; message?: string }) {
  await ensureDatabase();
  const db = getRawDb();
  const flag = await db.prepare("SELECT mode FROM feature_flags WHERE key='anonymous_feedback'").first<{ mode: FeatureMode }>();
  if (flag?.mode === 'off') throw new Error('Feedback is currently paused.');
  const cabinet = await db.prepare('SELECT id FROM cabinets WHERE id=? AND active=1').bind(input.cabinetId).first<{ id: string }>();
  if (!cabinet) throw new Error('That cabinet is not available for feedback.');
  if (!['empty', 'damaged', 'request', 'dietary', 'other'].includes(input.kind)) throw new Error('Choose a valid feedback option.');
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recentVolume = await db.prepare('SELECT COUNT(*) AS count FROM feedback WHERE submitted_at>=?').bind(minuteAgo).first<{ count: number }>();
  if (Number(recentVolume?.count ?? 0) >= 30) throw new Error('The feedback inbox is busy. Please try again in a minute.');
  const duplicateSince = new Date(Date.now() - 10_000).toISOString();
  const duplicate = await db.prepare(`SELECT id FROM feedback WHERE cabinet_id=? AND kind=?
    AND COALESCE(submitted_name,'')=? AND COALESCE(product_request,'')=?
    AND COALESCE(message,'')=? AND submitted_at>=? LIMIT 1`)
    .bind(
      input.cabinetId,
      input.kind,
      input.name?.trim().slice(0, 80) ?? '',
      input.productRequest?.trim().slice(0, 120) ?? '',
      input.message?.trim().slice(0, 500) ?? '',
      duplicateSince,
    )
    .first<{ id: string }>();
  if (duplicate) return duplicate;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO feedback (id,cabinet_id,kind,submitted_name,product_request,message,status,submitted_at)
    VALUES (?,?,?,?,?,?,'new',?)`).bind(
      id, input.cabinetId, input.kind.slice(0, 60),
      input.name?.trim().slice(0, 80) || null,
      input.productRequest?.trim().slice(0, 120) || null,
      input.message?.trim().slice(0, 500) || null,
      new Date().toISOString(),
    ).run();
  return { id };
}

export async function submitInquiry(input: { name: string; email: string; topic: string; message: string }) {
  await ensureDatabase();
  const db = getRawDb();
  const name = input.name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase().slice(0, 254);
  const topic = input.topic.trim().slice(0, 80);
  const message = input.message.trim().slice(0, 2000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !topic || !message) {
    throw new Error('Please complete all fields with a valid email address.');
  }
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await db.prepare('SELECT COUNT(*) AS count FROM inquiries WHERE submitted_at>=?').bind(minuteAgo).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 20) throw new Error('The inbox is busy. Please try again shortly.');
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO inquiries (id,name,email,topic,message,status,submitted_at)
    VALUES (?,?,?,?,?,'new',?)`).bind(id, name, email, topic, message, new Date().toISOString()).run();
  return { id };
}

async function createWeeklyReport(actorId: string | null) {
  await ensureDatabase();
  const db = getRawDb();
  const now = new Date().toISOString();
  const periodEnd = chicagoDateOnly();
  const periodStart = new Date(new Date(`${periodEnd}T12:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const existing = await db.prepare("SELECT * FROM reports WHERE type='weekly' AND period_start=? AND period_end=? ORDER BY created_at DESC LIMIT 1")
    .bind(periodStart, periodEnd).first<Record<string, unknown>>();
  if (existing) return { report: existing, created: false };
  const [checks, empty, completed, donations] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM cabinet_checks WHERE checked_at>=?').bind(periodStart).first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) AS count FROM cabinet_checks WHERE checked_at>=? AND is_empty=1').bind(periodStart).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE completed_at>=? AND status='complete'").bind(periodStart).first<{ count: number }>(),
    db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cents FROM donations WHERE received_at>=?').bind(periodStart).first<{ cents: number }>(),
  ]);
  const metrics = { checks: Number(checks?.count ?? 0), emptyReports: Number(empty?.count ?? 0), completedTasks: Number(completed?.count ?? 0), donationCents: Number(donations?.cents ?? 0) };
  const summary = `${metrics.checks} cabinet checks were recorded, ${metrics.emptyReports} found a cabinet empty, and ${metrics.completedTasks} assignments were completed. ${(metrics.donationCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in donations was entered during the period.`;
  const id = `weekly-${periodStart}-${periodEnd}`;
  const inserted = await db.prepare(`INSERT OR IGNORE INTO reports (id,type,period_start,period_end,status,summary,metrics_json,created_at,published_at)
    VALUES (?,'weekly',?,?,'draft',?,?,?,NULL)`).bind(id, periodStart, periodEnd, summary, JSON.stringify(metrics), now).run();
  const created = Number(inserted.meta?.changes ?? 0) === 1;
  const report = await db.prepare('SELECT * FROM reports WHERE id=?').bind(id).first<Record<string, unknown>>();
  if (!report) throw new Error('The weekly report draft could not be confirmed.');
  if (created) await logActivity(actorId, 'generated weekly report draft', 'report', id, `${periodStart} to ${periodEnd}`);
  return { report, created };
}

async function sendOperationsEmail(subject: string, html: string, idempotencyKey: string) {
  const recipients = (process.env.ALERT_RECIPIENTS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM_EMAIL || !recipients.length) {
    throw new Error('Email delivery is not configured.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: recipients, subject, html }),
    });
  } catch {
    throw new Error('Email delivery could not reach the provider.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Email service returned ${response.status}.`);
}

async function claimOutboundDelivery(key: string) {
  const db = getRawDb();
  const claimId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)').bind(key, claimId, now).run();
  const stored = await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{ value: string }>();
  return { claimed: stored?.value === claimId, claimId, now };
}

async function releaseOutboundDelivery(key: string, claimId: string) {
  await getRawDb().prepare('DELETE FROM settings WHERE key=? AND value=?').bind(key, claimId).run();
}

function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export async function runScheduledOperations() {
  await ensureDatabase();
  const db = getRawDb();
  const rows = await db.prepare("SELECT key,mode FROM feature_flags WHERE key IN ('outbound_delivery','weekly_reports','email_alerts')").all<{ key: string; mode: FeatureMode }>();
  const modes = Object.fromEntries(rows.results.map((row) => [row.key, row.mode]));
  const result: Record<string, unknown> = { outbound: modes.outbound_delivery ?? 'off', weekly: modes.weekly_reports ?? 'off', alerts: modes.email_alerts ?? 'off' };

  if (modes.weekly_reports !== 'off') {
    const generated = await createWeeklyReport(null);
    result.weeklyReportId = generated.report.id;
    result.weeklyCreated = generated.created;
    if (modes.outbound_delivery === 'on' && modes.weekly_reports === 'on' && generated.report.status !== 'sent') {
      const deliveryKey = `delivery:weekly:${generated.report.id}`;
      const claim = await claimOutboundDelivery(deliveryKey);
      if (claim.claimed) {
        let delivered = false;
        try {
          await sendOperationsEmail(
            `SFS weekly operations · ${generated.report.period_start}–${generated.report.period_end}`,
            `<h1>Students Feeding Students weekly operations</h1><p>${generated.report.summary}</p><p><strong>Human review remains required</strong> for purchases, public claims, and cabinet actions.</p>`,
            `weekly/${generated.report.id}`,
          );
          delivered = true;
          const sentAt = new Date().toISOString();
          await db.batch([
            db.prepare("UPDATE reports SET status='sent',published_at=? WHERE id=?").bind(sentAt, generated.report.id),
            db.prepare("UPDATE settings SET value='sent',updated_at=? WHERE key=? AND value=?").bind(sentAt, deliveryKey, claim.claimId),
            db.prepare(`INSERT INTO activity_log (id,actor_id,action,entity_type,entity_id,details,created_at)
              VALUES (?,NULL,'sent weekly operating report','report',?,NULL,?)`).bind(crypto.randomUUID(), String(generated.report.id), sentAt),
          ]);
          result.weeklySent = true;
        } catch (error) {
          // Once the provider confirms delivery, retain the claim even if the
          // local status write fails; a human can reconcile an uncertain send
          // without risking a duplicate message.
          if (!delivered) await releaseOutboundDelivery(deliveryKey, claim.claimId);
          throw error;
        }
      } else result.weeklySent = false;
    } else result.weeklySent = false;
  }

  if (modes.outbound_delivery === 'on' && modes.email_alerts === 'on') {
    const freshSince = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const latest = await db.prepare(`SELECT c.name,c.floor,c.location,cc.is_empty,cc.checked_at
      FROM cabinets c JOIN cabinet_checks cc ON cc.id=(SELECT id FROM cabinet_checks WHERE cabinet_id=c.id ORDER BY checked_at DESC LIMIT 1)
      WHERE c.active=1 AND cc.is_empty=1 AND cc.checked_at>=? ORDER BY c.sort_order`).bind(freshSince).all<Record<string, unknown>>();
    if (latest.results.length) {
      const signature = latest.results.map((item) => `${item.name}|${item.checked_at}`).join('::');
      const prior = await db.prepare("SELECT value FROM settings WHERE key='last_email_alert_signature'").first<{ value: string }>();
      if (prior?.value === signature) result.alertSent = false;
      else {
        const signatureHash = stableHash(signature);
        const deliveryKey = `delivery:alert:${signatureHash}`;
        const claim = await claimOutboundDelivery(deliveryKey);
        if (claim.claimed) {
          let delivered = false;
          try {
            const rowsHtml = latest.results.map((item) => `<li><strong>${escapeHtml(item.name)}</strong> · Floor ${escapeHtml(item.floor)}, ${escapeHtml(item.location)} · last reported empty ${escapeHtml(item.checked_at)}</li>`).join('');
            await sendOperationsEmail(
              `SFS cabinet alert · ${latest.results.length} need attention`,
              `<h1>Cabinets needing attention</h1><ul>${rowsHtml}</ul><p>Confirm current conditions before acting.</p>`,
              `cabinet-alert/${signatureHash}`,
            );
            delivered = true;
            const alertAt = new Date().toISOString();
            await db.batch([
              db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('last_email_alert_signature',?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(signature, alertAt),
              db.prepare("UPDATE settings SET value='sent',updated_at=? WHERE key=? AND value=?").bind(alertAt, deliveryKey, claim.claimId),
              db.prepare(`INSERT INTO activity_log (id,actor_id,action,entity_type,entity_id,details,created_at)
                VALUES (?,NULL,'sent cabinet attention alert','automation','email_alerts',?,?)`).bind(crypto.randomUUID(), `${latest.results.length} cabinets`, alertAt),
            ]);
            result.alertSent = true;
          } catch (error) {
            if (!delivered) await releaseOutboundDelivery(deliveryKey, claim.claimId);
            throw error;
          }
        } else result.alertSent = false;
      }
    } else result.alertSent = false;
  }
  return result;
}

export async function mutateMissionControl(user: MissionUser, action: string, payload: Record<string, unknown>) {
  await ensureDatabase();
  const db = getRawDb();
  const now = new Date().toISOString();
  const canManage = ['owner', 'admin', 'coordinator'].includes(user.role);
  const isAdmin = ['owner', 'admin'].includes(user.role);

  if (action === 'mark_all_fully_restocked') {
    if (!isAdmin) throw new Error('Only owners and administrators can record a full-program restock.');
    if (payload.confirmed !== true) throw new Error('Confirm that the full after-school restock is complete before recording it.');
    const idempotencyKey = String(payload.idempotencyKey ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) throw new Error('This restock request is missing a valid confirmation key. Reopen the confirmation and try again.');
    const idempotencySetting = `idempotency:full-restock:${idempotencyKey}`;
    const guardSetting = 'guard:full-restock';
    const lastResultSetting = 'last-result:full-restock';
    const prior = await db.prepare('SELECT value FROM settings WHERE key=?').bind(idempotencySetting).first<{ value: string }>();
    const priorResult = prior ? safeJson<DbRow | null>(prior.value, null) : null;
    const publicResult = (stored: DbRow, duplicate: boolean) => {
      const result = { ...stored };
      delete result.executionId;
      return {
        ok: true,
        duplicate,
        ...result,
        message: duplicate
          ? `This after-school restock was already recorded for ${result.cabinetsUpdated} cabinets. No duplicate snapshots were created.`
          : `Full after-school restock recorded for ${result.cabinetsUpdated} cabinets: ${result.binsRecorded} bins and ${Number(result.totalUnits).toLocaleString()} snacks.`,
      };
    };
    if (priorResult?.action === action) return publicResult(priorResult, true);
    if (prior && !priorResult) throw new Error('This full-restock request is still being processed. Wait a moment, then refresh Mission Control.');

    type RestockCabinet = { id: string; name: string; capacity: number };
    const activeCabinets = await db.prepare('SELECT id,name,capacity FROM cabinets WHERE active=1 ORDER BY sort_order').all<RestockCabinet>();
    if (!activeCabinets.results.length) throw new Error('No active cabinets are available for a full restock.');
    const invalidCapacity = activeCabinets.results.find((cabinet) => Number(cabinet.capacity) !== FULL_CABINET_CAPACITY);
    if (invalidCapacity) throw new Error(`${invalidCapacity.name} must have the verified five-bin capacity of ${FULL_CABINET_CAPACITY} snacks before a full restock can be recorded.`);

    const totalUnits = activeCabinets.results.length * FULL_CABINET_CAPACITY;

    const executionId = crypto.randomUUID();
    const duplicateCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const restockResult = {
      action,
      executionId,
      recordedAt: now,
      cabinetsUpdated: activeCabinets.results.length,
      binsPerCabinet: CABINET_BIN_COUNT,
      snacksPerBin: SNACKS_PER_BIN,
      binsRecorded: activeCabinets.results.length * CABINET_BIN_COUNT,
      cabinetEventsCreated: activeCabinets.results.length,
      totalUnits,
    };
    const resultJson = JSON.stringify(restockResult);
    const auditDetails = JSON.stringify({
      recordedAt: now,
      cabinets: restockResult.cabinetsUpdated,
      binsPerCabinet: restockResult.binsPerCabinet,
      snacksPerBin: restockResult.snacksPerBin,
      binsRecorded: restockResult.binsRecorded,
      cabinetEvents: restockResult.cabinetEventsCreated,
      totalUnits,
    });
    const ownsGuard = `EXISTS (SELECT 1 FROM settings WHERE key=? AND value=?)`;
    const statements: D1PreparedStatement[] = [
      db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)').bind(idempotencySetting, executionId, now),
      db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
        WHERE settings.updated_at<?`).bind(guardSetting, executionId, now, duplicateCutoff),
    ];
    for (const cabinet of activeCabinets.results) {
      statements.push(
        db.prepare(`INSERT INTO inventory_events
          (id,cabinet_id,product_id,event_type,quantity_delta,quantity_after,notes,user_id,occurred_at)
          SELECT ?,?,NULL,'full_restock',NULL,?,?,?,? WHERE ${ownsGuard}`)
          .bind(
            crypto.randomUUID(), cabinet.id, FULL_CABINET_CAPACITY,
            `Five bins × ${SNACKS_PER_BIN} snacks; product mix was not inferred`, user.id, now,
            guardSetting, executionId,
          ),
        db.prepare(`INSERT INTO cabinet_checks
          (id,external_id,cabinet_id,checked_at,checker_name,user_id,door_status,trash_present,bg_needed,is_empty,snack_summary,notes,source,created_at)
          SELECT ?,?,?,?,?,?,NULL,0,0,0,?,?,'after-school-restock',? WHERE ${ownsGuard}`)
          .bind(
          crypto.randomUUID(), `full-restock:${idempotencyKey}:${cabinet.id}`, cabinet.id, now, user.name, user.id,
          `Fully restocked · ${CABINET_BIN_COUNT} bins × ${SNACKS_PER_BIN} = ${FULL_CABINET_CAPACITY} snacks`,
          'Full after-school restock confirmed by an owner or administrator; door condition and product composition were not asserted.', now,
          guardSetting, executionId,
          ),
      );
    }
    statements.push(
      db.prepare(`INSERT INTO activity_log (id,actor_id,action,entity_type,entity_id,details,created_at)
        SELECT ?,?,'recorded full after-school restock','inventory_snapshot',?,?,? WHERE ${ownsGuard}`)
        .bind(crypto.randomUUID(), user.id, idempotencyKey, auditDetails, now, guardSetting, executionId),
      db.prepare(`INSERT OR REPLACE INTO settings (key,value,updated_at)
        SELECT ?,?,? WHERE ${ownsGuard}`).bind(lastResultSetting, resultJson, now, guardSetting, executionId),
      db.prepare(`UPDATE settings SET value=?,updated_at=? WHERE key=? AND ${ownsGuard}`)
        .bind(resultJson, now, idempotencySetting, guardSetting, executionId),
    );
    await db.batch(statements);

    const stored = await db.prepare('SELECT value FROM settings WHERE key=?').bind(idempotencySetting).first<{ value: string }>();
    const storedResult = stored ? safeJson<DbRow | null>(stored.value, null) : null;
    if (storedResult?.action === action) return publicResult(storedResult, storedResult.executionId !== executionId);
    const latest = await db.prepare('SELECT value FROM settings WHERE key=?').bind(lastResultSetting).first<{ value: string }>();
    const latestResult = latest ? safeJson<DbRow | null>(latest.value, null) : null;
    if (latest && latestResult?.action === action) {
      await db.prepare('UPDATE settings SET value=?,updated_at=? WHERE key=?').bind(latest.value, now, idempotencySetting).run();
      return publicResult(latestResult, true);
    }
    throw new Error('The full restock could not be confirmed. No duplicate request will be applied; refresh Mission Control before trying again.');
  }

  if (action === 'quick_count') {
    if (user.role === 'board_viewer') throw new Error('Board viewers have read-only access.');
    const cabinetId = String(payload.cabinetId ?? '');
    const quantities = Array.isArray(payload.quantities) ? payload.quantities as Array<{ productId: string; quantity: number }> : [];
    if (!cabinetId || !quantities.length) throw new Error('Choose a cabinet and enter at least one product count.');
    const cabinet = await db.prepare('SELECT id FROM cabinets WHERE id=? AND active=1').bind(cabinetId).first<{ id: string }>();
    if (!cabinet) throw new Error('Choose a valid active cabinet.');
    const validProducts = new Set((await db.prepare('SELECT id FROM products WHERE active=1').all<{ id: string }>()).results.map((product) => product.id));
    const statements: D1PreparedStatement[] = [];
    const seenProducts = new Set<string>();
    let total = 0;
    for (const item of quantities) {
      const productId = String(item.productId);
      if (!validProducts.has(productId)) throw new Error('One of the submitted products is invalid.');
      if (seenProducts.has(productId)) throw new Error('Each product may only be counted once.');
      seenProducts.add(productId);
      const numericQuantity = Number(item.quantity);
      if (!Number.isInteger(numericQuantity) || numericQuantity < 0 || numericQuantity > 10000) throw new Error('Counts must be whole numbers from 0 to 10,000.');
      const quantity = numericQuantity;
      total += quantity;
      const previous = await db.prepare('SELECT quantity FROM inventory WHERE cabinet_id=? AND product_id=?').bind(cabinetId, productId).first<{ quantity: number | null }>();
      const delta = previous?.quantity === null || previous?.quantity === undefined ? null : quantity - previous.quantity;
      statements.push(
        db.prepare(`INSERT INTO inventory (cabinet_id,product_id,quantity,target_quantity,last_counted_at,last_counted_by)
          VALUES (?,?,?,40,?,?) ON CONFLICT(cabinet_id,product_id) DO UPDATE SET
          quantity=excluded.quantity,last_counted_at=excluded.last_counted_at,last_counted_by=excluded.last_counted_by`)
          .bind(cabinetId, productId, quantity, now, user.id),
        db.prepare(`INSERT INTO inventory_events (id,cabinet_id,product_id,event_type,quantity_delta,quantity_after,notes,user_id,occurred_at)
          VALUES (?,?,?,'count',?,?,?,?,?)`).bind(crypto.randomUUID(), cabinetId, productId, delta, quantity, String(payload.notes ?? '').slice(0, 500) || null, user.id, now),
      );
    }
    // A manual count is a point-in-time snapshot. Products the volunteer did not
    // inspect must not silently inherit an older quantity and appear current.
    for (const productId of validProducts) {
      if (!seenProducts.has(productId)) {
        statements.push(db.prepare(`UPDATE inventory SET quantity=NULL,last_counted_at=NULL,last_counted_by=NULL
          WHERE cabinet_id=? AND product_id=?`).bind(cabinetId, productId));
      }
    }
    const emptySignal = total > 0 ? 0 : quantities.length === validProducts.size ? 1 : null;
    statements.push(db.prepare(`INSERT INTO cabinet_checks
      (id,external_id,cabinet_id,checked_at,checker_name,user_id,door_status,trash_present,bg_needed,is_empty,snack_summary,notes,source,created_at)
      VALUES (?,NULL,?,?,?,?,?,0,0,?,NULL,?,'mission-control',?)`)
      .bind(crypto.randomUUID(), cabinetId, now, user.name, user.id, String(payload.doorStatus ?? 'Closed'), emptySignal, String(payload.notes ?? '').slice(0, 500) || null, now));
    await db.batch(statements);
    await logActivity(user.id, 'recorded inventory count', 'cabinet', cabinetId, `${total} total snacks counted`);
    return { ok: true, message: 'Inventory count saved.' };
  }

  if (action === 'create_task') {
    if (!canManage) throw new Error('Your role cannot create assignments.');
    const id = crypto.randomUUID();
    const taskType = String(payload.type ?? 'restock');
    const priority = String(payload.priority ?? 'normal');
    const title = String(payload.title ?? '').trim().slice(0, 160);
    if (!title) throw new Error('Enter an assignment title.');
    if (!['restock', 'check', 'transfer', 'cleanup', 'purchase', 'forecast'].includes(taskType)) throw new Error('Choose a valid assignment type.');
    if (!['urgent', 'normal', 'watch'].includes(priority)) throw new Error('Choose a valid priority.');
    const taskCabinetId = payload.cabinetId ? String(payload.cabinetId) : null;
    if (taskCabinetId && !(await db.prepare('SELECT id FROM cabinets WHERE id=? AND active=1').bind(taskCabinetId).first())) throw new Error('Choose a valid cabinet.');
    const assignedTo = payload.assignedTo ? String(payload.assignedTo) : null;
    if (assignedTo && !(await db.prepare("SELECT id FROM users WHERE (id=? OR lower(email)=lower(?)) AND status='active'").bind(assignedTo, assignedTo).first())) throw new Error('Choose an active volunteer account.');
    const dueAt = payload.dueAt ? String(payload.dueAt) : null;
    if (dueAt && !Number.isFinite(new Date(dueAt).getTime())) throw new Error('Enter a valid due date.');
    await db.prepare(`INSERT INTO tasks
      (id,title,type,cabinet_id,priority,status,assigned_to,due_at,instructions,source,created_at)
      VALUES (?,?,?,?,?,'open',?,?,?, ?,?)`).bind(
        id, title, taskType,
        taskCabinetId, priority,
        assignedTo?.slice(0, 120) ?? null,
        dueAt,
        payload.instructions ? String(payload.instructions).slice(0, 500) : null,
        String(payload.source ?? 'manual'), now,
      ).run();
    await logActivity(user.id, 'created assignment', 'task', id, title);
    return { ok: true, message: 'Assignment created.' };
  }

  if (action === 'complete_task') {
    if (user.role === 'board_viewer') throw new Error('Board viewers have read-only access.');
    const id = String(payload.id ?? '');
    if (user.role === 'volunteer') {
      const task = await db.prepare('SELECT assigned_to FROM tasks WHERE id=?').bind(id).first<{ assigned_to: string | null }>();
      if (!task || (task.assigned_to && task.assigned_to !== user.id && task.assigned_to !== user.email)) {
        throw new Error('Volunteers can only complete unassigned work or work assigned to them.');
      }
    }
    const updated = await db.prepare("UPDATE tasks SET status='complete',completed_at=? WHERE id=? AND status!='complete'").bind(now, id).run();
    if (!Number(updated.meta?.changes ?? 0)) throw new Error('Assignment not found or already complete.');
    await logActivity(user.id, 'completed assignment', 'task', id);
    return { ok: true, message: 'Assignment completed.' };
  }

  if (action === 'add_donation') {
    if (!isAdmin) throw new Error('Only owners and administrators can record donations.');
    const idempotencyKey = clientIdempotencyKey(payload);
    const idempotencySetting = `idempotency:donation:${idempotencyKey}`;
    const prior = await db.prepare('SELECT value,updated_at FROM settings WHERE key=?').bind(idempotencySetting).first<{ value: string; updated_at: string }>();
    const priorResult = prior ? safeJson<DbRow | null>(prior.value, null) : null;
    if (priorResult?.action === action) return { ok: true, duplicate: true, ...priorResult };
    if (prior) {
      const claimAge = Date.now() - new Date(prior.updated_at).getTime();
      if (!Number.isFinite(claimAge) || claimAge < 2 * 60_000) throw new Error('This donation is still being recorded. Wait a moment, then try again.');
      await db.prepare('DELETE FROM settings WHERE key=? AND value=?').bind(idempotencySetting, prior.value).run();
    }
    const amount = Math.round(Number(payload.amount) * 100);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new Error('Enter a valid donation amount greater than zero.');
    const receivedAt = String(payload.receivedAt ?? chicagoDateOnly());
    if (!isValidDateOnly(receivedAt)) throw new Error('Enter a valid received date.');
    if (receivedAt > chicagoDateOnly()) throw new Error('A received date cannot be in the future.');
    const donorLabel = String(payload.donorLabel ?? '').trim().slice(0, 120);
    if (!donorLabel) throw new Error('Enter a donor label or use Anonymous donor.');
    const restriction = String(payload.restriction ?? 'Unrestricted');
    if (!['Unrestricted', 'Food purchases only', 'Cabinets and equipment', 'In-kind donation'].includes(restriction)) {
      throw new Error('Choose a valid donation restriction.');
    }
    const cost = Number((await db.prepare("SELECT value FROM settings WHERE key='estimated_cost_per_snack'").first<{ value: string }>())?.value ?? 0.5);
    const foodEligible = ['Unrestricted', 'Food purchases only'].includes(restriction);
    const snacks = foodEligible ? Math.max(0, Math.floor(amount / 100 / cost)) : 0;
    const attributionType = foodEligible ? 'estimated' : 'unallocated';
    const id = crypto.randomUUID();
    const message = foodEligible
      ? `Donation recorded — approximately ${snacks.toLocaleString()} snacks of potential impact.`
      : 'Donation recorded without a snack-impact estimate.';
    const result = { action, id, message };
    const executionId = crypto.randomUUID();
    const ownsClaim = 'EXISTS (SELECT 1 FROM settings WHERE key=? AND value=?)';
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)').bind(idempotencySetting, executionId, now),
      db.prepare(`INSERT INTO donations
        (id,donor_label,amount_cents,received_at,campaign,restriction,status,attributed_snacks,attribution_type,notes,created_at)
        SELECT ?,?,?,?,?,?,'received',?,?,?,? WHERE ${ownsClaim}`).bind(
          id, donorLabel, amount, receivedAt, String(payload.campaign ?? 'General support').slice(0, 120),
          restriction, snacks, attributionType, payload.notes ? String(payload.notes).slice(0, 500) : null, now,
          idempotencySetting, executionId,
        ),
      db.prepare(`INSERT INTO activity_log (id,actor_id,action,entity_type,entity_id,details,created_at)
        SELECT ?,?,'recorded donation','donation',?,?,? WHERE ${ownsClaim}`).bind(
          crypto.randomUUID(), user.id, id, foodEligible
            ? `$${(amount / 100).toFixed(2)} · approximately ${snacks} snacks`
            : `$${(amount / 100).toFixed(2)} · not allocated to food impact`, now,
          idempotencySetting, executionId,
        ),
      db.prepare(`UPDATE settings SET value=?,updated_at=? WHERE key=? AND value=?
        AND EXISTS (SELECT 1 FROM donations WHERE id=?)`).bind(JSON.stringify(result), now, idempotencySetting, executionId, id),
    ]);
    const stored = await db.prepare('SELECT value FROM settings WHERE key=?').bind(idempotencySetting).first<{ value: string }>();
    const storedResult = stored ? safeJson<DbRow | null>(stored.value, null) : null;
    if (storedResult?.action === action) return { ok: true, duplicate: storedResult.id !== id, ...storedResult };
    throw new Error('The donation could not be confirmed. Refresh Mission Control before trying again.');
  }

  if (action === 'add_purchase') {
    if (!canManage) throw new Error('Your role cannot record purchases.');
    const idempotencyKey = clientIdempotencyKey(payload);
    const idempotencySetting = `idempotency:purchase:${idempotencyKey}`;
    const prior = await db.prepare('SELECT value,updated_at FROM settings WHERE key=?').bind(idempotencySetting).first<{ value: string; updated_at: string }>();
    const priorResult = prior ? safeJson<DbRow | null>(prior.value, null) : null;
    if (priorResult?.action === action) return { ok: true, duplicate: true, ...priorResult };
    if (prior) {
      const claimAge = Date.now() - new Date(prior.updated_at).getTime();
      if (!Number.isFinite(claimAge) || claimAge < 2 * 60_000) throw new Error('This purchase is still being recorded. Wait a moment, then try again.');
      await db.prepare('DELETE FROM settings WHERE key=? AND value=?').bind(idempotencySetting, prior.value).run();
    }
    const amount = Math.round(Number(payload.amount) * 100);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new Error('Enter a valid purchase amount greater than zero.');
    const purchasedAt = String(payload.purchasedAt ?? chicagoDateOnly());
    if (!isValidDateOnly(purchasedAt)) throw new Error('Enter a valid purchase date.');
    if (purchasedAt > chicagoDateOnly()) throw new Error('A purchase date cannot be in the future.');
    const receiptUrl = payload.receiptUrl ? String(payload.receiptUrl).slice(0, 500) : null;
    if (receiptUrl && !/^https:\/\//i.test(receiptUrl)) throw new Error('Receipt links must use HTTPS.');
    const vendor = String(payload.vendor ?? '').trim().slice(0, 120);
    if (!vendor) throw new Error('Enter a vendor.');
    const rawSnackUnits = String(payload.snackUnits ?? '').trim();
    const snackUnits = rawSnackUnits ? Number(rawSnackUnits) : null;
    if (snackUnits !== null && (!Number.isInteger(snackUnits) || snackUnits < 1 || snackUnits > 1_000_000)) throw new Error('Snack units must be a whole number greater than zero.');
    // Ten cents is deliberately more permissive than SFS's configured average,
    // while still rejecting impossible impact claims caused by a mistyped count.
    const maximumPlausibleUnits = Math.max(1, Math.floor(amount / 10));
    if (snackUnits !== null && snackUnits > maximumPlausibleUnits) {
      throw new Error(`The snack count is too high for this purchase amount. Enter no more than ${maximumPlausibleUnits.toLocaleString()} units, or correct the amount.`);
    }
    const donationId = payload.donationId ? String(payload.donationId) : null;
    if (donationId && !isAdmin) throw new Error('Only owners and administrators can link purchases to donations.');
    if (donationId && snackUnits === null) throw new Error('Enter the number of snack units purchased before linking a donation.');
    if (donationId) {
      const donation = await db.prepare("SELECT amount_cents,restriction FROM donations WHERE id=? AND status='received'").bind(donationId).first<{ amount_cents: number; restriction: string | null }>();
      if (!donation) throw new Error('Choose a valid donation.');
      if (!['Unrestricted', 'Food purchases only'].includes(String(donation.restriction ?? 'Unrestricted'))) {
        throw new Error('Only unrestricted or food-purchase donations can fund a snack purchase.');
      }
      const allocated = await db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cents FROM purchases WHERE donation_id=?').bind(donationId).first<{ cents: number }>();
      if (Number(allocated?.cents ?? 0) + amount > Number(donation.amount_cents)) throw new Error('This purchase would allocate more than the donation amount.');
    }
    const id = crypto.randomUUID();
    const notes = payload.notes ? String(payload.notes).slice(0, 500) : null;
    const executionId = crypto.randomUUID();
    const ownsClaim = 'EXISTS (SELECT 1 FROM settings WHERE key=? AND value=?)';
    const result = { action, id, message: 'Purchase recorded.' };
    const statements: D1PreparedStatement[] = [
      db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)').bind(idempotencySetting, executionId, now),
    ];
    if (donationId && snackUnits !== null) {
      statements.push(
        db.prepare(`INSERT INTO purchases
          (id,vendor,amount_cents,purchased_at,status,receipt_url,snack_units,donation_id,notes,created_at)
          SELECT ?,?,?,?,'recorded',?,?,?,?,? WHERE ${ownsClaim} AND EXISTS (
            SELECT 1 FROM donations d WHERE d.id=? AND d.status='received'
              AND COALESCE(d.restriction,'Unrestricted') IN ('Unrestricted','Food purchases only')
              AND (SELECT COALESCE(SUM(p.amount_cents),0) FROM purchases p WHERE p.donation_id=d.id)+?<=d.amount_cents
          )`).bind(id, vendor, amount, purchasedAt, receiptUrl, snackUnits, donationId, notes, now,
            idempotencySetting, executionId, donationId, amount),
        db.prepare(`UPDATE donations SET attributed_snacks=CASE WHEN attribution_type='estimated' THEN ? ELSE attributed_snacks+? END,
          attribution_type='purchase-linked' WHERE id=?
          AND EXISTS (SELECT 1 FROM purchases WHERE id=? AND donation_id=?)`).bind(snackUnits, snackUnits, donationId, id, donationId),
      );
    } else {
      statements.push(db.prepare(`INSERT INTO purchases
        (id,vendor,amount_cents,purchased_at,status,receipt_url,snack_units,donation_id,notes,created_at)
        SELECT ?,?,?,?,'recorded',?,?,?,?,? WHERE ${ownsClaim}`).bind(
          id, vendor, amount, purchasedAt, receiptUrl, snackUnits, donationId, notes, now,
          idempotencySetting, executionId,
        ));
    }
    statements.push(
      db.prepare(`INSERT INTO activity_log (id,actor_id,action,entity_type,entity_id,details,created_at)
        SELECT ?,?,'recorded purchase','purchase',?,?,? WHERE EXISTS (SELECT 1 FROM purchases WHERE id=?)`)
        .bind(crypto.randomUUID(), user.id, id, `$${(amount / 100).toFixed(2)}`, now, id),
      db.prepare(`UPDATE settings SET value=?,updated_at=? WHERE key=? AND value=?
        AND EXISTS (SELECT 1 FROM purchases WHERE id=?)`).bind(JSON.stringify(result), now, idempotencySetting, executionId, id),
    );
    await db.batch(statements);
    const stored = await db.prepare('SELECT value FROM settings WHERE key=?').bind(idempotencySetting).first<{ value: string }>();
    const storedResult = stored ? safeJson<DbRow | null>(stored.value, null) : null;
    if (storedResult?.action === action) return { ok: true, duplicate: storedResult.id !== id, ...storedResult };
    await db.prepare('DELETE FROM settings WHERE key=? AND value=?').bind(idempotencySetting, executionId).run();
    throw new Error('The donation balance changed before this purchase could be linked. Refresh and try again.');
  }

  if (action === 'update_product') {
    if (!canManage) throw new Error('Your role cannot edit the product catalog.');
    const id = String(payload.id ?? '');
    if (!(await db.prepare('SELECT id FROM products WHERE id=? AND active=1').bind(id).first())) throw new Error('Product not found.');
    const name = String(payload.name ?? '').trim().slice(0, 120);
    const category = String(payload.category ?? '').trim().slice(0, 120);
    const supplier = String(payload.supplier ?? '').trim().slice(0, 120) || null;
    const unitsPerCase = Number(payload.unitsPerCase);
    const rawCost = String(payload.costPerCase ?? '').trim();
    const costPerCase = rawCost ? Number(rawCost) : null;
    const nutritionScore = Number(payload.nutritionScore);
    const popularityScore = Number(payload.popularityScore);
    if (!name || !category) throw new Error('Product name and category are required.');
    if (!Number.isInteger(unitsPerCase) || unitsPerCase < 1 || unitsPerCase > 10_000) throw new Error('Units per case must be a whole number from 1 to 10,000.');
    if (costPerCase !== null && (!Number.isFinite(costPerCase) || costPerCase <= 0 || costPerCase > 100_000)) throw new Error('Enter a valid case price or leave it blank.');
    if (!Number.isInteger(nutritionScore) || nutritionScore < 1 || nutritionScore > 5) throw new Error('Nutrition score must be from 1 to 5.');
    if (!Number.isInteger(popularityScore) || popularityScore < 0 || popularityScore > 100) throw new Error('Popularity score must be from 0 to 100.');
    const list = (value: unknown) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12).map((item) => item.slice(0, 80));
    await db.prepare(`UPDATE products SET name=?,category=?,supplier=?,units_per_case=?,cost_per_case=?,nutrition_score=?,
      allergen_flags=?,dietary_labels=?,popularity_score=? WHERE id=?`).bind(
        name, category, supplier, unitsPerCase, costPerCase, nutritionScore,
        JSON.stringify(list(payload.allergens)), JSON.stringify(list(payload.dietaryLabels)), popularityScore, id,
      ).run();
    await logActivity(user.id, 'updated product catalog', 'product', id, name);
    return { ok: true, message: `${name} updated.` };
  }

  if (action === 'set_feature') {
    if (!isAdmin) throw new Error('Only owners and administrators can change system controls.');
    const key = String(payload.key ?? '');
    const mode = String(payload.mode ?? '') as FeatureMode;
    if (!['off', 'review', 'on'].includes(mode)) throw new Error('Choose Off, Review, or On.');
    const current = await db.prepare('SELECT requires_setup FROM feature_flags WHERE key=?').bind(key).first<{ requires_setup: number }>();
    if (!current) throw new Error('Feature not found.');
    if (mode === 'on' && current?.requires_setup) {
      const ready = ['email_alerts', 'weekly_reports'].includes(key) ? Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL && process.env.ALERT_RECIPIENTS && process.env.AUTOMATION_SECRET)
        : true;
      if (!ready) throw new Error('This feature still needs its connection or hardware setup. Keep it in Review until that is added.');
    }
    await db.prepare('UPDATE feature_flags SET mode=?,updated_at=? WHERE key=?').bind(mode, now, key).run();
    await logActivity(user.id, `set feature to ${mode}`, 'feature_flag', key);
    return { ok: true, message: `Feature set to ${mode === 'on' ? 'On' : mode === 'off' ? 'Off' : 'Review'}.` };
  }

  if (action === 'review_feedback') {
    if (!canManage) throw new Error('Your role cannot moderate feedback.');
    const id = String(payload.id ?? '');
    const status = String(payload.status ?? 'reviewed');
    if (!['new', 'reviewed', 'resolved', 'archived'].includes(status)) throw new Error('Choose a valid feedback status.');
    await db.prepare('UPDATE feedback SET status=? WHERE id=?').bind(status, id).run();
    await logActivity(user.id, 'reviewed feedback', 'feedback', id, status);
    return { ok: true, message: 'Feedback updated.' };
  }

  if (action === 'review_inquiry') {
    if (!canManage) throw new Error('Your role cannot manage inquiries.');
    const id = String(payload.id ?? '');
    const status = String(payload.status ?? 'reviewed');
    if (!['new', 'reviewed', 'resolved'].includes(status)) throw new Error('Choose a valid inquiry status.');
    await db.prepare('UPDATE inquiries SET status=? WHERE id=?').bind(status, id).run();
    await logActivity(user.id, 'reviewed inquiry', 'inquiry', id, status);
    return { ok: true, message: 'Inquiry updated.' };
  }

  if (action === 'import_tracker') {
    if (!canManage) throw new Error('Your role cannot import tracker history.');
    const result = await importTrackerHistory(user.id);
    return { ok: true, message: result.imported ? `${result.imported} new tracker records imported.` : 'Tracker is already up to date.', result };
  }


  if (action === 'generate_weekly_report') {
    if (!canManage) throw new Error('Your role cannot generate reports.');
    const feature = await db.prepare("SELECT mode FROM feature_flags WHERE key='weekly_reports'").first<{ mode: FeatureMode }>();
    if (feature?.mode === 'off') throw new Error('Weekly reports are switched off. Move the feature to Review to create a draft.');
    const result = await createWeeklyReport(user.id);
    return { ok: true, message: result.created ? 'Weekly report draft generated. Nothing was sent.' : 'This week’s report draft already exists.' };
  }

  throw new Error('Unknown Mission Control action.');
}
