import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { SupplierFormScreen } from "@/features/suppliers";

export default function SupplierCreateRoute() {
  return (
    <RequirePermissions permissions={["purchasing.write"]}>
      <SupplierFormScreen mode="create" />
    </RequirePermissions>
  );
}
