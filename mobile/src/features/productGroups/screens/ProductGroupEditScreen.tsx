import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { generateVariantCombinations } from "@/features/productGroups/lib/variantGeneration";
import { productGroupsGetById } from "@/catalog/productGroups";
import { updateProductGroupOffline } from "@/sync/syncEngine";
import { makeUuid } from "@/util/uuid";
import { AppText, Button, Card, Divider, Screen, Stack, TextField } from "@/ui/components";

type VariantOptionDraft = { id: string; key: string; valuesCsv: string };

export default function ProductGroupEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [name, setName] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<VariantOptionDraft[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const group = await productGroupsGetById(id);
      if (cancelled) return;
      if (!group) {
        setNotFound(true);
        setName("");
        setVariantOptions([]);
        setLoading(false);
        return;
      }
      setName(group.name);
      try {
        const parsed = JSON.parse(group.variant_options_json ?? "{}");
        if (typeof parsed === "object" && parsed) {
          const entries = Object.entries(parsed as Record<string, unknown>);
          setVariantOptions(
            entries.map(([k, v]) => ({
              id: makeUuid(),
              key: k,
              valuesCsv: Array.isArray(v) ? (v as unknown[]).map((x) => String(x)).join(", ") : "",
            }))
          );
        } else {
          setVariantOptions([]);
        }
      } catch {
        setVariantOptions([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canSave = !loading && !notFound && name.trim().length > 0 && !busy;

  const variantCombinations = React.useMemo(() => {
    const inputs = variantOptions.map((o) => ({
      key: o.key,
      values: o.valuesCsv
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    }));
    return generateVariantCombinations(inputs);
  }, [variantOptions]);

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Edit product group</AppText>

        {loading ? <AppText muted>Loading…</AppText> : null}
        {notFound ? <AppText muted>Group not found.</AppText> : null}

        {!loading && !notFound ? (
          <>
            <Card>
              <Stack gap={12}>
                <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
              </Stack>
            </Card>

            <Card>
              <Stack gap={12}>
                <AppText variant="h2">Variant options</AppText>
                <AppText muted>Use comma-separated values. Example: Size = S, M, L.</AppText>

                {variantOptions.length === 0 ? <AppText muted>No variant options yet.</AppText> : null}

                {variantOptions.map((opt, idx) => (
                  <React.Fragment key={opt.id}>
                    {idx > 0 ? <Divider /> : null}
                    <Stack gap={10}>
                      <TextField
                        label="Option name"
                        value={opt.key}
                        onChangeText={(t) => setVariantOptions((prev) => prev.map((p) => (p.id === opt.id ? { ...p, key: t } : p)))}
                      />
                      <TextField
                        label="Values"
                        value={opt.valuesCsv}
                        onChangeText={(t) =>
                          setVariantOptions((prev) => prev.map((p) => (p.id === opt.id ? { ...p, valuesCsv: t } : p)))
                        }
                        placeholder="e.g. Red, Blue"
                      />
                      <Button
                        title="Remove option"
                        variant="ghost"
                        size="sm"
                        onPress={() => setVariantOptions((prev) => prev.filter((p) => p.id !== opt.id))}
                      />
                    </Stack>
                  </React.Fragment>
                ))}

                <Button
                  title="Add option"
                  variant="secondary"
                  onPress={() => setVariantOptions((prev) => [...prev, { id: makeUuid(), key: "", valuesCsv: "" }])}
                />
              </Stack>
            </Card>

            {variantCombinations.length > 0 ? (
              <Card>
                <Stack gap={10}>
                  <AppText variant="h2">Variants preview</AppText>
                  <AppText muted>{variantCombinations.length} combinations</AppText>
                  <Stack gap={6}>
                    {variantCombinations.slice(0, 20).map((combo, i) => (
                      <AppText key={i} variant="caption">
                        {Object.entries(combo)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" • ")}
                      </AppText>
                    ))}
                    {variantCombinations.length > 20 ? <AppText muted>Showing first 20…</AppText> : null}
                  </Stack>
                </Stack>
              </Card>
            ) : null}

            <Button
              title={busy ? "Saving…" : "Save changes"}
              disabled={!canSave}
              loading={busy}
              onPress={async () => {
                const n = name.trim();
                if (!n) return;
                const variant_options = variantOptions.reduce(
                  (acc, option) => {
                    const key = option.key.trim();
                    if (!key) return acc;
                    const values = option.valuesCsv
                      .split(",")
                      .map((v) => v.trim())
                      .filter((v) => v.length > 0);
                    if (values.length > 0) acc[key] = values;
                    return acc;
                  },
                  {} as Record<string, string[]>
                );
                setBusy(true);
                try {
                  await updateProductGroupOffline({ id, name: n, variant_options });
                  router.replace({ pathname: "/(tabs)/product-groups/[id]", params: { id } });
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
