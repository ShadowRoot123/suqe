import type React from "react";

export type SortDir = "asc" | "desc";

export type DataTableColumn<T> = {
  key: string;
  title: string;
  width?: number;
  minWidth?: number;
  hideOnMobile?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
};

export type TableFilterValue = string | string[] | boolean | null | { start: string; end: string };
