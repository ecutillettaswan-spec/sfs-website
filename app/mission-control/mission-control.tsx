'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Activity, BarChart3, Bell, Boxes, Building2, CalendarCheck, ChevronRight, ClipboardCheck,
  Command, HandCoins, LayoutDashboard, Menu, PackageCheck, Route, Search, Settings2,
  LogOut, ShieldCheck, X,
} from 'lucide-react';
import ActionDialog, { type DialogState } from './action-dialog';
import MissionView from './views';
import type { ForecastAnalyticsResult } from '@/lib/forecast-analytics';

// D1 query payloads are normalized at the API boundary and intentionally remain flexible here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type MissionData = {
  user: { id: string; email: string; name: string; role: string };
  cabinets: Row[];
  products: Row[];
  inventory: Row[];
  checks: Row[];
  tasks: Row[];
  shifts: Row[];
  donations: Row[];
  purchases: Row[];
  feedback: Row[];
  features: Row[];
  reports: Row[];
  users: Row[];
  approvedEmails: Row[];
  activity: Row[];
  recommendations: Row[];
  purchaseRecommendations: Row[];
  analytics: ForecastAnalyticsResult | null;
  settings: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metrics: Record<string, any>;
  featureModes: Record<string, string>;
  authMode: 'shared-password';
};

const nav = [
  { id: 'today', label: 'Today', Icon: LayoutDashboard },
  { id: 'cabinets', label: 'Cabinets', Icon: Building2 },
  { id: 'analytics', label: 'Forecasts & analytics', Icon: BarChart3 },
  { id: 'routes', label: 'Routes & tasks', Icon: Route },
  { id: 'inventory', label: 'Inventory & purchasing', Icon: Boxes },
  { id: 'impact', label: 'Impact & reports', Icon: HandCoins },
  { id: 'feedback', label: 'Feedback', Icon: Bell },
  { id: 'admin', label: 'Admin', Icon: Settings2 },
];

