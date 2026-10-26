import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useSession } from "@/auth/session";
import { variantsGetById, variantsSearch, type VariantSearchHit } from "@/catalog/variants";
import { formatQuantity, parseDelta, parseQuantity } from "@/inventory/lib/quantity";
import { createInventoryAdjustmentOffline } from "@/sync/syncEngine";
import { AppText, Badge, Button, Card, Screen, SelectField, SkuTag, Stack, TextField } from "@/ui/components";
import { theme } from "@/ui/theme";
import { useToast } from "@/ui/toast";

import { useInventoryData } from "../hooks/useInventoryData";

type SearchHit = VariantSearchHit;

export default function StockAdjustmentScreen() {
  const toast = useToast();
  const { session } = useSession();
  const { locations, onHandFor, readLocal } = useInventoryData();

  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [variant, setVariant] = React.useState<SearchHit | null>(null);
  const [locationId, setLocationId] = React.useState<string | null>(null);
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const params = useLocalSearchParams<{ variant_id?: string; location_id?: string; product_name?: string }>();

  // Opened from a line on the inventory list: that item at that location, ready to adjust.
  React.useEffect(() => {
    if (typeof params.location_id === "string") setLocationId(params.location_id);
    if (typeof params.variant_id !== "string") return;
    const variantId = params.variant_id;
    let cancelled = false;
    (async () => {
      const row = await variantsGetById(variantId);
      if (cancelled || !row) return;
      const name = typeof params.product_name === "string" ? params.product_name : null;
      setVariant({ ...row, product_name: name, product_status: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [params.variant_id, params.location_id, params.product_name]);

  // Default to the only location so the common single-shop case needs no picking.
  React.useEffect(() => {
    if (locationId === null && locations.length === 1) setLocationId(locations[0].id);
  }, [locationId, locations]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Archived items are still adjustable: writing off the remaining stock is usually the
      // reason the product was archived in the first place.
      const results = await variantsSearch(query, 8, { includeArchived: true });
      if (!cancelled) setHits(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const parsed = parseDelta(delta);
  const current = variant && locationId ? onHandFor(variant.id, locationId) : null;
  const projected = parsed.ok ? (current?.quantity ?? 0) + parsed.value : null;
  const canSave = !!variant && !!locationId && parsed.ok && !busy;
  const locationName = locations.find((l) => l.id === locationId)?.name ?? "";

  const bump = (step: number) => {
    const next = (parseQuantity(delta) ?? 0) + step;
    setDelta(next === 0 ? "" : formatQuantity(next));
  };

  const submit = React.useCallback(async () => {
    if (!variant || !locationId || !parsed.ok) return;
    setBusy(true);
    try {
      await createInventoryAdjustmentOffline({
        variant_id: variant.id,
        location_id: locationId,
        quantity_delta: parsed.value,
        reason: reason.trim() || null,
        created_by: session?.userId ?? null,
      });
      await readLocal();
      toast.success(`${variant.sku} adjusted by ${formatQuantity(parsed.value)}.`, { title: "Queued" });
      router.replace("/(tabs)/inventory");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue the adjustment.", { title: "Adjustment failed" });
    } finally {
      setBusy(false);
    }
  }, [variant, locationId, parsed, reason, session, readLocal, toast]);

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText muted>Works offline — the adjustment is queued and applied to the ledger on the next sync.</AppText>

        <Card title="Item">
          <Stack gap={12}>
            {variant ? (
              <View style={styles.selected}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <AppText variant="h3">{variant.product_name ?? "Product"}</AppText>
                    {variant.product_status === "archived" ? <Badge tone="neutral" label="Archived" /> : null}
                  </View>
                  <SkuTag sku={variant.sku} />
                </View>
                <Button
                  title="Change"
                  variant="link"
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
                    onPress={() => setVariant(hit)}
                    style={({ pressed }) => [styles.hit, pressed && { opacity: 0.85 }]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <AppText variant="h3">{hit.product_name ?? "Product"}</AppText>
                      {hit.product_status === "archived" ? <Badge tone="neutral" label="Archived" /> : null}
                    </View>
                    <SkuTag sku={hit.sku} />
                  </Pressable>
                ))}
                {query.trim().length > 0 && hits.length === 0 ? <AppText muted>No matching items.</AppText> : null}
              </>
            )}
          </Stack>
        </Card>

        <Card title="Adjustment">
          <Stack gap={12}>
            <SelectField
              label="Location"
              value={locationId}
              placeholder={locations.length ? "Select a location…" : "No locations synced yet"}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
              onChange={setLocationId}
            />

            <TextField
              label="Quantity change"
              value={delta}
              onChangeText={setDelta}
              keyboardType="numbers-and-punctuation"
              placeholder="e.g. 12 to add, -3 to remove"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[-10, -1, 1, 10].map((step) => (
                <Button
                  key={step}
                  title={step > 0 ? `+${step}` : `−${-step}`}
                  variant="secondary"
                  style={styles.step}
                  accessibilityLabel={`${step > 0 ? "Add" : "Remove"} ${Math.abs(step)}`}
                  onPress={() => bump(step)}
                />
              ))}
            </View>
            {delta.trim().length > 0 && !parsed.ok ? (
              <AppText style={{ color: theme.colors.dangerText }}>{parsed.error}</AppText>
            ) : null}

            <TextField
              label="Reason (optional)"
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Stock count, damage, shrinkage"
            />

            {variant && locationId ? (
              <View style={styles.projection}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="caption" style={styles.projectionLabel}>
                    On hand at {locationName}
                  </AppText>
                  <AppText style={styles.projectionValue}>
                    {formatQuantity(current?.quantity ?? 0)}
                    {projected !== null ? ` → ${formatQuantity(projected)}` : ""}
                  </AppText>
                </View>
                {current && current.pending !== 0 ? (
                  <Badge tone="warning" label={`${formatQuantity(current.pending)} unsynced`} />
                ) : null}
              </View>
            ) : null}
          </Stack>
        </Card>

        <Button
          title={busy ? "Queueing…" : "Queue adjustment"}
          size="lg"
          disabled={!canSave}
          loading={busy}
          onPress={submit}
        />
        <Button title="Cancel" variant="link" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  selected: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  hit: { gap: 6, padding: theme.spacing.sm, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceAlt },
  step: { flex: 1, minHeight: 44, backgroundColor: theme.colors.surfaceAlt },
  projection: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.infoBg,
  },
  projectionLabel: { color: theme.colors.infoText, fontWeight: theme.typography.weight.semibold },
  projectionValue: {
    color: theme.colors.infoText,
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.bold,
  },
});
