// Money primitives, mirroring the backend's decimal(12,2). They live here rather than under a
// feature because purchasing and sales both need the same arithmetic, and a sales module reaching
// into `purchasing/lib` for `parseMoney` would invent a dependency between two unrelated domains.
// `purchasing/lib/money.ts` re-exports these, so every existing import still resolves.
export const MONEY_SCALE = 2;

export const MONEY_FACTOR = 10 ** MONEY_SCALE;

/**
 * Rounds a float; the server rounds a BigDecimal (`ColumnScale`). At an *exact* half the two can
 * disagree — 1.005 is 1.00499… as a double and rounds down here while Ruby rounds the decimal
 * literal up, and 2.005 goes the other way. Not reachable through the app: every write rounds at
 * parse and sends the rounded string, so the server never sees a raw sub-scale value from a till.
 */
export function roundMoney(value: number): number {
  return Math.round(value * MONEY_FACTOR) / MONEY_FACTOR;
}

/** Parses anything the local store or the server may hand us. Returns null when it isn't a number. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

export function moneyOrZero(value: unknown): number {
  return parseMoney(value) ?? 0;
}

/**
 * The same parse with **no rounding**. `parseMoney` rounds to the cent, which is right everywhere
 * money is stored, summed or displayed — but it turns -0.004 into 0, so a `< 0` check built on it
 * lets through a price the server refuses (it tests the sign before rounding). Validation only:
 * a value from here must never reach a total or a stored column.
 */
export function parseMoneyExact(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Always two decimals: this is currency, so "12.50" reads better than "12.5". */
export function formatMoney(value: number): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}
