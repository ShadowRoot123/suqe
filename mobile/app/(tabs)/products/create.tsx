import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductCreateScreen from "@/features/products/screens/ProductCreateScreen";

export default function ProductsCreateRoute() {
  return (
    <RequirePermissions permissions={["catalog.write"]}>
      <ProductCreateScreen />
    </RequirePermissions>
  );
}
