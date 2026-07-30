import React from "react";

import { productsList, type ProductRow } from "@/catalog/products";
import { variantsListAll, type VariantRow } from "@/catalog/variants";
import { useSession } from "@/auth/session";
import { refreshInventoryFromServer } from "@/inventory/bootstrapInventory";
import {
  indexThresholds,
  lowStockFor,
  thresholdTargetsWithoutStock,
  type LowStockState,
  type ThresholdIndex,
} from "@/inventory/lib/lowStock";
import { cellKey, foldOnHand, type OnHandCell } from "@/inventory/lib/onHand";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { movementsListUnsynced } from "@/inventory/movements";
import { snapshotsList } from "@/inventory/snapshots";
import { thresholdsList } from "@/inventory/thresholds";

export type OnHandLine = OnHandCell & {
  variant: VariantRow;
  product_name: string;
  location_name: string;
  /** null when no reorder point applies here — which is not the same as being well stocked. */
  lowStock: LowStockState | null;
};

/**
 * Everything the inventory screens need, read from the local store first so the screens work
 * offline; the server refresh is best effort and only corrects the snapshot cache.
 */
export function useInventoryData() {
  const { session } = useSession();
  const [refreshing, setRefreshing] = React.useState(false);
  const [locations, setLocations] = React.useState<LocationRow[]>([]);
  const [lines, setLines] = React.useState<OnHandLine[]>([]);
  const [cells, setCells] = React.useState<Map<string, OnHandCell>>(new Map());
  const [thresholds, setThresholds] = React.useState<ThresholdIndex>(() => indexThresholds([]));

  const readLocal = React.useCallback(async () => {
    const [locs, snapshots, pending, variants, products, thresholdRows] = await Promise.all([
      locationsList(),
      snapshotsList(),
      movementsListUnsynced(),
      variantsListAll(),
      productsList(),
      thresholdsList(),
    ]);

    const folded = foldOnHand(snapshots, pending);
    const thresholdIndex = indexThresholds(thresholdRows);
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const productNameById = new Map<string, string>(products.map((p: ProductRow) => [p.id, p.name]));
    const locationNameById = new Map(locs.map((l) => [l.id, l.name]));

    // A reorder point aimed at a location is a claim the variant belongs there, so it gets a row
    // at 0 even before any stock has moved — otherwise the one alert that matters most, "we have
    // none of this", is the one that never appears. Server-side `LowStock.rows` does the same.
    for (const target of thresholdTargetsWithoutStock(thresholdIndex, (variantId, locationId) =>
      folded.has(cellKey(variantId, locationId))
    )) {
      if (!variantById.has(target.variant_id) || !locationNameById.has(target.location_id)) continue;
      folded.set(cellKey(target.variant_id, target.location_id), {
        variant_id: target.variant_id,
        location_id: target.location_id,
        synced: 0,
        pending: 0,
        quantity: 0,
      });
    }

    const nextLines: OnHandLine[] = [];
    for (const cell of folded.values()) {
      const variant = variantById.get(cell.variant_id);
      if (!variant) continue;
      nextLines.push({
        ...cell,
        variant,
        product_name: productNameById.get(variant.product_id) ?? "Unknown product",
        location_name: locationNameById.get(cell.location_id) ?? "Unknown location",
        lowStock: lowStockFor(thresholdIndex, cell.variant_id, cell.location_id, cell.quantity),
      });
    }

    nextLines.sort((a, b) => a.product_name.localeCompare(b.product_name) || a.variant.sku.localeCompare(b.variant.sku));

    setLocations(locs);
    setCells(folded);
    setThresholds(thresholdIndex);
    setLines(nextLines);
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      if (session) {
        try {
          await refreshInventoryFromServer(session);
        } catch {
          // offline, or no inventory permission — local data still renders
        }
      }
      await readLocal();
    } finally {
      setRefreshing(false);
    }
  }, [readLocal, session]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onHandFor = React.useCallback(
    (variantId: string, locationId: string) => cells.get(cellKey(variantId, locationId)) ?? null,
    [cells]
  );

  const lowStockCount = React.useMemo(() => lines.filter((l) => l.lowStock?.low).length, [lines]);

  return { refreshing, refresh, readLocal, locations, lines, cells, onHandFor, thresholds, lowStockCount };
}
