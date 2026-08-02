/**
 * A pure mirror of `backend/app/domains/sales/sale_lines.rb` and `sale_payments.rb`.
 * Keep the two in step.
 *
 * Same reasoning as `purchasing/lib/orderLifecycle.ts` and `receiving.ts`: the till has to show a
 * running total that matches what the server will derive, and refuse a bad cart while the cashier
 * is looking at it rather than after the next push. A total that changed the moment a sale synced
 * would be worse than useless in a shop.
 */
import { parseQuantity, QUANTITY_SCALE } from "@/inventory/lib/quantity";
import { formatMoney, MONEY_FACTOR, parseMoney, roundMoney } from "@/util/money";

const QUANTITY_FACTOR = 10 ** QUANTITY_SCALE;

/** Mirrors `Sales::SalePayments::METHODS`. The column is free text, so the list is the guard. */
export const PAYMENT_METHODS = ["cash", "card", "mobile_money", "voucher"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile money",
  voucher: "Voucher",
};

export type SaleLineAmounts = {
  quantity: string | number;
  unit_price: string | number;
  discount?: string | number | null;
  tax?: string | number | null;
};

export type SaleTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
};

export type PaymentInput = { method: string; amount: string | number };

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Quantity x price on scaled integers (thousandths x cents), so a long cart cannot accumulate
 * float noise the way repeated 0.1 additions do. Not rounded — the caller rounds once at the end.
 */
function exactLineSubtotal(line: SaleLineAmounts): number {
  const quantity = parseQuantity(line.quantity);
  const price = parseMoney(line.unit_price);
  if (quantity === null || price === null) return 0;

  return (Math.round(quantity * QUANTITY_FACTOR) * Math.round(price * MONEY_FACTOR)) / (QUANTITY_FACTOR * MONEY_FACTOR);
}

/** What one line is worth to the customer: quantity x price, less its discount, plus its tax. */
export function lineTotal(line: SaleLineAmounts): number {
  return roundMoney(exactLineSubtotal(line) - (parseMoney(line.discount) ?? 0) + (parseMoney(line.tax) ?? 0));
}

/**
 * `Sales::SaleLines.totals_for`, exactly: sum the exact line products and round **once** at the
 * end. Rounding per line drifts a cent or two from the server, and the difference would show up
 * as the total changing under the cashier the moment the sale synced.
 */
export function computeSaleTotals(lines: SaleLineAmounts[]): SaleTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  for (const line of lines) {
    subtotal += exactLineSubtotal(line);
    discount += parseMoney(line.discount) ?? 0;
    tax += parseMoney(line.tax) ?? 0;
  }

  const rounded = { subtotal: roundMoney(subtotal), discount: roundMoney(discount), tax: roundMoney(tax) };
  return { ...rounded, total_amount: roundMoney(rounded.subtotal + rounded.tax - rounded.discount) };
}

export function paymentsTotal(payments: PaymentInput[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + (parseMoney(payment.amount) ?? 0), 0));
}

/**
 * The message the server would send back, produced locally so nothing doomed is ever queued.
 * Returns null when the cart is fine. `labelFor` names a variant the way a cashier would read it;
 * the server has only the id.
 */
export function saleError(args: {
  lines: (SaleLineAmounts & { variant_id: string })[];
  payments: PaymentInput[];
  labelFor?: (variantId: string) => string;
}): string | null {
  const { lines, payments } = args;
  const name = (variantId: string) => args.labelFor?.(variantId) ?? variantId;

  if (lines.length === 0) return "A sale needs at least one line";

  for (const line of lines) {
    if (!line.variant_id) return "Every line needs an item";

    const quantity = parseQuantity(line.quantity);
    if (quantity === null) return "quantity must be a number";
    if (quantity <= 0) return `${name(line.variant_id)}: quantity must be greater than zero`;

    const price = parseMoney(line.unit_price);
    if (price === null) return "unit_price must be a number";
    // A giveaway is a real line; a negative price is a refund pretending to be a sale.
    if (price < 0) return `${name(line.variant_id)}: unit_price must not be negative`;

    const discount = parseMoney(line.discount) ?? 0;
    const tax = parseMoney(line.tax) ?? 0;
    if (discount < 0) return `${name(line.variant_id)}: discount must not be negative`;
    if (tax < 0) return `${name(line.variant_id)}: tax must not be negative`;
    // Otherwise the line is worth less than nothing and the sale starts paying the customer.
    if (discount > roundMoney(exactLineSubtotal(line))) {
      return `${name(line.variant_id)}: discount must not be greater than the line total`;
    }
  }

  if (payments.length === 0) return "A sale needs at least one payment";

  for (const payment of payments) {
    if (!isPaymentMethod(payment.method)) return `Invalid payment method: ${String(payment.method)}`;
    const amount = parseMoney(payment.amount);
    if (amount === null) return "amount must be a number";
    if (amount <= 0) return "amount must be greater than zero";
  }

  const due = computeSaleTotals(lines).total_amount;
  const paid = paymentsTotal(payments);
  if (paid !== due) {
    // Money reads with its cents — "10.0 due" looks like a bug to whoever is holding the till.
    return `Payments must add up to the sale total: ${formatMoney(due)} due, ${formatMoney(paid)} paid`;
  }

  return null;
}
