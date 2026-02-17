import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductsListScreen from "@/features/products/screens/ProductsListScreen";

export default function ProductsIndexRoute() {
  return (
    <RequirePermissions permissions={["catalog.read"]}>
      <ProductsListScreen />
    </RequirePermissions>
  );
}
