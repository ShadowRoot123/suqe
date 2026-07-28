import { addQuantity, quantityOrZero } from "@/inventory/lib/quantity";

export type SnapshotLike = { variant_id: string; location_id: string; quantity: string | number };
export type PendingMovementLike = { variant_id: string; location_id: string; quantity_delta: string | number };

export type OnHandCell = {
  variant_id: string;
  location_id: string;
  /** Last known server on-hand. */
  synced: number;
  /** Sum of local adjustments the server has not acknowledged yet. */
  pending: number;
  /** What the user should see: synced + pending. */
  quantity: number;
};

export function cellKey(variantId: string, locationId: string): string {
  return `${variantId}::${locationId}`;
}

/**
 * Folds the server snapshot cache and the not-yet-synced local ledger into the on-hand the
 * UI shows. Pure so it can be tested without a database, and so every screen agrees on the
 * same arithmetic.
 */
export function foldOnHand(snapshots: SnapshotLike[], pending: PendingMovementLike[]): Map<string, OnHandCell> {
  const cells = new Map<string, OnHandCell>();

  const cellFor = (variant_id: string, location_id: string) => {
    const key = cellKey(variant_id, location_id);
    let cell = cells.get(key);
    if (!cell) {
      cell = { variant_id, location_id, synced: 0, pending: 0, quantity: 0 };
      cells.set(key, cell);
    }
    return cell;
  };

  for (const snapshot of snapshots) {
    const cell = cellFor(snapshot.variant_id, snapshot.location_id);
    cell.synced = addQuantity(cell.synced, quantityOrZero(snapshot.quantity));
  }

  for (const movement of pending) {
    const cell = cellFor(movement.variant_id, movement.location_id);
    cell.pending = addQuantity(cell.pending, quantityOrZero(movement.quantity_delta));
  }

  for (const cell of cells.values()) {
    cell.quantity = addQuantity(cell.synced, cell.pending);
  }

  return cells;
}

/** Totals a variant across locations, or reads a single location. */
export function totalForVariant(
  cells: Map<string, OnHandCell>,
  variantId: string,
  locationId?: string | null
): OnHandCell {
  const total: OnHandCell = { variant_id: variantId, location_id: locationId ?? "", synced: 0, pending: 0, quantity: 0 };

  for (const cell of cells.values()) {
    if (cell.variant_id !== variantId) continue;
    if (locationId && cell.location_id !== locationId) continue;
    total.synced = addQuantity(total.synced, cell.synced);
    total.pending = addQuantity(total.pending, cell.pending);
  }

  total.quantity = addQuantity(total.synced, total.pending);
  return total;
}
