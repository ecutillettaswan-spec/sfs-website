import type { Metadata } from 'next';
import { ArrowLeft, Download } from 'lucide-react';
import { getStockingHistory } from '@/lib/stocking';
import { addDays, formatMonthDay, WEEKDAY_SHORT, weekdayOf, type StockingHistoryDay } from '@/lib/stocking-shared';
import TopBar, { PlainLink } from '../top-bar';
import '../stocking.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stocking history',
  description: 'Who has stocked the SFS cabinets this school year.',
  robots: { index: false, follow: false },
};

function mondayOf(date: string) {
  const weekday = weekdayOf(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function byWeek(days: StockingHistoryDay[]) {
  const weeks: { monday: string; days: StockingHistoryDay[] }[] = [];
  for (const day of days) {
    const monday = mondayOf(day.date);
    if (weeks.at(-1)?.monday !== monday) weeks.push({ monday, days: [] });
    weeks[weeks.length - 1].days.push(day);
  }
  return weeks;
}

export default async function StockingHistoryPage() {
  const history = await getStockingHistory().catch((error) => {
    console.error('stocking history failed to load', error);
    return null;
  });

  return (
    <main className="stk">
      <TopBar path="/stocking/history">
        <PlainLink className="stk-barlink" href="/stocking">this week</PlainLink>
      </TopBar>
      <div className="stk-wrap stk-wrap-single">
        <div className="stk-main">
          <header className="stk-title">
            <h1>Stocking history</h1>
            <p>{history ? `This school year · since ${formatMonthDay(history.since)}, ${history.since.slice(0, 4)}` : 'This school year'}</p>
          </header>

          <div className="stk-inline">
            <PlainLink className="stk-btn" href="/stocking"><ArrowLeft aria-hidden="true" /> This week</PlainLink>
            <PlainLink className="stk-btn" href="/api/stocking/history.csv"><Download aria-hidden="true" /> Download spreadsheet (CSV)</PlainLink>
          </div>

          {!history ? (
            <div className="stk-day stk-empty"><p><strong>Couldn’t load the history.</strong></p><p>Refresh the page in a moment.</p></div>
          ) : history.people.length === 0 ? (
            <div className="stk-day stk-empty"><p>Nothing yet. Days show up here once people tap “I can make it”.</p></div>
          ) : (
            <>
              <section className="stk-day" aria-labelledby="stk-people-heading">
                <div className="stk-dayhead">
                  <h2 id="stk-people-heading">People</h2>
                  <p className="stk-tally"><b>{history.people.length}</b> people · <b>{history.days.reduce((sum, day) => sum + day.stocked.length, 0)}</b> times stocked</p>
                </div>
                <div className="stk-table-wrap">
                  <table className="stk-table">
                    <thead>
                      <tr><th scope="col">Name</th><th scope="col">Stocked</th><th scope="col">Couldn’t</th><th scope="col">Last stocked</th></tr>
                    </thead>
                    <tbody>
                      {history.people.map((person) => (
                        <tr key={person.name}>
                          <th scope="row">{person.name}</th>
                          <td>{person.stocked}</td>
                          <td>{person.out}</td>
                          <td>{person.lastStocked ? formatMonthDay(person.lastStocked) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="stk-day" aria-labelledby="stk-days-heading">
                <div className="stk-dayhead">
                  <h2 id="stk-days-heading">By day</h2>
                  <p className="stk-tally">newest first</p>
                </div>
                {byWeek(history.days).map((week) => (
                  <div key={week.monday} className="stk-week">
                    <p className="stk-week-label">Week of {formatMonthDay(week.monday)}</p>
                    <ul className="stk-history">
                      {week.days.map((day) => (
                        <li key={day.date}>
                          <span className="stk-history-date">
                            {WEEKDAY_SHORT[weekdayOf(day.date)]} {formatMonthDay(day.date)}
                            {day.date === history.today && <span className="stk-phase is-today">today</span>}
                          </span>
                          <span className="stk-history-who">
                            {day.stocked.length ? day.stocked.join(', ') : <em>Nobody checked in</em>}
                            {day.out.length > 0 && <small>Couldn’t make it: {day.out.join(', ')}</small>}
                          </span>
                          <span className="stk-history-count">{day.stocked.length}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </>
          )}

          <p className="stk-fineprint">
            “Stocked” means they tapped “I can make it” that day. Records start when the stocking page went live.
            The spreadsheet has every answer with the time it was given.
          </p>
        </div>
      </div>
    </main>
  );
}
