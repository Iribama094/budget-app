import { useState } from 'react';
import { api, type Admin, type PersonDetail, type PersonMatch } from '../api';

const CAN_ACT: Admin['role'][] = ['owner', 'support'];

export function People({ admin }: { admin: Admin }) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<PersonMatch[] | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mayAct = CAN_ACT.includes(admin.role);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setDetail(null);
    setBusy(true);
    try {
      const res = await api.people(q.trim());
      setMatches(res.items);
      if (res.items.length === 1) void open(res.items[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search');
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setError(null);
    try {
      setDetail(await api.person(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that person');
    }
  };

  const act = async (action: 'send-password-reset' | 'sign-out-devices') => {
    if (!detail) return;
    const what = action === 'send-password-reset' ? 'send a password reset code to their email' : 'sign out every device on their account';
    if (!window.confirm(`This will ${what}. Continue?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.personAction(detail.person.id, action);
      setNotice(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>People</h1>
          <p className="sub">
            Find somebody who has written in, and help them. You can see how their account is set up, never what they spent. Searching needs their
            full email, so this cannot be used to browse everyone.
          </p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}
      {notice ? <div className="banner good">{notice}</div> : null}

      <form className="card" onSubmit={search}>
        <div className="field">
          <label htmlFor="q">Their email address</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="amaka@example.com" style={{ flexGrow: 1 }} required />
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Looking...' : 'Find'}
            </button>
          </div>
        </div>
      </form>

      {matches && matches.length === 0 ? <div className="banner warn">Nobody with that email. Check the spelling with them.</div> : null}

      {matches && matches.length > 1 ? (
        <div className="card">
          {matches.map((m) => (
            <div className="row" key={m.id}>
              <div className="grow">
                <p className="name">{m.name ?? m.email}</p>
                <p className="meta">{m.email}</p>
              </div>
              <button type="button" className="btn small" onClick={() => void open(m.id)}>
                Open
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {detail ? (
        <div className="card">
          <div className="spread">
            <div>
              <h2>{detail.person.name ?? detail.person.email}</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                {detail.person.email}, joined {new Date(detail.person.createdAt).toLocaleDateString()}
              </p>
            </div>
            <span className="chip on">{detail.person.budgetPeriod === 'monthly' ? 'Calendar months' : 'Payday to payday'}</span>
          </div>

          <div className="grid four" style={{ marginTop: 16 }}>
            <div className="card tile" style={{ padding: 12 }}>
              <p className="label">Logged</p>
              <p className="value" style={{ fontSize: 20 }}>{detail.counts.transactions}</p>
            </div>
            <div className="card tile" style={{ padding: 12 }}>
              <p className="label">Budgets</p>
              <p className="value" style={{ fontSize: 20 }}>{detail.counts.budgets}</p>
            </div>
            <div className="card tile" style={{ padding: 12 }}>
              <p className="label">Goals</p>
              <p className="value" style={{ fontSize: 20 }}>{detail.counts.goals}</p>
            </div>
            <div className="card tile" style={{ padding: 12 }}>
              <p className="label">Devices</p>
              <p className="value" style={{ fontSize: 20 }}>{detail.counts.devices}</p>
            </div>
          </div>

          {detail.plan?.note ? <div className="banner warn" style={{ marginTop: 16 }}>{detail.plan.note}</div> : null}

          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#3c4e4a', textTransform: 'uppercase', letterSpacing: '0.6px' }}>What you can do</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn" disabled={!mayAct || busy} onClick={() => void act('send-password-reset')}>
                Send a password reset
              </button>
              <button type="button" className="btn" disabled={!mayAct || busy} onClick={() => void act('sign-out-devices')}>
                Sign out their devices
              </button>
            </div>
            {!mayAct ? <p className="muted" style={{ marginTop: 10 }}>Your role can look but not act. Support and owners can.</p> : null}
          </div>

          <p className="muted" style={{ marginTop: 18 }}>
            Their transactions are not on this screen and cannot be opened from here. If a problem needs them, they export them from the app and send
            them. There is no sign in as them, either.
          </p>
        </div>
      ) : null}
    </>
  );
}
