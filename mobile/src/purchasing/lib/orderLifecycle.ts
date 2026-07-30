/**
 * A pure mirror of `backend/app/domains/purchasing/order_lifecycle.rb`. Keep the two in step.
 *
 * The duplication buys immediate feedback: the device can refuse "receive this draft" while the
 * user is looking at the button, instead of accepting it, queueing it, and surfacing the failure
 * minutes later when the push finally lands. Same reasoning as inventory/lib/lowStock.ts.
 */
export const ORDER_STATUSES = [
  "draft",
  "approved",
  "partially_received",
  "received",
  "closed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["approved", "cancelled"],
  approved: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

/** Only a draft's lines are editable — past that, receipts are matched against them. */
const EDITABLE_STATUSES: OrderStatus[] = ["draft"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  partially_received: "Partly received",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** Badge tones, so a status reads the same on the list and the detail screen. */
export const STATUS_TONE: Record<OrderStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  approved: "info",
  partially_received: "warning",
  received: "success",
  closed: "neutral",
  cancelled: "danger",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Anything unrecognised is treated as a draft — a local row is never left without a status. */
export function toOrderStatus(value: unknown): OrderStatus {
  return isOrderStatus(value) ? value : "draft";
}

export function nextStatuses(status: unknown): OrderStatus[] {
  return TRANSITIONS[toOrderStatus(status)];
}

export function isTerminal(status: unknown): boolean {
  return nextStatuses(status).length === 0;
}

export function isEditable(status: unknown): boolean {
  return EDITABLE_STATUSES.includes(toOrderStatus(status));
}

export function canTransition(from: unknown, to: unknown): boolean {
  return isOrderStatus(to) && nextStatuses(from).includes(to);
}

/**
 * The message the server would send back, produced locally so the toast is instant. Returns null
 * when the transition is fine.
 */
export function transitionError(args: { from: unknown; to: unknown; lineCount: number }): string | null {
  const from = toOrderStatus(args.from);
  if (!isOrderStatus(args.to)) return `Invalid purchase order status: ${String(args.to)}`;
  if (args.to === from) return null;

  if (isTerminal(from)) return `Cannot change the status of a purchase order that is ${from}`;
  if (!canTransition(from, args.to)) return `Cannot move a purchase order from ${from} to ${args.to}`;
  if (args.to === "approved" && args.lineCount === 0) {
    return "A purchase order needs at least one line before it can be approved";
  }

  return null;
}
