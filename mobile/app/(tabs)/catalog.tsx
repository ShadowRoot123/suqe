import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, SafeAreaView, Text, TextInput, View } from "react-native";

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ barcode?: string }>();
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (typeof params.barcode === "string" && params.barcode.length > 0) {
      setQuery(params.barcode);
    }
  }, [params.barcode]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Catalog</Text>

      <View style={{ gap: 8 }}>
        <TextInput
          placeholder="Search SKU / name / barcode"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}
        />
        <Pressable
          onPress={() => router.push("/scanner")}
          style={{ padding: 14, backgroundColor: "#111", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Scan barcode</Text>
        </Pressable>
      </View>

      <View style={{ gap: 6, marginTop: 8 }}>
        <Text style={{ color: "#444" }}>Offline catalog search is scaffolded.</Text>
        <Text style={{ color: "#444" }}>Wire this to local DB + sync as backend entities land.</Text>
      </View>
    </SafeAreaView>
  );
}

