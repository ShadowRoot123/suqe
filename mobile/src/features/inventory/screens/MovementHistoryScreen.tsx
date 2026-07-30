import React from "react";
import { RefreshControl, View } from "react-native";

import { apiForSession } from "@/api/endpoints";
import { useSession } from "@/auth/session";
import { productsList, type ProductRow } from "@/catalog/products";
import { variantsListAll } from "@/catalog/variants";
import { formatQuantity, quantityOrZero } from "@/inventory/lib/quantity";
import { locationsList } from "@/inventory/locations";
import { movementsListRecent } from "@/inventory/movements";
import { AppText, Badge, Button, Chip, Screen, Stack } from "@/ui/components";
import { DataTable } from "@/ui/table";

const PAGE_SIZE = 50;

const TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
  sale: "Sale",
  return: "Return",
  adjustment: "Adjustment",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

type HistoryLine = {
  id: string;
  variant_id: string;
  location_id: string;
  type: string;
  quantity_delta: string;
  note: string | null;
  created_at: string;
  /** Local rows can be ahead of the server; server rows never are. */
  pending: boolean;
  product_name: string;
  sku: string;
  location_name: string;
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/**
 * The ledger is online-first: it can run to thousands of rows, so it is read from the server a
 * page at a time through the keyset cursor rather than cached whole. Offline it falls back to the
 * local ledger, which holds recent and not-yet-synced movements.
 */
export default function MovementHistoryScreen() {
  const { session } = useSession();

  const [locations, setLocations] = React.useState<{ id: string; name: string }[]>([]);
  const [lines, setLines] = React.useState<HistoryLine[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<"server" | "local">("server");
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [locationFilter, setLocationFilter] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null);

  // The API returns ids; the names live in the local catalog, which is already synced.
  const names = React.useCallback(async () => {
    const [variants, products, locs] = await Promise.all([variantsListAll(), productsList(), locationsList()]);
    const productNameById = new Map<string, string>(products.map((p: ProductRow) => [p.id, p.name]));
    return {
      variantById: new Map(variants.map((v) => [v.id, v])),
      productNameById,
      locationNameById: new Map(locs.map((l) => [l.id, l.name])),
      locations: locs.map((l) => ({ id: l.id, name: l.name })),
    };
  }, []);

  const load = React.useCallback(
    async (options?: { cursor?: string | null }) => {
      const more = !!options?.cursor;
      if (more) setLoadingMore(true);
      else setLoading(true);

      try {
        const lookup = await names();
        setLocations(lookup.locations);

        const decorate = (row: {
          id: string;
          variant_id: string;
          location_id: string;
          type: string;
          quantity_delta: string;
          note: string | null;
          created_at: string;
          pending: boolean;
        }): HistoryLine => {
          const variant = lookup.variantById.get(row.variant_id);
          return {
            ...row,
            sku: variant?.sku ?? "Unknown SKU",
            product_name: variant
              ? (lookup.productNameById.get(variant.product_id) ?? "Unknown product")
              : "Unknown product",
            location_name: lookup.locationNameById.get(row.location_id) ?? "Unknown location",
          };
        };

        if (session) {
          try {
            const api = apiForSession(session);
            const res = await api.inventoryMovementsIndex({
              location_id: locationFilter,
              type: typeFilter,
              limit: PAGE_SIZE,
              cursor: options?.cursor ?? null,
            });
            const page = res.inventory_movements.map((m) =>
              decorate({
                id: m.id,
                variant_id: m.variant_id,
                location_id: m.location_id,
                type: m.type,
                quantity_delta: m.quantity_delta,
                note: m.note,
                created_at: m.created_at,
                pending: false,
              })
            );
            setLines((previous) => (more ? [...previous, ...page] : page));
            setCursor(res.next_cursor);
            setSource("server");
            setError(null);
            return;
          } catch {
            // offline, or no inventory.view_movements — fall through to the local ledger
          }
        }

        const local = await movementsListRecent(PAGE_SIZE);
        const filtered = local
          .filter((m) => (locationFilter ? m.location_id === locationFilter : true))
          .filter((m) => (typeFilter ? m.type === typeFilter : true))
          .map((m) =>
            decorate({
              id: m.id,
              variant_id: m.variant_id,
              location_id: m.location_id,
              type: m.type,
              quantity_delta: m.quantity_delta,
              note: m.note,
              created_at: m.created_at,
              pending: !m.synced,
            })
          );
        setLines(filtered);
        setCursor(null);
        setSource("local");
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the movement history.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [locationFilter, names, session, typeFilter]
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      <Stack gap={16}>
        <AppText variant="h1">Movement history</AppText>
        {source === "local" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="warning" label="Offline" />
            <AppText muted>Showing the movements stored on this device.</AppText>
          </View>
        ) : (
          <AppText muted>Every stock movement, newest first.</AppText>
        )}

        {/* Chips rather than the usual FilterBar: its search box would only match the page already
            loaded, which reads as "no results" for a row that is one page further down. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              selected={typeFilter === value}
              onPress={() => setTypeFilter(typeFilter === value ? null : value)}
            />
          ))}
          {locations.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              selected={locationFilter === l.id}
              onPress={() => setLocationFilter(locationFilter === l.id ? null : l.id)}
            />
          ))}
          {typeFilter || locationFilter ? (
            <Button
              title="Reset"
              variant="ghost"
              onPress={() => {
                setTypeFilter(null);
                setLocationFilter(null);
              }}
            />
          ) : null}
        </View>

        <DataTable
          loading={loading}
          errorText={error ?? undefined}
          emptyTitle="No movements yet"
          emptySubtitle="Stock adjustments, sales and receipts all appear here."
          columns={[
            {
              key: "created_at",
              title: "When",
              minWidth: 190,
              render: (l: HistoryLine) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <AppText>{formatWhen(l.created_at)}</AppText>
                  {l.pending ? <Badge tone="warning" label="Unsynced" /> : null}
                </View>
              ),
            },
            {
              key: "product",
              title: "Product",
              minWidth: 220,
              render: (l: HistoryLine) => l.product_name,
            },
            {
              key: "sku",
              title: "SKU",
              minWidth: 150,
              hideOnMobile: true,
              render: (l: HistoryLine) => l.sku,
            },
            {
              key: "location",
              title: "Location",
              minWidth: 160,
              render: (l: HistoryLine) => l.location_name,
            },
            {
              key: "type",
              title: "Type",
              minWidth: 140,
              hideOnMobile: true,
              render: (l: HistoryLine) => TYPE_LABEL[l.type] ?? l.type,
            },
            {
              key: "quantity_delta",
              title: "Change",
              minWidth: 120,
              render: (l: HistoryLine) => {
                const delta = quantityOrZero(l.quantity_delta);
                return `${delta > 0 ? "+" : ""}${formatQuantity(delta)}`;
              },
            },
            {
              key: "note",
              title: "Note",
              minWidth: 200,
              hideOnMobile: true,
              render: (l: HistoryLine) => l.note ?? "—",
            },
          ]}
          rows={lines}
          getRowId={(l: HistoryLine) => l.id}
        />

        {cursor ? (
          <Button
            title={loadingMore ? "Loading…" : "Load more"}
            variant="secondary"
            loading={loadingMore}
            disabled={loadingMore}
            onPress={() => void load({ cursor })}
          />
        ) : null}
      </Stack>
    </Screen>
  );
}
