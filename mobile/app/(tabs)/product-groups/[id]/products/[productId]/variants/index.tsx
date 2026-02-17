import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import ProductVariantsListScreen from "@/features/variants/screens/ProductVariantsListScreen";

export default function VariantsIndexRoute() {
  return (
    <RequirePermissions permissions={["catalog.read"]}>
      <ProductVariantsListScreen />
    </RequirePermissions>
  );
}
