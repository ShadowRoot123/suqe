import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { RequirePermissions } from "@/auth/RequirePermissions";
import { useSession } from "@/auth/session";
import { getApiBaseUrl } from "@/config/apiBaseUrl";
import { useSyncBadges } from "@/features/sync";
import { getLastSyncChanges, getSyncCursor, pullAcks, pushPending, syncNow } from "@/sync/syncEngine";
import { useToast } from "@/ui/toast";
import { toErrorMessage } from "@/util/errorMessage";

export default function SyncScreen() {
  const { session } = useSession();
  const toast = useToast();
  const { pendingCount, refresh: refreshBadges } = useSyncBadges();
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [healthOk, setHealthOk] = React.useState<boolean | null>(null);
  const [lastChanges, setLastChanges] = React.useState<any[]>([]);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [nextCursor, nextChanges] = await Promise.all([getSyncCursor(), getLastSyncChanges(), refreshBadges()]);
    setCursor(nextCursor);
    setLastChanges(nextChanges);
  }, [refreshBadges]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const checkHealth = React.useCallback(async () => {
    try {
      const api = apiForSession(null);
      await api.health();
      setHealthOk(true);
    } catch {
      setHealthOk(false);
    }
  }, []);

  React.useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const doPush = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await pushPending(session);
      await refresh();
      toast.success(`Pushed ${res.pushed} command(s).`, { title: "Push complete" });
    } catch (e) {
      toast.error(toErrorMessage(e), { title: "Push failed" });
    } finally {
      setBusy(false);
    }
  }, [session, busy, refresh, toast]);

  const doPull = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await pullAcks(session);
      await refresh();
      toast.success(`Acks: ${res.acks}. Cursor updated.`, { title: "Pull complete" });
    } catch (e) {
      toast.error(toErrorMessage(e), { title: "Pull failed" });
    } finally {
      setBusy(false);
    }
  }, [session, busy, refresh, toast]);

  const doSyncNow = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await syncNow(session);
      await refresh();
      toast.success(`Push: ${res.push.pushed} command(s). Pull acks: ${res.pull.acks}.`, { title: "Sync complete" });
    } catch (e) {
      toast.error(toErrorMessage(e), { title: "Sync failed" });
    } finally {
      setBusy(false);
    }
  }, [session, busy, refresh, toast]);

  return (
    <RequirePermissions permissions={["org.manage"]}>
      <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 18, fontWeight: "700" }}>Sync</Text>
          <Text style={{ color: "#444" }}>API: {getApiBaseUrl()}</Text>
          <Text style={{ color: "#444" }}>Health: {healthOk === null ? "…" : healthOk ? "OK" : "FAIL"}</Text>
          <Text style={{ color: "#444" }}>Pending outbox: {pendingCount}</Text>
          <Text style={{ color: "#444" }}>Cursor: {cursor ?? "(none)"}</Text>
          <Text style={{ color: "#444" }}>Last changes: {lastChanges.length}</Text>
          {lastChanges.slice(-3).map((c) => (
            <Text key={String(c.id)} style={{ color: "#666" }}>
              {String(c.action)} · {String(c.entity ?? "-")} · {String(c.metadata?.idempotency_key ?? "-")}
            </Text>
          ))}
        </View>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Pressable
          onPress={doSyncNow}
          disabled={!session || busy}
          style={{
            padding: 14,
            backgroundColor: !session || busy ? "#444" : "#111",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>{busy ? "Working…" : "Sync now"}</Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={doPush}
            disabled={!session || busy}
            style={{
              flex: 1,
              padding: 14,
              backgroundColor: !session || busy ? "#ddd" : "#f1f1f1",
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "600" }}>Push</Text>
          </Pressable>
          <Pressable
            onPress={doPull}
            disabled={!session || busy}
            style={{
              flex: 1,
              padding: 14,
              backgroundColor: !session || busy ? "#ddd" : "#f1f1f1",
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "600" }}>Pull</Text>
          </Pressable>
        </View>
      </View>
      </SafeAreaView>
    </RequirePermissions>
  );
}
