import {
  computeSaleTotals,
  isPaymentMethod,
  lineTotal,
  paymentsTotal,
  saleError,
} from "@/sales/lib/saleTotals";
import { formatMoney } from "@/util/money";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function line(overrides: Record<string, unknown> = {}) {
  return { variant_id: A, quantity: "1", unit_price: "10.00", ...overrides } as any;
}

/**
 * The mirror of `backend/app/domains/sales/sale_lines.rb` and `sale_payments.rb`. These assert the
 * same rules the Ruby specs do (`spec/models/sales_checkout_spec.rb`) so the pair cannot drift.
 */
describe("sale totals", () => {
  test("a line total is quantity x price, less its discount, plus its tax", () => {
    expect(formatMoney(lineTotal({ quantity: "2", unit_price: "5.00" }))).toBe("10.00");
    expect(formatMoney(lineTotal({ quantity: "2", unit_price: "5.00", discount: "1.00", tax: "0.50" }))).toBe("9.50");
  });

  test("totals are summed across the lines", () => {
    const totals = computeSaleTotals([
      { quantity: "2", unit_price: "5.00", discount: "1.00", tax: "0.50" },
      { quantity: "1", unit_price: "3.00", tax: "0.30" },
    ]);

    expect(formatMoney(totals.subtotal)).toBe("13.00");
    expect(formatMoney(totals.discount)).toBe("1.00");
    expect(formatMoney(totals.tax)).toBe("0.80");
    expect(formatMoney(totals.total_amount)).toBe("12.80");
  });

  /**
   * The server sums the exact line products and rounds once (`Sales::SaleLines.totals_for`).
   * Rounding each line first would give 0.99 here, and the total would change under the cashier
   * the moment the sale synced. The Ruby spec asserts 1.0 for the same three lines.
   */
  test("rounds once at the end, not per line", () => {
    const lines = Array.from({ length: 3 }, () => ({ quantity: "0.333", unit_price: "1.00" }));

    expect(formatMoney(computeSaleTotals(lines).subtotal)).toBe("1.00");
  });

  // 0.1 added ten times as a float is 0.9999999999999999.
  test("a long cart does not drift into float noise", () => {
    const lines = Array.from({ length: 10 }, () => ({ quantity: "1", unit_price: "0.10" }));

    expect(formatMoney(computeSaleTotals(lines).total_amount)).toBe("1.00");
  });

  test("an empty cart totals zero, and unparseable lines do not poison it", () => {
    expect(formatMoney(computeSaleTotals([]).total_amount)).toBe("0.00");
    expect(formatMoney(computeSaleTotals([{ quantity: "oops", unit_price: "5.00" }]).total_amount)).toBe("0.00");
  });

  test("payments are totalled the same way", () => {
    expect(formatMoney(paymentsTotal([{ method: "cash", amount: "4.00" }, { method: "card", amount: "6.15" }]))).toBe(
      "10.15"
    );
  });

  test("knows which payment methods the server will accept", () => {
    expect(isPaymentMethod("cash")).toBe(true);
    expect(isPaymentMethod("mobile_money")).toBe(true);
    expect(isPaymentMethod("iou")).toBe(false);
  });
});

describe("saleError", () => {
  const cash = (amount: string) => [{ method: "cash", amount }];

  test("accepts a cart whose payment matches the total", () => {
    expect(saleError({ lines: [line()], payments: cash("10.00") })).toBeNull();
  });

  test("refuses an empty cart and a cart with no payment", () => {
    expect(saleError({ lines: [], payments: cash("0") })).toMatch(/needs at least one line/);
    expect(saleError({ lines: [line()], payments: [] })).toMatch(/needs at least one payment/);
  });

  // The invariant that decides whether the drawer agrees with the books.
  test("refuses payments that do not add up, with money read to the cent", () => {
    expect(saleError({ lines: [line()], payments: cash("9.00") })).toBe(
      "Payments must add up to the sale total: 10.00 due, 9.00 paid"
    );
    expect(saleError({ lines: [line()], payments: cash("11.00") })).toMatch(/10.00 due, 11.00 paid/);
  });

  test("accepts a split across methods that adds up", () => {
    expect(
      saleError({
        lines: [line()],
        payments: [{ method: "cash", amount: "4.00" }, { method: "card", amount: "6.00" }],
      })
    ).toBeNull();
  });

  test("refuses a payment method the server does not know", () => {
    expect(saleError({ lines: [line()], payments: [{ method: "iou", amount: "10.00" }] })).toMatch(
      /Invalid payment method: iou/
    );
  });

  test("refuses a zero quantity, a negative price and a discount bigger than the line", () => {
    expect(saleError({ lines: [line({ quantity: "0" })], payments: cash("0") })).toMatch(
      /quantity must be greater than zero/
    );
    expect(saleError({ lines: [line({ unit_price: "-1" })], payments: cash("0") })).toMatch(
      /unit_price must not be negative/
    );
    expect(saleError({ lines: [line({ unit_price: "5.00", discount: "6.00" })], payments: cash("0") })).toMatch(
      /discount must not be greater than the line total/
    );
  });

  // Free goods are a real line.
  test("allows a line at no charge", () => {
    expect(saleError({ lines: [line({ unit_price: "0" })], payments: cash("0.00") })).toMatch(
      /amount must be greater than zero/
    );
  });

  /**
   * The server has only the id to hand and writes it onto the change feed; a till has the SKU and
   * should not show a cashier a UUID.
   */
  test("names the item however the caller asks it to", () => {
    expect(
      saleError({
        lines: [line({ variant_id: B, quantity: "0" })],
        payments: cash("0"),
        labelFor: () => "COLA-330",
      })
    ).toBe("COLA-330: quantity must be greater than zero");
  });
});
