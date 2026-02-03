import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";

export default function Login() {
  const { setSession } = useSession();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [orgId, setOrgId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const submit = React.useCallback(async () => {
    if (isSubmitting) return;
    if (!orgId.trim() || !email.trim() || !password) {
      Alert.alert("Missing fields", "org_id, email, and password are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const api = apiForSession(null);
      const res = await api.login({ org_id: orgId.trim(), email: email.trim(), password });
      await setSession({ accessToken: res.access_token, orgId: orgId.trim(), email: email.trim() });
      router.replace("/(tabs)/sync");
    } catch (e) {
      Alert.alert("Login failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, orgId, email, password, setSession]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Login</Text>

      <View style={{ gap: 8 }}>
        <TextInput
          placeholder="Organization ID (org_id)"
          value={orgId}
          onChangeText={setOrgId}
          autoCapitalize="none"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={isSubmitting}
        style={{
          padding: 14,
          backgroundColor: isSubmitting ? "#444" : "#111",
          borderRadius: 10,
          alignItems: "center",
          marginTop: 8,
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>{isSubmitting ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

