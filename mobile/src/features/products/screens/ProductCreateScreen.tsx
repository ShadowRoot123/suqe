import { router } from "expo-router";
import React from "react";

import { categoriesList } from "@/catalog/categories";
import { createProductOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, SelectField, Stack, TextField } from "@/ui/components";

import { type ProductStatus } from "../types";

export default function ProductCreateScreen() {
  const [busy, setBusy] = React.useState(false);
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);

  const [name, setName] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [status, setStatus] = React.useState<ProductStatus>("active");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const cs = await categoriesList();
      if (cancelled) return;
      setCategories(cs.map((c) => ({ id: c.id, name: c.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSave = name.trim().length > 0 && sku.trim().length > 0 && !busy;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Create product</AppText>

        <Card>
          <Stack gap={12}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="e.g. Cola 330ml"
            />
            <TextField
              label="SKU"
              value={sku}
              onChangeText={setSku}
              autoCapitalize="characters"
              placeholder="e.g. COLA-330"
            />
            <TextField
              label="Barcode (optional)"
              value={barcode}
              onChangeText={setBarcode}
              autoCapitalize="none"
              placeholder="e.g. 0123456789"
            />

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
          title={busy ? "Saving…" : "Save"}
          disabled={!canSave}
          loading={busy}
          onPress={async () => {
            const n = name.trim();
            const s = sku.trim();
            const b = barcode.trim();
            if (!n || !s) return;
            setBusy(true);
            try {
              await createProductOffline({
                name: n,
                sku: s,
                barcode: b.length ? b : undefined,
                category_id: categoryId,
                status,
              });
              router.replace("/(tabs)/products");
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

