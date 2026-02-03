import React from "react";
import { SafeAreaView, Text } from "react-native";

import { SessionProvider } from "@/auth/session";
import { migrate } from "@/db/db";

export function AppProviders(props: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrate();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to initialize");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Init failed</Text>
        <Text selectable>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading…</Text>
      </SafeAreaView>
    );
  }

  return <SessionProvider>{props.children}</SessionProvider>;
}

