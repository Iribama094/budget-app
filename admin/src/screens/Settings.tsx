import { useState } from 'react';
import { supabase, type Admin, API_BASE, PROJECT_REF } from '../api';

const ROLE_WHAT: Record<Admin['role'], string> = {
  owner: 'Everything, including adding and removing staff',
  engineer: 'Flags, Wrapped and content. No access to a person’s money',
  support: 'Find one person and help them',
  finance: 'Tax rules, and reading the rest'
};

export function Settings({ admin }: { admin: Admin }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 10) {
      setError('Use at least ten characters. This account can switch features off for everyone.');
      return;
    }
    if (password !== again) {
      setError('The two passwords are not the same.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPassword('');
    setAgain('');
    setNotice('Changed. It works for the app as well, since it is one account.');
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Your own account, and where this console is pointed.</p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}
      {notice ? <div className="banner good">{notice}</div> : null}

      <div className="card">
        <h2>You</h2>
        <div className="row">
          <div className="grow">
            <p className="name">{admin.name ?? admin.email}</p>
            <p className="meta">{admin.email}</p>
          </div>
          <span className="chip on" style={{ textTransform: 'capitalize' }}>{admin.role}</span>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>{ROLE_WHAT[admin.role]}</p>
      </div>

      <form className="card" onSubmit={change}>
        <h2>Change your password</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          The console and the app are one account, so this changes both. Worth doing now if somebody else set this password for you.
        </p>
        <div className="grid two" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="new-pass">New password</label>
            <input id="new-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <span className="muted">{password.length} characters</span>
          </div>
          <div className="field">
            <label htmlFor="again">Type it again</label>
            <input id="again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
          </div>
        </div>
        <button type="submit" className="btn primary" disabled={busy} style={{ marginTop: 14 }}>
          {busy ? 'Changing...' : 'Change password'}
        </button>
      </form>

      <div className="card">
        <h2>Where this points</h2>
        <div className="row">
          <div className="grow">
            <p className="name">API</p>
            <p className="meta">{API_BASE}</p>
          </div>
        </div>
        <div className="row">
          <div className="grow">
            <p className="name">Supabase project</p>
            <p className="meta">{PROJECT_REF}</p>
          </div>
          <a className="btn small" href={`https://supabase.com/dashboard/project/${PROJECT_REF}/logs/edge-functions`} target="_blank" rel="noreferrer">
            Open the logs
          </a>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          For errors, slow queries and anything the console does not cover, the Supabase dashboard is still the right place. This page is not trying
          to be a worse copy of it.
        </p>
      </div>
    </>
  );
}
