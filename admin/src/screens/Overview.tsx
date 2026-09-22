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
  tax: 'Tax reminders',
  referral: 'Friends joined'
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
        <div className="spread">
          <h2>Waitlist and invites</h2>
          <span className="muted">
            {data ? `${data.waitlist.total.toLocaleString()} on the waitlist · ${data.waitlist.today} today · ${data.waitlist.invited} came from an invite` : ''}
          </span>
        </div>
        <div style={{ marginTop: 6 }}>
          {!data ? <p className="muted" style={{ paddingTop: 12 }}>Loading...</p> : null}
          {data && data.topReferrers.length === 0 ? <p className="muted" style={{ paddingTop: 12 }}>Nobody has joined with an invite code yet.</p> : null}
          {data?.topReferrers.map((r) => (
            <div className="row" key={r.code}>
              <div className="grow">
                <p className="name">{r.name}</p>
                <p className="meta">Code {r.code}</p>
              </div>
              <span className="muted">
                {r.app} in the app · {r.waitlist} on the waitlist
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <h2>Today's usage</h2>
          <span className="muted">Resets at midnight UTC</span>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          What the app has spent today on the services it pays for. When one reaches its ceiling that feature pauses until tomorrow and says so
          politely; nothing else is affected. Raise a ceiling with its setting (for example CAP_EMAIL_DAY) without a release.
        </p>
        <div style={{ marginTop: 8 }}>
          {!data ? <p className="muted" style={{ paddingTop: 12 }}>Loading...</p> : null}
          {data?.usage.map((u) => {
            const share = u.cap > 0 ? Math.min(100, Math.round((u.used / u.cap) * 100)) : 0;
            const tone = share >= 90 ? 'bad' : share >= 70 ? 'wait' : 'on';
            return (
              <div className="row" key={u.service}>
                <div className="grow">
                  <p className="name" style={{ textTransform: 'capitalize' }}>{u.what}</p>
                  <p className="meta">
                    {u.used.toLocaleString()} of {u.cap.toLocaleString()} today
                  </p>
                </div>
                <div style={{ width: 180, height: 8, borderRadius: 999, background: 'var(--line-soft)', overflow: 'hidden' }}>
                  <div style={{ width: `${share}%`, height: '100%', background: share >= 90 ? 'var(--red)' : share >= 70 ? 'var(--brass)' : 'var(--teal)' }} />
                </div>
                <span className={`chip ${tone}`}>{share}%</span>
              </div>
            );
          })}
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
