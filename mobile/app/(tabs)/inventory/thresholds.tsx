import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { StockThresholdScreen } from "@/features/inventory";

export default function InventoryThresholdsRoute() {
  return (
    <RequirePermissions permissions={["inventory.adjust"]}>
      <StockThresholdScreen />
    </RequirePermissions>
  );
}
