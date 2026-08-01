import {
  canTransition,
  isEditable,
  isReceiptDriven,
  isReceivable,
  isTerminal,
  manualStatuses,
  nextStatuses,
  toOrderStatus,
  transitionError,
} from "@/purchasing/lib/orderLifecycle";

/**
 * The mirror of `backend/app/domains/purchasing/order_lifecycle.rb`. The duplication is what
 * lets the device refuse an illegal move while the user is looking at the button instead of
 * queueing a command that is doomed, so these tests pin the same rules the Ruby specs do
 * (`spec/models/purchasing_lifecycle_spec.rb`).
 */
describe("purchase order lifecycle", () => {
  test("allows the forward path and nothing sideways", () => {
    expect(canTransition("draft", "approved")).toBe(true);
    expect(canTransition("approved", "partially_received")).toBe(true);
    expect(canTransition("partially_received", "received")).toBe(true);
    expect(canTransition("received", "closed")).toBe(true);

    expect(canTransition("draft", "received")).toBe(false);
    expect(canTransition("received", "approved")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
  });

  // Once stock has landed the ledger holds movements a status change cannot undo.
  test("allows cancelling only before anything has been received", () => {
    expect(canTransition("approved", "cancelled")).toBe(true);
    expect(canTransition("partially_received", "cancelled")).toBe(false);
    expect(canTransition("partially_received", "closed")).toBe(true);
  });

  test("treats closed and cancelled as terminal", () => {
    expect(isTerminal("closed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(nextStatuses("closed")).toEqual([]);
  });

  test("counts only a draft as editable and only an order in flight as receivable", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("approved")).toBe(false);

    expect(isReceivable("approved")).toBe(true);
    expect(isReceivable("partially_received")).toBe(true);
    ["draft", "received", "closed", "cancelled"].forEach((status) => {
      expect(isReceivable(status)).toBe(false);
    });
  });

  test("an unrecognised status reads as a draft rather than leaving a row without one", () => {
    expect(toOrderStatus("shipped")).toBe("draft");
    expect(toOrderStatus(undefined)).toBe("draft");
  });

  /**
   * The two receiving statuses summarise the receipts, so the server only accepts them from
   * ReceiveOrder. Offering them as buttons would queue commands that can only fail.
   */
  test("does not offer the receiving statuses as something to pick", () => {
    expect(isReceiptDriven("partially_received")).toBe(true);
    expect(isReceiptDriven("received")).toBe(true);
    expect(isReceiptDriven("approved")).toBe(false);

    expect(manualStatuses("approved")).toEqual(["cancelled"]);
    expect(manualStatuses("partially_received")).toEqual(["closed"]);
    // Approving is still a decision someone makes.
    expect(manualStatuses("draft")).toEqual(["approved", "cancelled"]);
  });

  test("explains a refused transition the way the server would", () => {
    expect(transitionError({ from: "draft", to: "approved", lineCount: 1 })).toBeNull();
    expect(transitionError({ from: "draft", to: "approved", lineCount: 0 })).toMatch(/at least one line/);
    expect(transitionError({ from: "draft", to: "received", lineCount: 1 })).toMatch(
      /Cannot move a purchase order from draft to received/
    );
    expect(transitionError({ from: "cancelled", to: "approved", lineCount: 1 })).toMatch(
      /status of a purchase order that is cancelled/
    );
    expect(transitionError({ from: "draft", to: "shipped", lineCount: 1 })).toMatch(/Invalid purchase order status/);
    // Already there is not an error: the caller asked for a state the order is in.
    expect(transitionError({ from: "approved", to: "approved", lineCount: 1 })).toBeNull();
  });

  test("refuses a claim that goods arrived, and says how they get there", () => {
    expect(transitionError({ from: "approved", to: "received", lineCount: 1 })).toBe(
      "A purchase order becomes received by receiving against it, not by setting its status"
    );
    expect(transitionError({ from: "approved", to: "partially_received", lineCount: 1 })).toMatch(
      /by receiving against it/
    );
  });
});
