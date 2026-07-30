import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { PurchaseOrderFormScreen } from "@/features/purchasing";

export default function PurchaseOrderEditRoute() {
  return (
    <RequirePermissions permissions={["purchasing.write"]}>
      <PurchaseOrderFormScreen mode="edit" />
    </RequirePermissions>
  );
}
