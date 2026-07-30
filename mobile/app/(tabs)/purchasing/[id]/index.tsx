import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { PurchaseOrderDetailScreen } from "@/features/purchasing";

export default function PurchaseOrderDetailRoute() {
  return (
    <RequirePermissions permissions={["purchasing.read"]}>
      <PurchaseOrderDetailScreen />
    </RequirePermissions>
  );
}
