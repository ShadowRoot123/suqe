/**
 * A pure mirror of `Sale::STATUSES` / `Sale::VOIDABLE_STATUSES` in
 * `backend/app/models/sale.rb`, and of the guard `Sales::VoidSale` applies before it undoes
 * anything. Keep the two in step.
 *
 * Same reasoning as `purchasing/lib/orderLifecycle.ts`: the till has to refuse an impossible void
 * while the supervisor is standing at the screen, not one push later — and it has to refuse it
 * with the words the server would have used.
 */
export const SALE_STATUSES = ["completed", "voided"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  completed: "Completed",
  voided: "Voided",
};

/** `voided` is terminal: un-voiding is a new sale, not a change to this one. */
const VOIDABLE_STATUSES: readonly string[] = ["completed"];

export function isSaleStatus(value: unknown): value is SaleStatus {
  return typeof value === "string" && (SALE_STATUSES as readonly string[]).includes(value);
}

export function isVoidable(status: string): boolean {
  return VOIDABLE_STATUSES.includes(status);
}

/** The message the server would send back, produced locally. Null when the void can go ahead. */
export function voidError(status: string): string | null {
  // A second void of an already-voided sale is a replay, not an error — the server treats it the
  // same way, returning the sale it already voided rather than refusing.
  if (status === "voided") return null;
  return isVoidable(status) ? null : `Cannot void a sale that is ${status}`;
}
