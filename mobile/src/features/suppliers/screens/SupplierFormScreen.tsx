import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { ordersExistForSupplier } from "@/purchasing/orders";
import { suppliersGetById } from "@/purchasing/suppliers";
import { createSupplierOffline, deleteSupplierOffline, updateSupplierOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";
import { useToast } from "@/ui/toast";

export default function SupplierFormScreen({ mode }: { mode: "create" | "edit" }) {
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const isEdit = mode === "edit";

  const [loading, setLoading] = React.useState(isEdit);
  const [notFound, setNotFound] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [hasOrders, setHasOrders] = React.useState(false);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");

  React.useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      const [supplier, ordered] = await Promise.all([suppliersGetById(id), ordersExistForSupplier(id)]);
      if (cancelled) return;
      if (!supplier) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setName(supplier.name);
      setPhone(supplier.phone ?? "");
      setEmail(supplier.email ?? "");
      setAddress(supplier.address ?? "");
      setHasOrders(ordered);
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
        await updateSupplierOffline({ id, name: trimmed, phone, email, address });
        toast.success(`${trimmed} saved.`, { title: "Queued" });
      } else {
        await createSupplierOffline({ name: trimmed, phone, email, address });
        toast.success(`${trimmed} added.`, { title: "Queued" });
      }
      router.replace("/(tabs)/purchasing/suppliers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the supplier.", { title: "Save failed" });
    } finally {
      setBusy(false);
    }
  }, [address, email, id, isEdit, name, phone, toast]);

  const remove = React.useCallback(async () => {
    setBusy(true);
    try {
      await deleteSupplierOffline(id);
      toast.success("Supplier removed.", { title: "Queued" });
      router.replace("/(tabs)/purchasing/suppliers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the supplier.", { title: "Delete failed" });
    } finally {
      setBusy(false);
    }
  }, [id, toast]);

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">{isEdit ? "Edit supplier" : "New supplier"}</AppText>

        {loading ? <AppText muted>Loading…</AppText> : null}
        {notFound ? <AppText muted>Supplier not found.</AppText> : null}

        {!loading && !notFound ? (
          <>
            <Card>
              <Stack gap={12}>
                <TextField
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  placeholder="e.g. Acme Supply"
                />
                <TextField
                  label="Phone (optional)"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="e.g. +212 600 000000"
                />
                <TextField
                  label="Email (optional)"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="e.g. sales@acme.test"
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
              title={busy ? "Saving…" : isEdit ? "Save changes" : "Add supplier"}
              disabled={!canSave}
              loading={busy}
              onPress={save}
            />

            {isEdit ? (
              hasOrders ? (
                <AppText muted>
                  This supplier has purchase orders, so it cannot be deleted. Its history is what those orders are
                  attached to.
                </AppText>
              ) : (
                <Button title="Delete supplier" variant="secondary" disabled={busy} onPress={remove} />
              )
            ) : null}
          </>
        ) : null}

        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}
