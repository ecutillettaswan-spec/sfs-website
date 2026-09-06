const CHICAGO_TIME_ZONE = 'America/Chicago';
const DAY_MS = 86_400_000;
const CABINET_PRIOR_STRENGTH = 6;
const PATTERN_PRIOR_STRENGTH = 5;

export type ForecastConfidenceTier = 'low' | 'early' | 'medium' | 'high';

export interface ForecastCheckInput {
  id?: unknown;
  cabinet_id?: unknown;
  cabinetId?: unknown;
  checked_at?: unknown;
  checkedAt?: unknown;
  is_empty?: unknown;
  isEmpty?: unknown;
  source?: unknown;
  snack_summary?: unknown;
  snackSummary?: unknown;
  validation_issues?: unknown;
  validationIssues?: unknown;
}

export interface ForecastCabinetInput {
  id?: unknown;
  name?: unknown;
  floor?: unknown;
  location?: unknown;
  active?: unknown;
  sort_order?: unknown;
  sortOrder?: unknown;
}

export interface ForecastInventoryEventInput {
  id?: unknown;
  cabinet_id?: unknown;
  cabinetId?: unknown;
  product_id?: unknown;
  productId?: unknown;
  event_type?: unknown;
  eventType?: unknown;
  quantity_delta?: unknown;
  quantityDelta?: unknown;
  quantity_after?: unknown;
  quantityAfter?: unknown;
  occurred_at?: unknown;
  occurredAt?: unknown;
}

export interface ForecastAnalyticsInput {
  checks?: readonly ForecastCheckInput[] | null;
  cabinets?: readonly ForecastCabinetInput[] | null;
  inventoryEvents?: readonly ForecastInventoryEventInput[] | null;
  now?: Date | string | number;
}

export interface UncertaintyInterval {
  low: number;
  high: number;
}

export interface ProbabilityEstimate {
  probabilityPct: number | null;
  interval90Pct: UncertaintyInterval | null;
  observedRatePct: number | null;
  weightedObservedRatePct: number | null;
  rawChecks: number;
  emptyChecks: number;
  nonEmptyChecks: number;
  weightedChecks: number;
  effectiveSampleSize: number;
  confidenceTier: ForecastConfidenceTier;
  shrinkagePct: number | null;
  estimateSource: 'no-data' | 'direct-observations' | 'observations-shrunk-to-global' | 'global-baseline-only';
}

export interface PeriodComparison {
  currentSchoolYear: ProbabilityEstimate;
  historical: ProbabilityEstimate;
  deltaPercentagePoints: number | null;
  direction: 'higher' | 'lower' | 'unchanged' | 'unavailable';
}

export interface CabinetForecastAnalytics {
  cabinetId: string;
  cabinetName: string;
  floor: number | null;
  location: string | null;
  rank: number;
  riskTier: 'highest' | 'elevated' | 'watch' | 'lower' | 'unknown';
  nextCheckEmptyProbability: ProbabilityEstimate;
  currentVsHistorical: PeriodComparison;
  lastObservationAt: string | null;
  schoolYearsObserved: number;
  statement: string;
}

export interface PatternPoint {
  key: string;
  label: string;
  estimate: ProbabilityEstimate;
}

export interface WeeklyTrendPoint extends PatternPoint {
  weekStart: string;
  weekEnd: string;
  schoolYear: string;
}

export interface PresenceSignal {
  key: string;
  label: string;
  category: string;
  mentions: number;
  weightedMentions: number;
  mentionRatePct: number;
  weightedMentionRatePct: number;
  mostRecentMentionAt: string | null;
}

export interface ProductCountReadiness {
  key: string;
  cabinetId: string;
  productId: string;
  countEvents: number;
  validNegativeIntervals: number;
  intervalsBlockedByRestock: number;
  distinctIntervalDays: number;
  observationSpanDays: number;
  totalObservedDecrease: number;
  averageObservedUnitsPerDay: number | null;
  readinessScore: number;
  status: 'not-started' | 'building' | 'ready';
  readyForRateEstimate: boolean;
}

export interface CabinetCountReadiness {
  cabinetId: string;
  cabinetName: string;
  trackedProductSeries: number;
  readyProductSeries: number;
  validNegativeIntervals: number;
  intervalsBlockedByRestock: number;
  distinctIntervalDays: number;
  readinessScore: number;
  status: 'not-started' | 'building' | 'ready';
}

export interface ForecastAnalyticsResult {
  generatedAt: string;
  timezone: typeof CHICAGO_TIME_ZONE;
  methodology: {
    outcome: string;
    interpretation: string;
    schoolYearDefinition: string;
    currentSchoolYear: string;
    yearWeights: Array<{ schoolYear: string; yearsBack: number; weight: number }>;
    weighting: string;
    shrinkage: string;
    uncertainty: string;
    inventoryReadinessRule: string;
  };
  overview: {
    currentSchoolYear: string;
    currentSchoolYearDistinctDays: number;
    nextCheckEmptyProbability: ProbabilityEstimate;
    currentVsHistorical: PeriodComparison;
    cabinetsIncluded: number;
    cabinetsWithDirectObservations: number;
    schoolYearsObserved: number;
    latestObservationAt: string | null;
  };
  schoolYearBreakdown: Array<PatternPoint & { yearsBack: number; weight: number }>;
  cabinetRanking: CabinetForecastAnalytics[];
  weeklyTrend: WeeklyTrendPoint[];
  weekdayPattern: PatternPoint[];
  daypartPattern: PatternPoint[];
  presenceSignals: {
    summarizedNonEmptyChecks: number;
    weightedSummarizedNonEmptyChecks: number;
    products: PresenceSignal[];
    categories: PresenceSignal[];
    interpretation: string;
  };
  inventoryCountReadiness: {
    readinessScore: number;
    status: 'not-started' | 'building' | 'ready';
    trackedProductSeries: number;
    readyProductSeries: number;
    validNegativeIntervals: number;
    intervalsBlockedByRestock: number;
    distinctIntervalDays: number;
    cabinets: CabinetCountReadiness[];
    products: ProductCountReadiness[];
  };
  dataQuality: {
    inputChecks: number;
    validObservationalChecks: number;
    excludedAfterSchoolRestocks: number;
    excludedInvalidEmptySignals: number;
    excludedInvalidTimestamps: number;
    excludedFutureChecks: number;
    excludedMissingCabinetIds: number;
    excludedDuplicateCheckIds: number;
    excludedContradictoryChecks: number;
    excludedRapidRepeatChecks: number;
    inputInventoryEvents: number;
    usableCountEvents: number;
    inventoryRestockBoundaries: number;
    excludedInventoryEvents: number;
    notes: string[];
  };
}

