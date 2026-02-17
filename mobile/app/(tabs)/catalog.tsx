import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { categoriesList } from "@/catalog/categories";
import { variantsSearch } from "@/catalog/variants";
import { getLastSyncChanges } from "@/sync/syncEngine";
import { createCategoryOffline, createProductOffline } from "@/sync/syncEngine";
import { BarChartCard } from "@/ui/charts";
import { AppText, Button, Card, Chip, Screen, SectionHeader, Stack, TextField } from "@/ui/components";
import { useDebouncedValue } from "@/ui/hooks/useDebouncedValue";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { DataTable, FilterBar, useTableState } from "@/ui/table";

export default function CatalogScreen() {
  const params = useLocalSearchParams<{ barcode?: string }>();
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [newProductName, setNewProductName] = React.useState("");
  const [newProductSku, setNewProductSku] = React.useState("");
  const [newProductBarcode, setNewProductBarcode] = React.useState("");
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);
  const [results, setResults] = React.useState<
    { id: string; sku: string; barcode: string | null; product_name: string | null }[]
  >([]);
  const [lastChanges, setLastChanges] = React.useState<{ id: string; entity: string; operation: string; status: string }[]>(
    []
  );
  const bp = useBreakpoint();

  const refresh = React.useCallback(async () => {
    const rows = await categoriesList();
    setCategories(rows.map((r) => ({ id: r.id, name: r.name })));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const changes = await getLastSyncChanges();
      if (cancelled) return;
      setLastChanges(
        changes.slice(-8).reverse().map((c) => ({
          id: String(c.id),
          entity: String(c.entity ?? "-"),
          operation: String((c.metadata as any)?.operation ?? "-"),
          status: String((c.metadata as any)?.status ?? "-"),
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const variantsTable = useTableState(results, {
    queryMode: "external",
    filterFns: {
      hasBarcode: (row, value) => (value === true ? Boolean(row.barcode) : true),
      hasName: (row, value) => (value === true ? Boolean(row.product_name && row.product_name.trim()) : true),
    },
    sortValueBy: {
      product_name: (r) => r.product_name ?? "",
      sku: (r) => r.sku,
      barcode: (r) => r.barcode ?? "",
    },
    initial: { pageSize: 25 },
  });
  const setVariantQuery = variantsTable.setQuery;

  React.useEffect(() => {
    if (typeof params.barcode === "string" && params.barcode.length > 0) {
      setVariantQuery(params.barcode);
    }
  }, [params.barcode, setVariantQuery]);

  const categoriesTable = useTableState(categories, {
    getSearchText: (c) => c.name,
    sortValueBy: { name: (c) => c.name },
    initial: { pageSize: 25 },
  });

  const debouncedQuery = useDebouncedValue(variantsTable.state.query, 200);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = debouncedQuery.trim();
      if (!q) {
        if (!cancelled) setResults([]);
        return;
      }
      const hits = await variantsSearch(q, 50);
      if (cancelled) return;
      setResults(
        hits.map((h) => ({
          id: h.id,
          sku: h.sku,
          barcode: h.barcode,
          product_name: h.product_name,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const showPaged = !bp.isMobile;
  const variantRows = showPaged ? variantsTable.pagedRows : variantsTable.rows;

  return (
    <RequirePermissions permissions={["catalog.read"]}>
      <Screen scroll>
        <Stack gap={16}>
          <AppText variant="h1">Catalog</AppText>

        <Card>
          <Stack gap={12}>
            <SectionHeader
              title="Search"
              right={<Button title="Scan barcode" variant="secondary" onPress={() => router.push("/scanner")} />}
            />

            <FilterBar
              searchValue={variantsTable.state.query}
              onSearchChange={variantsTable.setQuery}
              onReset={() => {
                variantsTable.setQuery("");
                variantsTable.clearFilters();
              }}
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Chip
                  label="Has barcode"
                  selected={variantsTable.state.filters.hasBarcode === true}
                  onPress={() =>
                    variantsTable.setFilter(
                      "hasBarcode",
                      variantsTable.state.filters.hasBarcode === true ? null : true
                    )
                  }
                />
                <Chip
                  label="Has name"
                  selected={variantsTable.state.filters.hasName === true}
                  onPress={() =>
                    variantsTable.setFilter("hasName", variantsTable.state.filters.hasName === true ? null : true)
                  }
                />
              </View>
            </FilterBar>
          </Stack>
        </Card>

        <Stack gap={10}>
          <SectionHeader title="Search results" />
          <DataTable
            columns={[
              {
                key: "product_name",
                title: "Product",
                minWidth: 240,
                render: (r) => r.product_name ?? "-",
                sortValue: (r) => r.product_name ?? "",
              },
              { key: "sku", title: "SKU", minWidth: 180, render: (r) => r.sku, sortValue: (r) => r.sku },
              {
                key: "barcode",
                title: "Barcode",
                minWidth: 200,
                render: (r) => r.barcode ?? "-",
                sortValue: (r) => r.barcode ?? "",
              },
            ]}
            rows={variantRows}
            getRowId={(r) => r.id}
            sort={{ key: variantsTable.state.sortKey, dir: variantsTable.state.sortDir, onToggle: variantsTable.toggleSort }}
            pagination={
              showPaged
                ? {
                    page: variantsTable.state.page,
                    pageSize: variantsTable.state.pageSize,
                    totalRows: variantsTable.totalRows,
                    onPageChange: variantsTable.setPage,
                    onPageSizeChange: variantsTable.setPageSize,
                  }
                : undefined
            }
            emptyTitle={variantsTable.state.query.trim() ? "No results" : "Type to search"}
            emptySubtitle={variantsTable.state.query.trim() ? undefined : "Search by SKU, barcode, or product name"}
          />
        </Stack>

        <Card>
          <Stack gap={12}>
            <SectionHeader title="Products (offline)" />
            <TextField
              label="Product name"
              value={newProductName}
              onChangeText={setNewProductName}
              autoCapitalize="words"
              placeholder="e.g. Cola 330ml"
            />
            <TextField
              label="SKU"
              value={newProductSku}
              onChangeText={setNewProductSku}
              autoCapitalize="characters"
              placeholder="e.g. COLA-330"
            />
            <TextField
              label="Barcode (optional)"
              value={newProductBarcode}
              onChangeText={setNewProductBarcode}
              autoCapitalize="none"
              placeholder="e.g. 0123456789"
            />
            <Button
              title="Add product (offline)"
              variant="secondary"
              onPress={async () => {
                const name = newProductName.trim();
                const sku = newProductSku.trim();
                const barcode = newProductBarcode.trim();
                if (!name || !sku) return;
                await createProductOffline({ name, sku, barcode: barcode.length ? barcode : undefined });
                setNewProductName("");
                setNewProductSku("");
                setNewProductBarcode("");
                variantsTable.setQuery(sku);
              }}
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap={12}>
            <SectionHeader title="Last sync changes" />
            {lastChanges.length === 0 ? (
              <AppText muted>No changes yet</AppText>
            ) : (
              lastChanges.map((c) => (
                <AppText key={c.id} muted>
                  {c.entity} · {c.operation} · {c.status}
                </AppText>
              ))
            )}
          </Stack>
        </Card>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: bp.isMobile ? "100%" : bp.isTablet ? "100%" : "49%" }}>
            <BarChartCard
              title="Recent changes"
              subtitle="Counts by status (last 8)"
              data={[
                { x: "ok", y: lastChanges.filter((c) => c.status === "ok").length },
                { x: "applied", y: lastChanges.filter((c) => c.status === "applied").length },
                { x: "other", y: lastChanges.filter((c) => c.status !== "ok" && c.status !== "applied").length },
              ]}
            />
          </View>
        </View>

        <Card>
          <Stack gap={12}>
            <SectionHeader title="Categories" />
            <FilterBar
              searchValue={categoriesTable.state.query}
              onSearchChange={categoriesTable.setQuery}
              onReset={() => {
                categoriesTable.setQuery("");
                categoriesTable.clearFilters();
              }}
            />

            <DataTable
              columns={[{ key: "name", title: "Name", minWidth: 260, render: (c) => c.name, sortValue: (c) => c.name }]}
              rows={bp.isMobile ? categoriesTable.rows : categoriesTable.pagedRows}
              getRowId={(c) => c.id}
              sort={{ key: categoriesTable.state.sortKey, dir: categoriesTable.state.sortDir, onToggle: categoriesTable.toggleSort }}
              pagination={
                bp.isMobile
                  ? undefined
                  : {
                      page: categoriesTable.state.page,
                      pageSize: categoriesTable.state.pageSize,
                      totalRows: categoriesTable.totalRows,
                      onPageChange: categoriesTable.setPage,
                      onPageSizeChange: categoriesTable.setPageSize,
                    }
              }
            />

            <TextField
              label="New category name"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoCapitalize="words"
              placeholder="e.g. Beverages"
            />
            <Button
              title="Add category (offline)"
              variant="secondary"
              onPress={async () => {
                const name = newCategoryName.trim();
                if (!name) return;
                await createCategoryOffline(name);
                setNewCategoryName("");
                await refresh();
              }}
            />
          </Stack>
        </Card>
        </Stack>
      </Screen>
    </RequirePermissions>
  );
}
