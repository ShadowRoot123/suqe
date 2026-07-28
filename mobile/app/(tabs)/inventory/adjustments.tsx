import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { StockAdjustmentScreen } from "@/features/inventory";

export default function InventoryAdjustmentsRoute() {
  return (
    <RequirePermissions permissions={["inventory.adjust"]}>
      <StockAdjustmentScreen />
    </RequirePermissions>
  );
}
