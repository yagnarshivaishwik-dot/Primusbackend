// Twin of ClutcHH-1/src/utils/datetime.js — keep behaviour identical so the
// admin portal and the kiosk display the same timestamps for the same row.
// See that file for the timezone bug background.

export function parseUtcDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string' || value.length === 0) return null;
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTz ? value : `${value}Z`);
}

export function formatLocalTime(value) {
  const d = parseUtcDate(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString();
}
