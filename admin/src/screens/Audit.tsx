import { useEffect, useState } from 'react';
import { api, type AuditRow } from '../api';

const ACTION_LABELS: Record<string, string> = {
  'flag.update': 'Changed a feature flag',
  'wrapped.certify': 'Certified a Wrapped period',
  'wrapped.update': 'Changed a Wrapped period',
  'staff.add': 'Added a staff member',
  'staff.remove': 'Removed a staff member'
};

export function Audit() {
  const [items, setItems] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .audit()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));
  }, []);

  return (
    <>
      <div className="head">
        <div>
          <h1>Audit log</h1>
          <p className="sub">Every change made in this console, with the name of whoever made it. Nobody can edit or remove a line, including an owner.</p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '20%' }}>Who</th>
              <th>What changed</th>
              <th style={{ width: '18%' }}>When</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <tr>
                <td colSpan={3} className="muted">Loading...</td>
              </tr>
            ) : null}
            {items && items.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">Nothing yet. The first change anyone makes shows up here.</td>
              </tr>
            ) : null}
            {items?.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.adminName ?? row.adminEmail}</strong>
                  <div className="muted" style={{ textTransform: 'capitalize' }}>{row.adminRole ?? 'removed'}</div>
                </td>
                <td>
                  <div>{ACTION_LABELS[row.action] ?? row.action}</div>
                  {row.target ? <div className="muted">{row.target}</div> : null}
                  {row.detail ? (
                    <div className="muted" style={{ marginTop: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>
                      {JSON.stringify(row.detail)}
                    </div>
                  ) : null}
                </td>
                <td className="muted">{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
