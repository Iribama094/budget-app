import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { WrappedStory } from '../api';

/**
 * Plays a Wrapped story the way the app does: the same slides in the same order, with the same colours, words and
 * timing. Staff certify what people will actually see, so this mirrors mobile/src/screens/WrappedScreen.tsx rather
 * than summarising it. If that screen changes, change this with it.
 */

const EMOJI: Record<string, string> = { stacker: '🐿️', planner: '📋', tracker: '🧾', enjoyer: '🎉', hustler: '💪', builder: '🏗️', grinder: '💼', survivor: '🙏' };
const SYMBOLS: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh', ZAR: 'R' };
const SLIDE_MS = 7000;

type Slide = { key: string; colors: [string, string]; body: ReactNode };

/** Fades a line up into place, after a delay, every time its slide comes round. */
function Reveal({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="wv-reveal" style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

function Pop({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="wv-pop" style={{ animationDelay: `${delay}ms`, ...style }}>
      {children}
    </div>
  );
}

/** Counts up to the figure, as the app does, so the moment lands the same way. */
function CountUp({ value, format, delay = 0, color }: { value: number; format: (n: number) => string; delay?: number; color: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const startAt = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / 900));
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);
  return <div className="wv-count" style={{ color }}>{format(shown)}</div>;
}

/** A bar that grows to its share once its slide is showing. */
function GrowBar({ percent, color, delay = 0, vertical = false }: { percent: number; color: string; delay?: number; vertical?: boolean }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  const size = `${grown ? Math.max(2, Math.min(100, percent)) : 0}%`;
  return <div className="wv-bar" style={{ background: color, ...(vertical ? { height: size, width: '100%' } : { width: size, height: '100%' }) }} />;
}