function formatRole(role: string) {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: unknown) {
  if (!value) return 'No check yet';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function confidenceLabel(value: unknown) {
  const label = String(value ?? 'low');
  return label === 'early' ? 'Early signal' : `${label.charAt(0).toUpperCase()}${label.slice(1)} confidence`;
}

function StatusPill({ status }: { status: Row }) {
  return <span className={`status-pill status-${status.severity ?? 'unknown'}`}><span />{status.label ?? 'Unknown'}</span>;
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

export function CabinetCard({ cabinet, onOpen }: { cabinet: Row; onOpen?: (cabinet: Row) => void }) {
  const latest = cabinet.latest_check as Row | null;
  const forecast = cabinet.forecast as Row | null;
  const hasEmptySignal = latest?.is_empty !== null && latest?.is_empty !== undefined;
  const confirmedFull = latest?.source === 'after-school-restock';
  const latestSignal = latest?.source === 'after-school-restock'
    ? 'Fully restocked'
    : hasEmptySignal && Number(latest?.is_empty) === 1
      ? 'Empty'
      : (hasEmptySignal && Number(latest?.is_empty) === 0) || latest?.snack_summary
        ? 'Food present'
        : 'Unknown';
  return (
    <article className={`cabinet-card cabinet-${cabinet.status?.severity ?? 'unknown'}`}>
      <div className="cabinet-top">
        <div className="cabinet-number">{String(cabinet.name).replace('Cabinet ', '')}</div>
        <StatusPill status={cabinet.status ?? {}} />
      </div>
      <h3>{cabinet.name}</h3>
      <p className="location">Floor {cabinet.floor} · {cabinet.location}</p>
      <div className="cabinet-reading">
        {forecast ? <div><span>Projected stockout · {forecast.product_name}</span><strong>{new Date(String(forecast.predicted_at)).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' })}</strong></div> : <div>
          <span>{cabinet.fill_percent === null ? 'Latest signal' : confirmedFull ? 'Confirmed full' : 'Counted fill'}</span>
          <strong>{cabinet.fill_percent === null ? latestSignal : `${cabinet.fill_percent}%`}</strong>
        </div>}
        {cabinet.fill_percent !== null && <div className="fill-track" aria-label={`${cabinet.fill_percent}% of target inventory`}><span style={{ width: `${Math.min(100, cabinet.fill_percent)}%` }} /></div>}
      </div>
      <div className="cabinet-meta">
        <span><Activity aria-hidden="true" /> Checked {formatTime(latest?.checked_at)}</span>
        <span><ShieldCheck aria-hidden="true" /> {confidenceLabel(cabinet.forecast_confidence)}</span>
      </div>
      <button className="card-link" type="button" onClick={() => onOpen?.(cabinet)}>Open cabinet <ChevronRight aria-hidden="true" /></button>
    </article>
  );
}

export default function MissionControl({ initialData }: { initialData: MissionData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [view, setViewState] = useState(initialData.user.role === 'board_viewer' ? 'impact' : 'today');
  const [mobileNav, setMobileNav] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const canAdmin = ['owner', 'admin'].includes(data.user.role);
  const visibleNav = data.user.role === 'board_viewer' ? nav.filter((item) => item.id === 'impact')
    : data.user.role === 'volunteer' ? nav.filter((item) => ['today', 'cabinets', 'routes', 'feedback'].includes(item.id))
    : canAdmin ? nav : nav.filter((item) => item.id !== 'admin');
  const outboundOn = data.featureModes.outbound_delivery === 'on';
  const today = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()), []);
  const greeting = useMemo(() => {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }, []);
  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return [
      ...data.cabinets.filter((item) => `${item.name} ${item.location}`.toLowerCase().includes(query)).map((item) => ({ id: `cabinet-${item.id}`, label: item.name, detail: item.location, view: 'cabinets' })),
      ...data.tasks.filter((item) => `${item.title} ${item.cabinet_name ?? ''}`.toLowerCase().includes(query)).map((item) => ({ id: `task-${item.id}`, label: item.title, detail: item.cabinet_name ?? 'Program-wide assignment', view: 'routes' })),
      ...data.products.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query)).map((item) => ({ id: `product-${item.id}`, label: item.name, detail: item.category, view: 'inventory' })),
    ].slice(0, 8);
  }, [data.cabinets, data.products, data.tasks, search]);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get('view');
    const allowed = initialData.user.role === 'board_viewer' ? current === 'impact'
      : initialData.user.role === 'volunteer' ? Boolean(current && ['today', 'cabinets', 'routes', 'feedback'].includes(current))
      : Boolean(current && (current !== 'admin' || ['owner', 'admin'].includes(initialData.user.role)) && nav.some((item) => item.id === current));
    if (current && allowed) window.setTimeout(() => setViewState(current), 0);
    else if (current) {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      window.history.replaceState({}, '', url);
    }
  }, [initialData.user.role]);

  function setView(next: string) {
    setViewState(next);
    const url = new URL(window.location.href);
    if (next === 'today') url.searchParams.delete('view'); else url.searchParams.set('view', next);
    window.history.replaceState({}, '', url);
  }

  const refresh = useCallback(async () => {
    const response = await fetch('/api/mission-control', { cache: 'no-store' });
    if (!response.ok) throw new Error('Mission Control could not refresh.');
    setData(await response.json() as MissionData);
  }, []);

  useEffect(() => {
    const refreshQuietly = () => { void refresh().catch(() => undefined); };
    const interval = window.setInterval(refreshQuietly, 5 * 60_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshQuietly(); };
    window.addEventListener('focus', refreshQuietly);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshQuietly);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  async function mutate(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch('/api/mission-control', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, payload }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'The action could not be completed.');
      await refresh();
      setToast(result.message ?? 'Saved.');
      setDialog(null);
      window.setTimeout(() => setToast(''), 4200);
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The action could not be completed.');
      window.setTimeout(() => setToast(''), 5200);
      return false;
    } finally { setBusy(false); }
  }

  async function signOut() {
    await fetch('/api/mission-control/session', { method: 'DELETE' }).catch(() => undefined);
    router.replace('/missioncontrol');
    router.refresh();
  }

  return (
    <div className="mission-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className={mobileNav ? 'mission-sidebar mobile-open' : 'mission-sidebar'}>
        <div className="brand-lockup">
          <Image src="/sfs-logo2.png" alt="Students Feeding Students" width={42} height={42} priority />
          <div><strong>SFS</strong><span>Mission Control</span></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
        </div>
        <nav aria-label="Mission Control">
          <p>Operate</p>
          {visibleNav.filter((item) => item.id !== 'admin').map(({ id, label, Icon }) => (
            <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setMobileNav(false); }}>
              <Icon aria-hidden="true" /><span>{label}</span>
              {id === 'feedback' && data.metrics.feedbackNew > 0 && <b>{data.metrics.feedbackNew}</b>}
            </button>
          ))}
          <p>System</p>
          {visibleNav.filter((item) => item.id === 'admin').map(({ id, label, Icon }) => (
            <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setMobileNav(false); }}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-mode">
          <span className={`mode-dot ${outboundOn ? 'mode-live' : ''}`} />
          <div><strong>{outboundOn ? 'Delivery enabled' : 'Review mode'}</strong><small>{outboundOn ? 'External master gate is On' : 'External actions paused'}</small></div>
        </div>
        <div className="sidebar-user">
          <span>{data.user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <div><strong>{data.user.name}</strong><small>{formatRole(data.user.role)}</small></div>
        </div>
        <button className="sidebar-signout" onClick={signOut}><LogOut aria-hidden="true" /> Lock Mission Control</button>
      </aside>

      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <div className="mission-main">
        <header className="mission-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
          <div className="topbar-title"><Command aria-hidden="true" /><span>OPRF operations</span></div>
          <label className="global-search"><Search aria-hidden="true" /><span className="sr-only">Search Mission Control</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cabinets, tasks, snacks…" /></label>
          <div className="topbar-actions">
            <a className="public-link" href="/impact?preview=1">Preview impact</a>
            {data.user.role !== 'board_viewer' && <button className="icon-button" aria-label="Open alerts and controls" onClick={() => setView(canAdmin ? 'admin' : 'today')}><Bell />{(data.metrics.urgent > 0 || data.metrics.feedbackNew > 0) && <span className="notification-dot" />}</button>}
          </div>
        </header>

        {search.trim() && <div className="search-popover" role="region" aria-label="Search results">
          <div className="search-popover-head"><strong>Search results</strong><button onClick={() => setSearch('')} aria-label="Clear search"><X /></button></div>
          {searchResults.length ? searchResults.map((result) => <button key={result.id} onClick={() => { setView(result.view); setSearch(''); }}><Search /><span><strong>{result.label}</strong><small>{result.detail}</small></span><ChevronRight /></button>) : <p>No matching cabinets, tasks, or snacks.</p>}
        </div>}

        <main id="main-content" className="command-center" tabIndex={-1}>
          {view === 'today' && <section className="page-heading">
            <div><p className="eyebrow">{today}</p><h1>{greeting}. Here’s the handoff.</h1><p>Live operations from manual counts and the existing cabinet check history.</p></div>
            <div className="button-pair">
              <button className={canAdmin ? 'secondary-button' : 'primary-button'} onClick={() => setDialog({ type: 'count' })}><ClipboardCheck aria-hidden="true" /> Start a cabinet count</button>
              {canAdmin && <button className="primary-button" onClick={() => setDialog({ type: 'full-restock' })}><PackageCheck aria-hidden="true" /> Record after-school full restock</button>}
            </div>
          </section>}

          {view !== 'today' ? (
            <MissionView view={view} data={data} busy={busy} mutate={mutate} openDialog={setDialog} setView={setView} />
          ) : <>
            <section className="metrics-row" aria-label="Today at a glance">
              <Metric label="Needs attention" value={data.metrics.urgent} note={data.metrics.urgent ? 'plan for after-school closeout' : 'no after-school restock pressure'} />
              <Metric label="Cabinets active" value={`${data.metrics.activeCabinets}/${data.metrics.activeCabinets}`} note="across three floors" />
              <Metric label="Tracker checks" value={Number(data.metrics.trackerChecks).toLocaleString()} note="legacy history preserved" />
              <Metric label="Open assignments" value={data.metrics.openTasks} note="ready to route" />
            </section>

            <div className="section-heading">
              <div><p className="eyebrow">Live cabinet board</p><h2>Every cabinet, one glance.</h2></div>
              <button className="secondary-button" onClick={() => setView('cabinets')}>View all cabinets</button>
            </div>
            <section className="cabinet-grid">
              {data.cabinets.map((cabinet) => <CabinetCard key={cabinet.id} cabinet={cabinet} onOpen={(item) => setDialog({ type: 'count', cabinet: item })} />)}
            </section>

            <section className="lower-grid">
              <article className="panel recommendations-panel">
                <div className="panel-heading"><div><p className="eyebrow">Recommended next</p><h2>Action queue</h2></div><ClipboardCheck aria-hidden="true" /></div>
                <div className="recommendation-list">
                  {data.recommendations.length ? data.recommendations.slice(0, 4).map((item, index) => (
                    <div className="recommendation" key={item.id}>
                      <span className={`priority priority-${item.priority}`}>{index + 1}</span>
                      <div><strong>{item.title}</strong><p>{item.detail}</p><small>{confidenceLabel(item.confidence)}</small></div>
                      <button aria-label={item.action} onClick={() => mutate('create_task', { title: item.title, type: item.kind, cabinetId: item.cabinet_id, priority: item.priority, source: 'recommendation', instructions: item.detail })}><ChevronRight /></button>
                    </div>
                  )) : <div className="empty-state"><CalendarCheck aria-hidden="true" /><strong>Nothing urgent</strong><p>The next quantitative count will sharpen tomorrow’s plan.</p></div>}
                </div>
              </article>

              <article className="panel system-panel">
                <div className="panel-heading"><div><p className="eyebrow">System controls</p><h2>Feature settings</h2></div><Settings2 aria-hidden="true" /></div>
                <div className="system-list">
                  {data.features.slice(0, 5).map((feature) => (
                    <div key={feature.key}><span className={`feature-state state-${feature.mode}`} />
                      <div><strong>{feature.label}</strong><small>{feature.mode === 'on' ? 'On' : feature.mode === 'review' ? 'Review mode' : 'Off'}</small></div>
                    </div>
                  ))}
                </div>
                <button className="secondary-button wide" onClick={() => setView('admin')}><Settings2 aria-hidden="true" /> Open feature controls</button>
              </article>
            </section>
          </>}
        </main>
      </div>
      {dialog && <ActionDialog state={dialog} data={data} busy={busy} onClose={() => setDialog(null)} mutate={mutate} />}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
