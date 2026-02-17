import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductGroupEditScreen from "@/features/productGroups/screens/ProductGroupEditScreen";

export default function ProductGroupsEditRoute() {
  return (
    <RequirePermissions permissions={["catalog.write"]}>
      <ProductGroupEditScreen />
    </RequirePermissions>
  );
}
