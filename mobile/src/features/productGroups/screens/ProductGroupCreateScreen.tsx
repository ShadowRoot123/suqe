import { router } from "expo-router";
import React from "react";

import { createProductGroupOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";

export default function ProductGroupCreateScreen() {
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");

  const canSave = name.trim().length > 0 && !busy;

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Create product group</AppText>

        <Card>
          <Stack gap={12}>
            <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="e.g. Soft drinks" />
          </Stack>
        </Card>

        <Button
          title={busy ? "Saving…" : "Save"}
          disabled={!canSave}
          loading={busy}
          onPress={async () => {
            const n = name.trim();
            if (!n) return;
            setBusy(true);
            try {
              const id = await createProductGroupOffline(n);
              router.replace({ pathname: "/(tabs)/product-groups/[id]", params: { id } });
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

