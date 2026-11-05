'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Check, Pencil, Phone, Plus, X } from 'lucide-react';
import {
  formatMonthDay,
  formatPhone,
  formatRange,
  formatStamp,
  nameKey,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  type StockingClosure,
  type StockingDay,
  type StockingPerson,
  type StockingState,
  type StockingStatus,
} from '@/lib/stocking-shared';

const POLL_MS = 4_000;
const NOTICE_MS = 6_000;
const ME_STORAGE_KEY = 'sfs-stocking-me';
const SOMEONE_ELSE = '__someone-else';

// "This is me" is remembered per phone in localStorage. If storage is blocked
// (private browsing), it still works until the tab is closed.
let memoryMe: string | null = null;
const meListeners = new Set<() => void>();

function readMe() {
  try { return window.localStorage.getItem(ME_STORAGE_KEY) ?? memoryMe; } catch { return memoryMe; }
}

function subscribeMe(listener: () => void) {
  meListeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === ME_STORAGE_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    meListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function saveMe(name: string | null) {
  memoryMe = name;
  try {
    if (name) window.localStorage.setItem(ME_STORAGE_KEY, name);
    else window.localStorage.removeItem(ME_STORAGE_KEY);
  } catch { /* storage blocked; memoryMe covers this tab */ }
  meListeners.forEach((listener) => listener());
}

function defaultDate(state: StockingState) {
  const day = state.days.find((item) => item.phase === 'today') ?? state.days.find((item) => item.phase === 'future') ?? state.days.at(-1);
  return day?.date ?? null;
}

function patchPerson(state: StockingState, date: string, key: string, patch: Partial<StockingPerson>): StockingState {
  return {
    ...state,
    days: state.days.map((day) => day.date !== date ? day : {
      ...day,
      people: day.people.map((person) => person.key === key ? { ...person, ...patch } : person),
    }),
  };
}

function count(day: StockingDay) {
  const coming = day.people.filter((person) => person.status === 'in').length;
  const out = day.people.filter((person) => person.status === 'out').length;
  return { coming, out, unanswered: day.people.length - coming - out };
}

function statusLine(person: StockingPerson, day: StockingDay, today: string) {
  const at = person.statusAt ? ` · ${formatStamp(person.statusAt, today)}` : '';
  if (person.status === 'in') return `can make it${at}`;
  if (person.status === 'out') return `can’t make it${at}`;
  return day.phase === 'past' ? 'no answer' : 'no answer yet';
}

type Notice = { text: string; tone: 'info' | 'error' };

export default function StockingBoard({ initialState }: { initialState: StockingState | null }) {
  const [state, setState] = useState(initialState);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [online, setOnline] = useState(initialState !== null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pickingMe, setPickingMe] = useState(false);
  const [meChoice, setMeChoice] = useState('');
  const confirmed = useRef(initialState);
  const inFlight = useRef(0);
  const generation = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);
  const me = useSyncExternalStore(subscribeMe, readMe, () => null);
  const meKey = me ? nameKey(me) : null;

  const showNotice = useCallback((text: string, tone: Notice['tone'] = 'info') => {
    window.clearTimeout(noticeTimer.current);
    setNotice({ text, tone });
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const accept = useCallback((next: StockingState) => {
    confirmed.current = next;
    setState(next);
  }, []);

  const poll = useCallback(async () => {
    if (inFlight.current > 0) return;
    const startedAt = generation.current;
    const known = confirmed.current;
    const query = known ? `?v=${encodeURIComponent(known.version)}&d=${known.today}` : '';
    try {
      const response = await fetch(`/api/stocking${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as StockingState | { unchanged: true };
      setOnline(true);
      // Ignore poll results that raced with a save; the save's own response is newer.
      if ('unchanged' in data || inFlight.current > 0 || generation.current !== startedAt) return;
      accept(data);
    } catch {
      setOnline(false);
    }
  }, [accept]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void poll(); };
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    if (!confirmed.current) refresh();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [poll]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const send = useCallback(async (body: Record<string, unknown>, optimistic?: (current: StockingState) => StockingState) => {
    if (!confirmed.current) return false;
    inFlight.current += 1;
    generation.current += 1;
    if (optimistic) setState((current) => current ? optimistic(current) : current);
    try {
      const response = await fetch('/api/stocking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, actor: readMe() }),
      });
      const data = await response.json().catch(() => null) as (StockingState & { error?: string }) | null;
      if (!response.ok || !data || data.error) throw new Error(data?.error ?? 'That didn’t save. Try again.');
      accept(data);
      setOnline(true);
      return true;
    } catch (error) {
      setState(confirmed.current);
      showNotice(error instanceof TypeError ? 'Can’t reach the server. Check your connection and try again.' : (error as Error).message, 'error');
      return false;
    } finally {
      inFlight.current -= 1;
    }
  }, [accept, showNotice]);

  const everyone = useMemo(() => {
    const names = new Map<string, string>();
    for (const day of state?.days ?? []) for (const person of day.people) if (!names.has(person.key)) names.set(person.key, person.name);
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [state]);

  if (!state) {
    return (
      <main className="stk">
        <TopBar online={online} />
        <div className="stk-wrap stk-wrap-single">
          <div className="stk-day stk-empty">
            <p><strong>Couldn’t load the schedule.</strong></p>
            <p>Trying again every few seconds. If this keeps happening, text your stocking lead.</p>
          </div>
        </div>
      </main>
    );
  }

  const activeDate = state.days.some((day) => day.date === selectedDate) ? selectedDate : defaultDate(state);
  const day = state.days.find((item) => item.date === activeDate) ?? state.days[0];
  const weekdayName = WEEKDAY_NAMES[day.weekday];
  const lead = day.people.find((person) => person.role === 'lead');
  const mine = meKey ? day.people.filter((person) => person.key === meKey) : [];
  const people = meKey ? [...mine, ...day.people.filter((person) => person.key !== meKey)] : day.people;
  const myDays = meKey ? state.days.filter((item) => !item.closed && item.people.some((person) => person.key === meKey)) : [];
  const tally = count(day);
  const first = state.days[0];
  const last = state.days[state.days.length - 1];
  const nextWeek = state.days.every((item) => item.phase === 'future');
  const closed = day.closed;
  const canAddExtra = day.phase === 'today' && !closed;
  const upcomingClosures = state.closures.filter((item) => item.end >= state.today);
  const meOnDay = meKey ? day.people.some((person) => person.key === meKey) : false;
  const days = state.days;

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = days.findIndex((item) => item.date === day.date);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? days.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + days.length) % days.length;
    setSelectedDate(days[next].date);
    document.getElementById(`stk-tab-${days[next].date}`)?.focus();
  }

  function respond(person: StockingPerson, status: StockingStatus) {
    if (day.phase === 'past') return;
    if (status === 'in' && day.phase === 'future') {
      showNotice(`Too early to check in. Come back on ${weekdayName} to say you can make it.`);
      return;
    }
    const next = person.status === status ? null : status;
    void send(
      { action: 'respond', date: day.date, name: person.name, status: next },
      (current) => patchPerson(current, day.date, person.key, { status: next, statusAt: next ? new Date().toISOString() : null }),
    );
  }

  async function addExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) { showNotice('Type your name first.'); return; }
    if (await send({ action: 'add-extra', date: day.date, name })) form.reset();
  }

  async function addToLineup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) { showNotice('Type a name first.'); return; }
    if (await send({ action: 'roster-add', weekday: day.weekday, name })) form.reset();
  }

  function removePerson(person: StockingPerson) {
    if (person.role === 'extra') {
      if (window.confirm(`Remove ${person.name} from ${weekdayName}?`)) void send({ action: 'remove-extra', date: day.date, name: person.name });
      return;
    }
    if (window.confirm(`Remove ${person.name} from the ${weekdayName} lineup? This changes every week, for everyone.`)) {
      void send({ action: 'roster-remove', id: person.rosterId });
    }
  }

  async function savePhone(event: FormEvent<HTMLFormElement>, person: StockingPerson) {
    event.preventDefault();
    const phone = String(new FormData(event.currentTarget).get('phone') ?? '');
    if (await send({ action: 'roster-phone', id: person.rosterId, phone })) showNotice(phone.trim() ? 'Phone number saved.' : 'Phone number removed.');
  }

  async function addClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const start = String(data.get('start') ?? '');
    if (!start) { showNotice('Pick the first day with no stocking.'); return; }
    const end = String(data.get('end') ?? '') || start;
    if (await send({ action: 'closure-add', start, end, reason: String(data.get('reason') ?? '') })) {
      form.reset();
      showNotice(`Saved. No stocking ${formatRange(start, end)}.`);
    }
  }

  function removeClosure(closure: StockingClosure) {
    if (window.confirm(`Turn stocking back on for ${formatRange(closure.start, closure.end)}?`)) {
      void send({ action: 'closure-remove', id: closure.id });
    }
  }

  function pickMe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = String(new FormData(event.currentTarget).get('other') ?? '');
    const name = (meChoice === SOMEONE_ELSE ? typed : meChoice).replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) { showNotice('Pick your name first.'); return; }
    saveMe(name);
    setPickingMe(false);
  }

  function openPicker() {
    setMeChoice(me && everyone.includes(me) ? me : '');
    setPickingMe(true);
  }

  return (
    <main className="stk">
      <TopBar online={online} />
      <div className="stk-wrap">
        <div className="stk-main">
          <header className="stk-title">
            <h1>Stocking schedule</h1>
            <p>
              {nextWeek ? 'Next week' : 'This week'} · {formatMonthDay(first.date)} – {formatMonthDay(last.date)}
            </p>
          </header>

          <section className="stk-me" aria-label="Your name">
            {pickingMe ? (
              <form className="stk-me-form" onSubmit={pickMe}>
                <label htmlFor="stk-me-select">Which one are you?</label>
                <div className="stk-inline">
                  <select id="stk-me-select" className="stk-input" value={meChoice} onChange={(event) => setMeChoice(event.target.value)}>
                    <option value="" disabled>Pick your name</option>
                    {everyone.map((name) => <option key={name} value={name}>{name}</option>)}
                    <option value={SOMEONE_ELSE}>I’m not on the list</option>
                  </select>
                  {meChoice === SOMEONE_ELSE && (
                    <input className="stk-input" name="other" placeholder="Your name" maxLength={40} autoComplete="given-name" autoFocus />
                  )}
                </div>
                <div className="stk-inline">
                  <button type="submit" className="stk-btn solid">Save</button>
                  <button type="button" className="stk-btn" onClick={() => setPickingMe(false)}>Cancel</button>
                  {me && <button type="button" className="stk-link" onClick={() => { saveMe(null); setPickingMe(false); }}>Forget me on this phone</button>}
                </div>
              </form>
            ) : me ? (
              <p>
                <span className="stk-tag is-me">you</span> <strong>{me}</strong>
                <span className="stk-me-days">
                  {myDays.length ? `on ${myDays.map((item) => WEEKDAY_SHORT[item.weekday]).join(', ')}` : 'not on the schedule this week'}
                </span>
                <button type="button" className="stk-link" onClick={openPicker}>change</button>
              </p>
            ) : (
              <p>
                <button type="button" className="stk-link" onClick={openPicker}>Set your name</button>
                <span className="stk-me-days">to mark your days</span>
              </p>
            )}
          </section>

          <div className="stk-tabs" role="tablist" aria-label="Days this week" onKeyDown={onTabKey}>
            {state.days.map((item) => {
              const selected = item.date === day.date;
              const mineToday = meKey && !item.closed ? item.people.some((person) => person.key === meKey) : false;
              return (
                <button
                  key={item.date}
                  id={`stk-tab-${item.date}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="stk-day-panel"
                  tabIndex={selected ? 0 : -1}
                  className={`stk-tab is-${item.phase}${item.closed ? ' is-closed' : ''}`}
                  onClick={() => setSelectedDate(item.date)}
                >
                  <span className="stk-tab-day">{WEEKDAY_SHORT[item.weekday]}</span>
                  <span className="stk-tab-date">{item.phase === 'today' ? 'today' : item.closed ? 'off' : formatMonthDay(item.date)}</span>
                  {mineToday && <span className="stk-tab-dot" title="You’re on this day" />}
                </button>
              );
            })}
          </div>

          <section id="stk-day-panel" className="stk-day" role="tabpanel" aria-labelledby={`stk-tab-${day.date}`}>
            <div className="stk-dayhead">
              <h2>
                {weekdayName} <small>{formatMonthDay(day.date)}</small>
                {day.phase === 'today' && <span className="stk-phase is-today">today</span>}
                {day.phase === 'past' && <span className="stk-phase">done</span>}
                {closed && <span className="stk-phase is-off">no stocking</span>}
              </h2>
              {!closed && (
                <p className="stk-tally">
                  {day.phase === 'future' ? (
                    <><b>{day.people.length}</b> on the list · <b>{tally.out}</b> can’t make it</>
                  ) : (
                    <><b>{tally.coming}</b> {day.phase === 'past' ? 'came' : 'coming'} · <b>{tally.out}</b> can’t · <b>{tally.unanswered}</b> no answer</>
                  )}
                </p>
              )}
            </div>

            {editing && (
              <div className="stk-note is-edit">
                <span>Editing the {weekdayName} lineup. Changes apply every week, for everyone, and show up in the change log.</span>
                <button type="button" className="stk-btn" onClick={() => setEditing(false)}><Check aria-hidden="true" /> Done</button>
              </div>
            )}
            {!editing && closed && (
              <p className="stk-closed">
                No stocking {day.phase === 'today' ? 'today' : `on ${weekdayName}`}{closed.reason ? `: ${closed.reason}` : ''}.
                <span>You can change this under No-stocking days.</span>
              </p>
            )}
            {!editing && !closed && day.phase === 'future' && (
              <p className="stk-note">Check-in opens {weekdayName}. You can already say you can’t make it.</p>
            )}
            {!editing && !closed && day.phase === 'past' && (
              <p className="stk-note">{weekdayName} is over. This is what people said.</p>
            )}
            {!closed && !lead && day.people.length > 0 && (
              <p className="stk-note is-warn">No lead for {weekdayName}s. Use Edit lineup to pick one.</p>
            )}
            {!closed && lead?.status === 'out' && day.phase !== 'past' && (
              <p className="stk-note is-warn">{lead.name} (lead) can’t make it. Someone needs to cover as lead.</p>
            )}

            {closed && !editing ? null : people.length === 0 ? (
              <p className="stk-empty">Nobody is on {weekdayName} yet.{editing ? '' : ' Use Edit lineup to add people.'}</p>
            ) : (
              <ul className="stk-people" key={day.date}>
                {people.map((person) => (
                  <PersonRow
                    key={person.key}
                    person={person}
                    day={day}
                    today={state.today}
                    isMe={person.key === meKey}
                    editing={editing}
                    onRespond={respond}
                    onRemove={removePerson}
                    onMakeLead={(target) => void send({ action: 'roster-lead', id: target.rosterId })}
                    onSavePhone={savePhone}
                  />
                ))}
              </ul>
            )}

            {editing ? (
              <form className="stk-add" onSubmit={addToLineup}>
                <label htmlFor="stk-lineup-name">Add someone to every {weekdayName}</label>
                <div className="stk-inline">
                  <input id="stk-lineup-name" className="stk-input" name="name" placeholder="Name" maxLength={40} autoComplete="off" />
                  <button type="submit" className="stk-btn solid"><Plus aria-hidden="true" /> Add</button>
                </div>
              </form>
            ) : canAddExtra ? (
              <form className="stk-add" onSubmit={addExtra} key={`${day.date}-${meOnDay ? '' : me ?? ''}`}>
                <label htmlFor="stk-extra-name">Not on the list but going today?</label>
                <div className="stk-inline">
                  <input
                    id="stk-extra-name"
                    className="stk-input"
                    name="name"
                    placeholder="Your name"
                    maxLength={40}
                    autoComplete="given-name"
                    defaultValue={meOnDay ? '' : me ?? ''}
                  />
                  <button type="submit" className="stk-btn solid"><Plus aria-hidden="true" /> Add me for today</button>
                </div>
              </form>
            ) : day.phase === 'future' && !closed ? (
              <p className="stk-foot">Going on {weekdayName} but not on the list? Add yourself that day.</p>
            ) : null}

            <div className="stk-cardfoot">
              <button type="button" className="stk-btn" onClick={() => setEditing((value) => !value)} aria-pressed={editing}>
                {editing ? <><Check aria-hidden="true" /> Done editing</> : <><Pencil aria-hidden="true" /> Edit {weekdayName} lineup</>}
              </button>
            </div>
          </section>
        </div>

        <aside className="stk-aside">
          <details className="stk-panel" open>
            <summary>How it works</summary>
            <div className="stk-panel-body">
              <ul>
                <li>Sign up for at least 2 days if your schedule allows. 3 or more is great.</li>
                <li>“I can make it” only works on the day itself. That’s your check-in.</li>
                <li>Can’t go? Tap “I can’t make it” as soon as you know, even days ahead, so the lead sees it.</li>
                <li>Free last minute? Add yourself for today and go.</li>
              </ul>
            </div>
          </details>
          <NoStockingDays closures={upcomingClosures} today={state.today} onAdd={addClosure} onRemove={removeClosure} />
          <details className="stk-panel">
            <summary>Stocking lead responsibilities</summary>
            <div className="stk-panel-body">
              <ol>
                <li>Stay until all cabinets are stocked</li>
                <li>Handle any problems that come up</li>
                <li>Make sure stocking is done properly (red bins, recycling)</li>
                <li>Communicate with the people signed up</li>
                <li>Assign someone to lead if you can’t be there</li>
                <li>Call CFO Erik if something goes wrong</li>
                <li>Make sure everyone checks in on this page</li>
              </ol>
            </div>
          </details>
          <details className="stk-panel">
            <summary>Change log</summary>
            <div className="stk-panel-body">
              {state.log.length === 0 ? <p className="stk-muted">No changes yet.</p> : (
                <ol className="stk-log">
                  {state.log.map((entry) => (
                    <li key={entry.id}>
                      <time dateTime={entry.at}>{formatStamp(entry.at, state.today, true)}</time>
                      <span>{entry.text}{entry.actor && !entry.text.startsWith(entry.actor) ? <em> · by {entry.actor}</em> : null}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        </aside>
      </div>

      {notice && (
        <div className={`stk-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}><X aria-hidden="true" /></button>
        </div>
      )}
    </main>
  );
}

type NoStockingDaysProps = {
  closures: StockingClosure[];
  today: string;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (closure: StockingClosure) => void;
};

function NoStockingDays({ closures, today, onAdd, onRemove }: NoStockingDaysProps) {
  return (
    <details className="stk-panel" open>
      <summary>No-stocking days</summary>
      <div className="stk-panel-body">
        {closures.length === 0 ? <p className="stk-muted">None coming up.</p> : (
          <ul className="stk-closures">
            {closures.map((closure) => (
              <li key={closure.id}>
                <span className="stk-closure-dates">{formatRange(closure.start, closure.end)}</span>
                <span className="stk-closure-reason">{closure.reason || 'No stocking'}</span>
                <button type="button" className="stk-x" aria-label={`Remove ${formatRange(closure.start, closure.end)}`} title="Remove" onClick={() => onRemove(closure)}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="stk-closure-form" onSubmit={onAdd}>
          <label><span>First day</span><input className="stk-input" type="date" name="start" min={today} required /></label>
          <label><span>Last day <small>(blank = one day)</small></span><input className="stk-input" type="date" name="end" min={today} /></label>
          <label><span>Reason <small>(optional)</small></span><input className="stk-input" name="reason" placeholder="Institute day" maxLength={60} autoComplete="off" /></label>
          <button type="submit" className="stk-btn solid"><Plus aria-hidden="true" /> Add no-stocking days</button>
        </form>
      </div>
    </details>
  );
}

function TopBar({ online }: { online: boolean }) {
  return (
    <div className="stk-bar">
      <div className="stk-bar-inner">
        {/* Plain link on purpose: on Cloudflare Pages "/" is the static index.html, not an app route. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="stk-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sfs-logo2.png" alt="" width={26} height={26} />
          <span>SFS</span>
        </a>
        <span className="stk-path">/stocking</span>
        <span className={`stk-live${online ? '' : ' is-offline'}`} role="status">
          <i aria-hidden="true" />{online ? 'live' : 'offline · retrying'}
        </span>
      </div>
    </div>
  );
}

type PersonRowProps = {
  person: StockingPerson;
  day: StockingDay;
  today: string;
  isMe: boolean;
  editing: boolean;
  onRespond: (person: StockingPerson, status: StockingStatus) => void;
  onRemove: (person: StockingPerson) => void;
  onMakeLead: (person: StockingPerson) => void;
  onSavePhone: (event: FormEvent<HTMLFormElement>, person: StockingPerson) => void;
};

function PersonRow({ person, day, today, isMe, editing, onRespond, onRemove, onMakeLead, onSavePhone }: PersonRowProps) {
  const status = person.status ?? 'none';
  const canRemove = person.role !== 'extra' || day.phase !== 'past';
  return (
    <li className={`stk-row is-${status}${isMe ? ' is-me' : ''}`}>
      <div className="stk-who">
        <span className="stk-name">{person.name}</span>
        {person.role === 'lead' && <span className="stk-tag is-lead">lead</span>}
        {person.role === 'extra' && <span className="stk-tag">just this day</span>}
        {isMe && <span className="stk-tag is-me">you</span>}
        {person.role === 'lead' && person.phone && !editing && (
          <a className="stk-phone" href={`tel:+1${person.phone}`}><Phone aria-hidden="true" />{formatPhone(person.phone)}</a>
        )}
        <span className="stk-state">{statusLine(person, day, today)}</span>
      </div>

      {editing ? (
        <div className="stk-edit">
          {person.role === 'lead' && (
            <form className="stk-inline" onSubmit={(event) => onSavePhone(event, person)} key={person.phone ?? 'none'}>
              <input
                className="stk-input"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="Lead phone"
                aria-label={`${person.name}’s phone number`}
                defaultValue={person.phone ? formatPhone(person.phone) : ''}
                maxLength={24}
              />
              <button type="submit" className="stk-btn">Save</button>
            </form>
          )}
          <div className="stk-inline">
            {person.role === 'regular' && <button type="button" className="stk-btn" onClick={() => onMakeLead(person)}>Make lead</button>}
            {canRemove && <button type="button" className="stk-btn danger" onClick={() => onRemove(person)}>Remove</button>}
          </div>
        </div>
      ) : day.phase !== 'past' ? (
        <div className="stk-actions">
          <button
            type="button"
            className={`stk-btn yes${day.phase === 'future' ? ' is-locked' : ''}`}
            aria-pressed={person.status === 'in'}
            onClick={() => onRespond(person, 'in')}
          >
            <Check aria-hidden="true" /> I can make it
          </button>
          <button
            type="button"
            className="stk-btn no"
            aria-pressed={person.status === 'out'}
            onClick={() => onRespond(person, 'out')}
          >
            <X aria-hidden="true" /> I can’t make it
          </button>
        </div>
      ) : null}
    </li>
  );
}
