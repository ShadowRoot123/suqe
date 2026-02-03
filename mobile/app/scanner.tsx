import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

export default function Scanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = React.useState(false);

  if (!permission) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Checking camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>Camera permission</Text>
        <Text style={{ color: "#444" }}>Allow camera access to scan barcodes.</Text>
        <Pressable
          onPress={() => requestPermission()}
          style={{ padding: 14, backgroundColor: "#111", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Grant permission</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={{ padding: 14, backgroundColor: "#f1f1f1", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ fontWeight: "600" }}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        onBarcodeScanned={({ data }) => {
          if (scanned) return;
          setScanned(true);
          router.replace({ pathname: "/(tabs)/catalog", params: { barcode: data } });
        }}
      />
      <SafeAreaView style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ padding: 14, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Close</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

