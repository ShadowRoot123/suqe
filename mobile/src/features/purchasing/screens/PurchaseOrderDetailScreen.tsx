import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { canIssueCommand } from "@/auth/commandPermissions";
import { useSession } from "@/auth/session";
import { productsList } from "@/catalog/products";
import { locationsGetById } from "@/inventory/locations";
import { formatQuantity } from "@/inventory/lib/quantity";
import { variantsListAll } from "@/catalog/variants";
import { calendarDate } from "@/purchasing/lib/calendarDate";
import { formatMoney, lineTotal, moneyOrZero } from "@/purchasing/lib/money";
import {
  isEditable,
  isReceivable,
  manualStatuses,
  STATUS_LABEL,
  STATUS_TONE,
  type OrderStatus,
} from "@/purchasing/lib/orderLifecycle";
import { outstandingLines } from "@/purchasing/lib/receiving";
import { ordersGetById, type OrderRow } from "@/purchasing/orders";
import { receiptsListForOrder, type ReceiptRow } from "@/purchasing/receipts";
import { suppliersGetById } from "@/purchasing/suppliers";
import { deletePurchaseOrderOffline, transitionPurchaseOrderOffline } from "@/sync/syncEngine";
import { outboxUnsettledEntityIds } from "@/sync/outbox";
import { AppText, Badge, Button, Card, Screen, Stack } from "@/ui/components";
import { DataTable } from "@/ui/table";
import { useToast } from "@/ui/toast";

type DetailLine = {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  quantity_ordered: string;
  unit_cost: string;
  line_total: string;
  /** Blank until something has been delivered — an order that is still on its way says nothing. */
  received: string;
};

/**
 * What each onward status is called on a button, rather than as a state. The two receiving
 * statuses have no button: an order gets there by goods arriving, not by being told they did.
 */
const ACTION_LABEL: Record<OrderStatus, string> = {
  draft: "Back to draft",
  approved: "Approve and send",
  partially_received: "Mark partly received",
  received: "Mark received",
  closed: "Close order",
  cancelled: "Cancel order",
};

