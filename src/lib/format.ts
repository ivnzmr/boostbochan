export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function compact(value: number): string {
  return new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "hace 3 horas" style label for a past timestamp (ms). */
export function relativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const diff = timestampMs - nowMs;
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const [unit, size] = RELATIVE_UNITS.find(([, ms]) => Math.abs(diff) >= ms) ?? ["minute", 60_000];
  return formatter.format(Math.round(diff / size), unit);
}

/** Text color for a win rate: green above 52%, red below 48%. */
export function winRateTone(winRate: number): string {
  if (winRate >= 0.52) return "text-ok";
  if (winRate <= 0.48) return "text-bad";
  return "text-text";
}