interface ChicagoParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: string;
}

interface Observation {
  id: string | null;
  cabinetId: string;
  checkedAt: Date;
  isEmpty: 0 | 1;
  snackSummary: string;
  schoolYearStart: number;
  schoolYear: string;
  yearsBack: number;
  weight: number;
  chicago: ChicagoParts;
  chicagoDate: string;
}

interface Evidence {
  rawChecks: number;
  emptyChecks: number;
  nonEmptyChecks: number;
  weightedChecks: number;
  weightedEmpty: number;
  effectiveSampleSize: number;
  effectiveEmpty: number;
}

interface ParsedCountEvent {
  cabinetId: string;
  productId: string;
  occurredAt: Date;
  quantityDelta: number | null;
}

interface ParsedRestockBoundary {
  cabinetId: string;
  occurredAt: Date;
}

interface ProductDefinition {
  key: string;
  label: string;
  category: string;
  patterns: RegExp[];
}

const PRODUCT_DEFINITIONS: ProductDefinition[] = [
  { key: 'granola-bars', label: 'Granola bars', category: 'Bars', patterns: [/\bgranola(?:\s*(?:or|and|&)\s*protein)?\s*bars?\b/i, /\bgranola\b/i] },
  { key: 'breakfast-bars', label: 'Breakfast snacks', category: 'Breakfast', patterns: [/\bbreakfast\s+(?:snack|bar)/i, /\bnutri-?grain\b/i, /\bbelvita\b/i, /\bfig\s*bars?\b/i] },
  { key: 'protein-bars', label: 'Protein bars', category: 'Bars', patterns: [/\bprotein\s*bars?\b/i, /\bgranola\s+or\s+protein\s+bars?\b/i] },
  { key: 'fruit-snacks', label: 'Fruit snacks', category: 'Fruit', patterns: [/\bfruit\b/i, /\bgogo\s*squeez/i, /\bdried\s*fruit\b/i, /\bgummies\b/i] },
  { key: 'goldfish', label: 'Goldfish', category: 'Crackers', patterns: [/\bgoldfish\b/i] },
  { key: 'cheez-it', label: 'Cheez-It', category: 'Crackers', patterns: [/\bcheez[ -]?its?\b/i] },
  { key: 'crackers', label: 'Crackers', category: 'Crackers', patterns: [/\bcrackers?\b/i] },
  { key: 'pretzels', label: 'Pretzels', category: 'Savory snacks', patterns: [/\bpretzels?\b/i] },
  { key: 'chips', label: 'Baked chips & popcorn', category: 'Savory snacks', patterns: [/\bchips?\b/i, /\bpopcorn\b/i] },
  { key: 'cookies', label: 'Cookies', category: 'Sweets', patterns: [/\bcookies?\b/i] },
  { key: 'rice-crispy-treats', label: 'Rice crispy treats', category: 'Sweets', patterns: [/\brice\s*(?:krispy|crispy|crispie)s?\s*(?:treats?|bars?)?\b/i] },
  { key: 'pop-tarts', label: 'Pop-Tarts', category: 'Breakfast', patterns: [/\bpop[ -]?tarts?\b/i] },
  { key: 'cereal', label: 'Cereal', category: 'Breakfast', patterns: [/\bcereal\b/i] },
  { key: 'nuts', label: 'Nuts', category: 'Protein & nuts', patterns: [/\bnuts?\b/i, /\bpeanuts?\b/i, /\balmonds?\b/i] },
  { key: 'trail-mix', label: 'Trail mix', category: 'Protein & nuts', patterns: [/\btrail\s*mix\b/i] },
  { key: 'jerky', label: 'Jerky', category: 'Protein & nuts', patterns: [/\bjerky\b/i] },
  { key: 'applesauce', label: 'Applesauce', category: 'Fruit', patterns: [/\bapple\s*sauce\b/i] },
  { key: 'fruit-cups', label: 'Fruit cups', category: 'Fruit', patterns: [/\bfruit\s*cups?\b/i] },
];

const chicagoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CHICAGO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

function round(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isFinite(copy.getTime()) ? copy : null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseEmptySignal(value: unknown): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return 1;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return 0;
  return null;
}

function hasContradictoryValidationIssue(value: unknown) {
  let issues: unknown[];
  if (Array.isArray(value)) issues = value;
  else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      issues = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      issues = [trimmed];
    }
  } else if (value === null || value === undefined) return false;
  else issues = [value];
  return issues.some((issue) => /contradict|conflict|inconsisten|reported\s+empty\s+while\s+also\s+listing/i.test(stringValue(issue)));
}

function chicagoParts(date: Date): ChicagoParts {
  const parts = chicagoFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    weekday: value('weekday'),
  };
}

