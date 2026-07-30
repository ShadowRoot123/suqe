/**
 * Formats a stored `expected_at` for display.
 *
 * An expected delivery date is a calendar date, so it must not move with the timezone. Handing
 * "2026-08-20" to `new Date` parses it as UTC midnight, and `toLocaleDateString` then renders it a
 * day earlier anywhere behind UTC — the order list said 8/19 while the detail screen, which read
 * the string directly, said 2026-08-20. Reading the components and rebuilding the date in local
 * time keeps the day the user actually typed.
 *
 * Accepts both what the client stores ("2026-08-20") and what the server echoes
 * ("2026-08-20T00:00:00.000Z"), since the column is a timestamp.
 */
export function calendarDate(iso: string | null | undefined, fallback = "—"): string {
  const parts = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!parts) return fallback;

  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
}

/** The `YYYY-MM-DD` form the date input and the sync payload both use. */
export function calendarDateInput(iso: string | null | undefined): string {
  const parts = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return parts ? parts[0] : "";
}
