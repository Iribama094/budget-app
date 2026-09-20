import { useEffect, useState } from 'react';
import { api, type Admin, type TaxCountry, type TaxRule, type TaxVersion } from '../api';
import { TaxDraft } from './TaxDraft';

const CAN_CHANGE: Admin['role'][] = ['owner', 'finance'];
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const money = (n: number) => `₦${n.toLocaleString()}`;

/**
 * What this version would change about the rules in force, in words.
 *
 * Approving is the moment somebody's estimate changes, and a second pair of eyes is worthless if the second
 * person can only see a date and a note. This is what they are actually agreeing to.
 */
function changes(next: TaxRule, now: TaxCountry | undefined): string[] {
  if (!now) return ['There is nothing in force to compare this against. It would be the first version.'];
  const out: string[] = [];
  const nextBands = [...next.brackets].sort((a, b) => a.from - b.from);
  const nowBands = [...now.brackets].sort((a, b) => a.from - b.from);

  if (nextBands.length !== nowBands.length) out.push(`${nowBands.length} bands become ${nextBands.length}.`);
  const most = Math.max(nextBands.length, nowBands.length);
  for (let i = 0; i < most; i++) {
    const a = nowBands[i];
    const b = nextBands[i];
    if (!a) {
      out.push(`New band from ${money(b.from)} at ${pct(b.rate)}.`);
      continue;
    }
    if (!b) {
      out.push(`The band from ${money(a.from)} at ${pct(a.rate)} goes.`);
      continue;
    }
    if (a.from !== b.from || (a.to ?? null) !== (b.to ?? null)) {
      out.push(`Band ${i + 1} runs from ${money(b.from)} to ${b.to == null ? 'and above' : money(b.to)}, not ${money(a.from)} to ${a.to == null ? 'and above' : money(a.to)}.`);
    }
    if (a.rate !== b.rate) out.push(`Band ${i + 1} is taxed at ${pct(b.rate)}, not ${pct(a.rate)}.`);
  }

  const thresholdNow = now.noTaxIfGrossMonthlyAtOrBelow;
  const thresholdNext = next.noTaxIfGrossMonthlyAtOrBelow ?? null;
  if ((thresholdNow ?? null) !== thresholdNext) {
    out.push(
      thresholdNext == null
        ? `The exemption at or below ${money(thresholdNow ?? 0)} a month goes, so those earners start paying.`
        : `Nothing is owed at or below ${money(thresholdNext)} a month, instead of ${thresholdNow == null ? 'no exemption at all' : money(thresholdNow)}.`
    );
  }

  const reliefsNow = Object.keys(now.deductions ?? {});
  const reliefsNext = Object.keys(next.deductions ?? {});
  for (const k of reliefsNow) if (!reliefsNext.includes(k)) out.push(`The ${k} relief goes, so estimates rise for anybody claiming it.`);
  for (const k of reliefsNext) if (!reliefsNow.includes(k)) out.push(`A ${k} relief is added.`);
  for (const k of reliefsNext) {
    const a = now.deductions?.[k];
    const b = next.deductions?.[k];
    if (!a || !b) continue;
    if ((a.cap ?? null) !== (b.cap ?? null)) out.push(`The ${k} relief is capped at ${b.cap == null ? 'nothing' : money(b.cap)}, not ${a.cap == null ? 'nothing' : money(a.cap)}.`);
    if ((a.rate ?? null) !== (b.rate ?? null)) out.push(`The ${k} relief counts ${b.rate == null ? 'the whole amount' : pct(b.rate)}, not ${a.rate == null ? 'the whole amount' : pct(a.rate)}.`);
  }

  const cNow = now.company;
  const cNext = next.company;
  if (!cNow && cNext) out.push('Company income tax is added.');
  if (cNow && !cNext) out.push('Company income tax goes, so businesses are told they owe nothing.');
  if (cNow && cNext) {
    if (cNow.smallCompanyTurnover !== cNext.smallCompanyTurnover) {
      out.push(`A business pays no company tax up to ${money(cNext.smallCompanyTurnover)} turnover, not ${money(cNow.smallCompanyTurnover)}.`);
    }
    if (cNow.rate !== cNext.rate) out.push(`Company tax is ${pct(cNext.rate)} of profit, not ${pct(cNow.rate)}.`);
  }

  const allowancesNow = Object.keys(now.allowances ?? {}).length;
  const allowancesNext = Object.keys(next.allowances ?? {}).length;
  if (allowancesNow !== allowancesNext) out.push(`${allowancesNow} allowances become ${allowancesNext}. Allowances come off the gross before the bands.`);

  return out.length ? out : ['Nothing about the numbers changes. Only the date or the note is different.'];
}

