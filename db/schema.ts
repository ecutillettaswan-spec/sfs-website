import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('volunteer'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
});

export const approvedEmails = sqliteTable('approved_emails', {
  email: text('email').primaryKey(),
  name: text('name'),
  role: text('role').notNull(),
  addedBy: text('added_by'),
  createdAt: text('created_at').notNull(),
});

export const cabinets = sqliteTable('cabinets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  floor: integer('floor').notNull(),
  location: text('location').notNull(),
  capacity: integer('capacity').notNull().default(250),
  status: text('status').notNull().default('unknown'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull(),
  sensorReady: integer('sensor_ready', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  supplier: text('supplier'),
  packageSize: text('package_size'),
  unitsPerCase: integer('units_per_case'),
  costPerCase: real('cost_per_case'),
  nutritionScore: integer('nutrition_score').notNull().default(3),
  allergenFlags: text('allergen_flags').notNull().default('[]'),
  dietaryLabels: text('dietary_labels').notNull().default('[]'),
  popularityScore: integer('popularity_score').notNull().default(50),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const inventory = sqliteTable('inventory', {
  cabinetId: text('cabinet_id').notNull(),
  productId: text('product_id').notNull(),
  quantity: integer('quantity'),
  targetQuantity: integer('target_quantity').notNull().default(40),
  lastCountedAt: text('last_counted_at'),
  lastCountedBy: text('last_counted_by'),
}, (table) => [primaryKey({ columns: [table.cabinetId, table.productId] })]);

export const cabinetChecks = sqliteTable('cabinet_checks', {
  id: text('id').primaryKey(),
  externalId: text('external_id').unique(),
  sourceFingerprint: text('source_fingerprint').unique(),
  importBatchId: text('import_batch_id'),
  sourceRow: integer('source_row'),
  cabinetId: text('cabinet_id').notNull(),
  checkedAt: text('checked_at').notNull(),
  originalTimestamp: text('original_timestamp'),
  sourceTimezone: text('source_timezone').notNull().default('America/Chicago'),
  checkerName: text('checker_name'),
  userId: text('user_id'),
  doorStatus: text('door_status'),
  trashPresent: integer('trash_present', { mode: 'boolean' }).notNull().default(false),
  bgNeeded: integer('bg_needed', { mode: 'boolean' }).notNull().default(false),
  isEmpty: integer('is_empty', { mode: 'boolean' }),
  snackSummary: text('snack_summary'),
  notes: text('notes'),
  validationIssues: text('validation_issues').notNull().default('[]'),
  source: text('source').notNull().default('mission-control'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_checks_cabinet_date').on(table.cabinetId, table.checkedAt),
  index('idx_checks_source').on(table.source),
  index('idx_checks_import_batch').on(table.importBatchId, table.sourceRow),
]);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  sourceReference: text('source_reference').notNull(),
  importedBy: text('imported_by'),
  importedAt: text('imported_at').notNull(),
  parserVersion: text('parser_version').notNull(),
  totalRows: integer('total_rows').notNull(),
  insertedRows: integer('inserted_rows').notNull(),
  duplicateRows: integer('duplicate_rows').notNull(),
  warningRows: integer('warning_rows').notNull(),
  quarantinedRows: integer('quarantined_rows').notNull(),
  status: text('status').notNull(),
});

export const inventoryEvents = sqliteTable('inventory_events', {
  id: text('id').primaryKey(),
  cabinetId: text('cabinet_id').notNull(),
  productId: text('product_id'),
  eventType: text('event_type').notNull(),
  quantityDelta: integer('quantity_delta'),
  quantityAfter: integer('quantity_after'),
  notes: text('notes'),
  userId: text('user_id'),
  occurredAt: text('occurred_at').notNull(),
}, (table) => [index('idx_events_cabinet_product_date').on(table.cabinetId, table.productId, table.occurredAt)]);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  cabinetId: text('cabinet_id'),
  priority: text('priority').notNull().default('normal'),
  status: text('status').notNull().default('open'),
  assignedTo: text('assigned_to'),
  dueAt: text('due_at'),
  completedAt: text('completed_at'),
  instructions: text('instructions'),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_tasks_status_due').on(table.status, table.dueAt)]);

export const volunteerShifts = sqliteTable('volunteer_shifts', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  volunteerName: text('volunteer_name').notNull(),
  shiftDate: text('shift_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  status: text('status').notNull().default('scheduled'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
});

export const donations = sqliteTable('donations', {
  id: text('id').primaryKey(),
  donorLabel: text('donor_label').notNull(),
  amountCents: integer('amount_cents').notNull(),
  receivedAt: text('received_at').notNull(),
  campaign: text('campaign'),
  restriction: text('restriction'),
  status: text('status').notNull().default('received'),
  attributedSnacks: integer('attributed_snacks').notNull().default(0),
  attributionType: text('attribution_type').notNull().default('estimated'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_donations_date').on(table.receivedAt)]);

export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  vendor: text('vendor').notNull(),
  amountCents: integer('amount_cents').notNull(),
  purchasedAt: text('purchased_at').notNull(),
  status: text('status').notNull().default('recorded'),
  receiptUrl: text('receipt_url'),
  snackUnits: integer('snack_units'),
  donationId: text('donation_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_purchases_donation').on(table.donationId)]);

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  cabinetId: text('cabinet_id').notNull(),
  kind: text('kind').notNull(),
  submittedName: text('submitted_name'),
  productRequest: text('product_request'),
  message: text('message'),
  status: text('status').notNull().default('new'),
  submittedAt: text('submitted_at').notNull(),
}, (table) => [index('idx_feedback_status_date').on(table.status, table.submittedAt)]);

export const inquiries = sqliteTable('inquiries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  topic: text('topic').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('new'),
  submittedAt: text('submitted_at').notNull(),
}, (table) => [index('idx_inquiries_status_date').on(table.status, table.submittedAt)]);

export const featureFlags = sqliteTable('feature_flags', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  mode: text('mode').notNull().default('review'),
  requiresSetup: integer('requires_setup', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  status: text('status').notNull().default('draft'),
  summary: text('summary').notNull(),
  metricsJson: text('metrics_json').notNull(),
  createdAt: text('created_at').notNull(),
  publishedAt: text('published_at'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  createdAt: text('created_at').notNull(),
});

export const sensors = sqliteTable('sensors', {
  id: text('id').primaryKey(),
  cabinetId: text('cabinet_id').notNull(),
  label: text('label').notNull(),
  status: text('status').notNull().default('planned'),
  lastSeenAt: text('last_seen_at'),
  batteryPercent: integer('battery_percent'),
  tareGrams: real('tare_grams'),
  calibrationJson: text('calibration_json'),
  createdAt: text('created_at').notNull(),
});
