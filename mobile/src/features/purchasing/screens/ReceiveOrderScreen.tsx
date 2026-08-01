import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useSession } from "@/auth/session";
import { productsList } from "@/catalog/products";
import { variantsListAll } from "@/catalog/variants";
import { locationsGetById } from "@/inventory/locations";
import { formatQuantity, parseQuantity } from "@/inventory/lib/quantity";
import { formatMoney, parseMoney } from "@/purchasing/lib/money";
import { isReceivable, STATUS_LABEL, toOrderStatus } from "@/purchasing/lib/orderLifecycle";
import { outstandingLines, receiptError, type ReceiptInputLine } from "@/purchasing/lib/receiving";
import { ordersGetById, type OrderRow } from "@/purchasing/orders";
import { receiptsListForOrder, type ReceiptRow } from "@/purchasing/receipts";
import { receiveOrderOffline } from "@/sync/syncEngine";
import { AppText, Button, Card, Screen, Stack, TextField } from "@/ui/components";
import { theme } from "@/ui/theme";
import { useToast } from "@/ui/toast";

/**
 * A line as the user is filling it in. Quantity and cost stay strings so a half-typed "1." is not
 * clobbered, the same as the order form.
 */
type ReceiveLine = {
  variant_id: string;
  sku: string;
  product_name: string;
  ordered: string;
  received: string;
  outstanding: number;
  /** What the line was ordered at; used when the user does not type a cost of their own. */
  ordered_cost: string;
  quantity_input: string;
  cost_input: string;
};

