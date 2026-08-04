import { parseQuantity, QUANTITY_SCALE } from "@/inventory/lib/quantity";
import { MONEY_FACTOR, parseMoney, roundMoney } from "@/util/money";

// The money primitives moved to `@/util/money` when sales needed them too — re-exported here so
// every existing import still resolves. Quantities are decimal(14,3) and go through
// inventory/lib/quantity, so a line total lands at 5 decimal places before it is rounded.
export { formatMoney, moneyOrZero, MONEY_SCALE, parseMoney, parseMoneyExact, roundMoney } from "@/util/money";

const QUANTITY_FACTOR = 10 ** QUANTITY_SCALE;

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
