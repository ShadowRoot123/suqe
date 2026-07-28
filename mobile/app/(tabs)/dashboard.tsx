import React from "react";
import { RefreshControl, View } from "react-native";

import { categoriesList } from "@/catalog/categories";
import { productsList } from "@/catalog/products";
import { getDb } from "@/db/db";
import { getLastSyncChanges } from "@/sync/syncEngine";
import { outboxCount } from "@/sync/outbox";
import { BarChartCard, LineChartCard } from "@/ui/charts";
import { AppText, Badge, Card, KpiCard, Screen, Stack } from "@/ui/components";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { theme } from "@/ui/theme";
import { Platform } from "react-native";

function startOfDayISO(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

async function countFromWebKey(key: string) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

async function countTable(table: string, webKey: string) {
  if (Platform.OS === "web") return await countFromWebKey(webKey);
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
  return row?.c ?? 0;
}

export default function DashboardScreen() {
  const bp = useBreakpoint();
  const [refreshing, setRefreshing] = React.useState(false);
  const [pendingOutbox, setPendingOutbox] = React.useState(0);
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = React.useState<{ category_id: string | null }[]>([]);
  const [variantCount, setVariantCount] = React.useState(0);
  const [groupCount, setGroupCount] = React.useState(0);
  const [changes, setChanges] = React.useState<{ created_at: string; entity: string | null }[]>([]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [pending, cats, prods, vars, groups, lastChanges] = await Promise.all([
        outboxCount("pending"),
        categoriesList(),
        productsList(),
        countTable("variants", "myshop.variants.v1"),
        countTable("product_groups", "myshop.product_groups.v1"),
        getLastSyncChanges(),
      ]);
      setPendingOutbox(pending);
      setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
      setProducts(prods.map((p) => ({ category_id: p.category_id })));
      setVariantCount(vars);
      setGroupCount(groups);
      setChanges(lastChanges.map((c) => ({ created_at: c.created_at, entity: c.entity })));
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const dailyCounts = days.map((d) => {
    const start = startOfDayISO(d);
    const end = startOfDayISO(addDays(d, 1));
    const count = changes.filter((c) => c.created_at >= start && c.created_at < end).length;
    return { x: start.slice(5, 10), y: count };
  });

  const byEntity = new Map<string, number>();
  for (const c of changes) {
    const key = c.entity ?? "unknown";
    byEntity.set(key, (byEntity.get(key) ?? 0) + 1);
  }
  const entityBars = [...byEntity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([x, y]) => ({ x, y }));

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, number>();
  for (const p of products) {
    const name = p.category_id ? categoryName.get(p.category_id) ?? "Unknown" : "Uncategorized";
    byCategory.set(name, (byCategory.get(name) ?? 0) + 1);
  }
  const categoryBars = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([x, y]) => ({ x, y }));

  const kpiWidth = bp.isMobile ? "100%" : bp.isTablet ? "48%" : "24%";
  const chartWidth = bp.isMobile ? "100%" : bp.isTablet ? "100%" : "49%";
  const synced = pendingOutbox === 0;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack gap={16}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: theme.spacing.xs,
          }}
        >
          <View style={{ flex: 1, minWidth: 200 }}>
            <AppText variant="h1">Dashboard</AppText>
            <AppText muted>Catalog stored on this device and its sync status</AppText>
          </View>
          <Badge
            label={synced ? "All changes synced" : `${pendingOutbox} pending`}
            tone={synced ? "success" : "warning"}
          />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: kpiWidth }}>
            <KpiCard
              label="Products"
              value={products.length}
              subtitle="Cached locally"
              tone="primary"
              icon="pricetag-outline"
            />
          </View>
          <View style={{ width: kpiWidth }}>
            <KpiCard label="Variants" value={variantCount} subtitle="Sellable units" icon="cube-outline" />
          </View>
          <View style={{ width: kpiWidth }}>
            <KpiCard label="Categories" value={categories.length} subtitle={`${groupCount} product groups`} icon="folder-outline" />
          </View>
          <View style={{ width: kpiWidth }}>
            <KpiCard
              label="Pending sync"
              value={pendingOutbox}
              subtitle={synced ? "Nothing waiting to push" : "Offline commands queued"}
              tone={synced ? "success" : "warning"}
              icon={synced ? "checkmark-circle-outline" : "cloud-upload-outline"}
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: chartWidth }}>
            <LineChartCard
              title="Sync activity"
              subtitle="Changes pulled per day, last 7 days"
              data={dailyCounts}
              emptyText="No changes pulled in the last 7 days"
            />
          </View>
          <View style={{ width: chartWidth }}>
            <BarChartCard
              title="Products by category"
              subtitle="Top 6 categories"
              data={categoryBars}
              color={theme.series[1]}
              emptyText="No products cached yet"
            />
          </View>
        </View>

        <BarChartCard
          title="Changes by entity"
          subtitle="Most recent 50 pulled changes"
          data={entityBars}
          color={theme.series[4]}
          emptyText="Run a sync to see recent changes"
        />

        {products.length === 0 ? (
          <Card>
            <Stack gap={6}>
              <AppText variant="h3">No catalog yet</AppText>
              <AppText muted>
                Pull from the server on the Sync screen to download products, or create one from the Products screen.
              </AppText>
            </Stack>
          </Card>
        ) : null}
      </Stack>
    </Screen>
  );
}
