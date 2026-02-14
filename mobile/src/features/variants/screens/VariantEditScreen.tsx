import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { productsGetById } from "@/catalog/products";
import { variantsGetById } from "@/catalog/variants";
import { updateVariantOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";

export default function VariantEditScreen() {
  const params = useLocalSearchParams<{ id?: string; productId?: string; variantId?: string }>();
  const groupId = typeof params.id === "string" ? params.id : "";
  const productId = typeof params.productId === "string" ? params.productId : "";
  const variantId = typeof params.variantId === "string" ? params.variantId : "";

  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [productName, setProductName] = React.useState("Product");

  const [sku, setSku] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [price, setPrice] = React.useState("0");
  const [costPrice, setCostPrice] = React.useState("0");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const [p, v] = await Promise.all([productsGetById(productId), variantsGetById(variantId)]);
      if (cancelled) return;
      setProductName(p?.name ?? "Product");
      if (!v) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setSku(v.sku);
      setBarcode(v.barcode ?? "");
      setPrice(v.price);
      setCostPrice(v.cost_price);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, variantId]);

  const canSave = !loading && !notFound && sku.trim().length > 0 && !busy;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Edit variant</AppText>
        <AppText muted>{productName}</AppText>

        {loading ? <AppText muted>Loading…</AppText> : null}
        {notFound ? <AppText muted>Variant not found.</AppText> : null}

        {!loading && !notFound ? (
          <>
            <Card>
              <Stack gap={12}>
                <TextField label="SKU" value={sku} onChangeText={setSku} autoCapitalize="characters" />
                <TextField label="Barcode (optional)" value={barcode} onChangeText={setBarcode} autoCapitalize="none" />
                <TextField label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                <TextField label="Cost price" value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" />
              </Stack>
            </Card>

            <Button
              title={busy ? "Saving…" : "Save changes"}
              disabled={!canSave}
              loading={busy}
              onPress={async () => {
                const s = sku.trim();
                if (!s) return;
                setBusy(true);
                try {
                  await updateVariantOffline({
                    id: variantId,
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
          </>
        ) : null}

        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}

