import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductEditScreen from "@/features/products/screens/ProductEditScreen";

export default function ProductsEditRoute() {
  return (
    <RequirePermissions permissions={["catalog.write"]}>
      <ProductEditScreen />
    </RequirePermissions>
  );
}
