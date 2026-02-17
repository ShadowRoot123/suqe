import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductGroupCreateScreen from "@/features/productGroups/screens/ProductGroupCreateScreen";

export default function ProductGroupsCreateRoute() {
  return (
    <RequirePermissions permissions={["catalog.write"]}>
      <ProductGroupCreateScreen />
    </RequirePermissions>
  );
}
