import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { locationsGetById } from "@/inventory/locations";
import {
  createLocationOffline,
  deleteLocationOffline,
  updateLocationOffline,
  type LocationType,
} from "@/sync/syncEngine";
import { AppText, Button, Card, Notice, Screen, SelectField, Stack, TextField } from "@/ui/components";
import { useToast } from "@/ui/toast";

const TYPE_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "shop", label: "Shop" },
  { value: "warehouse", label: "Warehouse" },
];

export default function LocationFormScreen({ mode }: { mode: "create" | "edit" }) {
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const isEdit = mode === "edit";

  const [loading, setLoading] = React.useState(isEdit);
  const [notFound, setNotFound] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<LocationType>("shop");
  const [address, setAddress] = React.useState("");

  React.useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      const location = await locationsGetById(id);
      if (cancelled) return;
      if (!location) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setName(location.name);
      setType(location.type === "warehouse" ? "warehouse" : "shop");
      setAddress(location.address ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  const canSave = !loading && !notFound && name.trim().length > 0 && !busy;

  const save = React.useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (isEdit) {
        await updateLocationOffline({ id, name: trimmed, type, address });
        toast.success(`${trimmed} saved.`, { title: "Queued" });
      } else {
        await createLocationOffline({ name: trimmed, type, address });
        toast.success(`${trimmed} added.`, { title: "Queued" });
      }
      router.replace("/(tabs)/inventory/locations");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the location.", { title: "Save failed" });
    } finally {
      setBusy(false);
    }
  }, [address, id, isEdit, name, toast, type]);

  const remove = React.useCallback(async () => {
    setBusy(true);
    try {
      await deleteLocationOffline(id);
      toast.info("Delete queued. Locations with stock history are kept by the server.", { title: "Queued" });
      router.replace("/(tabs)/inventory/locations");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the location.", { title: "Delete failed" });
    } finally {
      setBusy(false);
    }
  }, [id, toast]);

  return (
    <Screen scroll>
      <Stack gap={16}>
        {loading ? <AppText muted>Loading…</AppText> : null}
        {notFound ? <AppText muted>Location not found.</AppText> : null}

        {!loading && !notFound ? (
          <>
            <Card>
              <Stack gap={12}>
                <TextField
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  placeholder="e.g. Main Shop"
                />
                <SelectField
                  label="Type"
                  value={type}
                  onChange={(v) => setType(v === "warehouse" ? "warehouse" : "shop")}
                  options={TYPE_OPTIONS}
                />
                <TextField
                  label="Address (optional)"
                  value={address}
                  onChangeText={setAddress}
                  placeholder="e.g. 12 Dock Road"
                />
              </Stack>
            </Card>

            <Button
              title={busy ? "Saving…" : isEdit ? "Save changes" : "Add location"}
              size="lg"
              disabled={!canSave}
              loading={busy}
              onPress={save}
            />

            {isEdit ? (
              <Card title="Delete this location">
                <Stack gap={12}>
                  <AppText muted>
                    Deleting removes {name || "this location"} from the location picker. Stock history stays — the
                    server keeps any location that has movements, so this may be refused.
                  </AppText>
                  {confirmingDelete ? (
                    <Stack gap={8}>
                      <Notice tone="danger" title="This cannot be undone." />
                      <Button title={`Delete ${name || "location"}`} variant="danger" disabled={busy} onPress={remove} />
                      <Button title="Keep this location" variant="link" onPress={() => setConfirmingDelete(false)} />
                    </Stack>
                  ) : (
                    <Button title="Delete location" variant="danger" disabled={busy} onPress={() => setConfirmingDelete(true)} />
                  )}
                </Stack>
              </Card>
            ) : null}
          </>
        ) : null}

        <Button title="Cancel" variant="link" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}
