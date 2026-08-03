import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { hasPermission } from "@/auth/permissions";
import { useSession } from "@/auth/session";
import { productsList } from "@/catalog/products";
import { variantsListAll } from "@/catalog/variants";
import { locationsGetById } from "@/inventory/locations";
import { isVoidable } from "@/sales/lib/saleStatus";
import { lineTotal, PAYMENT_METHOD_LABEL, isPaymentMethod } from "@/sales/lib/saleTotals";
import { salesGetById, type SaleRow } from "@/sales/sales";
import { voidSaleOffline } from "@/sync/syncEngine";
import { AppText, Badge, Button, Card, Divider, Screen, Stack, TextField } from "@/ui/components";
import { useToast } from "@/ui/toast";
import { formatMoney, moneyOrZero } from "@/util/money";

type ReceiptLine = {
  id: string;
  sku: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  discount: string;
  tax: string;
  total: string;
};

/**
 * Rendered entirely from the local store, so a receipt can be produced for a sale the server has
 * never seen — which is the point of an offline till.
 */
export default function SaleReceiptScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const toast = useToast();
  const { session } = useSession();

  const [loading, setLoading] = React.useState(true);
  const [sale, setSale] = React.useState<SaleRow | null>(null);
  const [locationName, setLocationName] = React.useState("");
  const [lines, setLines] = React.useState<ReceiptLine[]>([]);
  /**
   * Two steps rather than one. Voiding moves stock and cannot be undone from here — un-voiding is
   * a new sale — so the button that does it is never the button that was already under a thumb.
   */
  const [confirming, setConfirming] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [voiding, setVoiding] = React.useState(false);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await salesGetById(id);
      if (cancelled) return;
      setSale(row);

      if (!row) {
        setLoading(false);
        return;
      }

      const [location, variants, products] = await Promise.all([
        locationsGetById(row.location_id),
        variantsListAll(),
        productsList(),
      ]);
      if (cancelled) return;

      const variantById = new Map(variants.map((v) => [v.id, v]));
      const productNameById = new Map(products.map((p) => [p.id, p.name]));

      setLocationName(location?.name ?? "Unknown location");
      setLines(
        row.items.map((item) => {
          const variant = variantById.get(item.variant_id);
          return {
            id: item.id,
            sku: variant?.sku ?? "Unknown SKU",
            product_name: variant ? (productNameById.get(variant.product_id) ?? "Unknown product") : "Unknown product",
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount,
            tax: item.tax,
            total: formatMoney(lineTotal(item)),
          };
        })
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const canVoid = hasPermission(session, "pos.void_sale");

  const doVoid = React.useCallback(async () => {
    setVoiding(true);
    try {
      await voidSaleOffline({ id, reason, voided_by: session?.userId ?? null });
      setConfirming(false);
      setReason("");
      // Re-read rather than patching state: the stock is back and the status has changed, and the
      // store is what the rest of the app will agree with.
      setReload((n) => n + 1);
      toast.success("Sale voided. The stock is back on this device already.", { title: "Voided" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not void this sale.", { title: "Not voided" });
    } finally {
      setVoiding(false);
    }
  }, [id, reason, session?.userId, toast]);

  if (loading) {
    return (
      <Screen scroll>
        <AppText muted>Loading…</AppText>
      </Screen>
    );
  }

  if (!sale) {
    return (
      <Screen scroll>
        <Stack gap={16}>
          <AppText variant="h1">Receipt</AppText>
          <AppText muted>This sale is not on this device.</AppText>
          <Button title="Back to till" variant="ghost" onPress={() => router.replace("/(tabs)/pos")} />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <AppText variant="h1">Receipt</AppText>
          {sale.status === "voided" ? <Badge tone="danger" label="Voided" /> : null}
          {sale.synced ? null : <Badge tone="warning" label="Unsynced" />}
        </View>

        <Card title={locationName} subtitle={new Date(sale.sold_at).toLocaleString()}>
          <Stack gap={8}>
            {lines.map((line) => (
              <View key={line.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flexShrink: 1 }}>
                  <AppText>{line.product_name}</AppText>
                  <AppText muted>
                    {line.sku} · {line.quantity} x {line.unit_price}
                    {moneyOrZero(line.discount) > 0 ? ` · less ${line.discount}` : ""}
                    {moneyOrZero(line.tax) > 0 ? ` · tax ${line.tax}` : ""}
                  </AppText>
                </View>
                <AppText>{line.total}</AppText>
              </View>
            ))}

            <Divider />

            <Row label="Subtotal" value={sale.subtotal} />
            {moneyOrZero(sale.discount) > 0 ? <Row label="Discount" value={`-${sale.discount}`} /> : null}
            {moneyOrZero(sale.tax) > 0 ? <Row label="Tax" value={sale.tax} /> : null}
            <Row label="Total" value={sale.total_amount} strong />

            <Divider />

            {sale.payments.map((payment) => (
              <Row
                key={payment.id}
                label={isPaymentMethod(payment.method) ? PAYMENT_METHOD_LABEL[payment.method] : payment.method}
                value={payment.amount}
              />
            ))}
          </Stack>
        </Card>

        {sale.status === "voided" ? (
          <AppText muted>
            This sale was voided. The stock is back and the sale no longer counts as takings — but the money is not
            refunded here: what was taken still shows on the payments above and has to be settled at the till.
          </AppText>
        ) : null}

        {sale.synced ? null : (
          <AppText muted>
            This sale is queued and will sync when you are back online. The goods have left and the stock on this
            device already reflects it.
          </AppText>
        )}

        {/* Gated on `pos.void_sale`, not `pos.sell`: undoing a sale after the money has been taken
            is a supervisor's call, which is the same line the server draws. */}
        {canVoid && isVoidable(sale.status) ? (
          <Card title="Void this sale">
            <Stack gap={12}>
              {confirming ? (
                <>
                  <AppText>
                    Voiding puts {lines.length === 1 ? "this line" : `all ${lines.length} lines`} back into stock at{" "}
                    {locationName} and marks the sale voided. It cannot be undone — un-voiding is a new sale.
                  </AppText>
                  <TextField
                    label="Reason (optional)"
                    value={reason}
                    onChangeText={setReason}
                    placeholder="e.g. Wrong item scanned"
                  />
                  <Button
                    title={`Void ${sale.total_amount}`}
                    disabled={voiding}
                    onPress={() => void doVoid()}
                  />
                  <Button title="Keep the sale" variant="ghost" onPress={() => setConfirming(false)} />
                </>
              ) : (
                <>
                  <AppText muted>
                    Works offline: the stock comes back on this device now and the void syncs when you are back
                    online.
                  </AppText>
                  <Button title="Void sale" variant="ghost" onPress={() => setConfirming(true)} />
                </>
              )}
            </Stack>
          </Card>
        ) : null}

        <Button title="New sale" onPress={() => router.replace("/(tabs)/pos")} />
        <Button title="Recent sales" variant="ghost" onPress={() => router.push("/(tabs)/pos/orders")} />
      </Stack>
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <AppText variant={strong ? "h3" : undefined}>{label}</AppText>
      <AppText variant={strong ? "h3" : undefined}>{value}</AppText>
    </View>
  );
}
