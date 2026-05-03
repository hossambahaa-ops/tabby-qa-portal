import React from "react";
import { useCountUp } from "../lib/useCountUp.jsx";

/**
 * <CountUp value={42.7} decimals={1} suffix="%" />
 *
 * Drop-in replacement for any plain number node that should animate
 * on first paint. Pass `prefix`/`suffix` for "$" or "%" wrapping.
 * Pass `format={n => …}` for custom formatting (e.g. "1,234").
 */
export default function CountUp({ value, decimals, durationMs, prefix = "", suffix = "", format, skipFirst = false }) {
  const v = useCountUp(value, { decimals, durationMs, skipFirst });
  const display = format ? format(v) : (decimals != null ? v.toFixed(decimals) : v);
  return <>{prefix}{display}{suffix}</>;
}
