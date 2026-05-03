import { useEffect, useRef, useState } from "react";

/**
 * useCountUp(target, options?)
 *
 * Animates a numeric value from 0 (or the previous value) up to `target`
 * with an ease-out curve so big stats feel alive on first paint without
 * overshooting. Returns a number, formatted to the same decimal places
 * as the target unless overridden.
 *
 * Options:
 *   durationMs  — defaults to 600ms
 *   decimals    — number of decimals to round to. Auto-detects from
 *                 target if omitted (1 decimal if target has any
 *                 fractional part, else 0).
 *   skipFirst   — if true, the first render shows the target instantly.
 *                 Useful when re-using the hook on data that re-renders
 *                 frequently — only the *initial* mount animates.
 *
 * Respects prefers-reduced-motion: returns target immediately.
 */
export function useCountUp(target, opts = {}) {
  const { durationMs = 600, decimals, skipFirst = false } = opts;
  const safeTarget = Number.isFinite(target) ? Number(target) : 0;
  const dec = decimals != null
    ? decimals
    : (Math.floor(safeTarget) === safeTarget ? 0 : 1);
  const [value, setValue] = useState(skipFirst ? safeTarget : 0);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const fromRef = useRef(0);

  useEffect(() => {
    // Honour the user's reduced-motion preference.
    const reduce = typeof window !== "undefined"
      && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setValue(safeTarget); return; }

    fromRef.current = value;
    startRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // Ease-out cubic — fast at start, soft landing
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (safeTarget - fromRef.current) * eased;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, durationMs]);

  return Number(value.toFixed(dec));
}
