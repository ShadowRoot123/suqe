import { createApiClient } from "@/api/client";
import type { Session } from "@/auth/session";

export type HealthResponse = { ok: true };

export type MeResponse = {
  user: {
    id: string;
    org_id: string;
    name: string;
    email: string;
    status: string;
  };
  role_ids: string[];
  role_names: string[];
  permissions: string[];
};

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

export type LoginRequest = { org_id?: string; email: string; password: string };
export type LoginResponse = { access_token: string; org_id: string; email: string };

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

export type Category = {
  id: string;
  org_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  org_id: string;
  category_id: string | null;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Variant = {
  id: string;
  org_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  attrs: Record<string, unknown>;
  price: string;
  cost_price: string;
  created_at: string;
  updated_at: string;
};

export type Location = {
  id: string;
  org_id: string;
  name: string;
  type: string;
  address: string | null;
  created_at: string;
  updated_at: string;
};

export type InventorySnapshot = {
  org_id: string;
  variant_id: string;
  location_id: string;
  quantity: string;
  updated_at: string;
};

export type StockThreshold = {
  id: string;
  org_id: string;
  variant_id: string;
  /** null is the variant-wide default. */
  location_id: string | null;
  reorder_point: string;
  reorder_quantity: string | null;
  updated_at: string;
};

export type LowStockRow = {
  variant_id: string;
  location_id: string;
  on_hand: string;
  reorder_point: string;
  reorder_quantity: string | null;
  shortfall: string;
};

export type InventoryMovement = {
  id: string;
  org_id: string;
  variant_id: string;
  location_id: string;
  type: string;
  quantity_delta: string;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  idempotency_key: string | null;
};

export type Supplier = {
  id: string;
  org_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderItem = {
  id: string;
  purchase_order_id: string;
  variant_id: string;
  quantity_ordered: string;
  unit_cost: string;
};

export type PurchaseOrder = {
  id: string;
  org_id: string;
  supplier_id: string;
  location_id: string;
  status: string;
  expected_at: string | null;
  total_cost: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Present on both index and show — the index carries lines so a fresh device can fill its store. */
  items?: PurchaseOrderItem[];
};

export type PurchaseReceiptItem = {
  id: string;
  receipt_id: string;
  variant_id: string;
  quantity_received: string;
  unit_cost: string;
};

export type PurchaseReceipt = {
  id: string;
  org_id: string;
  purchase_order_id: string;
  received_at: string;
  received_by: string | null;
  created_at: string;
  /** The index carries lines so a fresh device can work out what is still outstanding. */
  items?: PurchaseReceiptItem[];
};

export type CategoriesIndexResponse = { categories: Category[] };
export type ProductsIndexResponse = { products: Product[] };
export type VariantsIndexResponse = { variants: Variant[] };
export type LocationsIndexResponse = { locations: Location[] };
export type InventorySnapshotsIndexResponse = { inventory_snapshots: InventorySnapshot[] };
export type StockThresholdsIndexResponse = { stock_thresholds: StockThreshold[] };
export type SuppliersIndexResponse = { suppliers: Supplier[] };
export type PurchaseOrdersIndexResponse = { purchase_orders: PurchaseOrder[] };
export type PurchaseOrderShowResponse = { purchase_order: PurchaseOrder };
export type PurchaseReceiptsIndexResponse = { purchase_receipts: PurchaseReceipt[] };
export type LowStockIndexResponse = { low_stock: LowStockRow[] };
/** `next_cursor` is null on the last page — the keyset cursor, not an offset. */
export type InventoryMovementsIndexResponse = { inventory_movements: InventoryMovement[]; next_cursor: string | null };

export type InventoryMovementsQuery = {
  variant_id?: string | null;
  location_id?: string | null;
  type?: string | null;
  created_by?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number | null;
  cursor?: string | null;
};

export function apiForSession(session: Session | null) {
  const client = createApiClient({ getAccessToken: () => session?.accessToken ?? null });
  return {
    health: () => client.request<HealthResponse>({ path: "/health" }).then((r) => r.data),
    me: () => client.request<MeResponse>({ path: "/me" }).then((r) => r.data),
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
    categoriesIndex: () => client.request<CategoriesIndexResponse>({ path: "/categories" }).then((r) => r.data),
    productsIndex: () => client.request<ProductsIndexResponse>({ path: "/products" }).then((r) => r.data),
    variantsIndex: () => client.request<VariantsIndexResponse>({ path: "/variants" }).then((r) => r.data),
    locationsIndex: () => client.request<LocationsIndexResponse>({ path: "/locations" }).then((r) => r.data),
    inventorySnapshotsIndex: () =>
      client.request<InventorySnapshotsIndexResponse>({ path: "/inventory_snapshots" }).then((r) => r.data),
    stockThresholdsIndex: () =>
      client.request<StockThresholdsIndexResponse>({ path: "/stock_thresholds" }).then((r) => r.data),
    suppliersIndex: () => client.request<SuppliersIndexResponse>({ path: "/suppliers" }).then((r) => r.data),
    purchaseOrdersIndex: (args?: { status?: string | null; supplier_id?: string | null }) => {
      const params = new URLSearchParams();
      if (args?.status) params.set("status", args.status);
      if (args?.supplier_id) params.set("supplier_id", args.supplier_id);
      const query = params.toString();
      return client
        .request<PurchaseOrdersIndexResponse>({ path: query ? `/purchase_orders?${query}` : "/purchase_orders" })
        .then((r) => r.data);
    },
    purchaseOrderShow: (id: string) =>
      client.request<PurchaseOrderShowResponse>({ path: `/purchase_orders/${id}` }).then((r) => r.data),
    purchaseReceiptsIndex: (args?: { purchase_order_id?: string | null }) => {
      const params = new URLSearchParams();
      if (args?.purchase_order_id) params.set("purchase_order_id", args.purchase_order_id);
      const query = params.toString();
      return client
        .request<PurchaseReceiptsIndexResponse>({ path: query ? `/purchase_receipts?${query}` : "/purchase_receipts" })
        .then((r) => r.data);
    },
    lowStockIndex: (args?: { location_id?: string | null }) => {
      const params = new URLSearchParams();
      if (args?.location_id) params.set("location_id", args.location_id);
      const query = params.toString();
      return client
        .request<LowStockIndexResponse>({ path: query ? `/stock_thresholds/low_stock?${query}` : "/stock_thresholds/low_stock" })
        .then((r) => r.data);
    },
    inventoryMovementsIndex: (args?: InventoryMovementsQuery) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(args ?? {})) {
        if (value === null || value === undefined || value === "") continue;
        params.set(key, String(value));
      }
      const query = params.toString();
      return client
        .request<InventoryMovementsIndexResponse>({ path: query ? `/inventory_movements?${query}` : "/inventory_movements" })
        .then((r) => r.data);
    },
  };
}