export default function PurchaseOrderDetailScreen() {
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { session } = useSession();
  // Asked of the command map rather than by naming the keys, so these cannot drift from what the
  // server checks when the transition or the receipt actually arrives.
  const canWrite = canIssueCommand(session, "purchase_order", "update");
  const canReceive = canIssueCommand(session, "purchase_receipt", "create");

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [order, setOrder] = React.useState<OrderRow | null>(null);
  const [supplierName, setSupplierName] = React.useState("");
  const [locationName, setLocationName] = React.useState("");
  const [lines, setLines] = React.useState<DetailLine[]>([]);
  const [receipts, setReceipts] = React.useState<ReceiptRow[]>([]);
  const [pending, setPending] = React.useState(false);

  const load = React.useCallback(async () => {
    const row = await ordersGetById(id);
    setOrder(row);
    if (!row) {
      setLoading(false);
      return;
    }

    const [supplier, location, variants, products, inFlight, receiptRows] = await Promise.all([
      suppliersGetById(row.supplier_id),
      locationsGetById(row.location_id),
      variantsListAll(),
      productsList(),
      outboxUnsettledEntityIds("purchase_order"),
      receiptsListForOrder(row.id),
    ]);

    const variantById = new Map(variants.map((v) => [v.id, v]));
    const productNameById = new Map(products.map((p) => [p.id, p.name]));
    const receivedByVariant = new Map(
      outstandingLines(row, receiptRows).map((line) => [line.variant_id, line.received])
    );

    setSupplierName(supplier?.name ?? "Unknown supplier");
    setLocationName(location?.name ?? "Unknown location");
    setPending(inFlight.has(row.id));
    setReceipts(receiptRows);
    setLines(
      row.items.map((item) => {
        const variant = variantById.get(item.variant_id);
        const received = receivedByVariant.get(item.variant_id) ?? 0;
        return {
          id: item.id,
          variant_id: item.variant_id,
          sku: variant?.sku ?? "Unknown SKU",
          product_name: variant ? (productNameById.get(variant.product_id) ?? "Unknown product") : "Unknown product",
          quantity_ordered: item.quantity_ordered,
          unit_cost: item.unit_cost,
          line_total: formatMoney(lineTotal(item)),
          received: received > 0 ? formatQuantity(received) : "",
        };
      })
    );
    setLoading(false);
  }, [id]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load])
  );

  const transition = React.useCallback(
    async (status: OrderStatus) => {
      setBusy(true);
      try {
        await transitionPurchaseOrderOffline({ id, status });
        await load();
        toast.success(`Order is now ${STATUS_LABEL[status].toLowerCase()}.`, { title: "Queued" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not change the status.", { title: "Not allowed" });
      } finally {
        setBusy(false);
      }
    },
    [id, load, toast]
  );

  const remove = React.useCallback(async () => {
    setBusy(true);
    try {
      await deletePurchaseOrderOffline(id);
      toast.success("Draft deleted.", { title: "Queued" });
      router.replace("/(tabs)/purchasing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the order.", { title: "Delete failed" });
    } finally {
      setBusy(false);
    }
  }, [id, toast]);

  if (loading) {
    return (
      <Screen scroll>
        <AppText muted>Loading…</AppText>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen scroll>
        <Stack gap={16}>
          <AppText variant="h1">Purchase order</AppText>
          <AppText muted>This order is not on this device. Pull to refresh the list and try again.</AppText>
          <Button title="Back to orders" variant="ghost" onPress={() => router.replace("/(tabs)/purchasing")} />
        </Stack>
      </Screen>
    );
  }

  const onward = manualStatuses(order.status);
  const editable = isEditable(order.status);
  const receivable = isReceivable(order.status);

  return (
    <Screen scroll>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <AppText variant="h1">{supplierName}</AppText>
          <Badge tone={STATUS_TONE[order.status]} label={STATUS_LABEL[order.status]} />
          {pending ? <Badge tone="warning" label="Unsynced" /> : null}
        </View>

        <Card title="Order">
          <Stack gap={8}>
            <AppText muted>Deliver to {locationName}</AppText>
            <AppText muted>Expected {calendarDate(order.expected_at, "— no date given")}</AppText>
            <AppText muted>
              {lines.length === 1 ? "1 line" : `${lines.length} lines`} · total {order.total_cost}
            </AppText>
            {moneyOrZero(order.total_cost) === 0 && lines.length > 0 ? (
              <AppText muted>Every line on this order is free of charge.</AppText>
            ) : null}
          </Stack>
        </Card>

        <DataTable
          emptyTitle="No lines on this order"
          emptySubtitle={editable ? "Edit the draft to add items." : "This order was sent without any lines."}
          columns={[
            {
              key: "product",
              title: "Product",
              minWidth: 200,
              render: (l: DetailLine) => l.product_name,
              sortValue: (l: DetailLine) => l.product_name,
            },
            {
              key: "sku",
              title: "SKU",
              minWidth: 150,
              hideOnMobile: true,
              render: (l: DetailLine) => l.sku,
              sortValue: (l: DetailLine) => l.sku,
            },
            {
              key: "quantity",
              title: "Ordered",
              minWidth: 110,
              render: (l: DetailLine) => l.quantity_ordered,
              sortValue: (l: DetailLine) => Number(l.quantity_ordered),
            },
            {
              key: "received",
              title: "Received",
              minWidth: 110,
              render: (l: DetailLine) => l.received || "—",
              sortValue: (l: DetailLine) => Number(l.received || 0),
            },
            {
              key: "cost",
              title: "Unit cost",
              minWidth: 120,
              render: (l: DetailLine) => l.unit_cost,
              sortValue: (l: DetailLine) => moneyOrZero(l.unit_cost),
            },
            {
              key: "total",
              title: "Line total",
              minWidth: 120,
              render: (l: DetailLine) => l.line_total,
              sortValue: (l: DetailLine) => moneyOrZero(l.line_total),
            },
          ]}
          rows={lines}
          getRowId={(l: DetailLine) => l.id}
        />

        {/*
          Its own card, outside the purchasing.write block: warehouse staff hold purchasing.receive
          without purchasing.write, and booking a delivery in is the whole of their job here.
        */}
        {canReceive || receipts.length > 0 ? (
          <Card title="Deliveries">
            <Stack gap={12}>
              {receipts.length === 0 ? (
                <AppText muted>Nothing has been booked in against this order yet.</AppText>
              ) : (
                receipts.map((receipt) => (
                  <View
                    key={receipt.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                  >
                    <AppText>
                      {calendarDate(receipt.received_at, "—")} · {receipt.items.length}{" "}
                      {receipt.items.length === 1 ? "line" : "lines"} ·{" "}
                      {formatQuantity(
                        receipt.items.reduce((sum, line) => sum + (Number(line.quantity_received) || 0), 0)
                      )}{" "}
                      units
                    </AppText>
                    {receipt.synced ? null : <Badge tone="warning" label="Unsynced" />}
                  </View>
                ))
              )}
              {receivable && canReceive ? (
                <Button
                  title="Receive goods"
                  disabled={busy}
                  onPress={() => router.push(`/(tabs)/purchasing/${order.id}/receive`)}
                />
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {canWrite ? (
          <Card title="What happens next">
            <Stack gap={12}>
              {onward.length === 0 ? (
                <AppText muted>
                  This order is {STATUS_LABEL[order.status].toLowerCase()} — its status cannot change again.
                </AppText>
              ) : (
                <>
                  {order.status === "draft" ? (
                    <AppText muted>
                      Approving sends the order to the supplier and locks its lines, because deliveries are checked
                      against them.
                    </AppText>
                  ) : null}
                  {receivable ? (
                    <AppText muted>
                      This order is waiting on the supplier. It becomes received when the goods are booked in against
                      it — that is what moves stock, so the status is never set by hand.
                    </AppText>
                  ) : null}
                  {onward.map((status) => (
                    <Button
                      key={status}
                      title={ACTION_LABEL[status]}
                      variant={status === "cancelled" ? "secondary" : "primary"}
                      disabled={busy}
                      onPress={() => void transition(status)}
                    />
                  ))}
                </>
              )}

              {editable ? (
                <>
                  <Button
                    title="Edit draft"
                    variant="ghost"
                    disabled={busy}
                    onPress={() => router.push(`/(tabs)/purchasing/${order.id}/edit`)}
                  />
                  <Button title="Delete draft" variant="ghost" disabled={busy} onPress={remove} />
                </>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        <Button title="Back to orders" variant="ghost" onPress={() => router.push("/(tabs)/purchasing")} />
      </Stack>
    </Screen>
  );
}
