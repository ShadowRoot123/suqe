import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { getApiBaseUrl } from "@/config/apiBaseUrl";
import { useToast } from "@/ui/toast";
import { toErrorMessage } from "@/util/errorMessage";

export default function SettingsScreen() {
  const { session, clearSession } = useSession();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const logout = React.useCallback(async () => {
    if (!session) return;
    if (busy) return;
    setBusy(true);
    try {
      const api = apiForSession(session);
      await api.logout();
    } catch {
      // best-effort
    } finally {
      await clearSession();
      setBusy(false);
    }
  }, [session, busy, clearSession]);

  const health = React.useCallback(async () => {
    try {
      const api = apiForSession(null);
      await api.health();
      toast.success("OK", { title: "Health" });
    } catch (e) {
      toast.error(toErrorMessage(e), { title: "Health" });
    }
  }, [toast]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Settings</Text>

      <View style={{ gap: 6 }}>
        <Text style={{ color: "#444" }}>API: {getApiBaseUrl()}</Text>
        <Text style={{ color: "#444" }}>Org: {session?.orgId ?? "(none)"}</Text>
        <Text style={{ color: "#444" }}>User: {session?.email ?? "(none)"}</Text>
      </View>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Pressable
          onPress={health}
          style={{ padding: 14, backgroundColor: "#f1f1f1", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ fontWeight: "600" }}>Check API health</Text>
        </Pressable>

        <Pressable
          onPress={logout}
          disabled={!session || busy}
          style={{
            padding: 14,
            backgroundColor: !session || busy ? "#ddd" : "#111",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: !session || busy ? "#444" : "white", fontWeight: "600" }}>
            {busy ? "Signing out…" : "Logout"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
