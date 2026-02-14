import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { productsGetById } from "@/catalog/products";
import { createVariantOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";

export default function VariantCreateScreen() {
  const params = useLocalSearchParams<{ id?: string; productId?: string }>();
  const groupId = typeof params.id === "string" ? params.id : "";
  const productId = typeof params.productId === "string" ? params.productId : "";

  const [busy, setBusy] = React.useState(false);
  const [productName, setProductName] = React.useState("Product");
  const [sku, setSku] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [price, setPrice] = React.useState("0");
  const [costPrice, setCostPrice] = React.useState("0");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await productsGetById(productId);
      if (!cancelled) setProductName(p?.name ?? "Product");
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const canSave = sku.trim().length > 0 && !busy;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Add variant</AppText>
        <AppText muted>{productName}</AppText>

        <Card>
          <Stack gap={12}>
            <TextField
              label="SKU"
              value={sku}
              onChangeText={setSku}
              autoCapitalize="characters"
              placeholder="e.g. COLA-330-CASE"
            />
            <TextField label="Barcode (optional)" value={barcode} onChangeText={setBarcode} autoCapitalize="none" />
            <TextField label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            <TextField label="Cost price" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" />
          </Stack>
        </Card>

        <Button
          title={busy ? "Saving…" : "Save"}
          disabled={!canSave}
          loading={busy}
          onPress={async () => {
            const s = sku.trim();
            if (!s) return;
            setBusy(true);
            try {
              await createVariantOffline({
                product_id: productId,
                sku: s,
                barcode: barcode.trim().length ? barcode.trim() : null,
                price: price.trim().length ? price.trim() : "0",
                cost_price: costPrice.trim().length ? costPrice.trim() : "0",
              });
              router.replace({
                pathname: "/(tabs)/product-groups/[id]/products/[productId]/variants",
                params: { id: groupId, productId },
              });
            } finally {
              setBusy(false);
            }
          }}
        />

        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}

