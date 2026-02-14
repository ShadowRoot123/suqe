import { router } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { AppText, Button, Screen, Stack } from "@/ui/components";
import { DataTable, useTableState } from "@/ui/table";

import { useProductGroupsData } from "../hooks/useProductGroupsData";

export default function ProductGroupsListScreen() {
  const { refreshing, refresh, groups } = useProductGroupsData();

  const table = useTableState(groups, {
    getSearchText: (g) => `${g.name}`,
    sortValueBy: {
      name: (g) => g.name,
      updated_at: (g) => g.updated_at,
    },
    initial: { sortKey: "updated_at", sortDir: "desc", pageSize: 25 },
  });

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="h1">Product groups</AppText>
          <Button title="New group" onPress={() => router.push("/(tabs)/product-groups/create")} />
        </View>

        <DataTable
          columns={[
            { key: "name", title: "Name", minWidth: 240, render: (g) => g.name, sortValue: (g) => g.name },
            {
              key: "updated_at",
              title: "Updated",
              minWidth: 200,
              hideOnMobile: true,
              render: (g) => new Date(g.updated_at).toLocaleString(),
              sortValue: (g) => g.updated_at,
            },
          ]}
          rows={table.pagedRows}
          getRowId={(g) => g.id}
          onRowPress={(g) => router.push({ pathname: "/(tabs)/product-groups/[id]", params: { id: g.id } })}
          sort={{ key: table.state.sortKey, dir: table.state.sortDir, onToggle: table.toggleSort }}
          pagination={{
            page: table.state.page,
            pageSize: table.state.pageSize,
            totalRows: table.totalRows,
            onPageChange: table.setPage,
            onPageSizeChange: table.setPageSize,
          }}
        />
      </Stack>
    </Screen>
  );
}

