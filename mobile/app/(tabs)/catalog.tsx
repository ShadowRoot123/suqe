import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";

import { categoriesList } from "@/catalog/categories";
import { variantsSearch } from "@/catalog/variants";
import { getLastSyncChanges } from "@/sync/syncEngine";
import { createCategoryOffline, createProductOffline } from "@/sync/syncEngine";

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ barcode?: string }>();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [newProductName, setNewProductName] = React.useState("");
  const [newProductSku, setNewProductSku] = React.useState("");
  const [newProductBarcode, setNewProductBarcode] = React.useState("");
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);
  const [results, setResults] = React.useState<
    { id: string; sku: string; barcode: string | null; product_name: string | null }[]
  >([]);
  const [lastChanges, setLastChanges] = React.useState<{ id: string; entity: string; operation: string; status: string }[]>(
    []
  );

  React.useEffect(() => {
    if (typeof params.barcode === "string" && params.barcode.length > 0) {
      setQuery(params.barcode);
    }
  }, [params.barcode]);

  const refresh = React.useCallback(async () => {
    const rows = await categoriesList();
    setCategories(rows.map((r) => ({ id: r.id, name: r.name })));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const changes = await getLastSyncChanges();
      if (cancelled) return;
      setLastChanges(
        changes.slice(-8).reverse().map((c) => ({
          id: String(c.id),
          entity: String(c.entity ?? "-"),
          operation: String((c.metadata as any)?.operation ?? "-"),
          status: String((c.metadata as any)?.status ?? "-"),
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = debouncedQuery.trim();
      if (!q) {
        if (!cancelled) setResults([]);
        return;
      }
      const hits = await variantsSearch(q, 20);
      if (cancelled) return;
      setResults(
        hits.map((h) => ({
          id: h.id,
          sku: h.sku,
          barcode: h.barcode,
          product_name: h.product_name,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Catalog</Text>

      <View style={{ gap: 8 }}>
        <TextInput
          placeholder="Search SKU / name / barcode"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <Pressable
          onPress={() => router.push("/scanner")}
          style={{ padding: 14, backgroundColor: "#111", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Scan barcode</Text>
        </Pressable>
      </View>

      <View style={{ gap: 8, marginTop: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Products (offline)</Text>
        <View style={{ gap: 8 }}>
          <TextInput
            placeholder="Product name"
            value={newProductName}
            onChangeText={setNewProductName}
            autoCapitalize="words"
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
          />
          <TextInput
            placeholder="SKU"
            value={newProductSku}
            onChangeText={setNewProductSku}
            autoCapitalize="characters"
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
          />
          <TextInput
            placeholder="Barcode (optional)"
            value={newProductBarcode}
            onChangeText={setNewProductBarcode}
            autoCapitalize="none"
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
          />
          <Pressable
            onPress={async () => {
              const name = newProductName.trim();
              const sku = newProductSku.trim();
              const barcode = newProductBarcode.trim();
              if (!name || !sku) return;
              await createProductOffline({ name, sku, barcode: barcode.length ? barcode : undefined });
              setNewProductName("");
              setNewProductSku("");
              setNewProductBarcode("");
              setQuery(sku);
            }}
            style={{ padding: 14, backgroundColor: "#f1f1f1", borderRadius: 10, alignItems: "center" }}
          >
            <Text style={{ fontWeight: "600" }}>Add product (offline)</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Search results</Text>
        {query.trim().length === 0 ? (
          <Text style={{ color: "#666" }}>Type a SKU, barcode, or product name</Text>
        ) : results.length === 0 ? (
          <Text style={{ color: "#666" }}>No results</Text>
        ) : (
          results.map((r) => (
            <Text key={r.id} style={{ color: "#666" }}>
              {r.product_name ?? "-"} · {r.sku} · {r.barcode ?? "-"}
            </Text>
          ))
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Last sync changes</Text>
        {lastChanges.length === 0 ? (
          <Text style={{ color: "#666" }}>No changes yet</Text>
        ) : (
          lastChanges.map((c) => (
            <Text key={c.id} style={{ color: "#666" }}>
              {c.entity} · {c.operation} · {c.status}
            </Text>
          ))
        )}
      </View>

      <View style={{ gap: 8, marginTop: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Categories</Text>
        <View style={{ gap: 8 }}>
          <TextInput
            placeholder="New category name"
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            autoCapitalize="words"
            style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
          />
          <Pressable
            onPress={async () => {
              const name = newCategoryName.trim();
              if (!name) return;
              await createCategoryOffline(name);
              setNewCategoryName("");
              await refresh();
            }}
            style={{ padding: 14, backgroundColor: "#f1f1f1", borderRadius: 10, alignItems: "center" }}
          >
            <Text style={{ fontWeight: "600" }}>Add category (offline)</Text>
          </Pressable>
        </View>

        <View style={{ gap: 6, marginTop: 6 }}>
          <Text style={{ color: "#444" }}>Stored locally: {categories.length}</Text>
          {filtered.slice(0, 20).map((c) => (
            <Text key={c.id} style={{ color: "#666" }}>
              {c.name}
            </Text>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
