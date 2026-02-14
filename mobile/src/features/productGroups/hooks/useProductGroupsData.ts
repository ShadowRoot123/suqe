import React from "react";

import { productGroupsList, type ProductGroupRow } from "@/catalog/productGroups";

export function useProductGroupsData() {
  const [refreshing, setRefreshing] = React.useState(false);
  const [groups, setGroups] = React.useState<ProductGroupRow[]>([]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      setGroups(await productGroupsList());
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { refreshing, refresh, groups };
}

