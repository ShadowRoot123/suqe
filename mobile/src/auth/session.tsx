import * as SecureStore from "expo-secure-store";
import React from "react";
import { Platform } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { bootstrapCatalogIfNeeded } from "@/catalog/bootstrapCatalog";
import { bootstrapInventoryIfNeeded } from "@/inventory/bootstrapInventory";
import { bootstrapPurchasingIfNeeded } from "@/purchasing/bootstrapPurchasing";
import { onUnauthorized } from "@/auth/unauthorized";
import { SESSION_STORAGE_KEY } from "@/shared/constants";

export type Session = {
  accessToken: string;
  orgId: string;
  email?: string;
  userId?: string;
  roleIds?: string[];
  roleNames?: string[];
  permissions?: string[];
};

type SessionContextValue = {
  session: Session | null;
  isHydrating: boolean;
  isIdentityLoading: boolean;
  setSession: (next: Session) => Promise<void>;
  clearSession: () => Promise<void>;
  refreshIdentity: () => Promise<void>;
};

const SessionContext = React.createContext<SessionContextValue | undefined>(undefined);

async function readStoredSession(): Promise<Session | null> {
  const raw =
    Platform.OS === "web"
      ? (() => {
          try {
            return globalThis.localStorage?.getItem(SESSION_STORAGE_KEY) ?? null;
          } catch {
            return null;
          }
        })()
      : await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
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
  if ((parsed as any).userId !== undefined && typeof (parsed as any).userId !== "string") return null;
  if ((parsed as any).roleIds !== undefined && !Array.isArray((parsed as any).roleIds)) return null;
  if ((parsed as any).roleNames !== undefined && !Array.isArray((parsed as any).roleNames)) return null;
  if ((parsed as any).permissions !== undefined && !Array.isArray((parsed as any).permissions)) return null;
  return parsed as Session;
}

async function writeStoredSession(next: Session | null): Promise<void> {
  if (!next) {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    return;
  }
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(next));
}

export function SessionProvider(props: { children: React.ReactNode }) {
  const [session, setSessionState] = React.useState<Session | null>(null);
  const [isHydrating, setIsHydrating] = React.useState(true);
  const [isIdentityLoading, setIsIdentityLoading] = React.useState(false);

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

  React.useEffect(() => {
    if (isHydrating) return;
    if (!session) return;
    void bootstrapCatalogIfNeeded(session);
    void bootstrapInventoryIfNeeded(session).catch(() => {});
    void bootstrapPurchasingIfNeeded(session).catch(() => {});
  }, [isHydrating, session]);

  const setSession = React.useCallback(async (next: Session) => {
    setSessionState(next);
    await writeStoredSession(next);
  }, []);

  const clearSession = React.useCallback(async () => {
    setSessionState(null);
    await writeStoredSession(null);
  }, []);

  const refreshIdentity = React.useCallback(async () => {
    if (!session) return;
    if (isIdentityLoading) return;
    setIsIdentityLoading(true);
    try {
      const api = apiForSession(session);
      const me = await api.me();
      const next: Session = {
        ...session,
        userId: me.user.id,
        roleIds: me.role_ids,
        roleNames: me.role_names,
        permissions: me.permissions,
        email: session.email ?? me.user.email,
        orgId: session.orgId ?? me.user.org_id,
      };
      setSessionState(next);
      await writeStoredSession(next);
    } finally {
      setIsIdentityLoading(false);
    }
  }, [session, isIdentityLoading]);

  React.useEffect(() => {
    if (isHydrating) return;
    if (!session) return;
    if (session.permissions && session.roleNames) return;
    void refreshIdentity();
  }, [isHydrating, session, refreshIdentity]);

  React.useEffect(() => {
    return onUnauthorized(() => {
      void clearSession();
    });
  }, [clearSession]);

  const value: SessionContextValue = React.useMemo(
    () => ({ session, isHydrating, isIdentityLoading, setSession, clearSession, refreshIdentity }),
    [session, isHydrating, isIdentityLoading, setSession, clearSession, refreshIdentity]
  );

  return <SessionContext.Provider value={value}>{props.children}</SessionContext.Provider>;
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
