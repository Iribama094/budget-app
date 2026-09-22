import { useEffect, useState } from 'react';
import { supabase } from '../api';

/**
 * The second step into the console, after the password.
 *
 * The console can sign people out, send password resets and change what everybody is told they owe, so a
 * leaked or reused password must not be enough to open it. The first time, this sets up an authenticator app
 * (Google Authenticator, Microsoft Authenticator, 1Password and so on). After that it asks for the six digits.
 */

type Setup = { factorId: string; qr: string; secret: string };

export function TwoFactor({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(listError.message);
        setLoading(false);
        return;
      }
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setLoading(false);
        return;
      }
      // A setup that was started and abandoned blocks a new one, so it is cleared first.
      for (const f of data.all.filter((f) => f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        // Named explicitly: without it the project's site address is used, and when that is unset the QR
        // code cannot be made at all.
        issuer: 'BudgetFriendly',
        friendlyName: `Staff console ${new Date().toISOString().slice(0, 10)}`
      });
      if (enrollError || !enrolled) {
        setError(enrollError?.message ?? 'Could not start setting up your authenticator.');
        setLoading(false);
        return;
      }
      setFactorId(enrolled.id);
      setSetup({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
      setLoading(false);
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (verifyError) {
      setError(/invalid|expired/i.test(verifyError.message) ? 'That code did not match. Codes change every 30 seconds, so use the one showing now.' : verifyError.message);
      setCode('');
      return;
    }
    onVerified();
  };

  return (
    <div className="signin">
      <form className="box stack" onSubmit={verify}>
        <div>
          <h1>{setup ? 'Set up your authenticator' : 'Confirm it is you'}</h1>
          <p style={{ marginTop: 8, color: '#b6d9ce', fontSize: 13, lineHeight: '20px' }}>
            {setup
              ? 'The console needs a second step as well as your password. Scan this with an authenticator app on your phone, then type the six digits it shows.'
              : 'Type the six digits your authenticator app is showing for BudgetFriendly.'}
          </p>
        </div>

        {error ? <div className="banner bad">{error}</div> : null}
        {loading ? <p style={{ color: '#b6d9ce' }}>One moment...</p> : null}

        {setup ? (
          <div className="stack" style={{ alignItems: 'center' }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 14 }}>
              <img src={setup.qr} alt="QR code to add BudgetFriendly to your authenticator app" width={184} height={184} />
            </div>
            <p style={{ color: '#b6d9ce', fontSize: 12.5, textAlign: 'center', lineHeight: '19px' }}>
              Cannot scan? Enter this key in the app instead:
              <br />
              <code style={{ color: '#eaf4f1', fontSize: 13, letterSpacing: 1, wordBreak: 'break-all' }}>{setup.secret}</code>
            </p>
          </div>
        ) : null}

        {!loading && factorId ? (
          <div className="field">
            <label htmlFor="otp">Six-digit code</label>
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
          </div>
        ) : null}

        <button type="submit" className="btn primary" disabled={busy || loading || !factorId}>
          {busy ? 'Checking...' : setup ? 'Finish setting up' : 'Continue'}
        </button>
        <button type="button" className="btn" onClick={onCancel} style={{ background: 'transparent', color: '#b6d9ce', borderColor: '#134a41' }}>
          Sign out
        </button>

        {setup ? (
          <p style={{ color: '#86bfaf', fontSize: 12, lineHeight: '18px' }}>
            Keep this app on a phone you will not lose track of. If you do lose it, the factor can be removed from the Supabase dashboard under Authentication, Users, and you set it up again here.
          </p>
        ) : null}
      </form>
    </div>
  );
}
