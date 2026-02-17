import React from "react";

import type { SortDir, TableFilterValue } from "@/ui/table/types";

export type TableState = {
  query: string;
  sortKey: string | null;
  sortDir: SortDir;
  page: number;
  pageSize: number;
  filters: Record<string, TableFilterValue>;
};

export function applyQuery<T>(rows: T[], query: string, getSearchText?: (row: T) => string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const toText = getSearchText ?? ((row: T) => String(row));
  return rows.filter((r) => toText(r).toLowerCase().includes(q));
}

export function applyFilters<T>(
  rows: T[],
  filters: Record<string, TableFilterValue>,
  filterFns?: Record<string, (row: T, value: TableFilterValue) => boolean>
) {
  if (!filterFns) return rows;
  const entries = Object.entries(filters).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  if (entries.length === 0) return rows;
  return rows.filter((row) => {
    for (const [key, value] of entries) {
      const fn = filterFns[key];
      if (!fn) continue;
      if (!fn(row, value)) return false;
    }
    return true;
  });
}

function cmpPrimitive(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b));
}

export function applySort<T>(
  rows: T[],
  sortKey: string | null,
  sortDir: SortDir,
  sortValueBy?: Record<string, (row: T) => unknown>
) {
  if (!sortKey) return rows;
  const getter = sortValueBy?.[sortKey];
  if (!getter) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => dir * cmpPrimitive(getter(a), getter(b)));
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const safePageSize = pageSize > 0 ? pageSize : 25;
  const safePage = page >= 1 ? page : 1;
  const start = (safePage - 1) * safePageSize;
  return rows.slice(start, start + safePageSize);
}

export function useTableState<T>(rows: T[], opts?: {
  getSearchText?: (row: T) => string;
  queryMode?: "local" | "external";
  filterFns?: Record<string, (row: T, value: TableFilterValue) => boolean>;
  sortValueBy?: Record<string, (row: T) => unknown>;
  initial?: Partial<TableState>;
}) {
  const initialRef = React.useRef<TableState | null>(null);
  if (initialRef.current === null) {
    initialRef.current = {
      query: "",
      sortKey: null,
      sortDir: "asc",
      page: 1,
      pageSize: 25,
      ...opts?.initial,
      filters: { ...(opts?.initial?.filters ?? {}) },
    };
  }

  const [state, setState] = React.useState<TableState>(initialRef.current);

  const filtered = React.useMemo(() => {
    const withQuery = opts?.queryMode === "external" ? rows : applyQuery(rows, state.query, opts?.getSearchText);
    const withFilters = applyFilters(withQuery, state.filters, opts?.filterFns);
    return applySort(withFilters, state.sortKey, state.sortDir, opts?.sortValueBy);
  }, [
    rows,
    state.query,
    state.filters,
    state.sortKey,
    state.sortDir,
    opts?.getSearchText,
    opts?.queryMode,
    opts?.filterFns,
    opts?.sortValueBy,
  ]);

  const paged = React.useMemo(() => paginate(filtered, state.page, state.pageSize), [filtered, state.page, state.pageSize]);

  const setQuery = React.useCallback((query: string) => {
    setState((s) => ({ ...s, query, page: 1 }));
  }, []);

  const setFilter = React.useCallback((key: string, value: TableFilterValue) => {
    setState((s) => ({ ...s, filters: { ...s.filters, [key]: value }, page: 1 }));
  }, []);

  const clearFilters = React.useCallback(() => {
    setState((s) => ({ ...s, filters: {}, page: 1 }));
  }, []);

  const toggleSort = React.useCallback((key: string) => {
    setState((s) => {
      if (s.sortKey !== key) return { ...s, sortKey: key, sortDir: "asc", page: 1 };
      return { ...s, sortDir: s.sortDir === "asc" ? "desc" : "asc", page: 1 };
    });
  }, []);

  const setPage = React.useCallback((page: number) => setState((s) => ({ ...s, page })), []);
  const setPageSize = React.useCallback((pageSize: number) => setState((s) => ({ ...s, pageSize, page: 1 })), []);

  const reset = React.useCallback(() => setState(initialRef.current as TableState), []);

  const queryParams = React.useMemo(() => {
    const params: Record<string, string> = {};
    if (state.query.trim()) params.q = state.query.trim();
    if (state.sortKey) params.sort = state.sortKey;
    if (state.sortKey) params.dir = state.sortDir;
    params.page = String(state.page);
    params.page_size = String(state.pageSize);
    for (const [k, v] of Object.entries(state.filters)) {
      if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      if (typeof v === "string") params[k] = v;
      else if (typeof v === "boolean") params[k] = v ? "true" : "false";
      else if (Array.isArray(v)) params[k] = v.join(",");
      else if (typeof v === "object") {
        params[`${k}_start`] = v.start;
        params[`${k}_end`] = v.end;
      }
    }
    return params;
  }, [state]);

  return {
    state,
    setQuery,
    setFilter,
    clearFilters,
    toggleSort,
    setPage,
    setPageSize,
    reset,
    rows: filtered,
    pagedRows: paged,
    totalRows: filtered.length,
    queryParams,
  };
}
