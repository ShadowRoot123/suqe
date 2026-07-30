import { parseQuantity, QUANTITY_SCALE } from "@/inventory/lib/quantity";

// Money mirrors the backend's decimal(12,2). Quantities are decimal(14,3) and go through
// inventory/lib/quantity, so a line total lands at 5 decimal places before it is rounded.
export const MONEY_SCALE = 2;

const MONEY_FACTOR = 10 ** MONEY_SCALE;
const QUANTITY_FACTOR = 10 ** QUANTITY_SCALE;

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

export type OrderLineAmounts = { quantity_ordered: string | number; unit_cost: string | number };

/**
 * The order total, computed the way `Purchasing::OrderLines.total_for` computes it: sum the exact
 * line products first, round **once** at the end. Rounding each line instead would drift a cent
 * or two away from the server's number, and the difference would surface as the total changing
 * under the user the moment the order synced.
 *
 * The arithmetic runs on scaled integers (quantity in thousandths x cost in cents = 10^-5 units)
 * so a long order cannot accumulate float noise the way repeated 0.1 additions do.
 */
export function computeOrderTotal(lines: OrderLineAmounts[]): number {
  let scaled = 0;
  for (const line of lines) {
    const quantity = parseQuantity(line.quantity_ordered);
    const cost = parseMoney(line.unit_cost);
    if (quantity === null || cost === null) continue;
    scaled += Math.round(quantity * QUANTITY_FACTOR) * Math.round(cost * MONEY_FACTOR);
  }
  return roundMoney(scaled / (QUANTITY_FACTOR * MONEY_FACTOR));
}

export function lineTotal(line: OrderLineAmounts): number {
  return computeOrderTotal([line]);
}
