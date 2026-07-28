import React from "react";

import { productsList, type ProductRow } from "@/catalog/products";
import { variantsListAll, type VariantRow } from "@/catalog/variants";
import { useSession } from "@/auth/session";
import { refreshInventoryFromServer } from "@/inventory/bootstrapInventory";
import { cellKey, foldOnHand, type OnHandCell } from "@/inventory/lib/onHand";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { movementsListUnsynced } from "@/inventory/movements";
import { snapshotsList } from "@/inventory/snapshots";

export type OnHandLine = OnHandCell & {
  variant: VariantRow;
  product_name: string;
  location_name: string;
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

  const readLocal = React.useCallback(async () => {
    const [locs, snapshots, pending, variants, products] = await Promise.all([
      locationsList(),
      snapshotsList(),
      movementsListUnsynced(),
      variantsListAll(),
      productsList(),
    ]);

    const folded = foldOnHand(snapshots, pending);
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const productNameById = new Map<string, string>(products.map((p: ProductRow) => [p.id, p.name]));
    const locationNameById = new Map(locs.map((l) => [l.id, l.name]));

    const nextLines: OnHandLine[] = [];
    for (const cell of folded.values()) {
      const variant = variantById.get(cell.variant_id);
      if (!variant) continue;
      nextLines.push({
        ...cell,
        variant,
        product_name: productNameById.get(variant.product_id) ?? "Unknown product",
        location_name: locationNameById.get(cell.location_id) ?? "Unknown location",
      });
    }

    nextLines.sort((a, b) => a.product_name.localeCompare(b.product_name) || a.variant.sku.localeCompare(b.variant.sku));

    setLocations(locs);
    setCells(folded);
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

  return { refreshing, refresh, readLocal, locations, lines, cells, onHandFor };
}
