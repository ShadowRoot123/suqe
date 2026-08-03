import { router } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import { useSession } from "@/auth/session";
import { variantsSearch, type VariantSearchHit } from "@/catalog/variants";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import {
  computeSaleTotals,
  lineTotal,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  saleError,
  type PaymentMethod,
} from "@/sales/lib/saleTotals";
import { cartClear, cartLoad, cartSave } from "@/sales/cart";
import { createSaleOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Divider, Screen, SelectField, Stack, TextField } from "@/ui/components";
import { theme } from "@/ui/theme";
import { useToast } from "@/ui/toast";
import { formatMoney, parseMoney } from "@/util/money";

/** A line in the cart. Amounts stay strings so a half-typed "1." is not clobbered. */
type CartLine = {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  /** Empty means none. Kept blank rather than "0.00" so the boxes read as untouched. */
  discount: string;
  tax: string;
};

export default function PosCartScreen() {
  const toast = useToast();
  const { session } = useSession();

  const [locations, setLocations] = React.useState<LocationRow[]>([]);
  const [locationId, setLocationId] = React.useState("");
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<VariantSearchHit[]>([]);
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [tendered, setTendered] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  /**
   * Nothing is written back to the held cart until the held cart has been read. Without this the
   * save effect fires on the first render with an empty `lines` and wipes the very cart it is
   * about to restore.
   */
  const [hydrated, setHydrated] = React.useState(false);
  const [restored, setRestored] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rows, held] = await Promise.all([locationsList(), cartLoad()]);
      if (cancelled) return;

      setLocations(rows);
      const fallback = rows[0]?.id ?? "";
      // A held cart carries the location it was rung up at — restoring the items but selling them
      // from somewhere else would take the stock out of the wrong shop.
      const heldLocation = held?.location_id && rows.some((l) => l.id === held.location_id) ? held.location_id : "";
      setLocationId((current) => current || heldLocation || fallback);

      if (held && held.lines.length > 0) {
        setLines(held.lines.map((line) => ({ id: line.variant_id, ...line })));
        setRestored(true);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Every change to the basket is written straight back, so the durable copy is never more than
  // one keystroke behind what the cashier can see.
  React.useEffect(() => {
    if (!hydrated) return;
    void cartSave({
      location_id: locationId,
      lines: lines.map((line) => ({
        variant_id: line.variant_id,
        sku: line.sku,
        product_name: line.product_name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount: line.discount,
        tax: line.tax,
      })),
    });
  }, [hydrated, lines, locationId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Archived products are excluded by default, which is the same guard the server applies.
      const results = query.trim() ? await variantsSearch(query, 8) : [];
      if (!cancelled) setHits(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const totals = React.useMemo(() => computeSaleTotals(lines), [lines]);

  /** One line per variant: scanning the same item twice bumps the quantity, as a till should. */
  const addLine = React.useCallback((hit: VariantSearchHit) => {
    setLines((current) => {
      const existing = current.find((line) => line.variant_id === hit.id);
      if (existing) {
        const next = (parseQuantity(existing.quantity) ?? 0) + 1;
        return current.map((line) =>
          line.variant_id === hit.id ? { ...line, quantity: formatQuantity(next) } : line
        );
      }
      return [
        ...current,
        {
          id: hit.id,
          variant_id: hit.id,
          sku: hit.sku,
          product_name: hit.product_name ?? "Unknown product",
          quantity: "1",
          unit_price: formatMoney(parseMoney(hit.price) ?? 0),
          discount: "",
          tax: "",
        },
      ];
    });
    setQuery("");
  }, []);

  const setLine = React.useCallback((variantId: string, patch: Partial<CartLine>) => {
    setLines((current) => current.map((line) => (line.variant_id === variantId ? { ...line, ...patch } : line)));
  }, []);

  const removeLine = React.useCallback((variantId: string) => {
    setLines((current) => current.filter((line) => line.variant_id !== variantId));
  }, []);

  /**
   * The payment recorded is always the sale total. Cash tendered is what the customer handed
   * over — it decides the change, not what the drawer takes, so a 50 against a 24.15 sale is a
   * 24.15 payment and 25.85 back, never a 50 payment the server would reject.
   */
  const payments = React.useMemo(
    () => [{ method, amount: totals.total_amount }],
    [method, totals.total_amount]
  );

  const error = React.useMemo(() => {
    if (lines.length === 0) return null;
    return saleError({
      lines,
      payments,
      labelFor: (variantId) => lines.find((line) => line.variant_id === variantId)?.sku ?? variantId,
    });
  }, [lines, payments]);

  const change = React.useMemo(() => {
    const paid = parseMoney(tendered);
    if (paid === null) return null;
    const back = paid - totals.total_amount;
    return back > 0 ? formatMoney(back) : null;
  }, [tendered, totals.total_amount]);

  const finalize = React.useCallback(async () => {
    setBusy(true);
    try {
      const id = await createSaleOffline({
        location_id: locationId,
        items: lines.map((line) => ({
          variant_id: line.variant_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          discount: line.discount,
          tax: line.tax,
        })),
        // Change given is not a second payment — the drawer takes the total, not the note handed over.
        payments: [{ method, amount: totals.total_amount }],
        cashier_id: session?.userId ?? null,
      });

      // The cart became a sale, so the held copy has served its purpose. Cleared explicitly rather
      // than left to the save effect, so a crash between here and the next render cannot restore
      // a basket that has already been charged.
      await cartClear();
      setLines([]);
      setTendered("");
      setQuery("");
      setRestored(false);
      toast.success("Sale complete. Stock is updated on this device already.", { title: "Sold" });
      router.push(`/(tabs)/pos/receipt/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete the sale.", { title: "Not sold" });
    } finally {
      setBusy(false);
    }
  }, [lines, locationId, method, session?.userId, toast, totals.total_amount]);

  const noLocations = locations.length === 0;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Sell</AppText>

        {noLocations ? (
          <Card>
            <Stack gap={12}>
              <AppText>Add a location first — a sale has to happen somewhere.</AppText>
              <Button title="Add location" onPress={() => router.push("/(tabs)/inventory/locations/create")} />
            </Stack>
          </Card>
        ) : null}

        {!noLocations ? (
          <>
            <Card title="Add items">
              <Stack gap={12}>
                {locations.length > 1 ? (
                  <SelectField
                    label="Selling from"
                    value={locationId}
                    options={locations.map((l) => ({ value: l.id, label: l.name }))}
                    onChange={setLocationId}
                  />
                ) : null}
                <TextField
                  label="Scan or search by SKU, barcode or name"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  placeholder="e.g. COLA-330"
                />
                {hits.map((hit) => (
                  <Pressable
                    key={hit.id}
                    onPress={() => addLine(hit)}
                    style={({ pressed }) => [
                      {
                        padding: 12,
                        borderRadius: theme.radii.md,
                        backgroundColor: pressed ? theme.colors.border : theme.colors.surfaceAlt,
                      },
                    ]}
                  >
                    <AppText>{hit.product_name ?? "Unknown product"}</AppText>
                    <AppText muted>
                      {hit.sku} · {formatMoney(parseMoney(hit.price) ?? 0)}
                    </AppText>
                  </Pressable>
                ))}
                {query.trim() && hits.length === 0 ? <AppText muted>Nothing matches that.</AppText> : null}
              </Stack>
            </Card>

            <Card title="Cart" subtitle={lines.length === 1 ? "1 line" : `${lines.length} lines`}>
              <Stack gap={12}>
                {restored && lines.length > 0 ? (
                  <AppText muted>Picked up where this device left off — nothing has been charged yet.</AppText>
                ) : null}
                {lines.length === 0 ? (
                  <AppText muted>Nothing in the cart yet. Search above, or scan an item.</AppText>
                ) : null}
                {lines.map((line) => (
                  <View key={line.variant_id} style={{ gap: 8 }}>
                    <AppText>{line.product_name}</AppText>
                    <AppText muted>
                      {line.sku} · {line.unit_price} each · {formatMoney(lineTotal(line))}
                    </AppText>
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <View style={{ minWidth: 90, flexGrow: 1 }}>
                        <TextField
                          label="Qty"
                          value={line.quantity}
                          onChangeText={(text) => setLine(line.variant_id, { quantity: text })}
                          keyboardType="numeric"
                          autoCapitalize="none"
                        />
                      </View>
                      {/* Both are per line, which is what the contract and the ledger carry — an
                          order-wide discount would have to be apportioned back onto the lines to
                          be stored, and apportioning it is the shop's decision, not the till's. */}
                      <View style={{ minWidth: 90, flexGrow: 1 }}>
                        <TextField
                          label="Discount"
                          value={line.discount}
                          onChangeText={(text) => setLine(line.variant_id, { discount: text })}
                          keyboardType="numeric"
                          autoCapitalize="none"
                          placeholder="0.00"
                        />
                      </View>
                      <View style={{ minWidth: 90, flexGrow: 1 }}>
                        <TextField
                          label="Tax"
                          value={line.tax}
                          onChangeText={(text) => setLine(line.variant_id, { tax: text })}
                          keyboardType="numeric"
                          autoCapitalize="none"
                          placeholder="0.00"
                        />
                      </View>
                      <Button title="Remove" variant="ghost" onPress={() => removeLine(line.variant_id)} />
                    </View>
                  </View>
                ))}
              </Stack>
            </Card>

            <Card title="Payment">
              <Stack gap={12}>
                <SelectField
                  label="Method"
                  value={method}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
                  onChange={(value) => setMethod(value as PaymentMethod)}
                />
                <TextField
                  label="Cash tendered (optional)"
                  value={tendered}
                  onChangeText={setTendered}
                  keyboardType="numeric"
                  autoCapitalize="none"
                  placeholder={formatMoney(totals.total_amount)}
                />
                {change ? <AppText>Change due: {change}</AppText> : null}

                <Divider />

                {/* Only shown once there is something to show: a shop that never discounts should
                    not read three lines to find the total. */}
                <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
                {totals.discount > 0 ? <TotalRow label="Discount" value={`-${formatMoney(totals.discount)}`} /> : null}
                {totals.tax > 0 ? <TotalRow label="Tax" value={formatMoney(totals.tax)} /> : null}
                <TotalRow label="Total" value={formatMoney(totals.total_amount)} strong />
                {error ? (
                  <AppText style={{ color: theme.colors.dangerText }}>{error}</AppText>
                ) : (
                  <AppText muted>
                    Selling works offline: the stock moves on this device now and the sale syncs when you are back
                    online.
                  </AppText>
                )}
              </Stack>
            </Card>

            <Button
              title={`Charge ${formatMoney(totals.total_amount)}`}
              disabled={busy || lines.length === 0 || error !== null}
              onPress={() => void finalize()}
            />
            <Button title="Recent sales" variant="ghost" onPress={() => router.push("/(tabs)/pos/orders")} />
          </>
        ) : null}
      </Stack>
    </Screen>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <AppText variant={strong ? "h3" : undefined} muted={!strong}>
        {label}
      </AppText>
      <AppText variant={strong ? "h3" : undefined}>{value}</AppText>
    </View>
  );
}
