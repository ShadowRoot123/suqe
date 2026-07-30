import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { SupplierFormScreen } from "@/features/suppliers";

export default function SupplierEditRoute() {
  return (
    <RequirePermissions permissions={["purchasing.write"]}>
      <SupplierFormScreen mode="edit" />
    </RequirePermissions>
  );
}
