import { Platform } from "react-native";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";
  const normalized = normalizeBaseUrl(raw);

  if (Platform.OS === "android") {
    return normalized
      .replace("http://localhost", "http://10.0.2.2")
      .replace("http://127.0.0.1", "http://10.0.2.2");
  }

  return normalized;
}

