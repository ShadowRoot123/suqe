import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { PurchaseOrdersListScreen } from "@/features/purchasing";

export default function PurchaseOrdersRoute() {
  return (
    <RequirePermissions permissions={["purchasing.read"]}>
      <PurchaseOrdersListScreen />
    </RequirePermissions>
  );
}
