import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { productGroupsGetById } from "@/catalog/productGroups";
import { updateProductGroupOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";

export default function ProductGroupEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [name, setName] = React.useState("");

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
        setLoading(false);
        return;
      }
      setName(group.name);
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

            <Button
              title={busy ? "Saving…" : "Save changes"}
              disabled={!canSave}
              loading={busy}
              onPress={async () => {
                const n = name.trim();
                if (!n) return;
                setBusy(true);
                try {
                  await updateProductGroupOffline({ id, name: n });
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

