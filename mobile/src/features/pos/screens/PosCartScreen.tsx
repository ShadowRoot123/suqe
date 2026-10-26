import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { useSession } from "@/auth/session";
import { variantsSearch, type VariantSearchHit } from "@/catalog/variants";
import { locationsList, type LocationRow } from "@/inventory/locations";
import { foldOnHand } from "@/inventory/lib/onHand";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { movementsListUnsynced } from "@/inventory/movements";
import { snapshotsList } from "@/inventory/snapshots";
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
import { AppText, Button, Chip, Divider, Screen, SkuTag, Stack, TextField } from "@/ui/components";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
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
  const [pickingLocation, setPickingLocation] = React.useState(false);
  /** Lines whose discount/tax boxes are open. Closed by default so the cart reads as a list. */
  const [adjusting, setAdjusting] = React.useState<Set<string>>(new Set());
  /** variant_id → on-hand at the selling location, so a line that would go negative is flagged. */
  const [onHand, setOnHand] = React.useState<Map<string, number>>(new Map());
  const { isDesktop } = useBreakpoint();

  React.useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    (async () => {
      const [snapshots, pending] = await Promise.all([snapshotsList({ location_id: locationId }), movementsListUnsynced()]);
      if (cancelled) return;
      const cells = foldOnHand(snapshots, pending);
      const next = new Map<string, number>();
      for (const cell of cells.values()) if (cell.location_id === locationId) next.set(cell.variant_id, cell.quantity);
      setOnHand(next);
    })();
    return () => {
      cancelled = true;
    };
    // Re-read after a sale (lines emptied) so the next basket warns against the new on-hand.
  }, [locationId, lines.length === 0]);

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
  const units = lines.reduce((sum, line) => sum + (parseQuantity(line.quantity) ?? 0), 0);
  const locationName = locations.find((l) => l.id === locationId)?.name ?? "";
  const summary = `${lines.length} ${lines.length === 1 ? "line" : "lines"} · ${formatQuantity(units)} ${units === 1 ? "unit" : "units"}`;

  const bumpQty = (line: CartLine, delta: number) => {
    const next = (parseQuantity(line.quantity) ?? 0) + delta;
    if (next <= 0) removeLine(line.variant_id);
    else setLine(line.variant_id, { quantity: formatQuantity(next) });
  };

  const toggleAdjust = (variantId: string) =>
    setAdjusting((current) => {
      const next = new Set(current);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });

  if (noLocations) {
    return (
      <Screen scroll>
        <Stack gap={16}>
          <View style={styles.panel}>
            <AppText>Add a location first — a sale has to happen somewhere.</AppText>
            <Button title="Add location" onPress={() => router.push("/(tabs)/inventory/locations/create")} />
          </View>
        </Stack>
      </Screen>
    );
  }

  const sellingFrom = (
    <View style={styles.sellingFrom}>
      <View style={styles.rowCenter}>
        <Ionicons name="storefront-outline" size={22} color={theme.colors.primaryStrong} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={styles.eyebrow}>
            SELLING FROM
          </AppText>
          <AppText variant="h2" style={{ color: theme.colors.primaryStrong }}>
            {locationName}
          </AppText>
        </View>
        {locations.length > 1 ? (
          <Button
            title="Change"
            variant="secondary"
            size="sm"
            right={<Ionicons name="chevron-forward" size={16} color={theme.colors.text} />}
            onPress={() => setPickingLocation((v) => !v)}
            accessibilityLabel="Change selling location"
          />
        ) : null}
      </View>
      {pickingLocation ? (
        <View style={styles.chipRow}>
          {locations.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              selected={l.id === locationId}
              onPress={() => {
                setLocationId(l.id);
                setPickingLocation(false);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );

  const restoredNotice =
    restored && lines.length > 0 ? (
      <View style={styles.notice}>
        <View style={styles.rowStart}>
          <Ionicons name="time-outline" size={18} color={theme.colors.infoText} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={styles.noticeTitle}>Cart restored</AppText>
            <AppText variant="caption" style={{ color: theme.colors.infoText }}>
              {summary} · {locationName}. Nothing was lost when the app closed, and nothing has been charged.
            </AppText>
          </View>
        </View>
        <View style={styles.rowCenter}>
          <Button title="Keep cart" variant="secondary" onPress={() => setRestored(false)} />
          <Button
            title="Discard"
            variant="secondary"
            style={{ borderColor: theme.colors.danger }}
            onPress={() => {
              setLines([]);
              setRestored(false);
            }}
          />
        </View>
      </View>
    ) : null;

  const search = (
    <Stack gap={8}>
      <TextField
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="Search name, SKU or barcode"
        accessibilityLabel="Search products by name, SKU or barcode"
        left={<Ionicons name="search" size={18} color={theme.colors.muted} style={{ marginLeft: 12 }} />}
      />
      {hits.map((hit) => (
        <Pressable
          key={hit.id}
          onPress={() => addLine(hit)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${hit.product_name ?? hit.sku} to cart`}
          style={({ pressed }) => [styles.hit, pressed && { backgroundColor: theme.colors.border }]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="h3">{hit.product_name ?? "Unknown product"}</AppText>
            <SkuTag sku={hit.sku} />
          </View>
          <AppText variant="h3">{formatMoney(parseMoney(hit.price) ?? 0)}</AppText>
          <Ionicons name="add-circle" size={28} color={theme.colors.primary} />
        </Pressable>
      ))}
      {query.trim() && hits.length === 0 ? <AppText muted>Nothing matches that.</AppText> : null}
    </Stack>
  );

  const cart = (
    <View style={styles.panel}>
      <View style={[styles.rowCenter, { justifyContent: "space-between", flexWrap: "wrap" }]}>
        <AppText variant="caption" muted>
          {summary}
        </AppText>
        {lines.length > 0 ? (
          <AppText variant="caption" style={{ color: theme.colors.successText }}>
            Sells offline — syncs when back online
          </AppText>
        ) : null}
      </View>
      {lines.length === 0 ? <AppText muted>Nothing in the cart yet. Search or scan an item.</AppText> : null}
      {lines.map((line, i) => {
        const qty = parseQuantity(line.quantity) ?? 0;
        const stock = onHand.get(line.variant_id);
        const after = stock === undefined ? null : stock - qty;
        const hasAdjust = Boolean(line.discount || line.tax);
        const open = adjusting.has(line.variant_id);
        return (
          <View key={line.variant_id} style={[styles.line, i > 0 && styles.lineDivider]}>
            <View style={styles.rowStart}>
              <View style={{ flex: 1, gap: 6 }}>
                <AppText variant="h3">{line.product_name}</AppText>
                <SkuTag sku={line.sku} />
              </View>
              <AppText variant="h3">{formatMoney(lineTotal(line))}</AppText>
            </View>

            <View style={[styles.rowCenter, { justifyContent: "space-between" }]}>
              <AppText muted>{line.unit_price} each</AppText>
              <View style={styles.rowCenter}>
                <View style={styles.stepper}>
                  <StepButton icon="remove" label={`One less ${line.product_name}`} onPress={() => bumpQty(line, -1)} />
                  <TextInput
                    value={line.quantity}
                    onChangeText={(text) => setLine(line.variant_id, { quantity: text })}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    accessibilityLabel={`Quantity of ${line.product_name}`}
                    style={styles.qtyInput}
                  />
                  <StepButton icon="add" label={`One more ${line.product_name}`} onPress={() => bumpQty(line, 1)} />
                </View>
                <Pressable
                  onPress={() => removeLine(line.variant_id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.product_name}`}
                  style={styles.iconButton}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.colors.muted} />
                </Pressable>
              </View>
            </View>

            {/* Both are per line, which is what the contract and the ledger carry — an order-wide
                discount would have to be apportioned back onto the lines to be stored, and
                apportioning it is the shop's decision, not the till's. */}
            <Pressable
              onPress={() => toggleAdjust(line.variant_id)}
              accessibilityRole="button"
              style={[styles.adjustRow, hasAdjust && { backgroundColor: theme.colors.infoBg }]}
            >
              <Ionicons name="pricetag-outline" size={14} color={hasAdjust ? theme.colors.infoText : theme.colors.muted} />
              <AppText variant="caption" style={{ flex: 1, color: hasAdjust ? theme.colors.infoText : theme.colors.muted }}>
                {hasAdjust
                  ? [line.discount && `Discount −${line.discount}`, line.tax && `Tax ${line.tax}`].filter(Boolean).join(" · ")
                  : "Add discount or tax"}
              </AppText>
              {hasAdjust || open ? (
                <AppText variant="caption" style={styles.adjustAction}>
                  {open ? "Done" : "Edit"}
                </AppText>
              ) : null}
            </Pressable>
            {open ? (
              <View style={styles.rowCenter}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Discount"
                    value={line.discount}
                    onChangeText={(text) => setLine(line.variant_id, { discount: text })}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    placeholder="0.00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Tax"
                    value={line.tax}
                    onChangeText={(text) => setLine(line.variant_id, { tax: text })}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    placeholder="0.00"
                  />
                </View>
              </View>
            ) : null}

            {after !== null && after < 0 ? (
              <View style={styles.warning}>
                <Ionicons name="warning-outline" size={16} color={theme.colors.warningText} />
                <AppText variant="caption" style={{ flex: 1, color: theme.colors.warningText }}>
                  {locationName} on-hand is {formatQuantity(stock ?? 0)} — this line takes it to {formatQuantity(after)}. The
                  sale still goes through; investigate after.
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  const checkout = (
    <Stack gap={16}>
      {/* Only shown once there is something to show: a shop that never discounts should not read
          three lines to find the total. */}
      <View style={styles.panel}>
        <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
        {totals.discount > 0 ? (
          <TotalRow label="Line discounts" value={`−${formatMoney(totals.discount)}`} tone="success" />
        ) : null}
        {totals.tax > 0 ? <TotalRow label="Tax" value={formatMoney(totals.tax)} /> : null}
        <Divider />
        <View style={[styles.rowCenter, { justifyContent: "space-between" }]}>
          <AppText variant="h2">Total</AppText>
          <AppText style={styles.total}>{formatMoney(totals.total_amount)}</AppText>
        </View>
      </View>

      <View style={styles.panel}>
        <AppText variant="h3">Payment</AppText>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} label={PAYMENT_METHOD_LABEL[m]} selected={m === method} onPress={() => setMethod(m)} />
          ))}
        </View>
        {method === "cash" ? (
          <>
            <TextField
              label="Cash tendered"
              value={tendered}
              onChangeText={setTendered}
              keyboardType="numeric"
              autoCapitalize="none"
              placeholder={formatMoney(totals.total_amount)}
            />
            {change ? (
              <View style={styles.change}>
                <AppText style={styles.changeLabel}>Change due</AppText>
                <AppText variant="h2" style={{ color: theme.colors.successText }}>
                  {change}
                </AppText>
              </View>
            ) : null}
            <AppText variant="caption" muted>
              Tendered only computes change. The payment recorded is always {formatMoney(totals.total_amount)}.
            </AppText>
          </>
        ) : null}
      </View>

      <View style={styles.panel}>
        {error ? <AppText style={{ color: theme.colors.dangerText }}>{error}</AppText> : null}
        <View style={[styles.rowCenter, { justifyContent: "space-between" }]}>
          <AppText variant="caption" muted style={{ flex: 1 }}>
            {locationName} · {summary}
          </AppText>
          <Pressable onPress={() => router.push("/(tabs)/pos/orders")} accessibilityRole="link" style={styles.link}>
            <AppText variant="caption" style={styles.linkText}>
              Recent sales
            </AppText>
          </Pressable>
        </View>
        <Button
          title={`Charge ${formatMoney(totals.total_amount)}`}
          size="lg"
          loading={busy}
          disabled={busy || lines.length === 0 || error !== null}
          onPress={() => void finalize()}
        />
      </View>
    </Stack>
  );

  return (
    <Screen scroll>
      <Stack gap={16}>
        {isDesktop ? (
          <View style={styles.columns}>
            <View style={{ flex: 3, gap: 16 }}>
              {sellingFrom}
              {search}
            </View>
            <View style={{ flex: 2, gap: 16 }}>
              {restoredNotice}
              {cart}
              {checkout}
            </View>
          </View>
        ) : (
          <>
            {sellingFrom}
            {restoredNotice}
            {search}
            {cart}
            {checkout}
          </>
        )}
      </Stack>
    </Screen>
  );
}

function StepButton({ icon, label, onPress }: { icon: "add" | "remove"; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.iconButton}>
      <Ionicons name={icon} size={20} color={theme.colors.text} />
    </Pressable>
  );
}

function TotalRow({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <AppText muted>{label}</AppText>
      <AppText style={tone === "success" ? { color: theme.colors.successText } : undefined}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  columns: { flexDirection: "row", gap: theme.spacing.lg, alignItems: "flex-start" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  rowStart: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  sellingFrom: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  eyebrow: { color: theme.colors.primaryStrong, letterSpacing: 0.5 },
  notice: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  noticeTitle: { color: theme.colors.infoText, fontWeight: theme.typography.weight.semibold },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    minHeight: 56,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  line: { gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  lineDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radii.md,
  },
  qtyInput: {
    width: 44,
    height: 44,
    textAlign: "center",
    color: theme.colors.text,
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.semibold,
  },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceAlt,
  },
  adjustAction: { color: theme.colors.infoText, fontWeight: theme.typography.weight.semibold },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.warningBg,
  },
  total: { fontSize: theme.typography.size.xxl, fontWeight: theme.typography.weight.heavy, color: theme.colors.text },
  change: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.successBg,
  },
  changeLabel: { color: theme.colors.successText, fontWeight: theme.typography.weight.semibold },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: theme.colors.primaryStrong, fontWeight: theme.typography.weight.semibold },
});
