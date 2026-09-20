import { useEffect, useState } from 'react';
import { api, type TaxCountry } from '../api';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number) => `₦${n.toLocaleString()}`;

export function TaxRules() {
  const [countries, setCountries] = useState<TaxCountry[] | null>(null);
  const [editable, setEditable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .taxRules()
      .then((r) => {
        setCountries(r.countries);
        setEditable(r.editable);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  return (
    <>
      <div className="head">
        <div>
          <h1>Tax rules</h1>
          <p className="sub">The bands, reliefs and thresholds the estimates are built from, exactly as the calculator sees them.</p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}

      {!editable ? (
        <div className="banner warn">
          These are read only for now, and they still live in the code. A wrong band changes what somebody believes they owe, so moving them here is
          worth doing properly: an edit should need a second person to approve it, and the old version should stay readable for past periods. Say the
          word and that is the next thing built.
        </div>
      ) : null}

      {!countries ? <p className="muted">Loading...</p> : null}

      {countries?.map((c) => (
        <div className="card" key={c.code}>
          <div className="spread">
            <h2>{c.country}</h2>
            <span className="chip on">{c.version ?? 'in force'}</span>
          </div>

          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#3c4e4a', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Yearly bands</p>
            <table style={{ marginTop: 8 }}>
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
          </div>

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
                <p className="muted" style={{ marginTop: 6 }}>{c.company.note}</p>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </>
  );
}
