import * as Application from "expo-application";
import { Platform } from "react-native";

import { kvGet, kvSet } from "@/db/kv";

const DEVICE_ID_KEY = "device_id";

function fallbackId(): string {
  return `rn-${Platform.OS}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function getDeviceId(): Promise<string> {
  const existing = await kvGet(DEVICE_ID_KEY);
  if (existing) return existing;

  let next: string | null = null;
  if (Platform.OS === "android") next = Application.getAndroidId?.() ?? null;
  if (Platform.OS === "ios") next = (await Application.getIosIdForVendorAsync()) ?? null;

  const id = next ?? fallbackId();
  await kvSet(DEVICE_ID_KEY, id);
  return id;
}
