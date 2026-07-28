import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { InventoryOverviewScreen } from "@/features/inventory";

export default function InventoryRoute() {
  return (
    <RequirePermissions permissions={["inventory.read"]}>
      <InventoryOverviewScreen />
    </RequirePermissions>
  );
}
