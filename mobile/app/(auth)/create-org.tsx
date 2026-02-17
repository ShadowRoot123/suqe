import { router } from "expo-router";
import React from "react";
import { Alert, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { useToast } from "@/ui/toast";
import { toErrorMessage } from "@/util/errorMessage";

export default function CreateOrg() {
  const { setSession } = useSession();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [orgName, setOrgName] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");

  const submit = React.useCallback(async () => {
    if (isSubmitting) return;
    if (!orgName.trim() || !ownerName.trim() || !ownerEmail.trim() || !ownerPassword) {
      Alert.alert("Missing fields", "Please fill all required fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const api = apiForSession(null);
      const res = await api.createOrg({
        name: orgName.trim(),
        owner: { name: ownerName.trim(), email: ownerEmail.trim(), password: ownerPassword },
      });

      await setSession({ accessToken: res.access_token, orgId: res.organization.id, email: res.user.email });
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      toast.error(toErrorMessage(e), { title: "Create org failed" });
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, orgName, ownerName, ownerEmail, ownerPassword, setSession, toast]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Create organization</Text>

      <View style={{ gap: 8 }}>
        <TextInput
          placeholder="Organization name"
          value={orgName}
          onChangeText={setOrgName}
          autoCapitalize="words"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <TextInput
          placeholder="Owner name"
          value={ownerName}
          onChangeText={setOwnerName}
          autoCapitalize="words"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <TextInput
          placeholder="Owner email"
          value={ownerEmail}
          onChangeText={setOwnerEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <TextInput
          placeholder="Owner password"
          value={ownerPassword}
          onChangeText={setOwnerPassword}
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
        <Text style={{ color: "white", fontWeight: "600" }}>{isSubmitting ? "Creating…" : "Create"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
