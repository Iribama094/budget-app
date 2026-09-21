import { useState } from 'react';
import { api, type ContentBlock, type FxRateValue, type PriceAlertValue } from '../api';

/**
 * Two things staff keep current for everyone: price news (fuel, food, fares) that reaches only people who buy
 * what it's about, and the exchange rates foreign money is counted at. People can set their own rates in the app.
 */
export function PricesAndRates({ items, mayChange, onChanged }: { items: ContentBlock[]; mayChange: boolean; onChanged: () => Promise<void> | void }) {
  const alerts = items.filter((b) => b.kind === 'price_alert');
  const rates = items.filter((b) => b.kind === 'fx_rate');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ title: '', body: '', categories: 'Transport', until: '' });
  const [rate, setRate] = useState({ currency: 'USD', rate: '' });

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const value: PriceAlertValue = {
      title: alert.title.trim(),
      body: alert.body.trim(),
      categories: alert.categories.split(',').map((c) => c.trim()).filter(Boolean),
      ...(alert.until ? { until: alert.until } : {})
    };
    const ok = await run(() => api.addContent({ key: `price.${Date.now().toString(36)}`, kind: 'price_alert', value }));
    if (ok) setAlert({ title: '', body: '', categories: 'Transport', until: '' });
  };

  const saveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = rate.currency.trim().toUpperCase();
    const value: FxRateValue = { currency: code, rate: Number(rate.rate) };
    const ok = await run(() => api.addContent({ key: `fx.${code}`, kind: 'fx_rate', value }));
    if (ok) setRate({ currency: 'USD', rate: '' });
  };

  return (
    <div className="card">
      <h2>Prices and exchange rates</h2>
      <p className="muted" style={{ marginTop: 6 }}>
        A price alert shows once in the app's insights, only to people who spent in one of its categories in the last two months. Rates count
        dollars, pounds and other money in naira for anyone who hasn't set their own.
      </p>
      {error ? <div className="banner warn" style={{ marginTop: 12 }}>{error}</div> : null}

      <div style={{ marginTop: 12 }}>
        {alerts.map((b) => {
          const v = b.value as PriceAlertValue;
          return (
            <div className="row" key={b.key}>
              <div className="grow">
                <p className="name">{v.title}</p>
                <p className="meta">
                  {v.body} · for {v.categories.join(', ') || 'everyone'}
                  {v.until ? ` · until ${v.until}` : ''}
                </p>
              </div>
              <span className={`chip ${b.enabled ? 'on' : 'off'}`}>{b.enabled ? 'Live' : 'Off'}</span>
              {mayChange ? (
                <button type="button" className="btn small" disabled={busy} onClick={() => void run(() => api.setContent(b.key, { enabled: !b.enabled }))}>
                  {b.enabled ? 'Switch off' : 'Switch on'}
                </button>
              ) : null}
            </div>
          );
        })}
        {rates.map((b) => {
          const v = b.value as FxRateValue;
          return (
            <div className="row" key={b.key}>
              <div className="grow">
                <p className="name">1 {v.currency} = ₦{v.rate.toLocaleString('en-NG')}</p>
                <p className="meta">Updated {new Date(b.updatedAt).toLocaleDateString()}</p>
              </div>
              <span className={`chip ${b.enabled ? 'on' : 'off'}`}>{b.enabled ? 'In use' : 'Off'}</span>
            </div>
          );
        })}
      </div>

      {mayChange ? (
        <div className="grid two" style={{ marginTop: 16 }}>
          <form className="stack" onSubmit={addAlert}>
            <div className="field">
              <label htmlFor="pa-title">Price alert</label>
              <input id="pa-title" value={alert.title} onChange={(e) => setAlert({ ...alert, title: e.target.value })} placeholder="Fuel is now about ₦1,100 a litre" required maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="pa-body">What it means</label>
              <input id="pa-body" value={alert.body} onChange={(e) => setAlert({ ...alert, body: e.target.value })} placeholder="Transport may cost more this month. Check your budget has room." required maxLength={240} />
            </div>
            <div className="grid two">
              <div className="field">
                <label htmlFor="pa-cats">For people who spend on</label>
                <input id="pa-cats" value={alert.categories} onChange={(e) => setAlert({ ...alert, categories: e.target.value })} placeholder="Transport, Food & groceries" />
              </div>
              <div className="field">
                <label htmlFor="pa-until">Show until</label>
                <input id="pa-until" type="date" value={alert.until} onChange={(e) => setAlert({ ...alert, until: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
              Post alert
            </button>
          </form>
          <form className="stack" onSubmit={saveRate}>
            <div className="grid two">
              <div className="field">
                <label htmlFor="fx-code">Currency</label>
                <input id="fx-code" value={rate.currency} onChange={(e) => setRate({ ...rate, currency: e.target.value })} maxLength={3} required />
              </div>
              <div className="field">
                <label htmlFor="fx-rate">Naira for one</label>
                <input id="fx-rate" type="number" min="0" step="0.01" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} required />
              </div>
            </div>
            <button type="submit" className="btn primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
              Save rate
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
