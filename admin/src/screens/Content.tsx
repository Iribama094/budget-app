import { useEffect, useState } from 'react';
import { api, type Admin, type ContentBlock, type QuoteValue } from '../api';

const CAN_CHANGE: Admin['role'][] = ['owner', 'engineer'];
const THEMES = ['saving', 'spending', 'planning', 'patience', 'change'] as const;

const asQuote = (b: ContentBlock) => b.value as QuoteValue;

export function Content({ admin }: { admin: Admin }) {
  const [items, setItems] = useState<ContentBlock[] | null>(null);
  const [inCode, setInCode] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<QuoteValue>({ text: '', author: '', source: '', themes: ['saving'], local: false });
  const mayChange = CAN_CHANGE.includes(admin.role);

  const load = () =>
    api
      .content()
      .then((r) => {
        setItems(r.items);
        setInCode(r.inCode);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));

  useEffect(() => {
    void load();
  }, []);

  const quotes = (items ?? []).filter((b) => b.kind === 'quote');

  const seed = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.seedQuotes();
      await load();
      setError(res.added === 0 ? 'They were already here, so nothing changed.' : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy them across');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (b: ContentBlock) => {
    try {
      await api.setContent(b.key, { enabled: !b.enabled });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const key = `quote.${draft.author.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${Date.now().toString(36).slice(-4)}`;
      await api.addContent({ key, kind: 'quote', value: draft });
      setDraft({ text: '', author: '', source: '', themes: ['saving'], local: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that quote');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Content and copy</h1>
          <p className="sub">
            The words that change more often than the code does. A quote saved here is used the next time the app sends an encouraging message, with
            no release needed.
          </p>
        </div>
      </div>

      {error ? <div className="banner warn">{error}</div> : null}
      {!mayChange ? <div className="banner warn">Your role can read these but not change them.</div> : null}

      {items && quotes.length === 0 ? (
        <div className="card spread">
          <div>
            <h2>Quotes still live in the code</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              {inCode} of them ship with the app. Copy them here once and they become editable, sources and all. Nothing changes for anyone until you
              edit one.
            </p>
          </div>
          <button type="button" className="btn primary" disabled={!mayChange || busy} onClick={() => void seed()}>
            {busy ? 'Copying...' : `Copy ${inCode} quotes here`}
          </button>
        </div>
      ) : null}

      {quotes.length ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="spread" style={{ padding: '14px 18px', background: 'var(--line-soft)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#3c4e4a' }}>
              {quotes.filter((q) => q.enabled).length} live, {quotes.length} in all
            </span>
            <span className="muted">A quote needs a source before it goes anywhere</span>
          </div>
          <div style={{ padding: '0 18px' }}>
            {quotes.map((b) => {
              const q = asQuote(b);
              return (
                <div className="row" key={b.key}>
                  <div className="grow">
                    <p style={{ fontSize: 13.5, lineHeight: '20px' }}>{q.text}</p>
                    <p className="meta">
                      {q.author}, {q.source}
                      {q.local ? ' · Nigerian or African voice, shown more often' : ''}
                    </p>
                  </div>
                  <span className={`chip ${b.enabled ? 'on' : 'off'}`}>{b.enabled ? 'Live' : 'Off'}</span>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={b.enabled}
                    aria-label={`${b.enabled ? 'Switch off' : 'Switch on'} the quote by ${q.author}`}
                    disabled={!mayChange}
                    onClick={() => void toggle(b)}
                  >
                    <span />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {mayChange ? (
        <form className="card" onSubmit={add}>
          <h2>Add a quote</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Only lines with a source anyone can check: a book, a letter, an interview. Sayings nobody can trace are credited to Proverb.
          </p>
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="q-text">The quote</label>
              <input id="q-text" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} required maxLength={400} />
            </div>
            <div className="grid two">
              <div className="field">
                <label htmlFor="q-author">Who said it</label>
                <input id="q-author" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="q-source">Where they said it</label>
                <input
                  id="q-source"
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  placeholder="Book, letter or interview, with the year"
                  required
                />
              </div>
            </div>
            <div className="spread">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {THEMES.map((t) => {
                  const on = draft.themes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`btn small ${on ? 'primary' : ''}`}
                      onClick={() => setDraft({ ...draft, themes: on ? draft.themes.filter((x) => x !== t) : [...draft.themes, t] })}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!draft.local} onChange={(e) => setDraft({ ...draft, local: e.target.checked })} />
                Nigerian or African voice
              </label>
            </div>
            <button type="submit" className="btn primary" disabled={busy || !draft.themes.length} style={{ alignSelf: 'flex-start' }}>
              {busy ? 'Saving...' : 'Add it'}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