export function WrappedViewer({ story, who, onClose }: { story: WrappedStory; who: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Bumped on every move, so a slide's entrance plays again when it comes back round.
  const [play, setPlay] = useState(0);
  const heldAt = useRef<number | null>(null);

  const glyph = SYMBOLS[(story.currency || 'NGN').toUpperCase()] ?? story.currency;
  const money = useCallback((n: number) => `${n < 0 ? '−' : ''}${glyph}${Math.abs(Math.round(n)).toLocaleString('en-NG')}`, [glyph]);

  const slides: Slide[] = useMemo(() => {
    const d = story;
    if (!d.hasData) return [];
    const out: Slide[] = [];
    const label = (text: string) => <p className="wv-label">{text}</p>;

    out.push({
      key: 'intro',
      colors: ['#0F3D35', '#1B6B5C'],
      body: (
        <>
          <Reveal>{label('Money Wrapped')}</Reveal>
          <Pop delay={180}>
            <p style={{ fontSize: 64, marginTop: 18 }}>🎁</p>
          </Pop>
          <Reveal delay={420}>
            <p className="wv-big" style={{ marginTop: 12 }}>{d.period.label}</p>
            <p className="wv-line wv-soft">
              {d.space === 'business' ? 'Business' : 'Personal'} · {d.period.complete ? 'the full story' : 'the story so far'}
            </p>
          </Reveal>
          <Reveal delay={760}>
            <p className="wv-line" style={{ marginTop: 28 }}>Oya, make we see how your money waka 👀</p>
            <p className="wv-caption wv-soft" style={{ marginTop: 8 }}>It moves on its own. Tap to skip ahead, hold to pause.</p>
          </Reveal>
        </>
      )
    });

    const saved = d.totals.net;
    out.push({
      key: 'money',
      colors: ['#1C2638', '#34445F'],
      body: (
        <>
          <Reveal>{label(d.space === 'business' ? 'Money through the business' : 'Money in and out')}</Reveal>
          <Reveal delay={220}>
            <p className="wv-metric" style={{ marginTop: 22 }}>Came in</p>
            <CountUp value={d.totals.income} format={money} delay={260} color="#FFFFFF" />
          </Reveal>
          <Reveal delay={520}>
            <p className="wv-metric" style={{ marginTop: 16 }}>Went out</p>
            <CountUp value={d.totals.spending} format={money} delay={560} color="#FFFFFF" />
          </Reveal>
          <Reveal delay={860}>
            <p className="wv-metric" style={{ marginTop: 16 }}>{saved >= 0 ? 'You kept' : 'Spent more than came in by'}</p>
            <CountUp value={Math.abs(saved)} format={money} delay={900} color={saved >= 0 ? '#8FD6C3' : '#F07565'} />
          </Reveal>
          <Reveal delay={1400}>
            {d.totals.savingsRate != null && d.totals.savingsRate > 0 ? (
              <p className="wv-line" style={{ marginTop: 18 }}>{d.totals.savingsRate}% of everything that came in, you kept. No be small thing 💪</p>
            ) : null}
            {d.change.spending != null ? (
              <p className="wv-line wv-soft" style={{ marginTop: 8 }}>
                Spending {d.change.spending >= 0 ? 'went up' : 'went down'} {Math.abs(d.change.spending)}% on the same time last year.
              </p>
            ) : null}
          </Reveal>
        </>
      )
    });

    if (d.topCategories.length) {
      const top = d.topCategories[0];
      out.push({
        key: 'categories',
        colors: ['#3A2A12', '#7A5A1E'],
        body: (
          <>
            <Reveal>{label('Where the money went')}</Reveal>
            <Pop delay={260}>
              <p className="wv-big" style={{ marginTop: 14 }}>{top.category}</p>
            </Pop>
            <Reveal delay={560}>
              <p className="wv-line wv-soft">
                took {top.share}% of your spending, {money(top.amount)}.
              </p>
            </Reveal>
            <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
              {d.topCategories.map((c, i) => (
                <Reveal key={c.category} delay={760 + i * 120}>
                  <div className="wv-row">
                    <span className="wv-strong">{c.category}</span>
                    <span className="wv-soft wv-small">{c.share}%</span>
                  </div>
                  <div className="wv-track">
                    <GrowBar percent={c.share} color="#E2B65C" delay={820 + i * 120} />
                  </div>
                </Reveal>
              ))}
            </div>
          </>
        )
      });
    }

    if (d.biggestMonth) {
      const maxSpend = Math.max(1, ...d.months.map((m) => m.spending));
      out.push({
        key: 'months',
        colors: ['#2B1B3D', '#5B3A7A'],
        body: (
          <>
            <Reveal>{label('Month by month')}</Reveal>
            <Pop delay={240}>
              <p className="wv-big" style={{ marginTop: 14 }}>{d.biggestMonth.month}</p>
            </Pop>
            <Reveal delay={540}>
              <p className="wv-line wv-soft">was your biggest spending month, {money(d.biggestMonth.amount)}.</p>
            </Reveal>
            <div className="wv-chart">
              {d.months.map((m, i) => (
                <div key={m.month} className="wv-col">
                  <div className="wv-colbar">
                    <GrowBar
                      vertical
                      percent={(m.spending / maxSpend) * 100}
                      color={m.month === d.biggestMonth!.month.slice(0, 3) ? '#E2B65C' : 'rgba(255,255,255,0.35)'}
                      delay={700 + i * 70}
                    />
                  </div>
                  <span className="wv-caption wv-soft" style={{ fontSize: 10, marginTop: 6 }}>{m.month.slice(0, 1)}</span>
                </div>
              ))}
            </div>
            <Reveal delay={1500}>
              {d.calmestMonth ? <p className="wv-line" style={{ marginTop: 14 }}>Calmest month: {d.calmestMonth.month} 😌</p> : null}
              {d.bestSavingMonth ? (
                <p className="wv-line" style={{ marginTop: 6 }}>
                  Best month for keeping money: {d.bestSavingMonth.month} ({money(d.bestSavingMonth.amount)})
                </p>
              ) : null}
            </Reveal>
          </>
        )
      });
    }

    if (d.topMerchant || d.busiestDay) {
      out.push({
        key: 'spot',
        colors: ['#12343B', '#1F6F7A'],
        body: (
          <>
            <Reveal>{label('Your spots')}</Reveal>
            {d.topMerchant ? (
              <>
                <Pop delay={260}>
                  <p className="wv-big" style={{ marginTop: 14 }}>{d.topMerchant.name}</p>
                </Pop>
                <Reveal delay={600}>
                  <p className="wv-line wv-soft">
                    {d.topMerchant.visits} visit{d.topMerchant.visits === 1 ? '' : 's'} · {money(d.topMerchant.amount)}. Looks like your regular spot 😄
                  </p>
                </Reveal>
              </>
            ) : null}
            {d.busiestDay ? (
              <Reveal delay={900}>
                <p className="wv-metric" style={{ marginTop: 28 }}>Big spending day</p>
                <p className="wv-big" style={{ fontSize: 34, lineHeight: '40px' }}>{d.busiestDay}s</p>
                <p className="wv-line wv-soft">Plan those days ahead and the week go calm.</p>
              </Reveal>
            ) : null}
          </>
        )
      });
    }

    const h = d.habits;
    const habitLines = [
      `🧾 ${h.transactions} transactions recorded`,
      `🙌 ${h.noSpendDays} no-spend days`,
      d.goals.saved > 0 ? `🌱 ${money(d.goals.saved)} put toward ${d.goals.goalsFunded} goal${d.goals.goalsFunded === 1 ? '' : 's'}` : null,
      d.budgets.ended > 0 ? `🎯 ${d.budgets.onBudget} of ${d.budgets.ended} budgets finished on plan` : null
    ].filter(Boolean) as string[];
    out.push({
      key: 'habits',
      colors: ['#16302A', '#2F6B57'],
      body: (
        <>
          <Reveal>{label('Your habits')}</Reveal>
          <Pop delay={240}>
            <p className="wv-big" style={{ marginTop: 14 }}>{h.daysLogged} days</p>
          </Pop>
          <Reveal delay={540}>
            <p className="wv-line wv-soft">you logged your money, out of {h.trackedDays} since you started tracking.</p>
          </Reveal>
          <div style={{ marginTop: 24, display: 'grid', gap: 14 }}>
            {habitLines.map((line, i) => (
              <Reveal key={line} delay={820 + i * 160}>
                <p className="wv-line">{line}</p>
              </Reveal>
            ))}
          </div>
        </>
      )
    });

    const b = d.business;
    if (b) {
      out.push({
        key: 'business',
        colors: ['#1C2638', '#2A3A55'],
        body: (
          <>
            <Reveal>{label('The business')}</Reveal>
            <Reveal delay={220}>
              <p className="wv-metric" style={{ marginTop: 18 }}>{b.profit >= 0 ? 'Profit' : 'Loss'}</p>
              <CountUp value={Math.abs(b.profit)} format={money} delay={280} color={b.profit >= 0 ? '#E2B65C' : '#F07565'} />
              {b.margin != null ? <p className="wv-line wv-soft">{b.margin}% margin on {money(b.revenue)} revenue</p> : null}
            </Reveal>
            <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
              {b.topCustomer ? <p className="wv-line">🤝 Top customer: {b.topCustomer.name} ({money(b.topCustomer.amount)})</p> : null}
              {b.bestMonth ? <p className="wv-line">📈 Best month: {b.bestMonth.month}</p> : null}
              {b.invoicesIssued ? <p className="wv-line">🧾 {b.invoicesIssued} invoices sent, {b.invoicesPaid} paid</p> : null}
              {b.payroll ? <p className="wv-line">👥 {money(b.payroll)} paid to your team</p> : null}
              {b.ownerPay ? <p className="wv-line">😎 {money(b.ownerPay)} paid to yourself</p> : null}
            </div>
          </>
        )
      });
    }

    out.push({
      key: 'persona',
      colors: ['#1B1030', '#7A2E5C'],
      body: (
        <>
          <Reveal>{label('Your money personality')}</Reveal>
          <Reveal delay={300}>
            <p className="wv-line wv-soft" style={{ marginTop: 10 }}>Drumroll...</p>
          </Reveal>
          <Pop delay={900}>
            <p style={{ fontSize: 72, marginTop: 14 }}>{EMOJI[d.persona.key] ?? '✨'}</p>
          </Pop>
          <Pop delay={1150}>
            <p className="wv-big" style={{ marginTop: 8 }}>{d.persona.title}</p>
          </Pop>
          <Reveal delay={1500}>
            <p className="wv-line" style={{ marginTop: 10 }}>{d.persona.line}</p>
            <p className="wv-caption wv-soft" style={{ marginTop: 30 }}>{d.period.label} · BudgetFriendly</p>
          </Reveal>
        </>
      )
    });
    return out;
  }, [story, money]);

  const go = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(slides.length - 1, i)));
      setPlay((n) => n + 1);
    },
    [slides.length]
  );

  // Moves on by itself, like the app, unless held or on the last slide.
  useEffect(() => {
    if (!slides.length || paused || index >= slides.length - 1) return;
    const t = setTimeout(() => go(index + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, paused, slides.length, go, play]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onClose]);

  // A tap moves; a press held longer than a tap pauses, the way stories behave on a phone.
  const down = () => {
    heldAt.current = Date.now();
    setPaused(true);
  };
  const up = (forward: boolean) => {
    const held = heldAt.current ? Date.now() - heldAt.current : 0;
    heldAt.current = null;
    setPaused(false);
    if (held < 250) go(forward ? index + 1 : index - 1);
  };

  const slide = slides[index];

  return (
    <div className="wv-backdrop" role="dialog" aria-modal="true" aria-label={`Money Wrapped preview for ${who}`} onClick={onClose}>
      <div className="wv-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="wv-top">
          <div>
            <p className="wv-who">Playing {who}'s story</p>
            <p className="wv-note">
              Exactly what they will see. Figures show in full here; in the app they can hide them. Tap the sides or use the arrow keys, hold or press space to pause.
            </p>
          </div>
          <button type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="wv-phone">
          {slide ? (
            <div className="wv-slide" style={{ background: `linear-gradient(135deg, ${slide.colors[0]}, ${slide.colors[1]})` }}>
              <div className="wv-progress">
                {slides.map((s, i) => (
                  <div key={s.key} className="wv-seg">
                    <div
                      key={`${s.key}-${play}`}
                      className={`wv-fill ${i < index ? 'done' : i === index ? 'now' : ''}`}
                      style={i === index ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' } : undefined}
                    />
                  </div>
                ))}
              </div>
              <div className="wv-body" key={`${slide.key}-${play}`}>
                {slide.body}
              </div>
              <button type="button" className="wv-tap left" aria-label="Previous slide" onMouseDown={down} onMouseUp={() => up(false)} onTouchStart={down} onTouchEnd={() => up(false)} />
              <button type="button" className="wv-tap right" aria-label="Next slide" onMouseDown={down} onMouseUp={() => up(true)} onTouchStart={down} onTouchEnd={() => up(true)} />
            </div>
          ) : (
            <div className="wv-slide wv-empty" style={{ background: 'linear-gradient(135deg, #0F3D35, #1B6B5C)' }}>
              <p style={{ fontSize: 48 }}>🎁</p>
              <p className="wv-big" style={{ fontSize: 24, lineHeight: '30px', marginTop: 12 }}>Nothing to wrap yet</p>
              <p className="wv-line wv-soft" style={{ marginTop: 8 }}>
                There are no {story.space} transactions in {story.period.label}, so this person would see no story for it.
              </p>
            </div>
          )}
        </div>

        {slides.length ? (
          <p className="wv-count-note">
            Slide {index + 1} of {slides.length}
            {paused ? ' · paused' : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}
