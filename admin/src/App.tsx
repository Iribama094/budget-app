import { useCallback, useEffect, useState } from 'react';
import { api, supabase, ApiError, type Admin } from './api';
import { SignIn } from './screens/SignIn';
import { Overview } from './screens/Overview';
import { Flags } from './screens/Flags';
import { Wrapped } from './screens/Wrapped';
import { Audit } from './screens/Audit';
import { Staff } from './screens/Staff';

type Page = 'overview' | 'flags' | 'wrapped' | 'audit' | 'staff';

const PAGES: Array<{ key: Page; label: string; owners?: boolean }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'flags', label: 'Feature flags' },
  { key: 'wrapped', label: 'Money Wrapped' },
  { key: 'audit', label: 'Audit log' },
  { key: 'staff', label: 'Staff', owners: true }
];

export function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>('overview');
  const [denied, setDenied] = useState<string | null>(null);

  /**
   * Signed in is not the same as staff. The session may be perfectly valid and still have no business here,
   * so the console asks the server who it is talking to before showing anything.
   */
  const check = useCallback(async () => {
    setChecking(true);
    setDenied(null);
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setAdmin(null);
      setChecking(false);
      return;
    }
    try {
      const res = await api.me();
      setAdmin(res.admin);
    } catch (err) {
      setAdmin(null);
      if (err instanceof ApiError && err.status === 404) {
        setDenied('That account is not on the staff list. Ask an owner to add you.');
        await supabase.auth.signOut();
      } else {
        setDenied(err instanceof Error ? err.message : 'Could not reach the server.');
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => void check());
    return () => data.subscription.unsubscribe();
  }, [check]);

  if (checking) {
    return (
      <div className="signin">
        <div className="box">
          <p style={{ color: '#b6d9ce' }}>Checking your access...</p>
        </div>
      </div>
    );
  }

  if (!admin) return <SignIn notice={denied} onSignedIn={check} />;

  const pages = PAGES.filter((p) => !p.owners || admin.role === 'owner');

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3FA38F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7h13a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M16 12h3" />
            <path d="M3 7V6a2 2 0 0 1 2-2h9" />
          </svg>
          <span>Staff console</span>
        </div>

        <nav>
          {pages.map((p) => (
            <button key={p.key} type="button" aria-current={page === p.key ? 'page' : undefined} onClick={() => setPage(p.key)}>
              {p.label}
            </button>
          ))}
        </nav>

        <div className="who">
          <p>Signed in as</p>
          <strong>{admin.name ?? admin.email}</strong>
          <p style={{ marginTop: 2, textTransform: 'capitalize' }}>{admin.role}</p>
          <button type="button" className="btn small" style={{ marginTop: 10, width: '100%' }} onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        {page === 'overview' && <Overview onGoToWrapped={() => setPage('wrapped')} />}
        {page === 'flags' && <Flags admin={admin} />}
        {page === 'wrapped' && <Wrapped admin={admin} />}
        {page === 'audit' && <Audit />}
        {page === 'staff' && <Staff admin={admin} />}
      </main>
    </div>
  );
}
