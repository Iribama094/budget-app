import { useEffect, useState } from 'react';
import { api, type Admin, type Flag } from '../api';

const CAN_CHANGE: Admin['role'][] = ['owner', 'engineer'];

export function Flags({ admin }: { admin: Admin }) {
  const [items, setItems] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const mayChange = CAN_CHANGE.includes(admin.role);

  const load = () =>
    api
      .flags()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'));

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (flag: Flag) => {
    setSaving(flag.key);
    setError(null);
    try {
      const res = await api.setFlag(flag.key, { enabled: !flag.enabled });
      setItems((prev) => (prev ?? []).map((f) => (f.key === flag.key ? res.flag : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setSaving(null);
    }
  };

  const setRollout = async (flag: Flag, percent: number) => {
    setSaving(flag.key);
    try {
      const res = await api.setFlag(flag.key, { rolloutPercent: percent });
      setItems((prev) => (prev ?? []).map((f) => (f.key === flag.key ? res.flag : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Feature flags</h1>
          <p className="sub">
            Switch a part of the app on or off for everyone, or for a slice of people. Phones pick the change up within a minute, with no app update
            and no deploy.
          </p>
        </div>
      </div>

      {error ? <div className="banner bad">{error}</div> : null}
      {!mayChange ? <div className="banner warn">Your role can see these but not change them.</div> : null}

      <div className="card">
        {!items ? <p className="muted">Loading...</p> : null}
        {items?.map((flag) => (
          <div className="row" key={flag.key}>
            <div className="grow">
              <p className="name">{flag.label}</p>
              <p className="meta">{flag.description}</p>
              <code style={{ fontSize: 11.5, color: '#3c4e4a', background: '#f3f6f5', padding: '2px 7px', borderRadius: 6, display: 'inline-block', marginTop: 6 }}>
                {flag.key}
              </code>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#5a6e69' }}>
              <span>Shown to</span>
              <select
                value={flag.rolloutPercent}
                disabled={!mayChange || saving === flag.key}
                onChange={(e) => void setRollout(flag, Number(e.target.value))}
                style={{ height: 34, borderRadius: 9, border: '1px solid var(--line)', padding: '0 8px' }}
              >
                {[100, 50, 20, 10, 5, 0].map((p) => (
                  <option key={p} value={p}>
                    {p === 100 ? 'everyone' : `${p}%`}
                  </option>
                ))}
              </select>
            </label>

            <span className={`chip ${flag.enabled ? 'on' : 'off'}`}>{flag.enabled ? 'On' : 'Off'}</span>

            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={flag.enabled}
              aria-label={`${flag.enabled ? 'Switch off' : 'Switch on'} ${flag.label}`}
              disabled={!mayChange || saving === flag.key}
              onClick={() => void toggle(flag)}
            >
              <span />
            </button>
          </div>
        ))}
      </div>

      <div className="banner good">
        Money Wrapped is the one that needs more than this switch. It also needs a period certified inside its window, on the Money Wrapped screen.
      </div>
    </>
  );
}
