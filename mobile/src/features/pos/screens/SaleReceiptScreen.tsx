import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { productsList } from "@/catalog/products";
import { variantsListAll } from "@/catalog/variants";
import { locationsGetById } from "@/inventory/locations";
import { lineTotal, PAYMENT_METHOD_LABEL, isPaymentMethod } from "@/sales/lib/saleTotals";
import { salesGetById, type SaleRow } from "@/sales/sales";
import { AppText, Badge, Button, Card, Divider, Screen, Stack } from "@/ui/components";
import { formatMoney, moneyOrZero } from "@/util/money";

type ReceiptLine = {
  id: string;
  sku: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  total: string;
};

/**
 * Rendered entirely from the local store, so a receipt can be produced for a sale the server has
 * never seen — which is the point of an offline till.
 */
export default function SaleReceiptScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = React.useState(true);
  const [sale, setSale] = React.useState<SaleRow | null>(null);
  const [locationName, setLocationName] = React.useState("");
  const [lines, setLines] = React.useState<ReceiptLine[]>([]);

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
            total: formatMoney(lineTotal(item)),
          };
        })
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

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

        {sale.synced ? null : (
          <AppText muted>
            This sale is queued and will sync when you are back online. The goods have left and the stock on this
            device already reflects it.
          </AppText>
        )}

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
