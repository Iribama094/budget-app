/**
 * The small amount of JavaScript the page's motion needs: reveal on scroll, a count up on the phone's
 * figure, the bank ticker's second lane, and a flag on the header once you have scrolled.
 *
 * It does nothing at all when the phone asks for reduced motion. The `motion` class is what turns the
 * animated rules in styles.css on, so without this file, or with reduced motion, the page renders finished
 * and still. That is the point: no state where content is invisible because a script did not run.
 */
(() => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The scrolled header is worth having either way, so it is set before anything else can bail out.
  const onScroll = () => document.documentElement.setAttribute('data-scrolled', window.scrollY > 24 ? '1' : '0');
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  if (still.matches) return;
  document.documentElement.classList.add('motion');

  // Order the hero's parts and each revealed group, so they arrive one after another rather than together.
  const order = (nodes) => nodes.forEach((el, i) => el.style.setProperty('--i', String(i)));
  order([...document.querySelectorAll('.hero [data-enter]')]);
  document.querySelectorAll('[data-reveal-group]').forEach((group) => order([...group.querySelectorAll('[data-reveal]')]));

  // Reveals: once seen, stay seen. Nothing re-animates on the way back up the page.
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        seen.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.1 }
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => seen.observe(el));

  /** Counts up to the number already written in the markup, so the page reads correctly without this. */
  const countUp = (el) => {
    const target = Number(String(el.textContent).replace(/[^0-9]/g, ''));
    if (!target) return;
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / 900);
      // easeOutCubic: quick off the mark, gentle at the end, no overshoot on somebody's money.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-NG');
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };

  const device = document.querySelector('.hero .device');
  if (device) {
    const amount = device.querySelector('[data-count]');
    new IntersectionObserver(
      (entries, observer) => {
        if (!entries[0].isIntersecting) return;
        device.classList.add('live');
        if (amount) countUp(amount);
        observer.disconnect();
      },
      { threshold: 0.35 }
    ).observe(device);
  }

  // The ticker needs the chips twice to run without a seam. The copy is hidden from screen readers.
  const banks = document.querySelector('.banks.ticker');
  if (banks && !banks.querySelector('.lane')) {
    const lane = document.createElement('div');
    lane.className = 'lane';
    lane.append(...banks.children);
    const copy = lane.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    banks.append(lane, copy);
  }
})();
