import { quantityOrZero, roundQuantity } from "@/inventory/lib/quantity";

export type ThresholdLike = {
  id?: string;
  variant_id: string;
  location_id: string | null;
  reorder_point: string | number;
  reorder_quantity?: string | number | null;
};

export type ResolvedThreshold = {
  id: string | null;
  reorder_point: number;
  reorder_quantity: number | null;
  /** Which row won: the one naming this location, or the variant-wide default. */
  source: "location" | "default";
};

export type LowStockState = ResolvedThreshold & {
  on_hand: number;
  low: boolean;
  /** How far below the reorder point, 0 when sitting exactly on it. */
  shortfall: number;
};

export type ThresholdIndex = {
  /** variant_id -> the variant-wide default */
  defaults: Map<string, ThresholdLike>;
  /** `variant_id::location_id` -> the row naming that location */
  perLocation: Map<string, ThresholdLike>;
};

function targetKey(variantId: string, locationId: string) {
  return `${variantId}::${locationId}`;
}

export function indexThresholds(thresholds: ThresholdLike[]): ThresholdIndex {
  const index: ThresholdIndex = { defaults: new Map(), perLocation: new Map() };

  for (const threshold of thresholds) {
    if (threshold.location_id == null) index.defaults.set(threshold.variant_id, threshold);
    else index.perLocation.set(targetKey(threshold.variant_id, threshold.location_id), threshold);
  }

  return index;
}

/**
 * The threshold that actually applies at this location, or null when none is configured. Mirrors
 * `Inventory::LowStock.effective` on the server: a row naming the location beats the variant-wide
 * default, and an unset threshold is *not* a threshold of zero.
 */
export function effectiveThreshold(
  index: ThresholdIndex,
  variantId: string,
  locationId: string | null
): ResolvedThreshold | null {
  const specific = locationId ? index.perLocation.get(targetKey(variantId, locationId)) : undefined;
  const chosen = specific ?? index.defaults.get(variantId);
  if (!chosen) return null;

  const quantity = chosen.reorder_quantity == null ? null : quantityOrZero(chosen.reorder_quantity);
  return {
    id: chosen.id ?? null,
    reorder_point: quantityOrZero(chosen.reorder_point),
    reorder_quantity: quantity,
    source: specific ? "location" : "default",
  };
}

/**
 * Whether this variant is low at this location. Null means no threshold applies, which is the
 * difference between "nobody asked to be told" and "stock is fine" — the caller renders nothing.
 */
export function lowStockFor(
  index: ThresholdIndex,
  variantId: string,
  locationId: string | null,
  onHand: number
): LowStockState | null {
  const threshold = effectiveThreshold(index, variantId, locationId);
  if (!threshold) return null;

  const quantity = roundQuantity(onHand);
  // At the reorder point counts as low: that is the point at which reordering is due.
  const low = quantity <= threshold.reorder_point;

  return {
    ...threshold,
    on_hand: quantity,
    low,
    shortfall: low ? roundQuantity(threshold.reorder_point - quantity) : 0,
  };
}

/**
 * Targets that deserve a row even with no stock history: a threshold naming a location is a claim
 * that the variant belongs there, so it shows at 0 rather than staying invisible until the first
 * movement. A variant-wide default cannot do the same — it would cross every variant with every
 * location the org has ever opened.
 */
export function thresholdTargetsWithoutStock(
  index: ThresholdIndex,
  hasCell: (variantId: string, locationId: string) => boolean
): { variant_id: string; location_id: string }[] {
  const missing: { variant_id: string; location_id: string }[] = [];

  for (const threshold of index.perLocation.values()) {
    const locationId = threshold.location_id;
    if (!locationId) continue;
    if (hasCell(threshold.variant_id, locationId)) continue;
    missing.push({ variant_id: threshold.variant_id, location_id: locationId });
  }

  return missing;
}
