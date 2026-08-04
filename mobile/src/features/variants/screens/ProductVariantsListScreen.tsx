import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Alert, RefreshControl, View } from "react-native";

import { canIssueCommand } from "@/auth/commandPermissions";
import { useSession } from "@/auth/session";
import { productGroupsGetById } from "@/catalog/productGroups";
import { productsGetById } from "@/catalog/products";
import { variantsListByProduct, type VariantRow } from "@/catalog/variants";
import { planVariantGeneration } from "@/features/productGroups/lib/variantPlanning";
import { createVariantOffline, deleteVariantOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";
import { theme } from "@/ui/theme";

function parseVariantOptions(json: string | undefined): Record<string, string[]> {
  try {
    const parsed = JSON.parse(json ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.map((x) => String(x));
    }
    return out;
  } catch {
    return {};
  }
}

export default function ProductVariantsListScreen() {
  const params = useLocalSearchParams<{ id?: string; productId?: string }>();
  const groupId = typeof params.id === "string" ? params.id : "";
  const productId = typeof params.productId === "string" ? params.productId : "";
  /**
   * The route is gated on `catalog.read` — listing variants is a read. Creating or deleting one
   * queues a `variant` command, which the server refuses without `catalog.write`, so a reader is
   * shown the list and none of the buttons that would only produce rejected commands. Asked of
   * the command map rather than by naming the key, so this cannot drift from what the server
   * checks.
   */
  const { session } = useSession();
  const canWrite = canIssueCommand(session, "variant", "create");

  const [refreshing, setRefreshing] = React.useState(false);
  const [productName, setProductName] = React.useState<string>("Product");
  const [variants, setVariants] = React.useState<VariantRow[]>([]);
  const [variantOptions, setVariantOptions] = React.useState<Record<string, string[]>>({});
  const [basePrice, setBasePrice] = React.useState("0");
  const [generating, setGenerating] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [p, vs, group] = await Promise.all([
        productsGetById(productId),
        variantsListByProduct(productId),
        groupId ? productGroupsGetById(groupId) : Promise.resolve(null),
      ]);
      setProductName(p?.name ?? "Product");
      setVariants(vs);
      setVariantOptions(parseVariantOptions(group?.variant_options_json));
    } finally {
      setRefreshing(false);
    }
  }, [productId, groupId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const plannedVariants = React.useMemo(
    () =>
      planVariantGeneration({
        productName,
        variantOptions,
        existing: variants.map((v) => ({ sku: v.sku, attrs_json: v.attrs_json })),
      }),
    [productName, variantOptions, variants]
  );

  const parsedBasePrice = Number(basePrice.trim());
  const basePriceValid = basePrice.trim().length > 0 && Number.isFinite(parsedBasePrice) && parsedBasePrice >= 0;
  const canGenerate = plannedVariants.length > 0 && basePriceValid && !generating;

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
          {canWrite ? (
            <Button
              title="Add"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/product-groups/[id]/products/[productId]/variants/create",
                  params: { id: groupId, productId },
                })
              }
            />
          ) : null}
        </View>

        {canWrite && Object.keys(variantOptions).length > 0 ? (
          <Card>
            <Stack gap={10}>
              <AppText variant="h2">Generate from group options</AppText>
              {plannedVariants.length === 0 ? (
                <AppText muted>All combinations from the group options already exist.</AppText>
              ) : (
                <>
                  <AppText muted>
                    {plannedVariants.length} new variant{plannedVariants.length === 1 ? "" : "s"} will be created (existing
                    combinations are skipped).
                  </AppText>
                  <Stack gap={6}>
                    {plannedVariants.slice(0, 10).map((pv) => (
                      <AppText key={pv.sku} variant="caption">
                        {pv.sku} —{" "}
                        {Object.entries(pv.attrs)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" • ")}
                      </AppText>
                    ))}
                    {plannedVariants.length > 10 ? <AppText muted>Showing first 10…</AppText> : null}
                  </Stack>
                  <TextField
                    label="Base price for generated variants"
                    value={basePrice}
                    onChangeText={setBasePrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                  {!basePriceValid ? <AppText muted>Enter a valid non-negative price.</AppText> : null}
                  <Button
                    title={generating ? "Generating…" : `Generate ${plannedVariants.length} variant${plannedVariants.length === 1 ? "" : "s"}`}
                    disabled={!canGenerate}
                    loading={generating}
                    onPress={async () => {
                      if (!canGenerate) return;
                      setGenerating(true);
                      try {
                        for (const pv of plannedVariants) {
                          await createVariantOffline({
                            product_id: productId,
                            sku: pv.sku,
                            attrs: pv.attrs,
                            price: String(parsedBasePrice),
                          });
                        }
                        await refresh();
                      } finally {
                        setGenerating(false);
                      }
                    }}
                  />
                </>
              )}
            </Stack>
          </Card>
        ) : null}

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
                  {canWrite ? (
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
                  ) : null}
                  {canWrite ? (
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
                  ) : null}
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