const STATE_CHIP: Record<TaxVersion['state'], { cls: string; text: string }> = {
  draft: { cls: 'off', text: 'Draft' },
  pending: { cls: 'wait', text: 'Waiting for a second person' },
  live: { cls: 'on', text: 'Live' },
  retired: { cls: 'off', text: 'Retired' }
};

export function TaxRules({ admin }: { admin: Admin }) {
  const [inCode, setInCode] = useState<TaxCountry[] | null>(null);
  const [versions, setVersions] = useState<TaxVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const mayChange = CAN_CHANGE.includes(admin.role);

  const load = () =>
    api
      .taxRules()
      .then((r) => {
        setInCode(r.inCode);
        setVersions(r.versions.map((v) => ({ ...v, you: r.you })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));

  useEffect(() => {
    void load();
  }, []);

  /**
   * Starts a new version from whatever is in force, so nobody retypes a whole rule to change one band.
   *
   * The copying happens on the server. This screen only ever sees the rule to show it, and a payload rebuilt
   * from what is on screen would arrive missing anything the screen does not draw.
   */
  const startDraft = async (c: TaxCountry) => {
    setBusy(c.code);
    setError(null);
    try {
      // A tax change lands on a new year, so that is the date offered. A retired version can still be holding
      // one, and dates are unique per country, so this walks forward to the first free one. It is editable.
      const taken = new Set(versions.filter((v) => v.country === c.code).map((v) => v.effectiveFrom.slice(0, 10)));
      let year = new Date().getFullYear() + 1;
      while (taken.has(`${year}-01-01`)) year++;

      const res = await api.addTaxVersion({
        country: c.code,
        effectiveFrom: `${year}-01-01`,
        note: 'Copied from what is in force. Edit the bands before sending it for approval.'
      });
      await load();
      setEditing(res.version.id);
      setNotice('Draft created from the rules in force. Change what you need, then send it for approval.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a draft');
    } finally {
      setBusy(null);
    }
  };

  const act = async (v: TaxVersion, action: 'submit' | 'approve' | 'retire') => {
    const ask = {
      submit: 'Send this for approval? It cannot be edited afterwards.',
      approve: 'Approve this? It becomes the rule people are estimated against, immediately.',
      retire: 'Retire this? Estimates fall back to the rules that ship in the app.'
    }[action];
    if (!window.confirm(ask)) return;
    setBusy(v.id);
    setError(null);
    setNotice(null);
    try {
      const res = await api.taxVersionAction(v.id, action);
      setNotice(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Tax rules</h1>
          <p className="sub">
            The bands, reliefs and company tax the estimates are built from. A change here needs a second person to approve it, and the version it
            replaces is retired rather than deleted, so a past period still reads correctly.
          </p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}
      {notice ? <div className="banner good">{notice}</div> : null}
      {!mayChange ? <div className="banner warn">Your role can read these. Owners and finance can propose and approve changes.</div> : null}

      {versions.length ? (
        <div className="card">
          <h2>Versions</h2>
          <div style={{ marginTop: 6 }}>
            {versions.map((v) => {
              const chip = STATE_CHIP[v.state];
              const mine = v.createdBy === v.you;
              const now = inCode?.find((c) => c.code === v.country);
              const open = showing === v.id;
              return (
                <div key={v.id}>
                  <div className="row">
                    <div className="grow">
                      <p className="name">
                        {v.country.toUpperCase()}, from {v.effectiveFrom.slice(0, 10)}
                      </p>
                      <p className="meta">
                        {v.note ?? 'No note'}
                        <br />
                        Written by {v.createdByEmail ?? 'someone since removed'}
                        {v.approvedByEmail ? `, approved by ${v.approvedByEmail}` : ''}
                      </p>
                    </div>
                    <span className={`chip ${chip.cls}`}>{chip.text}</span>
                    <button type="button" className="btn small" onClick={() => setShowing(open ? null : v.id)}>
                      {open ? 'Hide' : 'What it changes'}
                    </button>
                    {v.state === 'draft' && mayChange ? (
                      <button type="button" className="btn small" onClick={() => setEditing(editing === v.id ? null : v.id)}>
                        {editing === v.id ? 'Close' : 'Edit'}
                      </button>
                    ) : null}
                    {v.state === 'pending' && mayChange ? (
                      <button
                        type="button"
                        className="btn small primary"
                        disabled={busy === v.id || mine}
                        title={mine ? 'You wrote this one, so somebody else has to approve it' : undefined}
                        onClick={() => void act(v, 'approve')}
                      >
                        {mine ? 'Yours to be approved' : 'Approve'}
                      </button>
                    ) : null}
                    {v.state === 'live' && mayChange ? (
                      <button type="button" className="btn small danger" disabled={busy === v.id} onClick={() => void act(v, 'retire')}>
                        Retire
                      </button>
                    ) : null}
                  </div>

                  {open ? (
                    <div className="card" style={{ margin: '0 0 14px', background: 'var(--line-soft)', borderColor: 'transparent' }}>
                      <p className="label">
                        {v.state === 'live' ? 'What this changed when it was approved' : 'What this would change about the rules in force'}
                      </p>
                      <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                        {changes(v.payload, now).map((line, i) => (
                          <li key={i} className="muted" style={{ marginBottom: 4 }}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {editing === v.id && v.state === 'draft' ? (
                    <div style={{ marginBottom: 14 }}>
                      <TaxDraft
                        version={v}
                        inForce={now}
                        onClose={() => setEditing(null)}
                        onSaved={(message) => {
                          setNotice(message);
                          setError(null);
                          setEditing(null);
                          void load();
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!inCode ? <p className="muted">Loading...</p> : null}

      {inCode?.map((c) => (
        <div className="card" key={c.code}>
          <div className="spread">
            <div>
              <h2>{c.country}</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                {c.source === 'approved'
                  ? `In force now, from an approved version${c.effectiveDate ? ` dated ${c.effectiveDate}` : ''}. Retiring it falls back to the rules that ship in the app.`
                  : 'In force now, from the app itself. No approved version has replaced it.'}
              </p>
            </div>
            {mayChange ? (
              <button
                type="button"
                className="btn"
                disabled={busy === c.code || versions.some((v) => v.country === c.code && (v.state === 'draft' || v.state === 'pending'))}
                title={
                  versions.some((v) => v.country === c.code && (v.state === 'draft' || v.state === 'pending'))
                    ? 'There is already one on the go. Finish it or retire it first.'
                    : undefined
                }
                onClick={() => void startDraft(c)}
              >
                {busy === c.code ? 'Starting...' : 'Start a new version'}
              </button>
            ) : null}
          </div>

          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {c.brackets.map((b, i) => (
                <tr key={i}>
                  <td>{money(b.from)}</td>
                  <td>{b.to == null ? 'and above' : money(b.to)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{pct(b.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid two" style={{ marginTop: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#3c4e4a', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Reliefs allowed</p>
              <p className="muted" style={{ marginTop: 6 }}>
                {Object.keys(c.deductions).length
                  ? Object.entries(c.deductions)
                      .map(([k, d]) => (d.rate ? `${k} (${pct(d.rate)}${d.cap ? ` up to ${money(d.cap)}` : ''})` : k))
                      .join(', ')
                  : 'None'}
              </p>
              {c.noTaxIfGrossMonthlyAtOrBelow ? (
                <p className="muted" style={{ marginTop: 6 }}>No tax at or below {money(c.noTaxIfGrossMonthlyAtOrBelow)} a month.</p>
              ) : null}
            </div>
            {c.company ? (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#3c4e4a', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Company income tax</p>
                <p className="muted" style={{ marginTop: 6 }}>
                  No tax at or below {money(c.company.smallCompanyTurnover)} turnover a year, then {pct(c.company.rate)} of profit.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </>
  );
}
