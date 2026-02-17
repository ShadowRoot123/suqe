import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductGroupsListScreen from "@/features/productGroups/screens/ProductGroupsListScreen";

export default function ProductGroupsIndexRoute() {
  return (
    <RequirePermissions permissions={["catalog.read"]}>
      <ProductGroupsListScreen />
    </RequirePermissions>
  );
}
