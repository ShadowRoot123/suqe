import {
  isFullyReceived,
  outstandingLines,
  receiptError,
  receivedByVariant,
  statusAfterReceipts,
} from "@/purchasing/lib/receiving";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const order = {
  status: "approved",
  items: [
    { variant_id: A, quantity_ordered: "10", unit_cost: "2.50" },
    { variant_id: B, quantity_ordered: "4", unit_cost: "1.00" },
  ],
};

function receipt(lines: { variant_id: string; quantity_received: string }[]) {
  return { items: lines };
}

/**
 * The mirror of `backend/app/domains/purchasing/receipt_lines.rb`. These assert the same rules the
 * Ruby specs do (`spec/models/purchasing_receiving_spec.rb`) so the pair cannot drift apart.
 */
describe("receiving", () => {
  test("totals what every receipt has booked in, by variant", () => {
    const totals = receivedByVariant([
      receipt([{ variant_id: A, quantity_received: "3" }]),
      receipt([
        { variant_id: A, quantity_received: "2" },
        { variant_id: B, quantity_received: "1" },
      ]),
    ]);

    expect(totals.get(A)).toBe(5);
    expect(totals.get(B)).toBe(1);
  });

  test("outstanding is what is left on each ordered line", () => {
    const lines = outstandingLines(order, [receipt([{ variant_id: A, quantity_received: "4" }])]);

    expect(lines).toEqual([
      { variant_id: A, ordered: 10, received: 4, outstanding: 6, unit_cost: "2.50" },
      { variant_id: B, ordered: 4, received: 0, outstanding: 4, unit_cost: "1.00" },
    ]);
  });

  // A receipt that somehow exceeded the order must not report a negative amount still owed.
  test("outstanding never goes below zero", () => {
    const lines = outstandingLines(order, [receipt([{ variant_id: A, quantity_received: "99" }])]);
    expect(lines[0].outstanding).toBe(0);
  });

  /**
   * Fully received is a question asked per line: one variant complete and another missing is not a
   * completed order, however the totals happen to add up.
   */
  test("fully received is per line, not a total", () => {
    const lopsided = [receipt([{ variant_id: A, quantity_received: "14" }])];
    expect(isFullyReceived(order, lopsided)).toBe(false);

    const complete = [
      receipt([
        { variant_id: A, quantity_received: "10" },
        { variant_id: B, quantity_received: "4" },
      ]),
    ];
    expect(isFullyReceived(order, complete)).toBe(true);
  });

  test("an order with no lines is never fully received", () => {
    expect(isFullyReceived({ items: [] }, [])).toBe(false);
  });

  /**
   * What the local row is set to the moment goods are booked in, and what a refused receipt is
   * repaired back to — no receipts means the order is waiting on the supplier again.
   */
  test("the status follows the receipts", () => {
    expect(statusAfterReceipts(order, [])).toBe("approved");
    expect(statusAfterReceipts(order, [receipt([{ variant_id: A, quantity_received: "1" }])])).toBe(
      "partially_received"
    );
    expect(
      statusAfterReceipts(order, [
        receipt([
          { variant_id: A, quantity_received: "10" },
          { variant_id: B, quantity_received: "4" },
        ]),
      ])
    ).toBe("received");
  });

  describe("receiptError", () => {
    test("accepts a delivery within what is outstanding", () => {
      expect(receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "10" }] })).toBeNull();
    });

    test("refuses an order that is not receivable", () => {
      expect(
        receiptError({
          order: { ...order, status: "draft" },
          receipts: [],
          lines: [{ variant_id: A, quantity_received: "1" }],
        })
      ).toBe("Cannot receive against a purchase order that is draft");
    });

    test("refuses a receipt with no lines", () => {
      expect(receiptError({ order, receipts: [], lines: [] })).toMatch(/needs at least one line/);
    });

    test("refuses a variant that is not on the order", () => {
      expect(
        receiptError({ order, receipts: [], lines: [{ variant_id: "99999999-9999-4999-8999-999999999999", quantity_received: "1" }] })
      ).toMatch(/is not on this purchase order/);
    });

    test("refuses more than is outstanding, and counts earlier receipts", () => {
      expect(receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "11" }] })).toBe(
        `Cannot receive more than ordered for variant ${A}: 10 outstanding`
      );

      const already = [receipt([{ variant_id: A, quantity_received: "7" }])];
      expect(receiptError({ order, receipts: already, lines: [{ variant_id: A, quantity_received: "4" }] })).toBe(
        `Cannot receive more than ordered for variant ${A}: 3 outstanding`
      );
      expect(receiptError({ order, receipts: already, lines: [{ variant_id: A, quantity_received: "3" }] })).toBeNull();
    });

    /**
     * The server has only the id to hand and writes it onto the change feed; a screen has the SKU
     * and should not show an operator a UUID. Same rule, different noun.
     */
    test("names the variant however the caller asks it to", () => {
      expect(
        receiptError({
          order,
          receipts: [],
          lines: [{ variant_id: A, quantity_received: "11" }],
          labelFor: () => "COLA-330",
        })
      ).toBe("Cannot receive more than ordered for variant COLA-330: 10 outstanding");
    });

    test("refuses a zero, negative or non-numeric quantity", () => {
      expect(receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "0" }] })).toMatch(
        /greater than zero/
      );
      expect(receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "-1" }] })).toMatch(
        /greater than zero/
      );
      expect(receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "some" }] })).toMatch(
        /must be a number/
      );
    });

    test("refuses two lines for the same variant", () => {
      expect(
        receiptError({
          order,
          receipts: [],
          lines: [
            { variant_id: A, quantity_received: "1" },
            { variant_id: A, quantity_received: "2" },
          ],
        })
      ).toMatch(/Duplicate line for variant/);
    });

    test("a named unit cost has to be a non-negative number, and omitting it is fine", () => {
      expect(
        receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "1", unit_cost: "-2" }] })
      ).toMatch(/must not be negative/);
      expect(
        receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "1", unit_cost: "abc" }] })
      ).toMatch(/must be a number/);
      expect(
        receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "1", unit_cost: null }] })
      ).toBeNull();
      // Free goods are a real line.
      expect(
        receiptError({ order, receipts: [], lines: [{ variant_id: A, quantity_received: "1", unit_cost: "0" }] })
      ).toBeNull();
    });
  });
});
