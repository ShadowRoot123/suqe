import React from "react";
import { Alert, Pressable, SafeAreaView, Text, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { getApiBaseUrl } from "@/config/apiBaseUrl";
import { getSyncCursor, pullAcks, pushPending, syncNow } from "@/sync/syncEngine";
import { outboxCount } from "@/sync/outbox";

export default function SyncScreen() {
  const { session } = useSession();
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [queueSize, setQueueSize] = React.useState<number>(0);
  const [healthOk, setHealthOk] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setQueueSize(await outboxCount("pending"));
    setCursor(await getSyncCursor());
  }, []);

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
      Alert.alert("Push complete", `Pushed ${res.pushed} command(s).`);
    } catch (e) {
      Alert.alert("Push failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [session, busy, refresh]);

  const doPull = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await pullAcks(session);
      await refresh();
      Alert.alert("Pull complete", `Acks: ${res.acks}. Cursor updated.`);
    } catch (e) {
      Alert.alert("Pull failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [session, busy, refresh]);

  const doSyncNow = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await syncNow(session);
      await refresh();
      Alert.alert(
        "Sync complete",
        `Push: ${res.push.pushed} command(s). Pull acks: ${res.pull.acks}.`
      );
    } catch (e) {
      Alert.alert("Sync failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [session, busy, refresh]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Sync</Text>
        <Text style={{ color: "#444" }}>API: {getApiBaseUrl()}</Text>
        <Text style={{ color: "#444" }}>Health: {healthOk === null ? "…" : healthOk ? "OK" : "FAIL"}</Text>
        <Text style={{ color: "#444" }}>Pending outbox: {queueSize}</Text>
        <Text style={{ color: "#444" }}>Cursor: {cursor ?? "(none)"}</Text>
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
  );
}

