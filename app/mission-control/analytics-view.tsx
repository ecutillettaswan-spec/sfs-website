'use client';

import { useMemo, useState } from 'react';
import {
  Activity, BarChart3, CalendarRange, CheckCircle2, CircleGauge, Clock3,
  Database, Info, LockKeyhole, PackageSearch, ShieldCheck, TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  CabinetForecastAnalytics, ForecastAnalyticsResult, PatternPoint,
  ProbabilityEstimate, WeeklyTrendPoint,
} from '@/lib/forecast-analytics';

type Props = { analytics: ForecastAnalyticsResult };

function pct(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

function signedPoints(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Not enough comparison data';
  if (Math.abs(value) < 0.05) return 'No change';
  return `${value > 0 ? '+' : ''}${Math.round(value)} pts`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No observation yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function confidenceLabel(value: string) {
  return value === 'early' ? 'Early evidence' : `${value.charAt(0).toUpperCase()}${value.slice(1)} confidence`;
}

function ProbabilityBand({ estimate, compact = false }: { estimate: ProbabilityEstimate; compact?: boolean }) {
  if (estimate.probabilityPct === null || !estimate.interval90Pct) {
    return <div className="probability-empty">Not enough observations</div>;
  }
  const low = Math.max(0, estimate.interval90Pct.low);
  const high = Math.min(100, estimate.interval90Pct.high);
  const value = Math.max(0, Math.min(100, estimate.probabilityPct));
  return <div className={compact ? 'probability-band compact' : 'probability-band'}
    role="img"
    aria-label={`${Math.round(value)} percent estimated chance the next check finds the cabinet empty; 90 percent interval ${Math.round(low)} to ${Math.round(high)} percent`}>
    <div className="probability-track">
      <span className="probability-interval" style={{ left: `${low}%`, width: `${Math.max(1, high - low)}%` }} />
      <span className="probability-marker" style={{ left: `${value}%` }} />
    </div>
    {!compact && <div className="probability-scale"><span>0%</span><span>90% range {Math.round(low)}–{Math.round(high)}%</span><span>100%</span></div>}
  </div>;
}

function Kpi({ label, value, note, tone = 'neutral', icon }: {
  label: string; value: string; note: string; tone?: 'neutral' | 'warning' | 'good'; icon: React.ReactNode;
}) {
  return <article className={`analytics-kpi analytics-kpi-${tone}`}>
    <div className="analytics-kpi-top"><span>{label}</span>{icon}</div>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}

function pathFor(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

function WeeklyTrendChart({ points }: { points: WeeklyTrendPoint[] }) {
  const usable = points.filter((point) => point.estimate.probabilityPct !== null);
  if (!usable.length) return <div className="analytics-empty"><CalendarRange /><strong>No weekly trend yet</strong><p>The chart appears after valid cabinet checks are recorded.</p></div>;
  const width = 760;
  const height = 245;
  const padding = { left: 45, right: 22, top: 18, bottom: 42 };
  const times = usable.map((point) => Date.parse(point.weekStart));
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  const range = Math.max(7 * 86_400_000, maximum - minimum);
  const x = (time: number) => padding.left + ((time - minimum) / range) * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + ((100 - value) / 100) * (height - padding.top - padding.bottom);
  const segments: WeeklyTrendPoint[][] = [];
  for (const point of usable) {
    const current = segments.at(-1);
    if (!current || Date.parse(point.weekStart) - Date.parse(current.at(-1)!.weekStart) > 15 * 86_400_000) segments.push([point]);
    else current.push(point);
  }
  const highest = usable.reduce((best, point) => (point.estimate.probabilityPct ?? -1) > (best.estimate.probabilityPct ?? -1) ? point : best);
  return <figure className="trend-figure">
    <figcaption><strong>Weekly found-empty likelihood</strong><span>Smoothed probability with a 90% uncertainty band</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="weekly-chart-title weekly-chart-desc">
      <title id="weekly-chart-title">Weekly found-empty likelihood</title>
      <desc id="weekly-chart-desc">The highest plotted week is {highest.label} at {pct(highest.estimate.probabilityPct)}. Gaps separate periods without checks.</desc>
      <defs><pattern id="forecast-band-pattern" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" /></pattern></defs>
      {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} /><text className="chart-axis" x={padding.left - 9} y={y(tick) + 4} textAnchor="end">{tick}%</text></g>)}
      {segments.map((segment, index) => {
        const center = segment.map((point) => ({ x: x(Date.parse(point.weekStart)), y: y(point.estimate.probabilityPct ?? 0) }));
        const top = segment.map((point) => ({ x: x(Date.parse(point.weekStart)), y: y(point.estimate.interval90Pct?.high ?? point.estimate.probabilityPct ?? 0) }));
        const bottom = [...segment].reverse().map((point) => ({ x: x(Date.parse(point.weekStart)), y: y(point.estimate.interval90Pct?.low ?? point.estimate.probabilityPct ?? 0) }));
        return <g key={segment[0].weekStart}>
          {segment.length > 1 && <path className="chart-band" d={`${pathFor(top)} ${pathFor(bottom).replace(/^M/, 'L')} Z`} />}
          {segment.length > 1 && <path className="chart-line" d={pathFor(center)} />}
          {center.map((point, pointIndex) => <circle key={`${index}-${pointIndex}`} className="chart-point" cx={point.x} cy={point.y} r="4" />)}
        </g>;
      })}
      <text className="chart-axis" x={padding.left} y={height - 12}>{usable[0].label}</text>
      <text className="chart-axis" x={width - padding.right} y={height - 12} textAnchor="end">{usable.at(-1)!.label}</text>
    </svg>
    <div className="chart-legend"><span><i className="legend-line" /> Smoothed estimate</span><span><i className="legend-band" /> 90% range</span><span>Each dot is one week with checks</span></div>
  </figure>;
}

function PatternBars({ title, points, icon }: { title: string; points: PatternPoint[]; icon: React.ReactNode }) {
  const visible = points.filter((point) => point.estimate.rawChecks > 0);
  return <article className="panel pattern-panel">
    <div className="panel-heading"><div><p className="eyebrow">Observed pattern</p><h2>{title}</h2></div>{icon}</div>
    <div className="pattern-list">{visible.length ? visible.map((point) => <div className="pattern-row" key={point.key}>
      <div><strong>{point.label}</strong><small>{point.estimate.rawChecks} check{point.estimate.rawChecks === 1 ? '' : 's'}</small></div>
      <div className="pattern-track" aria-hidden="true"><span style={{ width: `${point.estimate.probabilityPct ?? 0}%` }} /></div>
      <b>{pct(point.estimate.probabilityPct)}</b>
    </div>) : <p className="analytics-muted">No usable observations in this breakdown yet.</p>}</div>
  </article>;
}

function CabinetRow({ cabinet }: { cabinet: CabinetForecastAnalytics }) {
  const comparison = cabinet.currentVsHistorical;
  const delta = comparison.deltaPercentagePoints;
  return <article className="cabinet-risk-row">
    <div className="risk-rank">{cabinet.rank}</div>
    <div className="risk-cabinet"><strong>{cabinet.cabinetName}</strong><small>{cabinet.location ? `Floor ${cabinet.floor} · ${cabinet.location}` : formatDate(cabinet.lastObservationAt)}</small></div>
    <div className="risk-estimate"><strong>{pct(cabinet.nextCheckEmptyProbability.probabilityPct)}</strong><small>{confidenceLabel(cabinet.nextCheckEmptyProbability.confidenceTier)}</small></div>
    <ProbabilityBand estimate={cabinet.nextCheckEmptyProbability} compact />
    <div className="risk-comparison">
      <span>Now <b>{pct(comparison.currentSchoolYear.observedRatePct)}</b> · {comparison.currentSchoolYear.rawChecks} checks</span>
      <span>Prior <b>{pct(comparison.historical.observedRatePct)}</b> · {comparison.historical.rawChecks} checks</span>
    </div>
    <span className={`trend-chip ${delta !== null && delta > 0 ? 'trend-up' : 'trend-down'}`}>{delta !== null && delta > 0 ? <TrendingUp /> : <TrendingDown />}{signedPoints(delta)}</span>
  </article>;
}

export default function AnalyticsView({ analytics }: Props) {
  const [period, setPeriod] = useState<'current' | 'all'>('current');
  const currentYear = analytics.overview.currentSchoolYear;
  const weekly = useMemo(() => period === 'current'
    ? analytics.weeklyTrend.filter((point) => point.schoolYear === currentYear)
    : analytics.weeklyTrend, [analytics.weeklyTrend, currentYear, period]);
  const overview = analytics.overview;
  const currentComparison = overview.currentVsHistorical;
  const highestRisk = analytics.cabinetRanking[0];
  const readiness = analytics.inventoryCountReadiness;
  const change = currentComparison.deltaPercentagePoints;

  return <>
    <section className="page-heading inner-page-heading analytics-heading">
      <div><p className="eyebrow">Availability analytics</p><h1>Forecasts & analytics</h1><p>Operational probability, trends, and data quality—weighted toward what is happening this school year.</p></div>
      <div className="analytics-period" role="group" aria-label="Weekly chart period">
        <button className={period === 'current' ? 'active' : ''} onClick={() => setPeriod('current')}>{currentYear}</button>
        <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>All history</button>
      </div>
    </section>

    <div className="model-banner"><ShieldCheck /><div><strong>Current school year has 3× the influence</strong><span>Older evidence still contributes. Probabilities mean “chance the next recorded check finds this cabinet empty”—not percent of the day empty, student demand, or an exact stockout time.</span></div><span className="model-version">90% ranges</span></div>

    <section className="analytics-kpi-grid" aria-label="Forecast overview">
      <Kpi label="Next-check empty risk" value={pct(overview.nextCheckEmptyProbability.probabilityPct)} note={`${confidenceLabel(overview.nextCheckEmptyProbability.confidenceTier)} · ${overview.nextCheckEmptyProbability.rawChecks} usable checks`} tone="warning" icon={<CircleGauge />} />
      <Kpi label={`${currentYear} observed rate`} value={pct(currentComparison.currentSchoolYear.observedRatePct)} note={`${currentComparison.currentSchoolYear.emptyChecks} empty findings in ${currentComparison.currentSchoolYear.rawChecks} checks across ${overview.currentSchoolYearDistinctDays} days`} icon={<Activity />} />
      <Kpi label="Change from prior year" value={signedPoints(change)} note={change !== null && change > 0 ? 'empty findings increased at recorded checks' : 'comparison of recorded checks'} tone={change !== null && change > 0 ? 'warning' : 'good'} icon={change !== null && change > 0 ? <TrendingUp /> : <TrendingDown />} />
      <Kpi label="Exact forecast readiness" value={`${readiness.readyProductSeries}/${Math.max(readiness.trackedProductSeries, 0)}`} note={`${readiness.validNegativeIntervals} valid same-cycle count intervals`} tone={readiness.readyProductSeries ? 'good' : 'neutral'} icon={<Database />} />
    </section>

    <section className="analytics-main-grid">
      <article className="panel trend-panel">
        <WeeklyTrendChart points={weekly} />
        <details className="chart-table-fallback"><summary>View weekly data table</summary><div className="table-wrap"><table><thead><tr><th>Week</th><th>Checks</th><th>Found empty</th><th>Observed</th><th>Smoothed estimate</th><th>90% range</th></tr></thead><tbody>{weekly.map((point) => <tr key={point.weekStart}><td>{point.label}</td><td>{point.estimate.rawChecks}</td><td>{point.estimate.emptyChecks}</td><td>{pct(point.estimate.observedRatePct)}</td><td>{pct(point.estimate.probabilityPct)}</td><td>{point.estimate.interval90Pct ? `${pct(point.estimate.interval90Pct.low)}–${pct(point.estimate.interval90Pct.high)}` : '—'}</td></tr>)}</tbody></table></div></details>
      </article>
      <article className="panel risk-summary-panel">
        <div className="panel-heading"><div><p className="eyebrow">Highest current pressure</p><h2>{highestRisk?.cabinetName ?? 'Waiting for checks'}</h2></div><BarChart3 /></div>
        {highestRisk ? <><div className="hero-probability"><strong>{pct(highestRisk.nextCheckEmptyProbability.probabilityPct)}</strong><span>chance the next check finds it empty</span></div><ProbabilityBand estimate={highestRisk.nextCheckEmptyProbability} /><p>{highestRisk.statement}</p><div className="evidence-pair"><span><b>{highestRisk.nextCheckEmptyProbability.effectiveSampleSize}</b>effective observations</span><span><b>{highestRisk.schoolYearsObserved}</b>school years represented</span></div></> : <p>No observational data yet.</p>}
      </article>
    </section>

    <section className="panel cabinet-risk-panel">
      <div className="panel-heading"><div><p className="eyebrow">Cabinet comparison</p><h2>Where empty findings are most likely</h2></div><PackageSearch /></div>
      <div className="cabinet-risk-head"><span>Rank</span><span>Cabinet</span><span>Weighted risk</span><span>90% range</span><span>Raw seasons</span><span>Change</span></div>
      <div className="cabinet-risk-list">{analytics.cabinetRanking.map((cabinet) => <CabinetRow cabinet={cabinet} key={cabinet.cabinetId} />)}</div>
    </section>

    <section className="pattern-grid">
      <PatternBars title="By weekday" points={analytics.weekdayPattern} icon={<CalendarRange />} />
      <PatternBars title="By time of day" points={analytics.daypartPattern} icon={<Clock3 />} />
    </section>

    <section className="analytics-bottom-grid">
      <article className="panel presence-panel">
        <div className="panel-heading"><div><p className="eyebrow">Availability signals</p><h2>Snacks reported present</h2></div><PackageSearch /></div>
        <p className="panel-note">This is presence in written check summaries, not popularity or consumption.</p>
        <div className="presence-list">{analytics.presenceSignals.categories.slice(0, 7).map((signal) => <div key={signal.key}><div><strong>{signal.label}</strong><small>{signal.mentions} summarized checks</small></div><span><i style={{ width: `${Math.min(100, signal.weightedMentionRatePct)}%` }} /></span><b>{pct(signal.weightedMentionRatePct)}</b></div>)}</div>
      </article>
      <article className="panel readiness-panel">
        <div className="panel-heading"><div><p className="eyebrow">Precision runway</p><h2>Exact depletion timing</h2></div><LockKeyhole /></div>
        <div className="readiness-score"><span><i style={{ width: `${Math.min(100, readiness.readinessScore)}%` }} /></span><b>{readiness.readinessScore}% ready</b></div>
        <p>{readiness.readyProductSeries ? `${readiness.readyProductSeries} product series have enough same-cycle quantitative history for a rate estimate.` : 'Exact times stay locked until repeated manual counts measure decreases within the same restock cycle.'}</p>
        <ol className="readiness-steps"><li className={analytics.dataQuality.usableCountEvents > 0 ? 'done' : ''}><CheckCircle2 /><span><strong>Record complete unit counts</strong><small>All five snack bins in one cabinet</small></span></li><li className={readiness.validNegativeIntervals > 0 ? 'done' : ''}><CheckCircle2 /><span><strong>Measure same-cycle decreases</strong><small>Never bridge an after-school full restock</small></span></li><li className={readiness.readyProductSeries > 0 ? 'done' : ''}><CheckCircle2 /><span><strong>Cover at least three days</strong><small>Enough repetition to estimate a rate</small></span></li></ol>
      </article>
    </section>

    <section className="panel methodology-panel">
      <div className="panel-heading"><div><p className="eyebrow">Model card</p><h2>What the forecast knows—and what it does not</h2></div><Info /></div>
      <div className="quality-metrics"><div><strong>{analytics.dataQuality.validObservationalChecks}</strong><span>usable observations</span></div><div><strong>{analytics.dataQuality.excludedContradictoryChecks}</strong><span>contradictions excluded</span></div><div><strong>{analytics.dataQuality.excludedInvalidEmptySignals}</strong><span>unanswered outcomes</span></div><div><strong>{overview.cabinetsWithDirectObservations}/{overview.cabinetsIncluded}</strong><span>cabinets covered</span></div></div>
      <details><summary>Read the full methodology</summary><div className="methodology-copy"><p><strong>Outcome.</strong> {analytics.methodology.outcome}</p><p><strong>Weighting.</strong> {analytics.methodology.weighting}</p><p><strong>Small samples.</strong> {analytics.methodology.shrinkage}</p><p><strong>Uncertainty.</strong> {analytics.methodology.uncertainty}</p><p><strong>Quantitative gate.</strong> {analytics.methodology.inventoryReadinessRule}</p><ul>{analytics.dataQuality.notes.map((note) => <li key={note}>{note}</li>)}</ul></div></details>
      <footer><span><ShieldCheck /> Evidence-weighted model</span><span>Updated {formatDate(analytics.generatedAt)}</span></footer>
    </section>
  </>;
}
