import { useEffect, useState } from 'react';
import { api, type Admin, type AdminRole, type StaffRow } from '../api';

const ROLES: Array<{ key: AdminRole; what: string }> = [
  { key: 'owner', what: 'Everything, including adding and removing staff' },
  { key: 'engineer', what: 'Flags, Wrapped and content. No access to a person money' },
  { key: 'support', what: 'Find one person and help them. No flags' },
  { key: 'finance', what: 'Read only: tax rules, filings and totals' }
];

export function Staff({ admin }: { admin: Admin }) {
  const [items, setItems] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .staff()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));

  useEffect(() => {
    void load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.addStaff({ email: email.trim(), name: name.trim() || undefined, role });
      setEmail('');
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that person');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: StaffRow) => {
    setError(null);
    try {
      await api.removeStaff(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that person');
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Staff</h1>
          <p className="sub">
            Who may open this console, and how much they can reach. Adding someone here is not enough on its own: they also need an account, made with
            the same email.
          </p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}

      <div className="card">
        <h2>Add someone</h2>
        <form className="grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr auto', alignItems: 'end', marginTop: 12 }} onSubmit={add}>
          <div className="field">
            <label htmlFor="staff-email">Work email</label>
            <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="staff-name">Name</label>
            <input id="staff-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="staff-role">Role</label>
            <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.key}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Adding...' : 'Add'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>{ROLES.find((r) => r.key === role)?.what}</p>
      </div>

      <div className="card">
        <h2>The team</h2>
        <div style={{ marginTop: 6 }}>
          {!items ? <p className="muted" style={{ paddingTop: 12 }}>Loading...</p> : null}
          {items?.map((row) => (
            <div className="row" key={row.id}>
              <div className="grow">
                <p className="name">
                  {row.name ?? row.email} {row.id === admin.id ? <span className="muted">(you)</span> : null}
                </p>
                <p className="meta">
                  {row.email}
                  {row.lastSeenAt ? `, last here ${new Date(row.lastSeenAt).toLocaleDateString()}` : ', never signed in'}
                </p>
              </div>
              <span className={`chip ${row.disabledAt ? 'off' : 'on'}`} style={{ textTransform: 'capitalize' }}>
                {row.disabledAt ? 'Removed' : row.role}
              </span>
              {!row.disabledAt && row.id !== admin.id ? (
                <button type="button" className="btn small danger" onClick={() => void remove(row)}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Nobody can remove their own access, so an owner cannot lock themselves out. A removed person keeps their name in the audit log.
        </p>
      </div>
    </>
  );
}
