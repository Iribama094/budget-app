import { useState } from 'react';
import { api, type TaxBand, type TaxCountry, type TaxRule, type TaxVersion } from '../api';

/**
 * Editing a draft version of a country's tax rules.
 *
 * A draft starts as a copy of what is in force, so this screen is for changing the few things a finance act
 * actually changes: a band, a threshold, a relief cap. Anything not shown here is carried through untouched
 * rather than dropped, which matters because a missing relief does not look like an error, it just quietly
 * raises what everybody is told they owe.
 */

/** Only where a band ends is typed. Where it starts is wherever the one above it ended, so no gap can exist. */
type BandRow = { to: string; rate: string };
type ReliefRow = { key: string; cap: string; rate: string };

const num = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const rate = (s: string) => Math.round(num(s) * 10) / 1000;
const asPct = (n: number | undefined) => (n == null ? '' : String(Math.round(n * 1000) / 10));

function toRows(bands: TaxBand[]): BandRow[] {
  return [...bands].sort((a, b) => a.from - b.from).map((b) => ({ to: b.to == null ? '' : String(b.to), rate: asPct(b.rate) }));
}

/** Turns the typed rows back into bands, chaining each one's start to the last one's end. */
function toBands(rows: BandRow[]): TaxBand[] {
  let from = 0;
  return rows.map((r, i) => {
    const top = i === rows.length - 1;
    const to = top || r.to.trim() === '' ? null : num(r.to);
    const band = { from, to, rate: rate(r.rate) };
    from = to ?? from;
    return band;
  });
}

function toReliefs(deductions: TaxRule['deductions']): ReliefRow[] {
  return Object.entries(deductions ?? {}).map(([key, d]) => ({ key, cap: d.cap == null ? '' : String(d.cap), rate: asPct(d.rate) }));
}

/** The same rule the server enforces, run here so a mistake is caught while it is still being typed. */
export function checkBands(bands: TaxBand[]): string | null {
  if (!bands.length) return 'A version needs at least one band.';
  const sorted = [...bands].sort((a, b) => a.from - b.from);
  if (sorted[0].from !== 0) return 'The first band has to start at 0.';
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const last = i === sorted.length - 1;
    if (b.rate < 0 || b.rate > 1) return `Band ${i + 1} needs a rate between 0 and 100 percent.`;
    if (last) {
      if (b.to != null) return 'The top band has to be open ended, or the highest earners fall outside every band.';
      continue;
    }
    if (b.to == null || b.to <= b.from) return `Band ${i + 1} has to end above where it starts.`;
    if (b.to !== sorted[i + 1].from) return `Band ${i + 2} has to start exactly where band ${i + 1} ends, with no gap and no overlap.`;
  }
  return null;
}

