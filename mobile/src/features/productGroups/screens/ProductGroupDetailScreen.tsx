import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Alert, Pressable, View } from "react-native";

import { productGroupMembershipsListByGroup, type ProductGroupMembershipRow } from "@/catalog/productGroupMemberships";
import { productGroupsGetById } from "@/catalog/productGroups";
import { productsList, type ProductRow } from "@/catalog/products";
import { addProductToGroupOffline, deleteProductGroupOffline, removeProductFromGroupOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, SelectField, Stack } from "@/ui/components";
import { theme } from "@/ui/theme";

export default function ProductGroupDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const groupId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [groupName, setGroupName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [allProducts, setAllProducts] = React.useState<ProductRow[]>([]);
  const [memberships, setMemberships] = React.useState<ProductGroupMembershipRow[]>([]);
  const [productToAdd, setProductToAdd] = React.useState<string>("");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const [group, products, ms] = await Promise.all([
        productGroupsGetById(groupId),
        productsList(),
        productGroupMembershipsListByGroup(groupId),
      ]);
      setAllProducts(products);
      setMemberships(ms);
      if (!group) {
        setNotFound(true);
        setGroupName("");
        return;
      }
      setGroupName(group.name);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const membersByProductId = React.useMemo(() => {
    const map = new Map<string, ProductGroupMembershipRow>();
    for (const m of memberships) map.set(m.product_id, m);
    return map;
  }, [memberships]);

  const availableProducts = React.useMemo(
    () => allProducts.filter((p) => !membersByProductId.has(p.id)).slice(0, 200),
    [allProducts, membersByProductId]
  );

  const memberProducts = React.useMemo(() => {
    const byId = new Map(allProducts.map((p) => [p.id, p]));
    return memberships
      .map((m) => byId.get(m.product_id))
      .filter(Boolean) as ProductRow[];
  }, [allProducts, memberships]);

  if (loading) {
    return (
      <Screen scroll>
        <Stack gap={12}>
          <AppText variant="h1">Product group</AppText>
          <AppText muted>Loading…</AppText>
        </Stack>
      </Screen>
    );
  }

  if (notFound) {
    return (
      <Screen scroll>
        <Stack gap={12}>
          <AppText variant="h1">Product group</AppText>
          <AppText muted>Group not found.</AppText>
          <Button title="Back" variant="ghost" onPress={() => router.back()} />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="h1">{groupName}</AppText>
          <Button title="Edit" variant="ghost" onPress={() => router.push({ pathname: "/(tabs)/product-groups/[id]/edit", params: { id: groupId } })} />
        </View>

        <Card>
          <Stack gap={12}>
            <AppText variant="h2">Add product</AppText>
            <SelectField
              label="Product"
              value={productToAdd}
              onChange={setProductToAdd}
              options={[
                { value: "", label: "(Select)" },
                ...availableProducts.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Button
              title="Add to group"
              disabled={!productToAdd || busy}
              loading={busy}
              onPress={async () => {
                if (!productToAdd) return;
                setBusy(true);
                try {
                  await addProductToGroupOffline({ product_group_id: groupId, product_id: productToAdd });
                  setProductToAdd("");
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap={12}>
            <AppText variant="h2">Products in group</AppText>
            {memberProducts.length === 0 ? <AppText muted>No products yet.</AppText> : null}
            {memberProducts.map((p) => {
              const membership = membersByProductId.get(p.id);
              return (
                <View
                  key={p.id}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText numberOfLines={1}>{p.name}</AppText>
                    <AppText muted numberOfLines={1}>
                      {p.status}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/(tabs)/product-groups/[id]/products/[productId]/variants",
                          params: { id: groupId, productId: p.id },
                        })
                      }
                      style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <AppText style={{ fontWeight: "800" }}>Variants</AppText>
                    </Pressable>
                    <Pressable
                      disabled={!membership || busy}
                      onPress={() => {
                        if (!membership) return;
                        Alert.alert("Remove product", "Remove this product from the group?", [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: async () => {
                              setBusy(true);
                              try {
                                await removeProductFromGroupOffline(membership.id);
                                await refresh();
                              } finally {
                                setBusy(false);
                              }
                            },
                          },
                        ]);
                      }}
                      style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <AppText style={{ fontWeight: "800", color: "#c62828" }}>Remove</AppText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </Stack>
        </Card>

        <Button
          title="Delete group"
          variant="secondary"
          disabled={busy}
          loading={busy}
          style={{ backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger }}
          onPress={() => {
            Alert.alert("Delete group", "This will delete the group and its memberships.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  setBusy(true);
                  try {
                    await deleteProductGroupOffline(groupId);
                    router.replace("/(tabs)/product-groups");
                  } finally {
                    setBusy(false);
                  }
                },
              },
            ]);
          }}
        />
      </Stack>
    </Screen>
  );
}
