import React from "react";
import { Platform, RefreshControl, View } from "react-native";

import { categoriesList } from "@/catalog/categories";
import { getDb } from "@/db/db";
import { getLastSyncChanges } from "@/sync/syncEngine";
import { outboxCount } from "@/sync/outbox";
import { BarChartCard, LineChartCard } from "@/ui/charts";
import { AppText, KpiCard, Screen, Stack } from "@/ui/components";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";

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
  const [categoryCount, setCategoryCount] = React.useState(0);
  const [productCount, setProductCount] = React.useState(0);
  const [variantCount, setVariantCount] = React.useState(0);
  const [changes, setChanges] = React.useState<{ created_at: string; entity: string | null }[]>([]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [pending, cats, prods, vars, lastChanges] = await Promise.all([
        outboxCount("pending"),
        categoriesList(),
        countTable("products", "myshop.products.v1"),
        countTable("variants", "myshop.variants.v1"),
        getLastSyncChanges(),
      ]);
      setPendingOutbox(pending);
      setCategoryCount(cats.length);
      setProductCount(prods);
      setVariantCount(vars);
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
    .slice(0, 8)
    .map(([x, y]) => ({ x, y }));

  const kpiWidth = bp.isMobile ? "100%" : bp.isTablet ? "48%" : "24%";
  const chartWidth = bp.isMobile ? "100%" : bp.isTablet ? "100%" : "49%";

  return (
    <Screen
      scroll
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Stack gap={16}>
        <AppText variant="h1">Dashboard</AppText>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: kpiWidth }}>
            <KpiCard label="Pending outbox" value={pendingOutbox} subtitle="Offline commands waiting to sync" />
          </View>
          <View style={{ width: kpiWidth }}>
            <KpiCard label="Categories" value={categoryCount} subtitle="Stored locally" />
          </View>
          <View style={{ width: kpiWidth }}>
            <KpiCard label="Products" value={productCount} subtitle="Stored locally" />
          </View>
          <View style={{ width: kpiWidth }}>
            <KpiCard label="Variants" value={variantCount} subtitle="Stored locally" />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <View style={{ width: chartWidth }}>
            <LineChartCard title="Sync changes (7d)" subtitle="Count of recent pull changes" data={dailyCounts} />
          </View>
          <View style={{ width: chartWidth }}>
            <BarChartCard title="Changes by entity" subtitle="Top entities (last 50)" data={entityBars} />
          </View>
        </View>
      </Stack>
    </Screen>
  );
}
