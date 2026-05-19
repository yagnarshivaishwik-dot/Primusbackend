/**
 * Safe Date parsing that survives naive (no-tz) backend timestamps.
 *
 * Some legacy backend endpoints serialize `datetime.utcnow()` directly with
 * `.isoformat()`, which produces e.g. `"2026-05-19T08:07:00.123456"` —
 * no `Z`, no `+00:00`. JavaScript's `new Date(s)` then parses that as
 * LOCAL time (IST on the cafe kiosks → UTC+5:30), and the displayed time
 * drifts by the local UTC offset.
 *
 * `parseUtcDate` appends `Z` if the input lacks any timezone marker, so
 * naive backend strings get treated as UTC. The kiosk's system locale
 * then drives the display via `toLocaleTimeString()` — no hardcoded
 * timezone, the kiosk's clock decides (IST on cafe PCs).
 *
 * Inputs without a date (null / undefined / empty) yield `null` so the
 * caller can decide what to render.
 */
export function parseUtcDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string' || value.length === 0) return null;
  // Already has tz info (Z or ±HH:MM at the end) — trust it.
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTz ? value : `${value}Z`);
}

/**
 * Format a backend timestamp as HH:MM in the kiosk's local time.
 * Returns an empty string for missing inputs so it can be dropped into
 * JSX without guards.
 */
export function formatLocalTime(value) {
  const d = parseUtcDate(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
