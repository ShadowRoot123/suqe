import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductGroupDetailScreen from "@/features/productGroups/screens/ProductGroupDetailScreen";

export default function ProductGroupsDetailRoute() {
  return (
    <RequirePermissions permissions={["catalog.read"]}>
      <ProductGroupDetailScreen />
    </RequirePermissions>
  );
}
