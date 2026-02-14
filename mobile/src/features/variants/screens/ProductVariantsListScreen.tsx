import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Alert, RefreshControl, View } from "react-native";

import { productsGetById } from "@/catalog/products";
import { variantsListByProduct, type VariantRow } from "@/catalog/variants";
import { deleteVariantOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack } from "@/ui/components";
import { theme } from "@/ui/theme";

export default function ProductVariantsListScreen() {
  const params = useLocalSearchParams<{ id?: string; productId?: string }>();
  const groupId = typeof params.id === "string" ? params.id : "";
  const productId = typeof params.productId === "string" ? params.productId : "";

  const [refreshing, setRefreshing] = React.useState(false);
  const [productName, setProductName] = React.useState<string>("Product");
  const [variants, setVariants] = React.useState<VariantRow[]>([]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [p, vs] = await Promise.all([productsGetById(productId), variantsListByProduct(productId)]);
      setProductName(p?.name ?? "Product");
      setVariants(vs);
    } finally {
      setRefreshing(false);
    }
  }, [productId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="h1" numberOfLines={1}>
              Variants
            </AppText>
            <AppText muted numberOfLines={1}>
              {productName}
            </AppText>
          </View>
          <Button
            title="Add"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/product-groups/[id]/products/[productId]/variants/create",
                params: { id: groupId, productId },
              })
            }
          />
        </View>

        <Card>
          <Stack gap={10}>
            {variants.length === 0 ? <AppText muted>No variants yet.</AppText> : null}
            {variants.map((v) => (
              <View
                key={v.id}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText numberOfLines={1}>{v.sku}</AppText>
                  <AppText muted numberOfLines={1}>
                    {v.barcode ? `Barcode: ${v.barcode}` : "No barcode"} · Price {v.price}
                  </AppText>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button
                    title="Edit"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/product-groups/[id]/products/[productId]/variants/[variantId]",
                        params: { id: groupId, productId, variantId: v.id },
                      })
                    }
                  />
                  <Button
                    title="Delete"
                    size="sm"
                    variant="secondary"
                    style={{ backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger }}
                    onPress={() => {
                      Alert.alert("Delete variant", "Delete this variant?", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: async () => {
                            await deleteVariantOffline(v.id);
                            await refresh();
                          },
                        },
                      ]);
                    }}
                  />
                </View>
              </View>
            ))}
          </Stack>
        </Card>

        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}
