import { useEffect, useState } from 'react';
import { api, type Admin, type WrappedPeriod } from '../api';

const CAN_CHANGE: Admin['role'][] = ['owner', 'engineer'];

const periodName = (p: WrappedPeriod) => {
  if (p.kind === 'quarter') return `Q${p.quarter} ${p.year}`;
  if (p.kind === 'h1') return `H1 ${p.year}, January to June`;
  return `Full year ${p.year}`;
};

function stateChip(p: WrappedPeriod, today: string) {
  if (p.state === 'published') {
    const open = p.opensOn <= today && p.closesOn >= today;
    return open ? { cls: 'on', text: 'Live now' } : { cls: 'off', text: 'Certified, out of season' };
  }
  if (p.state === 'ready') return { cls: 'wait', text: 'Waiting to be certified' };
  if (p.state === 'building') return { cls: 'off', text: 'Still building' };
  return { cls: 'off', text: 'Hidden' };
}

export function Wrapped({ admin }: { admin: Admin }) {
  const [items, setItems] = useState<WrappedPeriod[] | null>(null);
  const [today, setToday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const mayChange = CAN_CHANGE.includes(admin.role);

  const load = () =>
    api
      .wrapped()
      .then((r) => {
        setItems(r.items);
        setToday(r.today);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));

  useEffect(() => {
    void load();
  }, []);

  const save = async (p: WrappedPeriod, patch: Parameters<typeof api.setWrapped>[1]) => {
    setBusy(p.id);
    setError(null);
    try {
      const res = await api.setWrapped(p.id, patch);
      setItems((prev) => (prev ?? []).map((x) => (x.id === p.id ? res.period : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Money Wrapped</h1>
          <p className="sub">
            Nobody sees Wrapped until a period is certified here and today falls inside its window. Off season the app shows no card, no menu row and
            sends no notification about it. Personal looks back twice a year; a business looks back every quarter, because that is the rhythm VAT,
            PAYE and stock already run on.
          </p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}
      {!mayChange ? <div className="banner warn">Your role can see these but not certify them.</div> : null}

      {!items ? <p className="muted">Loading...</p> : null}

      <div className="stack">
        {(['personal', 'business'] as const).map((space) => {
          const forSpace = (items ?? []).filter((p) => p.space === space);
          if (!items || forSpace.length === 0) return null;
          return (
            <div key={space} className="stack">
              <h2 style={{ marginTop: 6, textTransform: 'capitalize' }}>{space === 'personal' ? 'Personal, twice a year' : 'Business, every quarter'}</h2>
              {forSpace.map((p) => {
          const chip = stateChip(p, today);
          const note = notes[p.id] ?? '';
          const canPublish = mayChange && p.state !== 'building' && p.state !== 'published';
          return (
            <div className="card" key={p.id}>
              <div className="spread">
                <div>
                  <h2>{periodName(p)}</h2>
                  <p className="muted" style={{ marginTop: 5 }}>
                    Opens {p.opensOn}, closes {p.closesOn}
                    {p.builtAt ? `, built ${p.builtAt.slice(0, 10)} for ${p.peopleIncluded.toLocaleString()} people` : ', not built yet'}
                  </p>
                  {p.certifiedAt ? (
                    <p className="muted" style={{ marginTop: 4 }}>
                      Certified {p.certifiedAt.slice(0, 10)}
                      {p.note ? `. Note: ${p.note}` : ''}
                    </p>
                  ) : null}
                </div>
                <span className={`chip ${chip.cls}`}>{chip.text}</span>
              </div>

              <div className="grid two" style={{ marginTop: 16, alignItems: 'end' }}>
                <div className="field">
                  <label htmlFor={`note-${p.id}`}>What did you check?</label>
                  <input
                    id={`note-${p.id}`}
                    type="text"
                    value={note}
                    placeholder="Spot checked 20 accounts, totals match"
                    disabled={!canPublish || busy === p.id}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                  <span className="muted">Goes in the audit log next to your name. Required before publishing.</span>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  {p.state === 'published' ? (
                    <button type="button" className="btn danger" disabled={!mayChange || busy === p.id} onClick={() => void save(p, { state: 'hidden' })}>
                      Pull it back
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={!canPublish || busy === p.id || !note.trim()}
                      onClick={() => void save(p, { state: 'published', note: note.trim() })}
                    >
                      {busy === p.id ? 'Saving...' : 'Certify and publish'}
                    </button>
                  )}
                </div>
              </div>

              {p.state === 'building' ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  This period has not finished building, so it cannot be certified yet. The nightly job writes the stories once the period ends.
                </p>
              ) : null}
            </div>
          );
              })}
            </div>
          );
        })}
      </div>

      <div className="banner good">
        Pulling a period back hides Wrapped again for everyone within a minute. Anyone reading it at that moment keeps the screen open until they leave it.
      </div>
    </>
  );
}
