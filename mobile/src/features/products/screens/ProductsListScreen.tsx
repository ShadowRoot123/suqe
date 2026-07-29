import { router } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { AppText, Button, Chip, Screen, Stack } from "@/ui/components";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { DataTable, FilterBar, useTableState } from "@/ui/table";

import { useProductsListData } from "../hooks/useProductsListData";

export default function ProductsListScreen() {
  const bp = useBreakpoint();
  const { refreshing, refresh, products, categories, categoryNameById } = useProductsListData();

  const table = useTableState(products, {
    getSearchText: (p) => `${p.name} ${p.status} ${p.category_id ? categoryNameById.get(p.category_id) ?? "" : ""}`,
    filterFns: {
      status: (p, value) => (typeof value === "string" ? p.status === value : true),
      category: (p, value) => (typeof value === "string" ? p.category_id === value : true),
    },
    sortValueBy: {
      name: (p) => p.name,
      status: (p) => p.status,
      category: (p) => (p.category_id ? categoryNameById.get(p.category_id) ?? "" : ""),
      updated_at: (p) => p.updated_at,
    },
    initial: { sortKey: "updated_at", sortDir: "desc", pageSize: 25 },
  });

  const showPaged = !bp.isMobile;
  const rows = showPaged ? table.pagedRows : table.rows;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="h1">Products</AppText>
          <Button title="Add product" onPress={() => router.push("/(tabs)/products/create")} />
        </View>

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
              label="Active"
              selected={table.state.filters.status === "active"}
              onPress={() => table.setFilter("status", table.state.filters.status === "active" ? null : "active")}
            />
            <Chip
              label="Archived"
              selected={table.state.filters.status === "archived"}
              onPress={() => table.setFilter("status", table.state.filters.status === "archived" ? null : "archived")}
            />
            {categories.slice(0, 8).map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={table.state.filters.category === c.id}
                onPress={() => table.setFilter("category", table.state.filters.category === c.id ? null : c.id)}
              />
            ))}
          </View>
        </FilterBar>

        <DataTable
          columns={[
            { key: "name", title: "Name", minWidth: 240, render: (p) => p.name, sortValue: (p) => p.name },
            {
              key: "category",
              title: "Category",
              minWidth: 200,
              render: (p) => (p.category_id ? categoryNameById.get(p.category_id) ?? "-" : "-"),
              sortValue: (p) => (p.category_id ? categoryNameById.get(p.category_id) ?? "" : ""),
            },
            { key: "status", title: "Status", minWidth: 140, render: (p) => p.status, sortValue: (p) => p.status },
            {
              key: "updated_at",
              title: "Updated",
              minWidth: 200,
              hideOnMobile: true,
              render: (p) => new Date(p.updated_at).toLocaleString(),
              sortValue: (p) => p.updated_at,
            },
          ]}
          rows={rows}
          getRowId={(p) => p.id}
          onRowPress={(p) => router.push({ pathname: "/(tabs)/products/[id]", params: { id: p.id } })}
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
