'use client';

import {
  Activity, AlertTriangle, BarChart3, BellRing, Boxes, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, Download,
  FileBarChart, HandCoins, History, Import, Info, ListChecks, Mail, MapPin, PackageCheck, PackagePlus,
  Pencil, Printer, QrCode, RefreshCw, Route, Settings2, ShieldCheck, ShoppingCart, SlidersHorizontal,
  Sparkles, Users, Warehouse, WifiOff,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { CabinetCard, type MissionData, type Row } from './mission-control';
import type { DialogState } from './action-dialog';
import AnalyticsView from './analytics-view';

type Props = {
  view: string;
  data: MissionData;
  busy: boolean;
  mutate: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
  openDialog: (state: DialogState) => void;
  setView: (view: string) => void;
};

function PageHead({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="page-heading inner-page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>{action}</section>;
}

function money(cents: unknown) {
  return (Number(cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function dateLabel(value: unknown, includeTime = false) {
  if (!value) return 'Not scheduled';
  const raw = String(value);
  const dateOnly = !includeTime ? raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString('en-US', includeTime ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

function emptyState(icon: React.ReactNode, title: string, copy: string) {
  return <div className="empty-state roomy">{icon}<strong>{title}</strong><p>{copy}</p></div>;
}

function CabinetsView({ data, openDialog }: Pick<Props, 'data' | 'openDialog'>) {
  const forecastsOff = data.featureModes.depletion_forecasts === 'off';
  return <>
    <PageHead eyebrow="Inventory operations" title="Cabinets" copy="Manual counts become the source of truth. Legacy check data remains visible as a historical signal."
      action={<button className="primary-button" onClick={() => openDialog({ type: 'count' })}><ClipboardCheck /> Count a cabinet</button>} />
    <div className="notice-strip"><Info aria-hidden="true" /><div><strong>{forecastsOff ? 'Depletion forecasts are Off' : 'Forecast truth check'}</strong><span>{forecastsOff ? 'Current cabinet condition still appears, but projected stockout windows are disabled.' : 'Projected times unlock only after at least three valid consumption intervals across three separate days. Until then, Mission Control shows observational risk and sample size.'}</span></div></div>
    <section className="cabinet-grid large-grid">{data.cabinets.map((cabinet) => <CabinetCard key={cabinet.id} cabinet={cabinet} onOpen={(item) => openDialog({ type: 'count', cabinet: item })} />)}</section>
    <section className="panel data-panel">
      <div className="panel-heading"><div><p className="eyebrow">Recent field checks</p><h2>Cabinet history</h2></div><History /></div>
      <div className="table-wrap"><table><thead><tr><th>Time</th><th>Cabinet</th><th>Signal</th><th>Doors</th><th>Facilities</th><th>Source</th></tr></thead>
        <tbody>{data.checks.slice(0, 20).map((check) => {
          const cabinet = data.cabinets.find((item) => item.id === check.cabinet_id);
          const confirmedFull = check.source === 'after-school-restock';
          const hasEmptySignal = check.is_empty !== null && check.is_empty !== undefined;
          const isEmpty = hasEmptySignal && Number(check.is_empty) === 1;
          const hasFood = hasEmptySignal && Number(check.is_empty) === 0;
          const signal = confirmedFull ? 'Fully restocked' : isEmpty ? 'Empty' : hasFood ? 'Food present' : 'Unknown';
          const signalClass = isEmpty ? 'status-critical' : confirmedFull || hasFood ? 'status-good' : '';
          const source = confirmedFull ? 'After-school confirmation' : check.source === 'legacy-tracker' ? 'Legacy form' : 'Mission Control';
          return <tr key={check.id}><td>{dateLabel(check.checked_at, true)}</td><td><strong>{cabinet?.name ?? check.cabinet_id}</strong></td><td><span className={`status-pill ${signalClass}`}><span />{signal}</span></td><td>{check.door_status || 'Not answered'}</td><td>{Number(check.bg_needed) === 1 ? 'B&G requested' : Number(check.trash_present) === 1 ? 'Cleanup noted' : 'Clear'}</td><td>{source}</td></tr>;
        })}</tbody>
      </table></div>
    </section>
  </>;
}

function RoutesView({ data, mutate, openDialog, busy }: Pick<Props, 'data' | 'mutate' | 'openDialog' | 'busy'>) {
  const open = data.tasks.filter((task) => task.status !== 'complete');
  const complete = data.tasks.filter((task) => task.status === 'complete');
  const canManage = ['owner', 'admin', 'coordinator'].includes(data.user.role);
  return <>
    <PageHead eyebrow="Volunteer operations" title="Routes & tasks" copy="Turn cabinet risk into an ordered handoff that works between classes."
      action={canManage ? <button className="primary-button" onClick={() => openDialog({ type: 'task' })}><Route /> Create assignment</button> : undefined} />
    <section className="route-layout">
      <article className="panel route-board">
        <div className="panel-heading"><div><p className="eyebrow">Suggested route</p><h2>Next pass through the building</h2></div><MapPin /></div>
        <div className="route-line">
          {data.recommendations.slice(0, 4).map((recommendation, index) => {
            const cabinet = data.cabinets.find((item) => item.id === recommendation.cabinet_id);
            return <div className="route-stop" key={recommendation.id}><span>{index + 1}</span><div><strong>{cabinet?.name ?? recommendation.title}</strong><p>{cabinet ? `Floor ${cabinet.floor} · ${cabinet.location}` : recommendation.detail}</p><small>{recommendation.title} · {recommendation.confidence} confidence</small></div>{canManage && <button className="secondary-button" disabled={busy} onClick={() => mutate('create_task', { title: recommendation.title, type: recommendation.kind, cabinetId: recommendation.cabinet_id, priority: recommendation.priority, source: 'recommendation', instructions: recommendation.detail })}>Add</button>}</div>;
          })}
          {!data.recommendations.length && emptyState(<CheckCircle2 />, 'No route pressure', 'Create a routine check or wait for the next cabinet count.')}
        </div>
      </article>
      <article className="panel shift-panel"><div className="panel-heading"><div><p className="eyebrow">Coverage</p><h2>Volunteer shifts</h2></div><CalendarDays /></div>
        {data.shifts.length ? data.shifts.map((shift) => <div className="shift" key={shift.id}><span>{String(shift.shift_date).slice(5)}</span><div><strong>{shift.volunteer_name}</strong><small>{shift.start_time}–{shift.end_time}</small></div></div>) : emptyState(<Users />, 'No shifts scheduled', 'Assignments can still be claimed directly. Add recurring availability when the team is ready.')}
      </article>
    </section>
    <section className="panel task-panel"><div className="panel-heading"><div><p className="eyebrow">Assignments</p><h2>Open work</h2></div><ListChecks /></div>
      <div className="task-list">{open.length ? open.map((task) => <div className="task-row" key={task.id}><span className={`task-icon priority-${task.priority}`}>{task.type === 'restock' ? <Boxes /> : <ClipboardCheck />}</span><div><strong>{task.title}</strong><p>{task.cabinet_name ?? 'Program-wide'} · {task.assigned_to ? 'Assigned' : 'Unassigned'} · {dateLabel(task.due_at, true)}</p></div><button className="secondary-button" disabled={busy} onClick={() => mutate('complete_task', { id: task.id })}><Check /> Complete</button></div>) : emptyState(<CheckCircle2 />, 'No open assignments', 'Add a recommendation from the route above or create a new assignment.')}</div>
      {!!complete.length && <details className="completed-tasks"><summary>{complete.length} completed assignment{complete.length === 1 ? '' : 's'}</summary>{complete.slice(0, 10).map((task) => <div key={task.id}><Check /> {task.title}<span>{dateLabel(task.completed_at, true)}</span></div>)}</details>}
    </section>
  </>;
}

function InventoryView({ data, openDialog }: Pick<Props, 'data' | 'openDialog'>) {
  const canManage = ['owner', 'admin', 'coordinator'].includes(data.user.role);
  const canBulkRestock = ['owner', 'admin'].includes(data.user.role);
  const purchasingOff = data.featureModes.purchasing_recommendations === 'off';
  return <>
    <PageHead eyebrow="Stockroom intelligence" title="Inventory & purchasing" copy="Prioritize what students choose while keeping cost, nutrition, allergens, and stock pressure visible. Restocks happen after school; daytime alerts show availability risk for closeout planning."
      action={canManage ? <div className="button-pair">{canBulkRestock && <button className="primary-button" onClick={() => openDialog({ type: 'full-restock' })}><PackageCheck /> Record after-school full restock</button>}<button className="secondary-button" onClick={() => openDialog({ type: 'purchase' })}><PackagePlus /> Record purchase</button><button className="secondary-button" onClick={() => openDialog({ type: 'count' })}><ClipboardCheck /> Count stock</button></div> : undefined} />
    <section className="inventory-layout">
      <article className="panel purchase-rank"><div className="panel-heading"><div><p className="eyebrow">Recommended order</p><h2>What to buy next</h2></div><ShoppingCart /></div>
        <p className="panel-note">Scores combine current price fields, nutrition profile, allergen notes, popularity settings, and early scarcity signals. Confirm pricing before purchase.</p>
        {purchasingOff ? emptyState(<ShoppingCart />, 'Recommendations are Off', 'Use Admin to move purchasing recommendations into Review or On.') : <div className="ranking-list">{data.purchaseRecommendations.slice(0, 6).map((item, index) => <div key={item.product_id}><span className="rank">{index + 1}</span><div><strong>{item.name}</strong><p>{item.recommendation}</p><small>{item.signal}</small></div><div className="score"><b>{item.score}</b><span>/100</span></div></div>)}</div>}
      </article>
      <article className="panel warehouse-card"><div className="panel-heading"><div><p className="eyebrow">Central storage</p><h2>Stockroom</h2></div><Warehouse /></div>
        {emptyState(<WifiOff />, 'First stockroom count needed', 'Cabinet counts are connected. Add central storage quantities to calculate exact transfer and reorder amounts.')}
        {canManage && <button className="secondary-button wide" onClick={() => openDialog({ type: 'count' })}>Start with cabinet inventory</button>}
      </article>
    </section>
    <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">Product catalog</p><h2>Price, nutrition, allergens, popularity</h2></div><SlidersHorizontal /></div>
      <div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Case</th><th>Cost</th><th>Per snack</th><th>Popularity</th><th>Allergens</th>{canManage && <th><span className="sr-only">Actions</span></th>}</tr></thead><tbody>{data.products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.category}</td><td>{product.units_per_case ?? '—'}</td><td>{product.cost_per_case ? money(Number(product.cost_per_case) * 100) : 'Needs price'}</td><td>{product.cost_per_case && product.units_per_case ? money((Number(product.cost_per_case) / Number(product.units_per_case)) * 100) : '—'}</td><td><div className="mini-meter"><span style={{ width: `${product.popularity_score}%` }} /></div><small>{product.popularity_score}/100</small></td><td>{Array.isArray(product.allergen_flags) && product.allergen_flags.length ? product.allergen_flags.join(', ') : 'None declared'}</td>{canManage && <td><button className="table-action" onClick={() => openDialog({ type: 'product', product })}><Pencil /> Edit</button></td>}</tr>)}</tbody></table></div>
    </section>
  </>;
}

function ImpactView({ data, openDialog, mutate, busy }: Pick<Props, 'data' | 'openDialog' | 'mutate' | 'busy'>) {
  const isAdmin = ['owner', 'admin'].includes(data.user.role);
  const canGenerate = ['owner', 'admin', 'coordinator'].includes(data.user.role);
  const now = new Date();
  const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', year: 'numeric' }).format(now);
  const chicagoParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const chicagoYear = Number(chicagoParts.find((part) => part.type === 'year')?.value);
  const chicagoMonth = Number(chicagoParts.find((part) => part.type === 'month')?.value);
  const priorMonthDate = new Date(Date.UTC(chicagoYear, chicagoMonth - 2, 1));
  const priorMonthKey = priorMonthDate.toISOString().slice(0, 7);
  const priorMonthName = priorMonthDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const pdfMode = data.featureModes.monthly_board_pdf ?? 'off';
  const weeklyMode = data.featureModes.weekly_reports ?? 'off';
  return <>
    <PageHead eyebrow="Stewardship" title="Impact & reports" copy="Keep measured, estimated, and projected figures distinct—then turn them into reports people can trust."
      action={isAdmin ? <button className="primary-button" onClick={() => openDialog({ type: 'donation' })}><HandCoins /> Record donation</button> : undefined} />
    <section className="impact-metrics internal-impact">
      <div><span>Verified launch impact</span><strong>{Number(data.metrics.baselineSnacks).toLocaleString()}+</strong><small>snacks shared</small></div>
      <div><span>Students reached</span><strong>{Number(data.metrics.baselineStudents).toLocaleString()}+</strong><small>in week one</small></div>
      <div><span>Entered donations</span><strong>{money(data.metrics.donationCents)}</strong><small>current ledger</small></div>
      <div><span>Donation-linked snack impact</span><strong>{Number(data.metrics.donationSnacks).toLocaleString()}</strong><small>{Number(data.metrics.donationSnacks) ? `${Number(data.metrics.purchaseLinkedDonationSnacks).toLocaleString()} purchase-linked · ${Number(data.metrics.estimatedDonationSnacks).toLocaleString()} estimated` : 'eligible funds not yet entered'}</small></div>
    </section>
    <section className="report-grid">
      <article className="panel report-card featured-report"><FileBarChart /><p className="eyebrow">Monthly board packet</p><h2>{monthName} · month to date</h2><p>A monthly snapshot of cabinet checks, impact, purchasing, controls, and methodology.</p><div className="draft-badge">{pdfMode === 'on' ? 'Approved output' : pdfMode === 'review' ? 'Draft · review mode' : 'Off'}</div>{pdfMode === 'off' ? <span className="read-only-note">Enable in Admin to generate</span> : <div className="report-downloads"><a className="primary-button wide" href="/api/reports/monthly.pdf" target="_blank" rel="noreferrer"><Download /> Current month draft</a><a className="secondary-button wide" href={`/api/reports/monthly.pdf?month=${priorMonthKey}`} target="_blank" rel="noreferrer"><Download /> Closed {priorMonthName}</a></div>}</article>
      <article className="panel report-card"><Mail /><p className="eyebrow">Weekly operating report</p><h2>Automatic draft</h2><p>Prepared from cabinet checks, inventory changes, routes, and spending. Delivery requires the weekly feature and external-delivery master gate to both be On.</p><div className="draft-badge">{weeklyMode === 'on' ? 'On · scheduled delivery eligible' : weeklyMode === 'review' ? 'Review · sends nothing' : 'Off'}</div>{canGenerate && weeklyMode !== 'off' ? <button className="secondary-button wide" disabled={busy} onClick={() => mutate('generate_weekly_report', {})}><Sparkles /> {busy ? 'Generating…' : 'Generate weekly draft'}</button> : <span className="read-only-note">{canGenerate ? 'Enable Review to generate drafts' : 'Read-only access'}</span>}</article>
      <article className="panel report-card"><BarChart3 /><p className="eyebrow">Public impact</p><h2>Review the public view</h2><p>Only approved aggregate snapshots appear publicly.</p><div className="draft-badge">{data.featureModes.public_impact === 'on' ? 'Published' : 'Private preview'}</div><a className="secondary-button wide" href="/impact?preview=1"><ChevronRight /> Open preview</a></article>
    </section>
    {!!data.reports.length && <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">Report archive</p><h2>Drafts and published reports</h2></div><FileBarChart /></div><div className="report-archive">{data.reports.map((report) => <div key={report.id}><span className="draft-badge">{report.status}</span><div><strong>{String(report.type).replace(/\b\w/g, (letter) => letter.toUpperCase())} report · {dateLabel(report.period_start)}–{dateLabel(report.period_end)}</strong><p>{report.summary}</p></div></div>)}</div></section>}
    <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">Donation ledger</p><h2>Donation to impact</h2></div><CircleDollarSign /></div>
      {data.donations.length ? <div className="table-wrap"><table><thead><tr><th>Received</th><th>Donor label</th><th>Campaign</th><th>Amount</th><th>Impact statement</th><th>Status</th></tr></thead><tbody>{data.donations.map((donation) => <tr key={donation.id}><td>{dateLabel(donation.received_at)}</td><td><strong>{donation.donor_label}</strong></td><td>{donation.campaign}</td><td>{money(donation.amount_cents)}</td><td>{donation.attribution_type === 'purchase-linked' ? `Funded ${Number(donation.attributed_snacks).toLocaleString()} snacks through linked purchases` : donation.attribution_type === 'estimated' ? `Equivalent to approximately ${Number(donation.attributed_snacks).toLocaleString()} snacks at the configured average cost` : 'Not allocated to snack purchases'}</td><td><span className={`draft-badge ${donation.attribution_type === 'purchase-linked' ? 'verified-badge' : ''}`}>{donation.attribution_type === 'purchase-linked' ? 'Purchase-linked' : donation.attribution_type === 'estimated' ? 'Estimated' : 'Unallocated'}</span></td></tr>)}</tbody></table></div> : emptyState(<HandCoins />, 'No donations entered yet', 'Add a donation when you are ready. Nothing has been fabricated for the review dashboard.')}
    </section>
    {!!data.purchases.length && <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">Purchasing ledger</p><h2>Recorded purchases</h2></div><ShoppingCart /></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Vendor</th><th>Amount</th><th>Snack units</th><th>Donation link</th></tr></thead><tbody>{data.purchases.map((purchase) => <tr key={purchase.id}><td>{dateLabel(purchase.purchased_at)}</td><td><strong>{purchase.vendor}</strong></td><td>{money(purchase.amount_cents)}</td><td>{purchase.snack_units ? Number(purchase.snack_units).toLocaleString() : 'Not entered'}</td><td>{purchase.donation_id ? 'Linked' : 'Unallocated'}</td></tr>)}</tbody></table></div></section>}
  </>;
}

function FeedbackView({ data, mutate, busy }: Pick<Props, 'data' | 'mutate' | 'busy'>) {
  return <>
    <PageHead eyebrow="Student voice" title="Feedback & inquiries" copy="Cabinet updates, snack requests, and messages from the public site."
      action={<button className="secondary-button" onClick={() => window.print()}><Printer /> Print QR cards</button>} />
    <section className="panel feedback-inbox"><div className="panel-heading"><div><p className="eyebrow">Website inquiries</p><h2>{Number(data.metrics.inquiriesNew ?? 0)} new message{Number(data.metrics.inquiriesNew ?? 0) === 1 ? '' : 's'}</h2></div><Mail /></div>
      {data.inquiries.length ? <div className="feedback-list">{data.inquiries.map((item) => <article key={item.id}><span className="feedback-kind">{item.topic}</span><div><strong>{item.name} · <a href={`mailto:${encodeURIComponent(String(item.email))}`}>{item.email}</a></strong><p>{item.message}</p><small>{dateLabel(item.submitted_at, true)} · {item.status}</small></div>{item.status === 'new' && <button className="secondary-button" disabled={busy} onClick={() => mutate('review_inquiry', { id: item.id, status: 'reviewed' })}><Check /> Reviewed</button>}</article>)}</div> : emptyState(<Mail />, 'No inquiries yet', 'Messages from the contact form will appear here.')}
    </section>
    <section className="qr-grid">{data.cabinets.map((cabinet) => <article className="qr-card" key={cabinet.id}><div className="qr-code"><QRCodeSVG value={`https://studentsfeedingstudents.org/feedback/${cabinet.id}`} size={132} level="M" fgColor="#171310" bgColor="#fffdf9" /></div><div><p className="eyebrow">Scan at cabinet</p><h2>{cabinet.name}</h2><p>Floor {cabinet.floor} · {cabinet.location}</p><a href={`/feedback/${cabinet.id}`}>Open form <ChevronRight /></a></div></article>)}</section>
    <section className="panel feedback-inbox"><div className="panel-heading"><div><p className="eyebrow">Moderation inbox</p><h2>{data.metrics.feedbackNew} new response{data.metrics.feedbackNew === 1 ? '' : 's'}</h2></div><BellRing /></div>
      {data.feedback.length ? <div className="feedback-list">{data.feedback.map((item) => <article key={item.id}><span className={`feedback-kind kind-${item.kind}`}>{String(item.kind).replaceAll('_', ' ')}</span><div><strong>{item.cabinet_name}{item.submitted_name ? ` · ${item.submitted_name}` : ''}</strong><p>{item.product_request || item.message || 'No additional note.'}</p><small>{dateLabel(item.submitted_at, true)} · {item.status}</small></div>{item.status === 'new' && <button className="secondary-button" disabled={busy} onClick={() => mutate('review_feedback', { id: item.id, status: 'reviewed' })}><Check /> Reviewed</button>}</article>)}</div> : emptyState(<QrCode />, 'No feedback yet', 'The cabinet-specific forms are live and ready for responses.')}
    </section>
  </>;
}

function FeatureControl({ feature, busy, mutate }: { feature: Row; busy: boolean; mutate: Props['mutate'] }) {
  function choose(mode: string) {
    if (mode === 'on' && !window.confirm(`Turn ${feature.label} On? This enables its approved production behavior.`)) return;
    void mutate('set_feature', { key: feature.key, mode });
  }
  return <article className="feature-control"><div className="feature-copy"><span className={`feature-state state-${feature.mode}`} /><div><strong>{feature.label}</strong><p>{feature.description}</p>{Number(feature.requires_setup) === 1 && <small><AlertTriangle /> Connection or setup required before On</small>}</div></div><div className="mode-control" role="group" aria-label={`${feature.label} mode`}>{['off', 'review', 'on'].map((mode) => <button key={mode} className={feature.mode === mode ? 'active' : ''} disabled={busy} onClick={() => choose(mode)}>{mode === 'off' ? 'Off' : mode === 'review' ? 'Review' : 'On'}</button>)}</div></article>;
}

function AdminView({ data, mutate, busy }: Pick<Props, 'data' | 'mutate' | 'busy'>) {
  const groups = Object.groupBy(data.features, (feature) => String(feature.category));
  return <>
    <PageHead eyebrow="Owner controls" title="Admin" copy="Shared access, activation gates, tracker imports, and an audit history for the whole operation." />
    <section className="admin-grid">
      <article className="panel accounts-panel"><div className="panel-heading"><div><p className="eyebrow">Shared password</p><h2>One key for the SFS team</h2></div><Users /></div>
        <div className="shared-access-summary"><ShieldCheck /><div><strong>Full Mission Control access</strong><p>Anyone who knows the shared password can view data and use every owner control. Email approval and individual roles are no longer required.</p></div></div>
        <p className="shared-access-note">Use “Lock Mission Control” in the sidebar when leaving a shared device.</p>
      </article>
      <article className="panel import-panel"><div className="panel-heading"><div><p className="eyebrow">Legacy tracker</p><h2>Migration status</h2></div><Import /></div>
        <div className="migration-stat"><strong>{Number(data.metrics.trackerChecks).toLocaleString()}</strong><span>legacy tracker checks available in Mission Control</span></div>
        <p>{data.metrics.trackerSyncConfigured ? <>Last synced {dateLabel(data.metrics.trackerLastImport, true)}. Mission Control checks for new rows at most every five minutes; manual re-import is also safe because fingerprints prevent duplicate history.</> : <>Automatic sync is not configured on this deployment. Existing imported history remains available.</>}</p>
        <button className="secondary-button wide" disabled={busy || !data.metrics.trackerSyncConfigured} onClick={() => mutate('import_tracker', {})}><RefreshCw /> {busy ? 'Syncing…' : data.metrics.trackerSyncConfigured ? 'Sync tracker now' : 'Sync not configured'}</button>
        <div className="security-next"><AlertTriangle /><p><strong>Shared-password boundary</strong>The tracker source stays server-only, but anyone with the Mission Control password receives full operational access.</p></div>
      </article>
    </section>
    <section className="panel feature-panel"><div className="panel-heading"><div><p className="eyebrow">Activation center</p><h2>Off, Review, or On—feature by feature</h2></div><Settings2 /></div>
      <div className="activation-legend"><span><i className="state-off" />Off: unavailable</span><span><i className="state-review" />Review: drafts only</span><span><i className="state-on" />On: approved production behavior</span></div>
      {Object.entries(groups).map(([category, features]) => <div className="feature-group" key={category}><h3>{category}</h3>{features?.map((feature) => <FeatureControl key={feature.key} feature={feature} busy={busy} mutate={mutate} />)}</div>)}
    </section>
    <section className="admin-bottom-grid">
      <article className="panel operations-plan"><div className="panel-heading"><div><p className="eyebrow">Daily operating policy</p><h2>After-school closeout</h2></div><PackageCheck /></div><ol><li><span>1</span><div><strong>Observe during the day</strong><p>Checks and alerts document availability without triggering daytime restocks.</p></div></li><li><span>2</span><div><strong>Refill every cabinet after school</strong><p>Restore all five bins in each cabinet to 50 snacks.</p></div></li><li><span>3</span><div><strong>Confirm once</strong><p>Record the program-wide full restock to reset all four cabinet statuses.</p></div></li></ol><a className="secondary-button wide" href="/missioncontrol?view=inventory">Open inventory closeout</a></article>
      <article className="panel audit-panel"><div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h2>Recent system activity</h2></div><Activity /></div><div>{data.activity.length ? data.activity.slice(0, 10).map((item) => <p key={item.id}><span>{item.action}</span><small>{dateLabel(item.created_at, true)}</small></p>) : <p><span>No activity yet</span></p>}</div></article>
    </section>
  </>;
}

export default function MissionView(props: Props) {
  if (props.view === 'cabinets') return <CabinetsView data={props.data} openDialog={props.openDialog} />;
  if (props.view === 'analytics' && props.data.analytics) return <AnalyticsView analytics={props.data.analytics} />;
  if (props.view === 'routes') return <RoutesView data={props.data} mutate={props.mutate} openDialog={props.openDialog} busy={props.busy} />;
  if (props.view === 'inventory') return <InventoryView data={props.data} openDialog={props.openDialog} />;
  if (props.view === 'impact') return <ImpactView data={props.data} openDialog={props.openDialog} mutate={props.mutate} busy={props.busy} />;
  if (props.view === 'feedback') return <FeedbackView data={props.data} mutate={props.mutate} busy={props.busy} />;
  if (props.view === 'admin') return <AdminView data={props.data} mutate={props.mutate} busy={props.busy} />;
  return <section className="placeholder-view"><p className="eyebrow">Mission Control</p><h2>Choose a workspace</h2></section>;
}
