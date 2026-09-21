import { useEffect, useState } from 'react';
import { api, type Admin, type PreviewMatch, type WrappedPeriod, type WrappedStory } from '../api';

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
  const [previewEmail, setPreviewEmail] = useState('');
  const [preview, setPreview] = useState<{ of: string; story: WrappedStory } | null>(null);
  const [matches, setMatches] = useState<PreviewMatch[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const mayChange = CAN_CHANGE.includes(admin.role);

  /** Certifying means saying the numbers are right, which needs looking at some. Every look is audited. */
  const runPreview = async (p: WrappedPeriod, e: React.FormEvent | null, pickedId?: string) => {
    e?.preventDefault();
    setPreviewing(true);
    setError(null);
    setPreview(null);
    if (!pickedId) setMatches(null);
    try {
      const who = pickedId ? { id: pickedId } : { q: previewEmail.trim() };
      // The story for exactly this period: a business quarter previews that quarter, not the whole year.
      const res = await api.wrappedPreview(who, { kind: p.kind, quarter: p.quarter, year: p.year, space: p.space });
      if (res.matches) {
        // Several people fit what was typed: let staff pick, rather than guessing whose figures to open.
        setMatches(res.matches);
      } else if (res.wrapped && res.of) {
        setMatches(null);
        setPreview({ of: res.of, story: res.wrapped });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build that preview');
    } finally {
      setPreviewing(false);
    }
  };

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

              {mayChange ? (
                <form style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }} onSubmit={(e) => void runPreview(p, e)}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#3c4e4a', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Preview as a person
                  </p>
                  <p className="muted" style={{ marginTop: 6 }}>
                    See the story an account would get. This is the one place staff see somebody's figures, it is the summary rather than their
                    transactions, and each look is written to the audit log.
                  </p>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <input
                      type="text"
                      value={previewEmail}
                      onChange={(ev) => setPreviewEmail(ev.target.value)}
                      placeholder="Their name or email"
                      aria-label="Their name or email"
                      style={{ flexGrow: 1, height: 38, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)' }}
                      minLength={3}
                      required
                    />
                    <button type="submit" className="btn" disabled={previewing}>
                      {previewing ? 'Building...' : 'Show me'}
                    </button>
                  </div>
                  {matches ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="muted" style={{ marginBottom: 6 }}>
                        {matches.length} people match. Pick one to see their story.
                      </p>
                      {matches.map((m) => (
                        <div className="row" key={m.id}>
                          <div className="grow">
                            <p className="name">{m.name ?? m.email}</p>
                            <p className="meta">
                              {m.name ? `${m.email} · ` : ''}
                              {m.transactions
                                ? `${m.transactions} ${p.space} transaction${m.transactions === 1 ? '' : 's'} in ${periodName(p)}`
                                : `No ${p.space} transactions in ${periodName(p)}, so this story will be empty`}
                            </p>
                          </div>
                          <button type="button" className="btn small" disabled={previewing} onClick={() => void runPreview(p, null, m.id)}>
                            Show
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </form>
              ) : null}

              {preview ? (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#f3f6f5' }}>
                  <div className="spread">
                    <p className="name">{preview.of}</p>
                    <button type="button" className="btn small" onClick={() => setPreview(null)}>
                      Close
                    </button>
                  </div>
                  {!preview.story.hasData ? (
                    <p className="muted" style={{ marginTop: 8 }}>
                      Not enough logged for a story. That account would be left out rather than shown an empty one, which is the intended behaviour.
                    </p>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 13.5 }}>
                        <strong>{preview.story.persona.title}</strong>: {preview.story.persona.line}
                      </p>
                      <p className="muted" style={{ marginTop: 8 }}>
                        In {preview.story.totals.income.toLocaleString()}, out {preview.story.totals.spending.toLocaleString()}, kept{' '}
                        {preview.story.totals.net.toLocaleString()}
                        {preview.story.totals.savingsRate != null ? ` (${preview.story.totals.savingsRate}%)` : ''}
                      </p>
                      <p className="muted" style={{ marginTop: 6 }}>
                        Top: {preview.story.topCategories.map((c) => `${c.category} ${c.share}%`).join(', ') || 'nothing yet'}
                      </p>
                      <p className="muted" style={{ marginTop: 6 }}>
                        {preview.story.habits.daysLogged} days logged, {preview.story.habits.transactions} transactions
                      </p>
                    </div>
                  )}
                </div>
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
