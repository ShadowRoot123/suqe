import { calendarDate } from "@/purchasing/lib/calendarDate";
import { computeOrderTotal, formatMoney, lineTotal, parseMoney } from "@/purchasing/lib/money";

describe("purchase order money", () => {
  test("a line total is quantity x unit cost", () => {
    expect(formatMoney(lineTotal({ quantity_ordered: "12", unit_cost: "2.50" }))).toBe("30.00");
    expect(formatMoney(lineTotal({ quantity_ordered: "1.5", unit_cost: "4.00" }))).toBe("6.00");
  });

  test("the order total is the sum of its lines", () => {
    const total = computeOrderTotal([
      { quantity_ordered: "3", unit_cost: "2.50" },
      { quantity_ordered: "1.5", unit_cost: "4.00" },
    ]);

    expect(formatMoney(total)).toBe("13.50");
  });

  /**
   * The server sums the exact line products and rounds once (Purchasing::OrderLines.total_for).
   * Rounding each line first would give 0.99 here. `purchasing_lifecycle_spec.rb` asserts 1.0 for
   * the same three lines, so if either side changes its mind the pair of tests disagrees.
   */
  test("rounds once at the end, not per line", () => {
    const lines = Array.from({ length: 3 }, () => ({ quantity_ordered: "0.333", unit_cost: "1.00" }));

    expect(formatMoney(computeOrderTotal(lines))).toBe("1.00");
    expect(formatMoney(0.333 * 1)).toBe("0.33");
  });

  /**
   * The pair to `purchasing_lifecycle_spec.rb`'s "rounds each line to what its column will hold".
   *
   * `unit_cost` is decimal(12,2) and `quantity_ordered` decimal(14,3) on both sides. The client
   * has always rounded to those scales at parse; the server used to sum the unrounded values, so
   * three lines at 0.005 gave 0.02 there and 0.03 here and an order's total drifted a cent from
   * the sum of its own stored lines. If either side changes its mind, the two tests disagree.
   *
   * The values here are deliberately ones both sides round identically. **They do not always.**
   * This rounds a float and the server rounds a decimal, so at an exact half they can disagree —
   * 1.005 is 1.00499… as a double and rounds *down* here while `BigDecimal("1.005").round(2)`
   * rounds up, and 2.005 goes the other way. It is not reachable through the app: every client
   * rounds at parse and sends the rounded string, so the server never sees a raw sub-scale value
   * from a till. Don't "fix" it by making either side round the other's way.
   */
  test("rounds each amount to its column's scale, so the server derives the same total", () => {
    const lines = Array.from({ length: 3 }, () => ({ quantity_ordered: "1", unit_cost: "0.005" }));

    // 0.01 a line, three lines — not the 0.02 that summing 0.005 unrounded would give.
    expect(formatMoney(computeOrderTotal(lines))).toBe("0.03");
    expect(formatMoney(computeOrderTotal([{ quantity_ordered: "1.0004", unit_cost: "2.00" }]))).toBe("2.00");
  });

  // 0.1 added ten times as a float is 0.9999999999999999.
  test("a long order does not drift into float noise", () => {
    const lines = Array.from({ length: 10 }, () => ({ quantity_ordered: "1", unit_cost: "0.10" }));

    expect(formatMoney(computeOrderTotal(lines))).toBe("1.00");
  });

  test("an empty order totals zero, and unparseable lines are ignored rather than poisoning it", () => {
    expect(formatMoney(computeOrderTotal([]))).toBe("0.00");
    expect(
      formatMoney(computeOrderTotal([{ quantity_ordered: "nope", unit_cost: "1" }, { quantity_ordered: "2", unit_cost: "3" }]))
    ).toBe("6.00");
  });

  test("money parses what the wire sends and rejects what is not a number", () => {
    // ActiveSupport renders BigDecimal in plain notation, so "30.0" is what arrives for 30.
    expect(parseMoney("30.0")).toBe(30);
    expect(parseMoney("2.5")).toBe(2.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });

  test("money always shows two decimals", () => {
    expect(formatMoney(30)).toBe("30.00");
    expect(formatMoney(2.5)).toBe("2.50");
    expect(formatMoney(0)).toBe("0.00");
  });
});

describe("expected delivery date", () => {
  /**
   * The bug this pins: `new Date("2026-08-20").toLocaleDateString()` renders 8/19 anywhere behind
   * UTC, because the string parses as UTC midnight. A delivery date is a calendar date and has to
   * survive the trip regardless of where the till is.
   */
  test("keeps the day that was typed, whatever the timezone", () => {
    const naive = new Date("2026-08-20");
    const shown = calendarDate("2026-08-20");

    expect(shown).toBe(new Date(2026, 7, 20).toLocaleDateString());
    // Guard against the test passing only because the runner happens to sit at or ahead of UTC.
    if (naive.getDate() !== 20) expect(shown).not.toBe(naive.toLocaleDateString());
  });

  test("reads the server's timestamp form the same way", () => {
    expect(calendarDate("2026-08-20T00:00:00.000Z")).toBe(new Date(2026, 7, 20).toLocaleDateString());
  });

  test("falls back when there is no date", () => {
    expect(calendarDate(null)).toBe("—");
    expect(calendarDate("")).toBe("—");
    expect(calendarDate("not a date", "no date given")).toBe("no date given");
  });
});
