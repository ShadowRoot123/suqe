import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { categoriesList } from "@/catalog/categories";
import { productsGetById } from "@/catalog/products";
import { updateProductOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, SelectField, Stack, TextField } from "@/ui/components";

import { type ProductStatus } from "../types";

export default function ProductEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);

  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<ProductStatus>("active");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const [product, cs] = await Promise.all([productsGetById(id), categoriesList()]);
      if (cancelled) return;
      setCategories(cs.map((c) => ({ id: c.id, name: c.name })));
      if (!product) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setName(product.name);
      setStatus((product.status as ProductStatus) === "inactive" ? "inactive" : "active");
      setCategoryId(product.category_id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canSave = !loading && !notFound && name.trim().length > 0 && !busy;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Edit product</AppText>

        {loading ? <AppText muted>Loading…</AppText> : null}
        {notFound ? <AppText muted>Product not found.</AppText> : null}

        {!loading && !notFound ? (
          <>
            <Card>
              <Stack gap={12}>
                <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
                <SelectField
                  label="Status"
                  value={status}
                  onChange={(v) => setStatus(v)}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
                <SelectField
                  label="Category"
                  value={categoryId ?? ""}
                  onChange={(v) => setCategoryId(v === "" ? null : v)}
                  options={[
                    { value: "", label: "(None)" },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Stack>
            </Card>

            <Button
              title={busy ? "Saving…" : "Save changes"}
              disabled={!canSave}
              loading={busy}
              onPress={async () => {
                const n = name.trim();
                if (!n) return;
                setBusy(true);
                try {
                  await updateProductOffline({ id, name: n, category_id: categoryId, status });
                  router.back();
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

