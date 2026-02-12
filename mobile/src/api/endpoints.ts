import { createApiClient } from "@/api/client";
import { Session } from "@/auth/session";

export type HealthResponse = { ok: true };

export type Organization = {
  id: string;
  name: string;
  currency: string;
  tax_mode: string;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  org_id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CreateOrgRequest = {
  name: string;
  currency?: string;
  tax_mode?: string;
  owner: { name: string; email: string; password: string };
};

export type CreateOrgResponse = { organization: Organization; user: User; access_token: string };

export type LoginRequest = { org_id: string; email: string; password: string };
export type LoginResponse = { access_token: string };

export type SyncCommand = {
  idempotency_key: string;
  entity: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
};

export type SyncPushRequest = { device_id: string; commands: SyncCommand[] };
export type SyncPushOutcome = { idempotency_key?: string; status: "enqueued" | "duplicate" | "invalid"; details?: unknown };
export type SyncPushResponse = { received_at: string; outcomes: SyncPushOutcome[] };

export type SyncPullAck = { idempotency_key: string; status: "applied" | "failed"; outbox_id: string; processed_at: string };
export type SyncPullChange = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type SyncPullResponse = { cursor: string | null; next_cursor: string; changes: SyncPullChange[]; acks: SyncPullAck[] };

export function apiForSession(session: Session | null) {
  const client = createApiClient({ getAccessToken: () => session?.accessToken ?? null });
  return {
    health: () => client.request<HealthResponse>({ path: "/health" }).then((r) => r.data),
    createOrg: (body: CreateOrgRequest) =>
      client.request<CreateOrgResponse>({ path: "/orgs", method: "POST", body }).then((r) => r.data),
    login: (body: LoginRequest) =>
      client.request<LoginResponse>({ path: "/auth/login", method: "POST", body }).then((r) => r.data),
    logout: () => client.request<void>({ path: "/auth/logout", method: "POST" }).then(() => undefined),
    syncPush: (body: SyncPushRequest) =>
      client.request<SyncPushResponse>({ path: "/sync/push", method: "POST", body }).then((r) => r.data),
    syncPull: (args: { device_id: string; cursor?: string | null; limit?: number }) => {
      const params = new URLSearchParams();
      params.set("device_id", args.device_id);
      if (args.cursor) params.set("cursor", args.cursor);
      if (args.limit) params.set("limit", String(args.limit));
      return client
        .request<SyncPullResponse>({ path: `/sync/pull?${params.toString()}` })
        .then((r) => r.data);
    },
  };
}