export function TaxDraft({
  version,
  inForce,
  onSaved,
  onClose
}: {
  version: TaxVersion;
  inForce: TaxCountry | undefined;
  onSaved: (message: string) => void;
  onClose: () => void;
}) {
  const start = version.payload;
  const [effectiveFrom, setEffectiveFrom] = useState(version.effectiveFrom.slice(0, 10));
  const [note, setNote] = useState(version.note ?? '');
  const [bands, setBands] = useState<BandRow[]>(toRows(start.brackets));
  const [reliefs, setReliefs] = useState<ReliefRow[]>(toReliefs(start.deductions));
  const [noTax, setNoTax] = useState(start.noTaxIfGrossMonthlyAtOrBelow == null ? '' : String(start.noTaxIfGrossMonthlyAtOrBelow));
  const [minRate, setMinRate] = useState(asPct(start.minimumTaxRate));
  const [turnover, setTurnover] = useState(start.company ? String(start.company.smallCompanyTurnover) : '');
  const [companyRate, setCompanyRate] = useState(asPct(start.company?.rate));
  const [companyNote, setCompanyNote] = useState(start.company?.note ?? '');
  const [notes, setNotes] = useState(start.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const built = toBands(bands);
  const bandProblem = checkBands(built);

  const setBand = (i: number, patch: Partial<BandRow>) => setBands((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setRelief = (i: number, patch: Partial<ReliefRow>) => setReliefs((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** A new band goes in under the open ended top one, since the top band has to stay the top band. */
  const addBand = () =>
    setBands((rows) => {
      const next = [...rows];
      next.splice(Math.max(0, rows.length - 1), 0, { to: '', rate: '0' });
      return next;
    });

  const save = async (thenSubmit: boolean) => {
    setError(null);
    if (bandProblem) {
      setError(bandProblem);
      return;
    }
    const deductions: NonNullable<TaxRule['deductions']> = {};
    for (const r of reliefs) {
      const key = r.key.trim();
      if (!key) continue;
      const entry: { cap?: number; rate?: number } = {};
      if (r.cap.trim() !== '') entry.cap = num(r.cap);
      if (r.rate.trim() !== '') entry.rate = rate(r.rate);
      deductions[key] = entry;
    }

    const payload: TaxRule = {
      // Everything not on this screen rides along untouched. Allowances especially: they come off the gross
      // before the bands, so losing them would overstate the tax without looking like a mistake.
      ...start,
      effectiveDate: effectiveFrom,
      version: `${start.country} ${effectiveFrom}`,
      notes: notes.trim() || undefined,
      brackets: built,
      deductions: Object.keys(deductions).length ? deductions : undefined,
      noTaxIfGrossMonthlyAtOrBelow: noTax.trim() === '' ? undefined : num(noTax),
      minimumTaxRate: minRate.trim() === '' ? undefined : rate(minRate),
      company:
        turnover.trim() === ''
          ? undefined
          : { smallCompanyTurnover: num(turnover), rate: rate(companyRate), note: companyNote.trim() || 'An estimate for planning, not a filing.' }
    };

    setBusy(true);
    try {
      await api.saveTaxVersion(version.id, { payload, note: note.trim() || undefined, effectiveFrom });
      if (thenSubmit) {
        if (!window.confirm('Send this for approval? It cannot be edited afterwards, and someone else has to approve it.')) {
          onSaved('Saved. It is still a draft.');
          return;
        }
        const res = await api.taxVersionAction(version.id, 'submit');
        onSaved(res.message);
        return;
      }
      onSaved('Saved. Still a draft, so nothing has changed for anybody yet.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const allowanceCount = Object.keys(start.allowances ?? {}).length;

  return (
    <div className="card" style={{ borderColor: 'var(--teal-edge)' }}>
      <div className="spread">
        <div>
          <h2>Editing the draft, {version.country.toUpperCase()}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Copied from what is in force. Change what the finance act changed, leave the rest alone.
          </p>
        </div>
        <button type="button" className="btn small" onClick={onClose}>
          Close
        </button>
      </div>

      {error ? <div className="banner bad" style={{ marginTop: 14 }}>{error}</div> : null}
      {bandProblem && !error ? <div className="banner warn" style={{ marginTop: 14 }}>{bandProblem}</div> : null}

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="eff">In force from</label>
          <input id="eff" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="note">Why this changed</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Finance Act 2027, band three" />
        </div>
      </div>

      <p className="label" style={{ marginTop: 20 }}>Bands</p>
      <table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>From</th>
            <th>Up to</th>
            <th style={{ width: 120 }}>Rate</th>
            <th style={{ width: 70 }} />
          </tr>
        </thead>
        <tbody>
          {bands.map((b, i) => {
            const top = i === bands.length - 1;
            return (
              <tr key={i}>
                <td>
                  <span className="muted">₦{built[i].from.toLocaleString()}</span>
                </td>
                <td>
                  {top ? (
                    <span className="muted">and above</span>
                  ) : (
                    <input
                      aria-label={`Band ${i + 1} ends at`}
                      value={b.to}
                      onChange={(e) => setBand(i, { to: e.target.value })}
                      style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)' }}
                    />
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      aria-label={`Band ${i + 1} rate`}
                      value={b.rate}
                      onChange={(e) => setBand(i, { rate: e.target.value })}
                      style={{ width: 70, height: 36, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)' }}
                    />
                    <span className="muted">%</span>
                  </div>
                </td>
                <td>
                  {bands.length > 1 ? (
                    <button type="button" className="btn small danger" onClick={() => setBands((rows) => rows.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={addBand}>
        Add a band
      </button>

      <div className="grid two" style={{ marginTop: 22 }}>
        <div className="field">
          <label htmlFor="notax">No tax at or below, a month</label>
          <input id="notax" value={noTax} onChange={(e) => setNoTax(e.target.value)} placeholder="Leave empty for none" />
          <span className="muted">The minimum wage exemption. Empty means everybody goes through the bands.</span>
        </div>
        <div className="field">
          <label htmlFor="minrate">Minimum tax rate</label>
          <input id="minrate" value={minRate} onChange={(e) => setMinRate(e.target.value)} placeholder="Leave empty for none" />
          <span className="muted">As a percent. Nigeria no longer has one, so this is usually empty.</span>
        </div>
      </div>

      <p className="label" style={{ marginTop: 22 }}>Reliefs somebody can claim</p>
      <p className="muted" style={{ marginTop: 4 }}>
        Rate turns what they enter into the relief, for example 20 percent of annual rent. Cap is the most it can come to. Leave either empty to
        take the whole amount, or to leave it uncapped.
      </p>
      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Relief</th>
            <th style={{ width: 160 }}>Rate</th>
            <th style={{ width: 200 }}>Cap a year</th>
            <th style={{ width: 70 }} />
          </tr>
        </thead>
        <tbody>
          {reliefs.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  aria-label={`Relief ${i + 1} name`}
                  value={r.key}
                  onChange={(e) => setRelief(i, { key: e.target.value })}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)' }}
                />
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    aria-label={`Relief ${i + 1} rate`}
                    value={r.rate}
                    onChange={(e) => setRelief(i, { rate: e.target.value })}
                    style={{ width: 70, height: 36, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)' }}
                  />
                  <span className="muted">%</span>
                </div>
              </td>
              <td>
                <input
                  aria-label={`Relief ${i + 1} cap`}
                  value={r.cap}
                  onChange={(e) => setRelief(i, { cap: e.target.value })}
                  style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)' }}
                />
              </td>
              <td>
                <button type="button" className="btn small danger" onClick={() => setReliefs((rows) => rows.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={() => setReliefs((r) => [...r, { key: '', cap: '', rate: '' }])}>
        Add a relief
      </button>

      <p className="label" style={{ marginTop: 22 }}>Company income tax</p>
      <div className="grid two" style={{ marginTop: 10 }}>
        <div className="field">
          <label htmlFor="turnover">No tax at or below this turnover a year</label>
          <input id="turnover" value={turnover} onChange={(e) => setTurnover(e.target.value)} placeholder="Leave empty to drop company tax" />
        </div>
        <div className="field">
          <label htmlFor="crate">Rate on profit above it</label>
          <input id="crate" value={companyRate} onChange={(e) => setCompanyRate(e.target.value)} placeholder="30" />
          <span className="muted">As a percent.</span>
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="cnote">What a business is told</label>
        <input id="cnote" value={companyNote} onChange={(e) => setCompanyNote(e.target.value)} />
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="notes">What a person is told about these rules</label>
        <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {allowanceCount ? (
        <div className="banner good" style={{ marginTop: 18 }}>
          {allowanceCount} allowance{allowanceCount === 1 ? '' : 's'} came with the copy and will be saved untouched. Allowances come off the gross
          before the bands, so they are not edited here by hand.
        </div>
      ) : null}

      {inForce ? (
        <p className="muted" style={{ marginTop: 18 }}>
          In force now: {inForce.brackets.length} bands, top rate {Math.round(inForce.brackets[inForce.brackets.length - 1].rate * 1000) / 10} percent,
          {inForce.noTaxIfGrossMonthlyAtOrBelow ? ` nothing owed at or below ₦${inForce.noTaxIfGrossMonthlyAtOrBelow.toLocaleString()} a month.` : ' no exempt threshold.'}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void save(false)}>
          {busy ? 'Saving...' : 'Save the draft'}
        </button>
        <button type="button" className="btn primary" disabled={busy || !!bandProblem} onClick={() => void save(true)}>
          Save and send for approval
        </button>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Nothing here reaches anybody until a second person approves it. Saving a draft is safe.
      </p>
    </div>
  );
}
