import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { ApiError } from "@/api/errors";
import { useSession } from "@/auth/session";
import { bootstrapCatalogIfNeeded } from "@/catalog/bootstrapCatalog";

type OrganizationChoice = { id: string; name: string };

export default function Login() {
  const { setSession } = useSession();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [orgChoices, setOrgChoices] = React.useState<OrganizationChoice[] | null>(null);
  const [selectedOrgId, setSelectedOrgId] = React.useState<string | null>(null);

  const submit = React.useCallback(async () => {
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Email and password are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const api = apiForSession(null);
      const res = await api.login({
        org_id: selectedOrgId ?? undefined,
        email: email.trim(),
        password,
      });
      setOrgChoices(null);
      setSelectedOrgId(null);
      const nextSession = { accessToken: res.access_token, orgId: res.org_id, email: res.email };
      await setSession(nextSession);
      try {
        await bootstrapCatalogIfNeeded(nextSession);
      } catch {}
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.code === "multiple_organizations") {
        const raw = (e.details as any)?.organizations;
        if (Array.isArray(raw) && raw.every((o) => o && typeof o.id === "string" && typeof o.name === "string")) {
          setOrgChoices(raw as OrganizationChoice[]);
          Alert.alert("Select organization", "Choose which organization you want to sign in to.");
        } else {
          Alert.alert("Login failed", "Multiple organizations found for this email. Please contact support.");
        }
      } else {
        Alert.alert("Login failed", e instanceof Error ? e.message : "Unknown error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, selectedOrgId, email, password, setSession]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Login</Text>

      <View style={{ gap: 8 }}>
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

      {orgChoices ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: "700" }}>Organization</Text>
          {orgChoices.map((org) => (
            <Pressable
              key={org.id}
              onPress={() => {
                setSelectedOrgId(org.id);
                void submit();
              }}
              disabled={isSubmitting}
              style={{
                padding: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selectedOrgId === org.id ? "#111" : "#ddd",
                backgroundColor: selectedOrgId === org.id ? "#f1f1f1" : "white",
              }}
            >
              <Text style={{ fontWeight: "700" }}>{org.name}</Text>
              <Text style={{ color: "#666", marginTop: 4 }}>{org.id}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
