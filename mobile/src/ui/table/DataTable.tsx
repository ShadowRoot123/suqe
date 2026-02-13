import React from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Divider } from "@/ui/components/Divider";
import { Row } from "@/ui/components/Row";
import { Stack } from "@/ui/components/Stack";
import { EmptyState, ErrorState, LoadingState } from "@/ui/components/States";
import { useBreakpoint } from "@/ui/hooks/useBreakpoint";
import { theme } from "@/ui/theme";
import type { DataTableColumn, SortDir } from "@/ui/table/types";

export type DataTableSort = {
  key: string | null;
  dir: SortDir;
  onToggle: (key: string) => void;
};

export type DataTablePagination = {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowPress?: (row: T) => void;
  loading?: boolean;
  errorText?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  sort?: DataTableSort;
  pagination?: DataTablePagination;
};

function renderCell(value: React.ReactNode) {
  if (typeof value === "string" || typeof value === "number") return <AppText>{String(value)}</AppText>;
  return value;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowPress,
  loading,
  errorText,
  emptyTitle,
  emptySubtitle,
  sort,
  pagination,
}: DataTableProps<T>) {
  const bp = useBreakpoint();

  if (loading) return <LoadingState />;
  if (errorText) return <ErrorState message={errorText} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle ?? "No results"} subtitle={emptySubtitle} />;

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);

  if (bp.isMobile) {
    return (
      <FlatList
        data={rows}
        keyExtractor={(r) => getRowId(r)}
        contentContainerStyle={{ paddingBottom: 16, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable onPress={onRowPress ? () => onRowPress(item) : undefined}>
            <Card style={{ padding: 12 }}>
              <Stack gap={8}>
                {mobileColumns.slice(0, 5).map((c) => (
                  <Row key={c.key} justify="space-between" align="flex-start" gap={10}>
                    <AppText variant="caption" style={{ flex: 1 }}>
                      {c.title}
                    </AppText>
                    <View style={{ flex: 2, alignItems: "flex-end" }}>{renderCell(c.render(item))}</View>
                  </Row>
                ))}
              </Stack>
            </Card>
          </Pressable>
        )}
      />
    );
  }

  return (
    <Card padded={false} style={styles.tableWrap}>
      <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
        <View style={{ minWidth: "100%" }}>
          <View style={styles.headerRow}>
            {columns.map((c) => {
              const sortable = Boolean(c.sortValue);
              const isActive = sort?.key === c.key;
              const indicator = isActive ? (sort?.dir === "asc" ? " ↑" : " ↓") : "";
              const header = (
                <AppText variant="caption" style={[styles.headerText, sortable && styles.sortable]}>
                  {c.title}
                  {indicator}
                </AppText>
              );
              const cellStyle = [
                styles.headerCell,
                c.width ? { width: c.width } : null,
                c.minWidth ? { minWidth: c.minWidth } : null,
              ];

              return sortable && sort ? (
                <Pressable key={c.key} onPress={() => sort.onToggle(c.key)} style={cellStyle}>
                  {header}
                </Pressable>
              ) : (
                <View key={c.key} style={cellStyle}>
                  {header}
                </View>
              );
            })}
          </View>
          <Divider />
          {rows.map((r) => (
            <Pressable key={getRowId(r)} onPress={onRowPress ? () => onRowPress(r) : undefined}>
              <View style={styles.dataRow}>
                {columns.map((c) => (
                  <View
                    key={c.key}
                    style={[
                      styles.dataCell,
                      c.width ? { width: c.width } : null,
                      c.minWidth ? { minWidth: c.minWidth } : null,
                    ]}
                  >
                    {renderCell(c.render(r))}
                  </View>
                ))}
              </View>
              <Divider />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {pagination ? (
        <View style={styles.footer}>
          <Row justify="space-between">
            <Row>
              <Button
                title="Prev"
                variant="secondary"
                disabled={pagination.page <= 1}
                onPress={() => pagination.onPageChange(pagination.page - 1)}
              />
              <Button
                title="Next"
                variant="secondary"
                disabled={pagination.page >= Math.max(1, Math.ceil(pagination.totalRows / pagination.pageSize))}
                onPress={() => pagination.onPageChange(pagination.page + 1)}
              />
            </Row>
            <AppText muted>
              Page {pagination.page} / {Math.max(1, Math.ceil(pagination.totalRows / pagination.pageSize))}
            </AppText>
          </Row>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tableWrap: { overflow: "hidden" },
  headerRow: { flexDirection: "row", paddingVertical: 10, backgroundColor: theme.colors.surfaceAlt },
  headerCell: { paddingHorizontal: 12, minWidth: 160 },
  headerText: { fontWeight: theme.typography.weight.bold, color: theme.colors.muted },
  sortable: { color: theme.colors.text },
  dataRow: { flexDirection: "row", paddingVertical: 12 },
  dataCell: { paddingHorizontal: 12, minWidth: 160 },
  footer: { padding: 12 },
});

