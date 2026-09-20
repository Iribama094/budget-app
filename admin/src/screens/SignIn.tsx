import { useState } from 'react';
import { supabase } from '../api';

/**
 * Staff sign in. The console never says whether an email exists: a wrong password and an account that is not
 * staff give the same flat answer, so this page cannot be used to find out who works here.
 */
export function SignIn({ notice, onSignedIn }: { notice: string | null; onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) {
      setError('That did not work. Check the email and password.');
      return;
    }
    onSignedIn();
  };

  return (
    <div className="signin">
      <form className="box stack" onSubmit={submit}>
        <div>
          <h1>BudgetFriendly staff</h1>
          <p style={{ marginTop: 8, color: '#b6d9ce', fontSize: 13, lineHeight: '20px' }}>
            For the team that runs the app. Your account also has to be on the staff list.
          </p>
        </div>

        {notice ? <div className="banner bad">{notice}</div> : null}
        {error ? <div className="banner bad">{error}</div> : null}

        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={{ color: '#86bfaf', fontSize: 12, lineHeight: '19px' }}>
          Everything you do here is recorded with your name and the time.
        </p>
      </form>
    </div>
  );
}
