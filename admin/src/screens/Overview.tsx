import { useEffect, useState } from 'react';
import { api, type Overview as OverviewData } from '../api';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const KIND_LABELS: Record<string, string> = {
  weekly: 'Weekly summary',
  insight: 'Insight nudge',
  bill: 'Bill reminders',
  recurring: 'Recurring recorded',
  pace: 'Pace warnings',
  over: 'Over budget',
  autosave: 'Auto save nudges',
  shared: 'Shared budget activity',
  rollover: 'Money rolled over',
  bank: 'Bank updates',
  invoice: 'Invoice reminders',
  tax: 'Tax reminders'
};

export function Overview({ onGoToWrapped }: { onGoToWrapped: () => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .overview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  return (
    <>
      <div className="head">
        <div>
          <h1>Overview</h1>
          <p className="sub">How the live system is doing right now, and anything waiting on a person.</p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}

      {data && data.wrappedWaiting > 0 ? (
        <div className="banner warn spread">
          <span>
            {data.wrappedWaiting} Money Wrapped {data.wrappedWaiting === 1 ? 'period has' : 'periods have'} finished building and nobody has certified{' '}
            {data.wrappedWaiting === 1 ? 'it' : 'them'} yet. Until someone does, nobody sees it.
          </span>
          <button type="button" className="btn small" onClick={onGoToWrapped}>
            Review
          </button>
        </div>
      ) : null}

      <div className="grid four">
        <div className="card tile">
          <p className="label">People</p>
          <p className="value">{data ? data.people.total.toLocaleString() : '--'}</p>
          <p className="note">{data ? `${data.people.today} signed up today` : 'Loading'}</p>
        </div>
        <div className="card tile">
          <p className="label">Logged today</p>
          <p className="value">{data ? data.transactions.today.toLocaleString() : '--'}</p>
          <p className="note">{data ? `${data.transactions.week.toLocaleString()} in the last seven days` : 'Loading'}</p>
        </div>
        <div className="card tile">
          <p className="label">Wrapped</p>
          <p className="value">{data ? (data.wrappedWaiting > 0 ? 'Waiting' : 'Clear') : '--'}</p>
          <p className="note">{data && data.wrappedWaiting > 0 ? 'Someone needs to certify a period' : 'Nothing needs certifying'}</p>
        </div>
        <div className="card tile">
          <p className="label">Messages, 48h</p>
          <p className="value">{data ? data.notifications.reduce((sum, n) => sum + n.n, 0).toLocaleString() : '--'}</p>
          <p className="note">Across every kind of alert</p>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2>What the app has been sending</h2>
          <span className="muted">Last 48 hours</span>
        </div>
        <div style={{ marginTop: 6 }}>
          {!data ? <p className="muted" style={{ paddingTop: 12 }}>Loading...</p> : null}
          {data && data.notifications.length === 0 ? (
            <p className="muted" style={{ paddingTop: 12 }}>Nothing has gone out in the last two days. If that is a surprise, check the daily job.</p>
          ) : null}
          {data?.notifications.map((n) => (
            <div className="row" key={n.kind}>
              <div className="grow">
                <p className="name">{KIND_LABELS[n.kind] ?? n.kind}</p>
                <p className="meta">{n.n.toLocaleString()} sent</p>
              </div>
              <span className="muted">{ago(n.last)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Where to look next</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          The console covers what the team changes. For logs, slow queries and errors, the Supabase dashboard is still the right place, and this page
          is deliberately not a worse copy of it.
        </p>
      </div>
    </>
  );
}
