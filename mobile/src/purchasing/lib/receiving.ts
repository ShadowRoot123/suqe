/**
 * A pure mirror of `backend/app/domains/purchasing/receipt_lines.rb` (and the guards in
 * `receive_order.rb`). Keep the two in step.
 *
 * As with orderLifecycle.ts, the duplication buys immediate feedback: the device can refuse
 * "you are booking in more than was ordered" while the user is looking at the field, instead of
 * accepting it, queueing it, and surfacing the failure after the next push. It is also what makes
 * the receiving screen work offline at all — outstanding quantities are computed from the local
 * receipts, including ones this device made and has not synced.
 */
import { addQuantity, formatQuantity, parseQuantity, quantityOrZero } from "@/inventory/lib/quantity";
import { isReceivable } from "@/purchasing/lib/orderLifecycle";

export type OrderedLineLike = { variant_id: string; quantity_ordered: string | number; unit_cost: string | number };
export type ReceiptLike = { items: { variant_id: string; quantity_received: string | number }[] };
export type ReceiptInputLine = { variant_id: string; quantity_received: string | number; unit_cost?: string | number | null };

export type OutstandingLine = {
  variant_id: string;
  ordered: number;
  received: number;
  /** What is still owed: never negative, even if an over-receipt somehow landed. */
  outstanding: number;
  /** The cost the line was ordered at, which a receipt uses unless it names its own. */
  unit_cost: string;
};

/** What every receipt against this order has booked in, by variant. */
export function receivedByVariant(receipts: ReceiptLike[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const receipt of receipts) {
    for (const line of receipt.items ?? []) {
      if (!line?.variant_id) continue;
      const current = totals.get(line.variant_id) ?? 0;
      totals.set(line.variant_id, addQuantity(current, quantityOrZero(line.quantity_received)));
    }
  }
  return totals;
}

/** One row per ordered line, in the order's own order, with what is left on each. */
export function outstandingLines(order: { items: OrderedLineLike[] }, receipts: ReceiptLike[]): OutstandingLine[] {
  const received = receivedByVariant(receipts);

  return (order.items ?? []).map((line) => {
    const ordered = quantityOrZero(line.quantity_ordered);
    const already = received.get(line.variant_id) ?? 0;
    return {
      variant_id: line.variant_id,
      ordered,
      received: already,
      outstanding: Math.max(addQuantity(ordered, -already), 0),
      unit_cost: String(line.unit_cost ?? "0"),
    };
  });
}

/**
 * Fully received is a question asked per line — 2 of one variant and none of another is not
 * "2 received" — and it is how the server decides between `partially_received` and `received`.
 */
export function isFullyReceived(order: { items: OrderedLineLike[] }, receipts: ReceiptLike[]): boolean {
  const lines = order.items ?? [];
  if (lines.length === 0) return false;
  return outstandingLines({ items: lines }, receipts).every((line) => line.outstanding <= 0);
}

/**
 * The status the order lands on once `receipts` are all counted. Used to keep the local row in
 * step the moment goods are booked in offline, and to repair it if the server refuses a receipt.
 */
export function statusAfterReceipts(
  order: { items: OrderedLineLike[] },
  receipts: ReceiptLike[]
): "approved" | "partially_received" | "received" {
  if (receipts.length === 0) return "approved";
  return isFullyReceived(order, receipts) ? "received" : "partially_received";
}

/**
 * The message the server would send back, produced locally so the toast is instant. Returns null
 * when the receipt is fine. `receipts` is everything already booked against the order.
 */
export function receiptError(args: {
  order: { status: unknown; items: OrderedLineLike[] };
  receipts: ReceiptLike[];
  lines: ReceiptInputLine[];
  /**
   * How to name a variant in the message. The server has only the id to hand and writes it onto
   * the change feed; a screen has the SKU, and an operator should not be shown a UUID. The rule
   * being enforced is identical either way — only the noun changes.
   */
  labelFor?: (variantId: string) => string;
}): string | null {
  const { order, receipts, lines } = args;
  const name = (variantId: string) => args.labelFor?.(variantId) ?? variantId;

  if (!isReceivable(order.status)) {
    return `Cannot receive against a purchase order that is ${String(order.status)}`;
  }
  if (lines.length === 0) return "A purchase receipt needs at least one line";

  const outstanding = new Map(outstandingLines(order, receipts).map((line) => [line.variant_id, line]));
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line?.variant_id) return "Every line needs an item";
    if (seen.has(line.variant_id)) return `Duplicate line for variant ${name(line.variant_id)}`;
    seen.add(line.variant_id);

    const target = outstanding.get(line.variant_id);
    if (!target) return `Variant ${name(line.variant_id)} is not on this purchase order`;

    const quantity = parseQuantity(line.quantity_received);
    if (quantity === null) return "quantity_received must be a number";
    if (quantity <= 0) return "quantity_received must be greater than zero";
    if (quantity > target.outstanding) {
      return `Cannot receive more than ordered for variant ${name(line.variant_id)}: ${formatQuantity(
        target.outstanding
      )} outstanding`;
    }

    if (line.unit_cost !== null && line.unit_cost !== undefined && String(line.unit_cost).trim() !== "") {
      const cost = Number(String(line.unit_cost).trim());
      if (!Number.isFinite(cost)) return "unit_cost must be a number";
      if (cost < 0) return "unit_cost must not be negative";
    }
  }

  return null;
}
