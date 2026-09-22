import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { errorMessage } from '../lib/errorMessage';

/**
 * Loads what a screen shows, and loads it again whenever the screen comes back into view.
 *
 * Nearly every screen used to write this out: state for the data, the error and the first load, a try/catch
 * that turned the error into a sentence, and a useFocusEffect to run it again on the way back. Two things it
 * adds that the copies didn't: an answer that arrives after the screen has gone is dropped, and so is an
 * answer overtaken by a newer load, so a slow reply can't put stale data on the screen.
 *
 * `load` is called again whenever one of `deps` changes (the space someone is in, an id, a filter).
 */
export function useScreenData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  options: { fallback?: string; onFocus?: boolean } = {}
) {
  const { fallback = 'Could not load this', onFocus = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True until the first answer, so a screen can show its skeleton once and not flash it on every reload.
  const [loading, setLoading] = useState(true);

  const alive = useRef(true);
  const run = useRef(0);
  // Kept in a ref so `reload` never changes identity, and the screens that pass it to onRefresh don't re-render.
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const mine = ++run.current;
    setError(null);
    try {
      const next = await latest.current();
      if (!alive.current || mine !== run.current) return;
      setData(next);
    } catch (e) {
      if (!alive.current || mine !== run.current) return;
      setError(errorMessage(e, fallback));
    } finally {
      if (alive.current && mine === run.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  // Coming back to the screen. This deliberately does not depend on `deps`: a change there is handled below,
  // so whichever happens, the screen loads once and not twice.
  useFocusEffect(
    useCallback(() => {
      if (onFocus) void reload();
    }, [reload, onFocus])
  );

  // A change in what the screen depends on: the space someone switched to, an id, a filter. The first run is
  // skipped, because mounting already loaded (or is about to, on focus).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) void reload();
    else {
      mounted.current = true;
      // Nothing reloads this one on focus, so the first load happens here.
      if (!onFocus) void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, error, setError, loading, reload };
}
