import { router } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { formatQuantity } from "@/inventory/lib/quantity";
import { AppText, Badge, Button, Chip, Screen, Stack } from "@/ui/components";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { DataTable, FilterBar, useTableState } from "@/ui/table";

import { useInventoryData, type OnHandLine } from "../hooks/useInventoryData";

export default function InventoryOverviewScreen() {
  const bp = useBreakpoint();
  const { refreshing, refresh, lines, locations } = useInventoryData();

  const table = useTableState(lines, {
    getSearchText: (l) => `${l.product_name} ${l.variant.sku} ${l.variant.barcode ?? ""} ${l.location_name}`,
    filterFns: {
      location: (l, value) => (typeof value === "string" ? l.location_id === value : true),
      pending: (l, value) => (value === "pending" ? l.pending !== 0 : true),
    },
    sortValueBy: {
      product: (l) => l.product_name,
      sku: (l) => l.variant.sku,
      location: (l) => l.location_name,
      quantity: (l) => l.quantity,
    },
    initial: { sortKey: "product", sortDir: "asc", pageSize: 25 },
  });

  const showPaged = !bp.isMobile;
  const rows = showPaged ? table.pagedRows : table.rows;

  const pendingCount = React.useMemo(() => lines.filter((l) => l.pending !== 0).length, [lines]);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="h1">Inventory</AppText>
          <Button title="Adjust stock" onPress={() => router.push("/(tabs)/inventory/adjustments")} />
        </View>

        {pendingCount > 0 ? (
          <AppText muted>
            {pendingCount} {pendingCount === 1 ? "line has" : "lines have"} adjustments waiting to sync.
          </AppText>
        ) : null}

        <FilterBar
          searchValue={table.state.query}
          onSearchChange={table.setQuery}
          onReset={() => {
            table.setQuery("");
            table.clearFilters();
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Chip
              label="Not synced"
              selected={table.state.filters.pending === "pending"}
              onPress={() => table.setFilter("pending", table.state.filters.pending === "pending" ? null : "pending")}
            />
            {locations.map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                selected={table.state.filters.location === l.id}
                onPress={() => table.setFilter("location", table.state.filters.location === l.id ? null : l.id)}
              />
            ))}
          </View>
        </FilterBar>

        <DataTable
            emptyTitle="No stock yet"
            emptySubtitle="On-hand appears once a location exists and stock has been adjusted or received."
            columns={[
              {
                key: "product",
                title: "Product",
                minWidth: 240,
                render: (l: OnHandLine) => l.product_name,
                sortValue: (l: OnHandLine) => l.product_name,
              },
              {
                key: "sku",
                title: "SKU",
                minWidth: 160,
                render: (l: OnHandLine) => l.variant.sku,
                sortValue: (l: OnHandLine) => l.variant.sku,
              },
              {
                key: "location",
                title: "Location",
                minWidth: 160,
                render: (l: OnHandLine) => l.location_name,
                sortValue: (l: OnHandLine) => l.location_name,
              },
              {
                key: "quantity",
                title: "On hand",
                minWidth: 140,
                render: (l: OnHandLine) => formatQuantity(l.quantity),
                sortValue: (l: OnHandLine) => l.quantity,
              },
              {
                key: "pending",
                title: "Pending",
                minWidth: 140,
                hideOnMobile: true,
                render: (l: OnHandLine) =>
                  l.pending === 0 ? (
                    "—"
                  ) : (
                    <Badge
                      tone="warning"
                      label={`${l.pending > 0 ? "+" : ""}${formatQuantity(l.pending)} unsynced`}
                    />
                  ),
                sortValue: (l: OnHandLine) => l.pending,
              },
            ]}
            rows={rows}
            getRowId={(l: OnHandLine) => `${l.variant_id}-${l.location_id}`}
            sort={{ key: table.state.sortKey, dir: table.state.sortDir, onToggle: table.toggleSort }}
            pagination={
              showPaged
                ? {
                    page: table.state.page,
                    pageSize: table.state.pageSize,
                    totalRows: table.totalRows,
                    onPageChange: table.setPage,
                    onPageSizeChange: table.setPageSize,
                  }
                : undefined
            }
        />
      </Stack>
    </Screen>
  );
}
