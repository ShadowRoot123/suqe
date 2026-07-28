// Quantities mirror the backend's decimal(14,3): keep everything at 3 decimal places so
// repeated deltas can't drift into float noise like 0.30000000000000004.
export const QUANTITY_SCALE = 3;

const FACTOR = 10 ** QUANTITY_SCALE;

export function roundQuantity(value: number): number {
  return Math.round(value * FACTOR) / FACTOR;
}

/** Parses anything the local store or the server may hand us. Returns null when it isn't a number. */
export function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? roundQuantity(value) : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? roundQuantity(parsed) : null;
}

/** Same as parseQuantity but never fails — used where a missing row means "no stock". */
export function quantityOrZero(value: unknown): number {
  return parseQuantity(value) ?? 0;
}

export function addQuantity(a: number, b: number): number {
  return roundQuantity(a + b);
}

export function formatQuantity(value: number): string {
  const rounded = roundQuantity(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

export type DeltaResult = { ok: true; value: number } | { ok: false; error: string };

/** Validates the adjustment input the same way the server does, so we fail before enqueueing. */
export function parseDelta(input: string): DeltaResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Enter a quantity" };

  const parsed = parseQuantity(trimmed);
  if (parsed === null) return { ok: false, error: "Quantity must be a number" };
  if (parsed === 0) return { ok: false, error: "Quantity must not be zero" };

  return { ok: true, value: parsed };
}
