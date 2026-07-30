import { router } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, View } from "react-native";

import { productsList, type ProductRow } from "@/catalog/products";
import { variantsListAll, variantsSearch, type VariantSearchHit } from "@/catalog/variants";
import { formatQuantity } from "@/inventory/lib/quantity";
import { thresholdsFindTarget, thresholdsList, type ThresholdRow } from "@/inventory/thresholds";
import { deleteStockThresholdOffline, setStockThresholdOffline } from "@/sync/syncEngine";
import { AppText, Badge, Button, Card, Screen, SelectField, Stack, TextField } from "@/ui/components";
import { DataTable } from "@/ui/table";
import { theme } from "@/ui/theme";
import { useToast } from "@/ui/toast";

import { useInventoryData } from "../hooks/useInventoryData";

/** SelectField needs a concrete value, and the variant-wide default is a null location_id. */
const ALL_LOCATIONS = "__all__";

type ThresholdLine = ThresholdRow & {
  product_name: string;
  sku: string;
  location_label: string;
};

export default function StockThresholdScreen() {
  const toast = useToast();
  const { refreshing, refresh, locations, onHandFor, readLocal } = useInventoryData();

  const [lines, setLines] = React.useState<ThresholdLine[]>([]);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<VariantSearchHit[]>([]);
  const [variant, setVariant] = React.useState<{ id: string; sku: string; product_name: string | null } | null>(null);
  const [locationValue, setLocationValue] = React.useState<string>(ALL_LOCATIONS);
  const [point, setPoint] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [existing, setExisting] = React.useState<ThresholdRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const locationId = locationValue === ALL_LOCATIONS ? null : locationValue;

  const loadLines = React.useCallback(async () => {
    const [rows, variants, products] = await Promise.all([thresholdsList(), variantsListAll(), productsList()]);
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const productNameById = new Map<string, string>(products.map((p: ProductRow) => [p.id, p.name]));
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

    const next: ThresholdLine[] = rows.map((row) => {
      const v = variantById.get(row.variant_id);
      return {
        ...row,
        sku: v?.sku ?? "Unknown SKU",
        product_name: v ? (productNameById.get(v.product_id) ?? "Unknown product") : "Unknown product",
        location_label: row.location_id
          ? (locationNameById.get(row.location_id) ?? "Unknown location")
          : "All locations",
      };
    });

    next.sort(
      (a, b) => a.product_name.localeCompare(b.product_name) || a.location_label.localeCompare(b.location_label)
    );
    setLines(next);
  }, [locations]);

  React.useEffect(() => {
    void loadLines();
  }, [loadLines]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Archived products are excluded: a reorder point on something you stopped selling is noise.
      const results = await variantsSearch(query, 8);
      if (!cancelled) setHits(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Switching target reveals whatever is already configured for it, so saving edits that row
  // instead of quietly competing with it.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!variant) {
        if (!cancelled) setExisting(null);
        return;
      }
      const found = await thresholdsFindTarget(variant.id, locationId);
      if (cancelled) return;
      setExisting(found);
      setPoint(found ? found.reorder_point : "");
      setQuantity(found?.reorder_quantity ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, locationId]);

  const current = variant && locationId ? onHandFor(variant.id, locationId) : null;
  const canSave = !!variant && point.trim().length > 0 && !busy;

  const save = React.useCallback(async () => {
    if (!variant) return;
    setBusy(true);
    try {
      await setStockThresholdOffline({
        variant_id: variant.id,
        location_id: locationId,
        reorder_point: point.trim(),
        reorder_quantity: quantity.trim() || null,
      });
      await Promise.all([loadLines(), readLocal()]);
      const where = locationId ? (locations.find((l) => l.id === locationId)?.name ?? "location") : "all locations";
      toast.success(`${variant.sku} alerts below ${point.trim()} at ${where}.`, { title: "Reorder point saved" });
      const found = await thresholdsFindTarget(variant.id, locationId);
      setExisting(found);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the reorder point.", { title: "Save failed" });
    } finally {
      setBusy(false);
    }
  }, [variant, locationId, point, quantity, loadLines, readLocal, locations, toast]);

  const remove = React.useCallback(
    async (row: ThresholdRow) => {
      setBusy(true);
      try {
        await deleteStockThresholdOffline(row.id);
        await Promise.all([loadLines(), readLocal()]);
        if (existing?.id === row.id) {
          setExisting(null);
          setPoint("");
          setQuantity("");
        }
        toast.success("The line no longer raises a low-stock alert.", { title: "Reorder point removed" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove the reorder point.", { title: "Remove failed" });
      } finally {
        setBusy(false);
      }
    },
    [existing, loadLines, readLocal, toast]
  );

  const editLine = React.useCallback((line: ThresholdLine) => {
    setVariant({ id: line.variant_id, sku: line.sku, product_name: line.product_name });
    setLocationValue(line.location_id ?? ALL_LOCATIONS);
    setQuery("");
  }, []);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <AppText variant="h1">Reorder points</AppText>
        <AppText muted>
          A line is flagged low once on-hand reaches its reorder point. Works offline — the change is queued and the
          alert applies to local stock straight away.
        </AppText>

        <Card title="Item">
          <Stack gap={12}>
            {variant ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flexShrink: 1 }}>
                  <AppText variant="label">{variant.product_name ?? "Product"}</AppText>
                  <AppText muted>{variant.sku}</AppText>
                </View>
                <Button
                  title="Change"
                  variant="ghost"
                  onPress={() => {
                    setVariant(null);
                    setQuery("");
                  }}
                />
              </View>
            ) : (
              <>
                <TextField
                  label="Search by SKU, barcode or name"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  placeholder="e.g. COLA-330"
                />
                {hits.map((hit) => (
                  <Pressable
                    key={hit.id}
                    onPress={() => setVariant({ id: hit.id, sku: hit.sku, product_name: hit.product_name ?? null })}
                    style={({ pressed }) => [
                      { padding: 12, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceAlt },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <AppText variant="label">{hit.product_name ?? "Product"}</AppText>
                    <AppText muted>{hit.sku}</AppText>
                  </Pressable>
                ))}
                {query.trim().length > 0 && hits.length === 0 ? <AppText muted>No matching items.</AppText> : null}
              </>
            )}
          </Stack>
        </Card>

        <Card title="Threshold">
          <Stack gap={12}>
            <SelectField
              label="Applies to"
              value={locationValue}
              options={[
                { value: ALL_LOCATIONS, label: "All locations (default)" },
                ...locations.map((l) => ({ value: l.id, label: l.name })),
              ]}
              onChange={setLocationValue}
            />
            {locationId ? null : (
              <AppText muted>Any location without its own reorder point uses this one.</AppText>
            )}

            <TextField
              label="Reorder point"
              value={point}
              onChangeText={setPoint}
              keyboardType="numbers-and-punctuation"
              placeholder="e.g. 10"
            />
            <TextField
              label="Reorder quantity (optional)"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numbers-and-punctuation"
              placeholder="How many to order when low"
            />

            {variant && locationId ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <AppText muted>On hand here: {formatQuantity(current?.quantity ?? 0)}</AppText>
                {existing ? <Badge tone="info" label="Editing existing" /> : null}
              </View>
            ) : null}

            <Button
              title={busy ? "Saving…" : existing ? "Update reorder point" : "Set reorder point"}
              disabled={!canSave}
              loading={busy}
              onPress={save}
            />
            {existing ? (
              <Button title="Remove reorder point" variant="ghost" onPress={() => void remove(existing)} />
            ) : null}
          </Stack>
        </Card>

        <DataTable
          emptyTitle="No reorder points yet"
          emptySubtitle="Set one above and the inventory list will flag the line when stock runs down."
          onRowPress={editLine}
          columns={[
            {
              key: "product",
              title: "Product",
              minWidth: 220,
              render: (l: ThresholdLine) => l.product_name,
              sortValue: (l: ThresholdLine) => l.product_name,
            },
            {
              key: "sku",
              title: "SKU",
              minWidth: 150,
              render: (l: ThresholdLine) => l.sku,
              sortValue: (l: ThresholdLine) => l.sku,
            },
            {
              key: "location",
              title: "Applies to",
              minWidth: 170,
              render: (l: ThresholdLine) => l.location_label,
              sortValue: (l: ThresholdLine) => l.location_label,
            },
            {
              key: "point",
              title: "Reorder point",
              minWidth: 140,
              render: (l: ThresholdLine) => l.reorder_point,
              sortValue: (l: ThresholdLine) => Number(l.reorder_point),
            },
            {
              key: "quantity",
              title: "Reorder qty",
              minWidth: 130,
              hideOnMobile: true,
              render: (l: ThresholdLine) => l.reorder_quantity ?? "—",
            },
            {
              key: "actions",
              title: "",
              minWidth: 110,
              render: (l: ThresholdLine) => <Button title="Remove" variant="ghost" onPress={() => void remove(l)} />,
            },
          ]}
          rows={lines}
          getRowId={(l: ThresholdLine) => l.id}
        />

        <Button title="Back to inventory" variant="ghost" onPress={() => router.push("/(tabs)/inventory")} />
      </Stack>
    </Screen>
  );
}
