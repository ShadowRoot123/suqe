import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import { productsList } from "@/catalog/products";
import { variantsListAll, variantsSearch, type VariantSearchHit } from "@/catalog/variants";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { calendarDateInput } from "@/purchasing/lib/calendarDate";
import { computeOrderTotal, formatMoney, lineTotal } from "@/purchasing/lib/money";
import { isEditable } from "@/purchasing/lib/orderLifecycle";
import { ordersGetById } from "@/purchasing/orders";
import { suppliersList, type SupplierRow } from "@/purchasing/suppliers";
import { createPurchaseOrderOffline, updatePurchaseOrderOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, SelectField, Stack, TextField } from "@/ui/components";
import { theme } from "@/ui/theme";
import { useToast } from "@/ui/toast";

/** A line being edited. Quantity and cost stay strings so a half-typed "1." is not clobbered. */
type DraftLine = {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity_ordered: string;
  unit_cost: string;
};

export default function PurchaseOrderFormScreen({ mode }: { mode: "create" | "edit" }) {
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const isEdit = mode === "edit";

  const [loading, setLoading] = React.useState(true);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [locations, setLocations] = React.useState<LocationRow[]>([]);
  const [supplierId, setSupplierId] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [expectedAt, setExpectedAt] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([]);

  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<VariantSearchHit[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [supplierRows, locationRows] = await Promise.all([suppliersList(), locationsList()]);
      if (cancelled) return;
      setSuppliers(supplierRows);
      setLocations(locationRows);

      if (!isEdit) {
        setSupplierId(supplierRows[0]?.id ?? "");
        setLocationId(locationRows[0]?.id ?? "");
        setLoading(false);
        return;
      }

      const order = await ordersGetById(id);
      if (cancelled) return;
      if (!order) {
        setBlocked("Purchase order not found.");
        setLoading(false);
        return;
      }
      if (!isEditable(order.status)) {
        setBlocked(`This order is ${order.status} and its lines can no longer be changed.`);
        setLoading(false);
        return;
      }

      const [variants, products] = await Promise.all([variantsListAll(), productsList()]);
      if (cancelled) return;
      const variantById = new Map(variants.map((v) => [v.id, v]));
      const productNameById = new Map(products.map((p) => [p.id, p.name]));

      setSupplierId(order.supplier_id);
      setLocationId(order.location_id);
      setExpectedAt(calendarDateInput(order.expected_at));
      setLines(
        order.items.map((item) => {
          const variant = variantById.get(item.variant_id);
          return {
            id: item.id,
            variant_id: item.variant_id,
            sku: variant?.sku ?? "Unknown SKU",
            product_name: variant ? (productNameById.get(variant.product_id) ?? "Unknown product") : "Unknown product",
            quantity_ordered: item.quantity_ordered,
            unit_cost: item.unit_cost,
          };
        })
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await variantsSearch(query, 8);
      if (!cancelled) setHits(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const addLine = React.useCallback(
    async (hit: VariantSearchHit) => {
      if (lines.some((l) => l.variant_id === hit.id)) {
        toast.info("That item is already on the order — change its quantity instead.", { title: "Already added" });
        return;
      }

      // The variant's own cost price is the best first guess at what this delivery will cost.
      const variants = await variantsListAll();
      const cost = variants.find((v) => v.id === hit.id)?.cost_price ?? "0";

      setLines((prev) => [
        ...prev,
        {
          id: "",
          variant_id: hit.id,
          sku: hit.sku,
          product_name: hit.product_name ?? "Product",
          quantity_ordered: "1",
          unit_cost: formatMoney(Number(cost) || 0),
        },
      ]);
      setQuery("");
    },
    [lines, toast]
  );

  const patchLine = React.useCallback((variantId: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.variant_id === variantId ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = React.useCallback((variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variant_id !== variantId));
  }, []);

  const total = computeOrderTotal(lines);
  const canSave = !loading && !blocked && !!supplierId && !!locationId && !busy;

  const save = React.useCallback(async () => {
    setBusy(true);
    try {
      const items = lines.map((line) => ({
        // A line added in this session has no id yet; the sync engine mints one so the row keeps
        // its identity through later edits.
        id: line.id || null,
        variant_id: line.variant_id,
        quantity_ordered: line.quantity_ordered,
        unit_cost: line.unit_cost,
      }));

      if (isEdit) {
        await updatePurchaseOrderOffline({
          id,
          supplier_id: supplierId,
          location_id: locationId,
          expected_at: expectedAt,
          items,
        });
        toast.success("Draft saved.", { title: "Queued" });
        router.replace(`/(tabs)/purchasing/${id}`);
      } else {
        const newId = await createPurchaseOrderOffline({
          supplier_id: supplierId,
          location_id: locationId,
          expected_at: expectedAt,
          items,
        });
        toast.success("Draft created. Approve it when you are ready to send it.", { title: "Queued" });
        router.replace(`/(tabs)/purchasing/${newId}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the order.", { title: "Save failed" });
    } finally {
      setBusy(false);
    }
  }, [expectedAt, id, isEdit, lines, locationId, supplierId, toast]);

  const noSuppliers = !loading && suppliers.length === 0;
  const noLocations = !loading && locations.length === 0;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">{isEdit ? "Edit draft order" : "New purchase order"}</AppText>

        {loading ? <AppText muted>Loading…</AppText> : null}
        {blocked ? <AppText muted>{blocked}</AppText> : null}

        {noSuppliers ? (
          <Card>
            <Stack gap={12}>
              <AppText>Add a supplier first — an order has to be placed with someone.</AppText>
              <Button title="Add supplier" onPress={() => router.push("/(tabs)/purchasing/suppliers/create")} />
            </Stack>
          </Card>
        ) : null}
        {noLocations ? (
          <Card>
            <Stack gap={12}>
              <AppText>Add a location first — an order has to be delivered somewhere.</AppText>
              <Button title="Add location" onPress={() => router.push("/(tabs)/inventory/locations/create")} />
            </Stack>
          </Card>
        ) : null}

        {!loading && !blocked && !noSuppliers && !noLocations ? (
          <>
            <Card title="Order">
              <Stack gap={12}>
                <SelectField
                  label="Supplier"
                  value={supplierId}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={setSupplierId}
                />
                <SelectField
                  label="Deliver to"
                  value={locationId}
                  options={locations.map((l) => ({ value: l.id, label: l.name }))}
                  onChange={setLocationId}
                />
                <TextField
                  label="Expected date (optional)"
                  value={expectedAt}
                  onChangeText={setExpectedAt}
                  autoCapitalize="none"
                  placeholder="2026-08-20"
                />
              </Stack>
            </Card>

            <Card title="Add items">
              <Stack gap={12}>
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
                    onPress={() => void addLine(hit)}
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
              </Stack>
            </Card>

            <Card title="Lines" subtitle={lines.length === 1 ? "1 item" : `${lines.length} items`}>
              <Stack gap={12}>
                {lines.length === 0 ? (
                  <AppText muted>Nothing on this order yet. Search above to add an item.</AppText>
                ) : null}

                {lines.map((line) => (
                  <View
                    key={line.variant_id}
                    style={{
                      padding: 12,
                      borderRadius: theme.radii.md,
                      backgroundColor: theme.colors.surfaceAlt,
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <View style={{ flexShrink: 1 }}>
                        <AppText variant="label">{line.product_name}</AppText>
                        <AppText muted>{line.sku}</AppText>
                      </View>
                      <Button title="Remove" variant="ghost" onPress={() => removeLine(line.variant_id)} />
                    </View>

                    <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                      <View style={{ flexGrow: 1, flexBasis: 120 }}>
                        <TextField
                          label="Quantity"
                          value={line.quantity_ordered}
                          onChangeText={(v) => patchLine(line.variant_id, { quantity_ordered: v })}
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                      <View style={{ flexGrow: 1, flexBasis: 120 }}>
                        <TextField
                          label="Unit cost"
                          value={line.unit_cost}
                          onChangeText={(v) => patchLine(line.variant_id, { unit_cost: v })}
                          keyboardType="numbers-and-punctuation"
                        />
                      </View>
                    </View>

                    <AppText muted>Line total {formatMoney(lineTotal(line))}</AppText>
                  </View>
                ))}

                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <AppText variant="label">Order total</AppText>
                  <AppText variant="h3">{formatMoney(total)}</AppText>
                </View>
              </Stack>
            </Card>

            <Button
              title={busy ? "Saving…" : isEdit ? "Save draft" : "Create draft"}
              disabled={!canSave}
              loading={busy}
              onPress={save}
            />
          </>
        ) : null}

        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}
