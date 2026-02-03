import * as SecureStore from "expo-secure-store";
import React from "react";
import { Platform } from "react-native";

export type Session = {
  accessToken: string;
  orgId: string;
  email?: string;
};

type SessionContextValue = {
  session: Session | null;
  isHydrating: boolean;
  setSession: (next: Session) => Promise<void>;
  clearSession: () => Promise<void>;
};

const SessionContext = React.createContext<SessionContextValue | undefined>(undefined);

const STORAGE_KEY = "myshop.session.v1";

async function readStoredSession(): Promise<Session | null> {
  const raw =
    Platform.OS === "web"
      ? (() => {
          try {
            return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
          } catch {
            return null;
          }
        })()
      : await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as any).accessToken !== "string" ||
    typeof (parsed as any).orgId !== "string"
  ) {
    return null;
  }
  return parsed as Session;
}

async function writeStoredSession(next: Session | null): Promise<void> {
  if (!next) {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(STORAGE_KEY);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    return;
  }
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
}

export function SessionProvider(props: { children: React.ReactNode }) {
  const [session, setSessionState] = React.useState<Session | null>(null);
  const [isHydrating, setIsHydrating] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await readStoredSession();
        if (!cancelled) setSessionState(stored);
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = React.useCallback(async (next: Session) => {
    setSessionState(next);
    await writeStoredSession(next);
  }, []);

  const clearSession = React.useCallback(async () => {
    setSessionState(null);
    await writeStoredSession(null);
  }, []);

  const value: SessionContextValue = React.useMemo(
    () => ({ session, isHydrating, setSession, clearSession }),
    [session, isHydrating, setSession, clearSession]
  );

  return <SessionContext.Provider value={value}>{props.children}</SessionContext.Provider>;
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
