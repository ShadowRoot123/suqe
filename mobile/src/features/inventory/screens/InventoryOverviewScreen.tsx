import { router } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { formatQuantity } from "@/inventory/lib/quantity";
import { AppText, Badge, Button, Chip, Notice, Screen, SkuTag, Stack } from "@/ui/components";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { DataTable, FilterBar, useTableState } from "@/ui/table";
import { theme } from "@/ui/theme";

import { useInventoryData, type OnHandLine } from "../hooks/useInventoryData";

export default function InventoryOverviewScreen() {
  const bp = useBreakpoint();
  const { refreshing, refresh, lines, locations, lowStockCount } = useInventoryData();

  const table = useTableState(lines, {
    getSearchText: (l) => `${l.product_name} ${l.variant.sku} ${l.variant.barcode ?? ""} ${l.location_name}`,
    filterFns: {
      location: (l, value) => (typeof value === "string" ? l.location_id === value : true),
      pending: (l, value) => (value === "pending" ? l.pending !== 0 : true),
      low: (l, value) => (value === "low" ? !!l.lowStock?.low : true),
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
  const negativeCount = React.useMemo(() => lines.filter((l) => l.quantity < 0).length, [lines]);
  const lowOnly = table.state.filters.low === "low";

  const openLine = (l: OnHandLine) =>
    router.push({
      pathname: "/(tabs)/inventory/adjustments",
      params: { variant_id: l.variant_id, location_id: l.location_id, product_name: l.product_name },
    });

  // Phones get these as an even row under the list, where a thumb reaches them; wider screens
  // keep them top right.
  const grow = bp.isMobile ? { flex: 1, paddingHorizontal: 4, minHeight: 44 } : undefined;
  const size = bp.isMobile ? "sm" : "md";
  const actions = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
      <Button title="History" variant="secondary" size={size} style={grow} onPress={() => router.push("/(tabs)/inventory/movements")} />
      <Button
        title="Reorder points"
        variant="secondary"
        size={size}
        style={grow}
        onPress={() => router.push("/(tabs)/inventory/thresholds")}
      />
      <Button title="Adjust stock" size={size} style={grow} onPress={() => router.push("/(tabs)/inventory/adjustments")} />
    </View>
  );

  const alertText = [
    lowStockCount > 0
      ? lowStockCount === 1
        ? "1 line is at or below its reorder point."
        : `${lowStockCount} lines are at or below their reorder point.`
      : null,
    negativeCount > 0
      ? negativeCount === 1
        ? "1 line is negative and needs investigating."
        : `${negativeCount} lines are negative and need investigating.`
      : null,
  ].filter(Boolean);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        {bp.isMobile ? null : actions}

        {alertText.length > 0 ? (
          <Notice
            tone="danger"
            title={alertText[0] ?? undefined}
            action={
              lowStockCount > 0 ? (
                <Button
                  title={lowOnly ? "Show all" : "Show"}
                  variant="secondary"
                  size="sm"
                  onPress={() => table.setFilter("low", lowOnly ? null : "low")}
                />
              ) : undefined
            }
          >
            {alertText[1]}
          </Notice>
        ) : null}

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
              label="Low stock"
              selected={table.state.filters.low === "low"}
              onPress={() => table.setFilter("low", table.state.filters.low === "low" ? null : "low")}
            />
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
                minWidth: 220,
                render: (l: OnHandLine) => <SkuTag sku={l.variant.sku} />,
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
                minWidth: 180,
                render: (l: OnHandLine) => (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <OnHandValue line={l} />
                    <StockBadge line={l} />
                  </View>
                ),
                sortValue: (l: OnHandLine) => l.quantity,
              },
              {
                key: "reorder",
                title: "Reorder point",
                minWidth: 150,
                hideOnMobile: true,
                // An unset reorder point is not zero: nobody asked to be told about this line.
                render: (l: OnHandLine) => (l.lowStock ? formatQuantity(l.lowStock.reorder_point) : "—"),
                sortValue: (l: OnHandLine) => l.lowStock?.reorder_point ?? -1,
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
            onRowPress={openLine}
            renderMobileRow={(l: OnHandLine) => (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <AppText variant="h3">{l.product_name}</AppText>
                  <SkuTag sku={l.variant.sku} />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <AppText variant="caption" style={{ color: theme.colors.textSecondary }}>
                      {l.location_name}
                    </AppText>
                    <StockBadge line={l} />
                    {l.pending !== 0 ? (
                      <Badge tone="warning" label={`${l.pending > 0 ? "+" : ""}${formatQuantity(l.pending)} unsynced`} />
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <OnHandValue line={l} large />
                  <AppText variant="caption">
                    {l.lowStock ? `reorder ${formatQuantity(l.lowStock.reorder_point)}` : "—"}
                  </AppText>
                </View>
              </View>
            )}
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
        {bp.isMobile ? (
          <>
            <AppText variant="caption">Tap a line to adjust it.</AppText>
            {actions}
          </>
        ) : null}
      </Stack>
    </Screen>
  );
}

/** Low reads as danger, negative as warning: negative is a count to investigate, not a reorder. */
function OnHandValue({ line, large }: { line: OnHandLine; large?: boolean }) {
  const color =
    line.quantity < 0 ? theme.colors.warningText : line.lowStock?.low ? theme.colors.dangerText : theme.colors.text;
  return (
    <AppText
      style={{
        color,
        fontWeight: theme.typography.weight.bold,
        fontSize: large ? theme.typography.size.xl : theme.typography.size.lg,
      }}
    >
      {formatQuantity(line.quantity)}
    </AppText>
  );
}

function StockBadge({ line }: { line: OnHandLine }) {
  if (line.quantity < 0) return <Badge tone="warning" label="Negative · investigate" />;
  if (line.lowStock?.low) {
    const short = line.lowStock.shortfall;
    return <Badge tone="danger" label={short > 0 ? `Low · ${formatQuantity(short)} short` : "Low"} />;
  }
  return null;
}