function dateKey(parts: Pick<ChicagoParts, 'year' | 'month' | 'day'>) {
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

function schoolYearStart(parts: Pick<ChicagoParts, 'year' | 'month'>) {
  return parts.month >= 8 ? parts.year : parts.year - 1;
}

function schoolYearLabel(startYear: number) {
  return `${startYear}\u2013${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function weightForYearsBack(yearsBack: number) {
  if (yearsBack <= 0) return 3;
  if (yearsBack === 1) return 1;
  return 1 / yearsBack;
}

function evidenceFor(observations: readonly Observation[]): Evidence {
  const rawChecks = observations.length;
  const emptyChecks = observations.reduce((sum, observation) => sum + observation.isEmpty, 0);
  const weightedChecks = observations.reduce((sum, observation) => sum + observation.weight, 0);
  const weightedEmpty = observations.reduce((sum, observation) => sum + observation.weight * observation.isEmpty, 0);
  const squaredWeights = observations.reduce((sum, observation) => sum + observation.weight ** 2, 0);
  const effectiveSampleSize = squaredWeights > 0 ? (weightedChecks ** 2) / squaredWeights : 0;
  const weightedRate = weightedChecks > 0 ? weightedEmpty / weightedChecks : 0;
  return {
    rawChecks,
    emptyChecks,
    nonEmptyChecks: rawChecks - emptyChecks,
    weightedChecks,
    weightedEmpty,
    effectiveSampleSize,
    effectiveEmpty: weightedRate * effectiveSampleSize,
  };
}

// Lanczos log-gamma plus a continued fraction give deterministic beta posterior intervals.
function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const adjusted = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index++) series += coefficients[index] / (adjusted + index + 1);
  const term = adjusted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(term) - term + Math.log(series);
}

function betaContinuedFraction(a: number, b: number, x: number) {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const twice = iteration * 2;
    let coefficient = (iteration * (b - iteration) * x) / ((qam + twice) * (a + twice));
    d = 1 + coefficient * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + coefficient / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;
    coefficient = -((a + iteration) * (qab + iteration) * x) / ((a + twice) * (qap + twice));
    d = 1 + coefficient * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + coefficient / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) <= epsilon) break;
  }
  return result;
}

function regularizedIncompleteBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function betaQuantile(probability: number, alpha: number, beta: number) {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 70; iteration++) {
    const midpoint = (low + high) / 2;
    if (regularizedIncompleteBeta(midpoint, alpha, beta) < probability) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

function confidenceTier(rawChecks: number, effectiveSampleSize: number, intervalWidth: number): ForecastConfidenceTier {
  if (rawChecks >= 50 && effectiveSampleSize >= 35 && intervalWidth <= 20) return 'high';
  if (rawChecks >= 20 && effectiveSampleSize >= 15 && intervalWidth <= 32) return 'medium';
  if (rawChecks >= 6 && effectiveSampleSize >= 5) return 'early';
  return 'low';
}

function evidenceCoverageConfidence(
  observations: readonly Observation[],
  currentSchoolYearStart: number,
  statisticalTier: ForecastConfidenceTier,
): ForecastConfidenceTier {
  const current = observations.filter((observation) => observation.schoolYearStart === currentSchoolYearStart);
  const distinctDays = new Set(current.map((observation) => observation.chicagoDate)).size;
  const coveredDayparts = new Set(current.map((observation) => {
    const hour = observation.chicago.hour;
    if (hour < 8) return 'before-school';
    if (hour <= 10) return 'morning';
    if (hour <= 13) return 'midday';
    if (hour <= 16) return 'afternoon';
    return 'after-school';
  })).size;
  const coverageTier: ForecastConfidenceTier = distinctDays >= 20 && coveredDayparts >= 3
    ? 'high'
    : distinctDays >= 10 && coveredDayparts >= 2
      ? 'medium'
      : distinctDays >= 5
        ? 'early'
        : 'low';
  const order: ForecastConfidenceTier[] = ['low', 'early', 'medium', 'high'];
  return order[Math.min(order.indexOf(statisticalTier), order.indexOf(coverageTier))];
}

function noDataEstimate(): ProbabilityEstimate {
  return {
    probabilityPct: null,
    interval90Pct: null,
    observedRatePct: null,
    weightedObservedRatePct: null,
    rawChecks: 0,
    emptyChecks: 0,
    nonEmptyChecks: 0,
    weightedChecks: 0,
    effectiveSampleSize: 0,
    confidenceTier: 'low',
    shrinkagePct: null,
    estimateSource: 'no-data',
  };
}

function probabilityEstimate(
  observations: readonly Observation[],
  globalMean: number | null,
  priorStrength: number,
  allowPriorOnly: boolean,
  directOverall = false,
): ProbabilityEstimate {
  const evidence = evidenceFor(observations);
  if (!evidence.rawChecks && (!allowPriorOnly || globalMean === null)) return noDataEstimate();

  let alpha: number;
  let beta: number;
  let shrinkage = 0;
  if (directOverall) {
    alpha = 0.5 + evidence.effectiveEmpty;
    beta = 0.5 + evidence.effectiveSampleSize - evidence.effectiveEmpty;
  } else {
    const priorMean = globalMean ?? 0.5;
    alpha = priorMean * priorStrength + evidence.effectiveEmpty;
    beta = (1 - priorMean) * priorStrength + evidence.effectiveSampleSize - evidence.effectiveEmpty;
    shrinkage = priorStrength / (priorStrength + evidence.effectiveSampleSize);
  }
  const mean = alpha / (alpha + beta);
  const low = betaQuantile(0.05, alpha, beta);
  const high = betaQuantile(0.95, alpha, beta);
  const width = (high - low) * 100;
  const source = evidence.rawChecks
    ? directOverall ? 'direct-observations' : 'observations-shrunk-to-global'
    : 'global-baseline-only';
  return {
    probabilityPct: round(mean * 100),
    interval90Pct: { low: round(low * 100), high: round(high * 100) },
    observedRatePct: evidence.rawChecks ? round((evidence.emptyChecks / evidence.rawChecks) * 100) : null,
    weightedObservedRatePct: evidence.weightedChecks ? round((evidence.weightedEmpty / evidence.weightedChecks) * 100) : null,
    rawChecks: evidence.rawChecks,
    emptyChecks: evidence.emptyChecks,
    nonEmptyChecks: evidence.nonEmptyChecks,
    weightedChecks: round(evidence.weightedChecks, 2),
    effectiveSampleSize: round(evidence.effectiveSampleSize, 1),
    confidenceTier: confidenceTier(evidence.rawChecks, evidence.effectiveSampleSize, width),
    shrinkagePct: directOverall ? 0 : round(shrinkage * 100),
    estimateSource: source,
  };
}

function comparePeriods(
  current: readonly Observation[],
  historical: readonly Observation[],
  globalMean: number | null,
): PeriodComparison {
  const currentEstimate = probabilityEstimate(current, globalMean, PATTERN_PRIOR_STRENGTH, false);
  const historicalEstimate = probabilityEstimate(historical, globalMean, PATTERN_PRIOR_STRENGTH, false);
  const delta = currentEstimate.probabilityPct === null || historicalEstimate.probabilityPct === null
    ? null
    : round(currentEstimate.probabilityPct - historicalEstimate.probabilityPct);
  return {
    currentSchoolYear: currentEstimate,
    historical: historicalEstimate,
    deltaPercentagePoints: delta,
    direction: delta === null ? 'unavailable' : Math.abs(delta) < 0.05 ? 'unchanged' : delta > 0 ? 'higher' : 'lower',
  };
}

function riskTier(probability: number | null): CabinetForecastAnalytics['riskTier'] {
  if (probability === null) return 'unknown';
  if (probability >= 50) return 'highest';
  if (probability >= 30) return 'elevated';
  if (probability >= 15) return 'watch';
  return 'lower';
}

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function mondayKey(observation: Observation) {
  const utcDate = new Date(Date.UTC(observation.chicago.year, observation.chicago.month - 1, observation.chicago.day));
  const weekday = utcDate.getUTCDay();
  return shiftDateKey(observation.chicagoDate, -(weekday === 0 ? 6 : weekday - 1));
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function makePattern(
  key: string,
  label: string,
  observations: readonly Observation[],
  globalMean: number | null,
): PatternPoint {
  return { key, label, estimate: probabilityEstimate(observations, globalMean, PATTERN_PRIOR_STRENGTH, false) };
}

function definitionIsPresent(summary: string, definition: ProductDefinition) {
  if (!definition.patterns.some((pattern) => pattern.test(summary))) return false;
  return !definition.patterns.some((pattern) => {
    const source = pattern.source.replace(/^\\b|\\b$/g, '');
    try {
      return new RegExp(`(?:no|none|not|out of|without)\\s+(?:\\w+\\s+){0,2}(?:${source})`, 'i').test(summary);
    } catch {
      return false;
    }
  });
}

function presenceSignals(observations: readonly Observation[]) {
  const summarized = observations.filter((observation) => observation.isEmpty === 0 && observation.snackSummary.length > 0);
  const totalWeight = summarized.reduce((sum, observation) => sum + observation.weight, 0);
  const productStats = new Map<string, { definition: ProductDefinition; mentions: number; weighted: number; latest: number }>();
  for (const observation of summarized) {
    // Negated summaries are skipped because a phrase such as "no granola bars" is absence, not presence.
    const summary = observation.snackSummary;
    for (const definition of PRODUCT_DEFINITIONS) {
      if (!definitionIsPresent(summary, definition)) continue;
      const existing = productStats.get(definition.key) ?? { definition, mentions: 0, weighted: 0, latest: 0 };
      existing.mentions += 1;
      existing.weighted += observation.weight;
      existing.latest = Math.max(existing.latest, observation.checkedAt.getTime());
      productStats.set(definition.key, existing);
    }
  }
  const products: PresenceSignal[] = Array.from(productStats.values()).map((stat) => ({
    key: stat.definition.key,
    label: stat.definition.label,
    category: stat.definition.category,
    mentions: stat.mentions,
    weightedMentions: round(stat.weighted, 2),
    mentionRatePct: summarized.length ? round((stat.mentions / summarized.length) * 100) : 0,
    weightedMentionRatePct: totalWeight ? round((stat.weighted / totalWeight) * 100) : 0,
    mostRecentMentionAt: stat.latest ? new Date(stat.latest).toISOString() : null,
  })).sort((a, b) => b.weightedMentionRatePct - a.weightedMentionRatePct || b.mentions - a.mentions || a.key.localeCompare(b.key));

  const categoryStats = new Map<string, { mentions: number; weighted: number; latest: number }>();
  for (const observation of summarized) {
    const categories = new Set<string>();
    for (const product of PRODUCT_DEFINITIONS) {
      if (definitionIsPresent(observation.snackSummary, product)) categories.add(product.category);
    }
    for (const category of categories) {
      const existing = categoryStats.get(category) ?? { mentions: 0, weighted: 0, latest: 0 };
      existing.mentions += 1;
      existing.weighted += observation.weight;
      existing.latest = Math.max(existing.latest, observation.checkedAt.getTime());
      categoryStats.set(category, existing);
    }
  }
  const categories: PresenceSignal[] = Array.from(categoryStats.entries()).map(([category, stat]) => ({
    key: category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    label: category,
    category,
    mentions: stat.mentions,
    weightedMentions: round(stat.weighted, 2),
    mentionRatePct: summarized.length ? round((stat.mentions / summarized.length) * 100) : 0,
    weightedMentionRatePct: totalWeight ? round((stat.weighted / totalWeight) * 100) : 0,
    mostRecentMentionAt: stat.latest ? new Date(stat.latest).toISOString() : null,
  })).sort((a, b) => b.weightedMentionRatePct - a.weightedMentionRatePct || b.mentions - a.mentions || a.key.localeCompare(b.key));

  return {
    summarizedNonEmptyChecks: summarized.length,
    weightedSummarizedNonEmptyChecks: round(totalWeight, 2),
    products,
    categories,
    interpretation: 'Mentions show which items were reported present, not how many students chose them or how quickly they were consumed.',
  };
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inventoryReadiness(
  rawEvents: readonly ForecastInventoryEventInput[],
  cabinetNames: ReadonlyMap<string, string>,
  now: Date,
) {
  const parsed: ParsedCountEvent[] = [];
  const restockBoundaries: ParsedRestockBoundary[] = [];
  let excluded = 0;
  for (const event of rawEvents) {
    const eventType = stringValue(event.event_type ?? event.eventType).toLowerCase();
    const cabinetId = stringValue(event.cabinet_id ?? event.cabinetId);
    const productId = stringValue(event.product_id ?? event.productId);
    const occurredAt = parseDate(event.occurred_at ?? event.occurredAt);
    if (!cabinetId || !occurredAt || occurredAt.getTime() > now.getTime()) {
      excluded += 1;
      continue;
    }
    if (eventType === 'full_restock' || eventType === 'full-restock') {
      restockBoundaries.push({ cabinetId, occurredAt });
      continue;
    }
    if (eventType !== 'count' || !productId) {
      excluded += 1;
      continue;
    }
    parsed.push({
      cabinetId,
      productId,
      occurredAt,
      quantityDelta: numericValue(event.quantity_delta ?? event.quantityDelta),
    });
  }

  const series = groupBy(parsed, (event) => `${event.cabinetId}\u0000${event.productId}`);
  const boundariesByCabinet = groupBy(restockBoundaries, (boundary) => boundary.cabinetId);
  const validDaysBySeries = new Map<string, Set<string>>();
  const products: ProductCountReadiness[] = [];
  for (const [key, events] of series) {
    events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const intervals: Array<{ decrease: number; days: number; date: string }> = [];
    let intervalsBlockedByRestock = 0;
    const cabinetId = events[0]?.cabinetId ?? '';
    const cabinetBoundaries = boundariesByCabinet.get(cabinetId) ?? [];
    for (let index = 1; index < events.length; index++) {
      const event = events[index];
      const elapsedDays = (event.occurredAt.getTime() - events[index - 1].occurredAt.getTime()) / DAY_MS;
      const sameChicagoDate = dateKey(chicagoParts(event.occurredAt)) === dateKey(chicagoParts(events[index - 1].occurredAt));
      if (event.quantityDelta === null || event.quantityDelta >= 0 || elapsedDays < 4 / 24 || elapsedDays > 12 / 24 || !sameChicagoDate) continue;
      const crossesUnknownMixRestock = cabinetBoundaries.some((boundary) =>
        boundary.occurredAt.getTime() > events[index - 1].occurredAt.getTime()
        && boundary.occurredAt.getTime() <= event.occurredAt.getTime());
      if (crossesUnknownMixRestock) {
        intervalsBlockedByRestock += 1;
        continue;
      }
      intervals.push({
        decrease: -event.quantityDelta,
        days: elapsedDays,
        date: dateKey(chicagoParts(event.occurredAt)),
      });
    }
    const distinctDays = new Set(intervals.map((interval) => interval.date)).size;
    const firstTime = events[0]?.occurredAt.getTime() ?? 0;
    const lastTime = events.at(-1)?.occurredAt.getTime() ?? firstTime;
    const observationSpanDays = Math.max(0, (lastTime - firstTime) / DAY_MS);
    const totalDecrease = intervals.reduce((sum, interval) => sum + interval.decrease, 0);
    const totalIntervalDays = intervals.reduce((sum, interval) => sum + interval.days, 0);
    const ready = intervals.length >= 3 && distinctDays >= 3;
    const readinessScore = Math.round(
      Math.min(intervals.length / 3, 1) * 55
      + Math.min(distinctDays / 3, 1) * 35
      + Math.min(observationSpanDays / 7, 1) * 10,
    );
    const [, productId] = key.split('\u0000');
    validDaysBySeries.set(key, new Set(intervals.map((interval) => interval.date)));
    products.push({
      key: `${cabinetId}:${productId}`,
      cabinetId,
      productId,
      countEvents: events.length,
      validNegativeIntervals: intervals.length,
      intervalsBlockedByRestock,
      distinctIntervalDays: distinctDays,
      observationSpanDays: round(observationSpanDays, 1),
      totalObservedDecrease: round(totalDecrease, 1),
      averageObservedUnitsPerDay: ready && totalIntervalDays > 0 ? round(totalDecrease / totalIntervalDays, 1) : null,
      readinessScore,
      status: ready ? 'ready' : events.length ? 'building' : 'not-started',
      readyForRateEstimate: ready,
    });
  }
  products.sort((a, b) => b.readinessScore - a.readinessScore || a.key.localeCompare(b.key));

  const productsByCabinet = groupBy(products, (product) => product.cabinetId);
  const allCabinetIds = new Set([...cabinetNames.keys(), ...productsByCabinet.keys()]);
  const cabinets: CabinetCountReadiness[] = Array.from(allCabinetIds).map((cabinetId) => {
    const cabinetProducts = productsByCabinet.get(cabinetId) ?? [];
    const intervals = cabinetProducts.reduce((sum, product) => sum + product.validNegativeIntervals, 0);
    const cabinetDays = new Set<string>();
    for (const product of cabinetProducts) {
      for (const day of validDaysBySeries.get(`${product.cabinetId}\u0000${product.productId}`) ?? []) cabinetDays.add(day);
    }
    const readyProducts = cabinetProducts.filter((product) => product.readyForRateEstimate).length;
    const score = cabinetProducts.length
      ? Math.round(cabinetProducts.reduce((sum, product) => sum + product.readinessScore, 0) / cabinetProducts.length)
      : 0;
    return {
      cabinetId,
      cabinetName: cabinetNames.get(cabinetId) ?? cabinetId,
      trackedProductSeries: cabinetProducts.length,
      readyProductSeries: readyProducts,
      validNegativeIntervals: intervals,
      intervalsBlockedByRestock: cabinetProducts.reduce((sum, product) => sum + product.intervalsBlockedByRestock, 0),
      distinctIntervalDays: cabinetDays.size,
      readinessScore: score,
      status: (readyProducts > 0 ? 'ready' : cabinetProducts.length ? 'building' : 'not-started') as CabinetCountReadiness['status'],
    };
  }).sort((a, b) => b.readinessScore - a.readinessScore || a.cabinetName.localeCompare(b.cabinetName));

  const readyProductSeries = products.filter((product) => product.readyForRateEstimate).length;
  const score = products.length ? Math.round(products.reduce((sum, product) => sum + product.readinessScore, 0) / products.length) : 0;
  const intervalDates = new Set<string>();
  for (const days of validDaysBySeries.values()) for (const day of days) intervalDates.add(day);
  return {
    result: {
      readinessScore: score,
      status: readyProductSeries > 0 ? 'ready' as const : products.length ? 'building' as const : 'not-started' as const,
      trackedProductSeries: products.length,
      readyProductSeries,
      validNegativeIntervals: products.reduce((sum, product) => sum + product.validNegativeIntervals, 0),
      intervalsBlockedByRestock: products.reduce((sum, product) => sum + product.intervalsBlockedByRestock, 0),
      distinctIntervalDays: intervalDates.size,
      cabinets,
      products,
    },
    usableCountEvents: parsed.length,
    inventoryRestockBoundaries: restockBoundaries.length,
    excludedInventoryEvents: excluded,
  };
}

export function buildForecastAnalytics({
  checks = [],
  cabinets = [],
  inventoryEvents = [],
  now: suppliedNow,
}: ForecastAnalyticsInput): ForecastAnalyticsResult {
  const now = suppliedNow === undefined ? new Date() : parseDate(suppliedNow);
  if (!now) throw new TypeError('buildForecastAnalytics received an invalid now value.');
  const currentStart = schoolYearStart(chicagoParts(now));
  const currentSchoolYear = schoolYearLabel(currentStart);
  const rawChecks = Array.isArray(checks) ? checks : [];
  const rawCabinets = Array.isArray(cabinets) ? cabinets : [];
  const rawInventoryEvents = Array.isArray(inventoryEvents) ? inventoryEvents : [];

  const exclusions = {
    afterSchoolRestocks: 0,
    invalidEmptySignals: 0,
    invalidTimestamps: 0,
    futureChecks: 0,
    missingCabinetIds: 0,
    duplicateCheckIds: 0,
    contradictoryChecks: 0,
    rapidRepeatChecks: 0,
  };
  const seenIds = new Set<string>();
  const candidateObservations: Observation[] = [];
  for (const check of rawChecks) {
    const id = stringValue(check.id) || null;
    if (id && seenIds.has(id)) {
      exclusions.duplicateCheckIds += 1;
      continue;
    }
    if (id) seenIds.add(id);
    const source = stringValue(check.source).toLowerCase();
    if (source === 'after-school-restock') {
      exclusions.afterSchoolRestocks += 1;
      continue;
    }
    if (hasContradictoryValidationIssue(check.validation_issues ?? check.validationIssues)) {
      exclusions.contradictoryChecks += 1;
      continue;
    }
    const isEmpty = parseEmptySignal(check.is_empty ?? check.isEmpty);
    if (isEmpty === null) {
      exclusions.invalidEmptySignals += 1;
      continue;
    }
    const checkedAt = parseDate(check.checked_at ?? check.checkedAt);
    if (!checkedAt) {
      exclusions.invalidTimestamps += 1;
      continue;
    }
    if (checkedAt.getTime() > now.getTime()) {
      exclusions.futureChecks += 1;
      continue;
    }
    const cabinetId = stringValue(check.cabinet_id ?? check.cabinetId);
    if (!cabinetId) {
      exclusions.missingCabinetIds += 1;
      continue;
    }
    const local = chicagoParts(checkedAt);
    const start = schoolYearStart(local);
    const yearsBack = Math.max(0, currentStart - start);
    candidateObservations.push({
      id,
      cabinetId,
      checkedAt,
      isEmpty,
      snackSummary: stringValue(check.snack_summary ?? check.snackSummary),
      schoolYearStart: start,
      schoolYear: schoolYearLabel(start),
      yearsBack,
      weight: weightForYearsBack(yearsBack),
      chicago: local,
      chicagoDate: dateKey(local),
    });
  }
  candidateObservations.sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime() || a.cabinetId.localeCompare(b.cabinetId) || (a.id ?? '').localeCompare(b.id ?? ''));
  const observationsByTimeBucket = new Map<string, Observation>();
  for (const observation of candidateObservations) {
    const bucket = `${observation.cabinetId}\u0000${observation.chicagoDate}\u0000${String(observation.chicago.hour).padStart(2, '0')}`;
    if (observationsByTimeBucket.has(bucket)) exclusions.rapidRepeatChecks += 1;
    // Keep the latest check in an hour; this prevents rapid repeats from acting like independent evidence.
    observationsByTimeBucket.set(bucket, observation);
  }
  const observations = Array.from(observationsByTimeBucket.values()).sort((a, b) =>
    a.checkedAt.getTime() - b.checkedAt.getTime() || a.cabinetId.localeCompare(b.cabinetId) || (a.id ?? '').localeCompare(b.id ?? ''));

  const overallEvidence = evidenceFor(observations);
  const globalMean = overallEvidence.rawChecks
    ? (0.5 + overallEvidence.effectiveEmpty) / (1 + overallEvidence.effectiveSampleSize)
    : null;
  const overallBaseEstimate = probabilityEstimate(observations, globalMean, 0, false, true);
  const overallEstimate = {
    ...overallBaseEstimate,
    confidenceTier: evidenceCoverageConfidence(observations, currentStart, overallBaseEstimate.confidenceTier),
  };
  const currentObservations = observations.filter((observation) => observation.schoolYearStart === currentStart);
  const historicalObservations = observations.filter((observation) => observation.schoolYearStart < currentStart);

  const cabinetNames = new Map<string, string>();
  const cabinetMetadata = new Map<string, { name: string; floor: number | null; location: string | null; sortOrder: number }>();
  for (const cabinet of rawCabinets) {
    const id = stringValue(cabinet.id);
    if (!id || cabinetMetadata.has(id)) continue;
    const name = stringValue(cabinet.name) || id;
    const floor = numericValue(cabinet.floor);
    const sortOrder = numericValue(cabinet.sort_order ?? cabinet.sortOrder);
    cabinetNames.set(id, name);
    cabinetMetadata.set(id, {
      name,
      floor,
      location: stringValue(cabinet.location) || null,
      sortOrder: sortOrder ?? Number.MAX_SAFE_INTEGER,
    });
  }
  for (const observation of observations) {
    if (!cabinetMetadata.has(observation.cabinetId)) {
      cabinetNames.set(observation.cabinetId, observation.cabinetId);
      cabinetMetadata.set(observation.cabinetId, {
        name: observation.cabinetId,
        floor: null,
        location: null,
        sortOrder: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const observationsByCabinet = groupBy(observations, (observation) => observation.cabinetId);
  const cabinetRows = Array.from(cabinetMetadata.entries()).map(([cabinetId, metadata]) => {
    const cabinetObservations = observationsByCabinet.get(cabinetId) ?? [];
    const baseEstimate = probabilityEstimate(cabinetObservations, globalMean, CABINET_PRIOR_STRENGTH, true);
    const estimate = {
      ...baseEstimate,
      confidenceTier: evidenceCoverageConfidence(cabinetObservations, currentStart, baseEstimate.confidenceTier),
    };
    const last = cabinetObservations.at(-1)?.checkedAt.toISOString() ?? null;
    const probability = estimate.probabilityPct;
    const statement = probability === null
      ? 'No valid observations are available for an empty-at-next-check estimate.'
      : `${probability}% estimated chance this cabinet is found empty at its next recorded check (${estimate.confidenceTier} confidence; observational, not an exact depletion time).`;
    return {
      cabinetId,
      cabinetName: metadata.name,
      floor: metadata.floor,
      location: metadata.location,
      sortOrder: metadata.sortOrder,
      rank: 0,
      riskTier: riskTier(probability),
      nextCheckEmptyProbability: estimate,
      currentVsHistorical: comparePeriods(
        cabinetObservations.filter((observation) => observation.schoolYearStart === currentStart),
        cabinetObservations.filter((observation) => observation.schoolYearStart < currentStart),
        globalMean,
      ),
      lastObservationAt: last,
      schoolYearsObserved: new Set(cabinetObservations.map((observation) => observation.schoolYear)).size,
      statement,
    };
  });
  cabinetRows.sort((a, b) => {
    const probabilityDifference = (b.nextCheckEmptyProbability.probabilityPct ?? -1) - (a.nextCheckEmptyProbability.probabilityPct ?? -1);
    return probabilityDifference || b.nextCheckEmptyProbability.rawChecks - a.nextCheckEmptyProbability.rawChecks
      || a.sortOrder - b.sortOrder || a.cabinetName.localeCompare(b.cabinetName) || a.cabinetId.localeCompare(b.cabinetId);
  });
  const cabinetRanking: CabinetForecastAnalytics[] = cabinetRows.map((cabinet, index) => ({
    cabinetId: cabinet.cabinetId,
    cabinetName: cabinet.cabinetName,
    floor: cabinet.floor,
    location: cabinet.location,
    rank: index + 1,
    riskTier: cabinet.riskTier,
    nextCheckEmptyProbability: cabinet.nextCheckEmptyProbability,
    currentVsHistorical: cabinet.currentVsHistorical,
    lastObservationAt: cabinet.lastObservationAt,
    schoolYearsObserved: cabinet.schoolYearsObserved,
    statement: cabinet.statement,
  }));

  const schoolYearGroups = groupBy(observations, (observation) => observation.schoolYear);
  const schoolYearBreakdown = Array.from(schoolYearGroups.entries()).map(([label, group]) => ({
    ...makePattern(label, label, group, globalMean),
    yearsBack: group[0]?.yearsBack ?? 0,
    weight: round(group[0]?.weight ?? 0, 3),
  })).sort((a, b) => a.yearsBack - b.yearsBack || a.key.localeCompare(b.key));

  const weeklyGroups = groupBy(observations, mondayKey);
  const weeklyTrend: WeeklyTrendPoint[] = Array.from(weeklyGroups.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-104).map(([weekStart, group]) => ({
    ...makePattern(weekStart, weekStart, group, globalMean),
    weekStart,
    weekEnd: shiftDateKey(weekStart, 6),
    schoolYear: group[0]?.schoolYear ?? '',
  }));

  const weekdayDefinitions = [
    ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'],
    ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday'],
  ] as const;
  const weekdayPattern = weekdayDefinitions.map(([key, label]) => makePattern(
    key.toLowerCase(),
    label,
    observations.filter((observation) => observation.chicago.weekday === key),
    globalMean,
  ));

  const dayparts = [
    { key: 'before-school', label: 'Before school', from: 0, to: 7 },
    { key: 'morning', label: 'Morning', from: 8, to: 10 },
    { key: 'midday', label: 'Midday / lunch', from: 11, to: 13 },
    { key: 'afternoon', label: 'Afternoon', from: 14, to: 16 },
    { key: 'after-school', label: 'After school / evening', from: 17, to: 23 },
  ];
  const daypartPattern = dayparts.map((daypart) => makePattern(
    daypart.key,
    daypart.label,
    observations.filter((observation) => observation.chicago.hour >= daypart.from && observation.chicago.hour <= daypart.to),
    globalMean,
  ));

  const observedStarts = Array.from(new Set(observations.map((observation) => observation.schoolYearStart))).sort((a, b) => b - a);
  const yearWeights = observedStarts.map((start) => ({
    schoolYear: schoolYearLabel(start),
    yearsBack: Math.max(0, currentStart - start),
    weight: round(weightForYearsBack(Math.max(0, currentStart - start)), 3),
  }));
  if (!yearWeights.some((entry) => entry.yearsBack === 0)) yearWeights.unshift({ schoolYear: currentSchoolYear, yearsBack: 0, weight: 3 });

  const readiness = inventoryReadiness(rawInventoryEvents, cabinetNames, now);
  const latestObservationAt = observations.at(-1)?.checkedAt.toISOString() ?? null;
  const dataQualityNotes = [
    'The outcome is binary: whether a cabinet was found empty when somebody checked it. It does not measure student identities, visits, or individual behavior.',
    'After-school full-restock records and checks without a valid empty/not-empty answer are excluded from empty-risk estimates.',
    'Rows flagged with contradictory validation issues are excluded, and at most the latest check per cabinet per Chicago date-hour is modeled so rapid repeats do not inflate certainty.',
    'Current-school-year observations influence the estimate three times as much as the immediately previous year; older school years decline progressively.',
    'Kish effective sample size is used for uncertainty so weighting recent observations does not pretend that one check is three independent checks.',
    'Cabinet and pattern estimates are shrunk toward the program-wide rate when samples are small; 90% intervals show remaining uncertainty.',
    'Snack-summary mentions mean an item was reported present. They are not popularity, demand, or consumption measurements.',
    'Exact depletion timing remains disabled until quantitative counts provide at least three valid negative intervals on three distinct days for a cabinet-product series.',
    'A cabinet-level full-restock event is a hard boundary for product count intervals because the restocked product mix is unknown.',
  ];

  return {
    generatedAt: now.toISOString(),
    timezone: CHICAGO_TIME_ZONE,
    methodology: {
      outcome: 'Estimated probability that a cabinet is found empty at its next recorded check.',
      interpretation: 'An observational availability-risk estimate from cabinet checks, not an exact stockout time or a measure of individual student behavior.',
      schoolYearDefinition: 'August 1 through July 31 in America/Chicago.',
      currentSchoolYear,
      yearWeights,
      weighting: 'Current school year = 3.0×; immediately previous = 1.0×; each older year = 1 / years-back (positive and progressively smaller).',
      shrinkage: `Cabinet estimates use an empirical-Bayes prior centered on the program-wide weighted rate with ${CABINET_PRIOR_STRENGTH} effective prior observations; pattern estimates use ${PATTERN_PRIOR_STRENGTH}.`,
      uncertainty: '90% equal-tailed beta-posterior interval using Kish effective sample size for the weighted observations.',
      inventoryReadinessRule: 'A cabinet-product series is ready for a consumption-rate estimate after at least three negative count intervals of four to 12 hours across at least three distinct Chicago dates; each interval must stay within one Chicago date and may not cross a cabinet full-restock boundary with unknown product mix.',
    },
    overview: {
      currentSchoolYear,
      currentSchoolYearDistinctDays: new Set(currentObservations.map((observation) => observation.chicagoDate)).size,
      nextCheckEmptyProbability: overallEstimate,
      currentVsHistorical: comparePeriods(currentObservations, historicalObservations, globalMean),
      cabinetsIncluded: cabinetRanking.length,
      cabinetsWithDirectObservations: cabinetRanking.filter((cabinet) => cabinet.nextCheckEmptyProbability.rawChecks > 0).length,
      schoolYearsObserved: observedStarts.length,
      latestObservationAt,
    },
    schoolYearBreakdown,
    cabinetRanking,
    weeklyTrend,
    weekdayPattern,
    daypartPattern,
    presenceSignals: presenceSignals(observations),
    inventoryCountReadiness: readiness.result,
    dataQuality: {
      inputChecks: rawChecks.length,
      validObservationalChecks: observations.length,
      excludedAfterSchoolRestocks: exclusions.afterSchoolRestocks,
      excludedInvalidEmptySignals: exclusions.invalidEmptySignals,
      excludedInvalidTimestamps: exclusions.invalidTimestamps,
      excludedFutureChecks: exclusions.futureChecks,
      excludedMissingCabinetIds: exclusions.missingCabinetIds,
      excludedDuplicateCheckIds: exclusions.duplicateCheckIds,
      excludedContradictoryChecks: exclusions.contradictoryChecks,
      excludedRapidRepeatChecks: exclusions.rapidRepeatChecks,
      inputInventoryEvents: rawInventoryEvents.length,
      usableCountEvents: readiness.usableCountEvents,
      inventoryRestockBoundaries: readiness.inventoryRestockBoundaries,
      excludedInventoryEvents: readiness.excludedInventoryEvents,
      notes: dataQualityNotes,
    },
  };
}
