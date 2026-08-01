import { apiForSession } from "@/api/endpoints";
import type { Session } from "@/auth/session";
import { kvGet, kvSet } from "@/db/kv";
import { ordersUpsert } from "@/purchasing/orders";
import { receiptsUpsert } from "@/purchasing/receipts";
import { suppliersUpsert } from "@/purchasing/suppliers";
import { outboxUnsettledEntityIds } from "@/sync/outbox";

/**
 * Bumped to v2 when receipts joined the seed. A device that bootstrapped under v1 has orders but
 * no receipts, so it would offer the whole ordered quantity as outstanding on an order that has
 * already been half delivered — and the server would refuse the receipt. Changing the key makes
 * those devices seed once more; bump it again whenever this function learns to fetch something new.
 */
function bootKey(orgId: string) {
  return `purchasing_bootstrap_v2.${orgId}`;
}

/**
 * The pull feed only carries changes since the cursor, so a fresh device would never see suppliers
 * or orders that predate it. Both are seeded from REST once per org; after that the pull feed keeps
 * them current. Mirrors bootstrapInventory.
 */
export async function bootstrapPurchasingIfNeeded(session: Session) {
  const existing = await kvGet(bootKey(session.orgId));
  if (existing) return;

  await refreshPurchasingFromServer(session);
  await kvSet(bootKey(session.orgId), new Date().toISOString());
}

/** Best-effort online refresh; safe to call from pull-to-refresh while offline. */
export async function refreshPurchasingFromServer(session: Session) {
  const api = apiForSession(session);

  // A row the user just created or edited offline is ahead of the server's copy until its command
  // is acknowledged, so REST must not write over it.
  const [suppliersInFlight, ordersInFlight, receiptsInFlight] = await Promise.all([
    outboxUnsettledEntityIds("supplier"),
    outboxUnsettledEntityIds("purchase_order"),
    outboxUnsettledEntityIds("purchase_receipt"),
  ]);

  const suppliers = await api.suppliersIndex();
  for (const supplier of suppliers.suppliers) {
    if (suppliersInFlight.has(supplier.id)) continue;
    await suppliersUpsert({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      updated_at: supplier.updated_at,
    });
  }

  const orders = await api.purchaseOrdersIndex();
  for (const order of orders.purchase_orders) {
    if (ordersInFlight.has(order.id)) continue;
    await ordersUpsert({
      id: order.id,
      supplier_id: order.supplier_id,
      location_id: order.location_id,
      status: order.status,
      expected_at: order.expected_at,
      total_cost: order.total_cost,
      created_by: order.created_by,
      items: order.items ?? [],
      updated_at: order.updated_at,
    });
  }

  // Without the receipts a fresh device would offer the whole ordered quantity as outstanding on
  // an order that has already been half delivered, and the server would refuse the receipt.
  const receipts = await api.purchaseReceiptsIndex();
  for (const receipt of receipts.purchase_receipts) {
    if (receiptsInFlight.has(receipt.id)) continue;
    await receiptsUpsert({
      id: receipt.id,
      purchase_order_id: receipt.purchase_order_id,
      received_at: receipt.received_at,
      received_by: receipt.received_by,
      items: receipt.items ?? [],
      synced: true,
      updated_at: receipt.created_at,
    });
  }
}
