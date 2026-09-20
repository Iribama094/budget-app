import { useEffect, useState } from 'react';
import { api, type Admin, type TaxCountry, type TaxVersion } from '../api';

const CAN_CHANGE: Admin['role'][] = ['owner', 'finance'];
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const money = (n: number) => `₦${n.toLocaleString()}`;

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

  /** Starts a new version from whatever is in force, so nobody retypes a whole rule to change one band. */
  const startDraft = async (c: TaxCountry) => {
    setBusy(c.code);
    setError(null);
    try {
      const nextYear = new Date().getFullYear() + 1;
      await api.addTaxVersion({
        country: c.code,
        effectiveFrom: `${nextYear}-01-01`,
        payload: {
          country: c.country,
          version: `${c.country} ${nextYear}`,
          effectiveDate: `${nextYear}-01-01`,
          brackets: c.brackets.map((b) => ({ from: b.from, to: b.to, rate: b.rate })),
          noTaxIfGrossMonthlyAtOrBelow: c.noTaxIfGrossMonthlyAtOrBelow ?? undefined,
          minimumTaxRate: c.minimumTaxRate ?? undefined,
          company: c.company ?? undefined
        },
        note: 'Copied from what is in force. Edit the bands before sending it for approval.'
      });
      await load();
      setNotice('Draft created from the rules in force. Edit it, then send it for approval.');
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
              return (
                <div className="row" key={v.id}>
                  <div className="grow">
                    <p className="name">
                      {v.country.toUpperCase()}, from {v.effectiveFrom}
                    </p>
                    <p className="meta">
                      {v.note ?? 'No note'}
                      <br />
                      Written by {v.createdByEmail ?? 'someone since removed'}
                      {v.approvedByEmail ? `, approved by ${v.approvedByEmail}` : ''}
                    </p>
                  </div>
                  <span className={`chip ${chip.cls}`}>{chip.text}</span>
                  {v.state === 'draft' && mayChange ? (
                    <button type="button" className="btn small" disabled={busy === v.id} onClick={() => void act(v, 'submit')}>
                      Send for approval
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
                {versions.some((v) => v.country === c.code && v.state === 'live')
                  ? 'An approved version is in force. The rules below are the fallback that ships in the app.'
                  : 'In force now, from the app itself. No approved version has replaced it.'}
              </p>
            </div>
            {mayChange ? (
              <button type="button" className="btn" disabled={busy === c.code} onClick={() => void startDraft(c)}>
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
              <p className="muted" style={{ marginTop: 6 }}>{c.deductions.length ? c.deductions.join(', ') : 'None'}</p>
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