export default function ReceiveOrderScreen() {
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { session } = useSession();

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [locationName, setLocationName] = React.useState("");
  const [lines, setLines] = React.useState<ReceiveLine[]>([]);
  // Kept so the receipt can be re-validated on every keystroke rather than only on submit.
  const [order, setOrder] = React.useState<OrderRow | null>(null);
  const [receipts, setReceipts] = React.useState<ReceiptRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const order = await ordersGetById(id);
      if (cancelled) return;
      setOrder(order);

      if (!order) {
        setBlocked("This order is not on this device. Pull to refresh the list and try again.");
        setLoading(false);
        return;
      }
      if (!isReceivable(order.status)) {
        setBlocked(
          `This order is ${STATUS_LABEL[toOrderStatus(order.status)].toLowerCase()}. Goods can only be booked in against an order that has been approved and still has something outstanding.`
        );
        setLoading(false);
        return;
      }

      const [receipts, location, variants, products] = await Promise.all([
        receiptsListForOrder(order.id),
        locationsGetById(order.location_id),
        variantsListAll(),
        productsList(),
      ]);
      if (cancelled) return;

      const variantById = new Map(variants.map((v) => [v.id, v]));
      const productNameById = new Map(products.map((p) => [p.id, p.name]));

      setReceipts(receipts);
      setLocationName(location?.name ?? "Unknown location");
      setLines(
        outstandingLines(order, receipts).map((line) => {
          const variant = variantById.get(line.variant_id);
          return {
            variant_id: line.variant_id,
            sku: variant?.sku ?? "Unknown SKU",
            product_name: variant ? (productNameById.get(variant.product_id) ?? "Unknown product") : "Unknown product",
            ordered: formatQuantity(line.ordered),
            received: formatQuantity(line.received),
            outstanding: line.outstanding,
            ordered_cost: formatMoney(parseMoney(line.unit_cost) ?? 0),
            // Defaulted to what is still owed: the common case is the delivery everyone expected,
            // and a short one is a couple of edits rather than a whole form to fill in.
            quantity_input: line.outstanding > 0 ? formatQuantity(line.outstanding) : "",
            cost_input: "",
          };
        })
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const setLine = React.useCallback((variantId: string, patch: Partial<ReceiveLine>) => {
    setLines((current) => current.map((line) => (line.variant_id === variantId ? { ...line, ...patch } : line)));
  }, []);

  /** Only the lines the user actually entered a quantity on — a blank line is "none arrived". */
  const enteredLines = React.useMemo<ReceiptInputLine[]>(
    () =>
      lines
        .filter((line) => line.quantity_input.trim() !== "")
        .map((line) => ({
          variant_id: line.variant_id,
          quantity_received: line.quantity_input.trim(),
          unit_cost: line.cost_input.trim() === "" ? null : line.cost_input.trim(),
        })),
    [lines]
  );

  /**
   * The server's own answer, worked out locally — the mirror in `purchasing/lib/receiving.ts`.
   * Nothing is queued until this is null, so an over-receipt is refused while the user is still
   * looking at the field rather than after the next push.
   */
  const error = React.useMemo(() => {
    if (!order || enteredLines.length === 0) return null;
    return receiptError({
      order,
      receipts,
      lines: enteredLines,
      // An operator should read a SKU, not the UUID the server writes onto the change feed.
      labelFor: (variantId) => lines.find((line) => line.variant_id === variantId)?.sku ?? variantId,
    });
  }, [enteredLines, lines, order, receipts]);

  const total = React.useMemo(() => {
    let sum = 0;
    for (const line of lines) {
      const quantity = parseQuantity(line.quantity_input);
      if (quantity === null || quantity <= 0) continue;
      const cost = line.cost_input.trim() === "" ? parseMoney(line.ordered_cost) : parseMoney(line.cost_input);
      sum += quantity * (cost ?? 0);
    }
    return formatMoney(sum);
  }, [lines]);

  const submit = React.useCallback(async () => {
    setBusy(true);
    try {
      await receiveOrderOffline({
        purchase_order_id: id,
        items: enteredLines,
        received_by: session?.userId ?? null,
      });
      toast.success("Goods booked in. Stock is updated on this device already.", { title: "Queued" });
      router.replace(`/(tabs)/purchasing/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not book the delivery in.", { title: "Not received" });
    } finally {
      setBusy(false);
    }
  }, [enteredLines, id, session?.userId, toast]);

  if (loading) {
    return (
      <Screen scroll>
        <AppText muted>Loading…</AppText>
      </Screen>
    );
  }

  if (blocked) {
    return (
      <Screen scroll>
        <Stack gap={16}>
          <AppText variant="h1">Receive goods</AppText>
          <AppText muted>{blocked}</AppText>
          <Button title="Back to order" variant="ghost" onPress={() => router.replace(`/(tabs)/purchasing/${id}`)} />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack gap={16}>
        <AppText variant="h1">Receive goods</AppText>
        <AppText muted>
          Stock lands at {locationName}, where the order said it would be delivered. Enter what actually arrived —
          leave a line blank if none of it did.
        </AppText>

        {lines.map((line) => (
          <Card key={line.variant_id} title={line.product_name} subtitle={line.sku}>
            <Stack gap={12}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                <Labelled label="Ordered" value={line.ordered} />
                <Labelled label="Already received" value={line.received} />
                <Labelled label="Outstanding" value={formatQuantity(line.outstanding)} />
              </View>
              <TextField
                label="Received now"
                value={line.quantity_input}
                onChangeText={(text) => setLine(line.variant_id, { quantity_input: text })}
                keyboardType="numeric"
                autoCapitalize="none"
                placeholder="0"
              />
              <TextField
                label={`Unit cost (optional — ordered at ${line.ordered_cost})`}
                value={line.cost_input}
                onChangeText={(text) => setLine(line.variant_id, { cost_input: text })}
                keyboardType="numeric"
                autoCapitalize="none"
                placeholder={line.ordered_cost}
              />
            </Stack>
          </Card>
        ))}

        <Card title="This delivery">
          <Stack gap={8}>
            <AppText>
              {enteredLines.length} {enteredLines.length === 1 ? "line" : "lines"} · total {total}
            </AppText>
            {error ? (
              <AppText style={{ color: theme.colors.dangerText }}>{error}</AppText>
            ) : (
              <AppText muted>
                Booking in works offline: the stock moves on this device now and the receipt syncs when you are back
                online.
              </AppText>
            )}
          </Stack>
        </Card>

        <Button
          title="Book in delivery"
          disabled={busy || enteredLines.length === 0 || error !== null}
          onPress={() => void submit()}
        />
        <Button title="Cancel" variant="ghost" onPress={() => router.replace(`/(tabs)/purchasing/${id}`)} />
      </Stack>
    </Screen>
  );
}

function Labelled({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="label" style={{ color: theme.colors.muted }}>
        {label}
      </AppText>
      <AppText>{value}</AppText>
    </View>
  );
}
