// Money primitives, mirroring the backend's decimal(12,2). They live here rather than under a
// feature because purchasing and sales both need the same arithmetic, and a sales module reaching
// into `purchasing/lib` for `parseMoney` would invent a dependency between two unrelated domains.
// `purchasing/lib/money.ts` re-exports these, so every existing import still resolves.
export const MONEY_SCALE = 2;

export const MONEY_FACTOR = 10 ** MONEY_SCALE;

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

/** Always two decimals: this is currency, so "12.50" reads better than "12.5". */
export function formatMoney(value: number): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}
