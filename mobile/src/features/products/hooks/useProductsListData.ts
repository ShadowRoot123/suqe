import React from "react";

import { categoriesList } from "@/catalog/categories";
import { productsList, type ProductRow } from "@/catalog/products";

export function useProductsListData() {
  const [refreshing, setRefreshing] = React.useState(false);
  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);

  const categoryNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [ps, cs] = await Promise.all([productsList(), categoriesList()]);
      setProducts(ps);
      setCategories(cs.map((c) => ({ id: c.id, name: c.name })));
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return { refreshing, refresh, products, categories, categoryNameById };
}

