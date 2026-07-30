import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { MovementHistoryScreen } from "@/features/inventory";

export default function InventoryMovementsRoute() {
  return (
    <RequirePermissions permissions={["inventory.view_movements"]}>
      <MovementHistoryScreen />
    </RequirePermissions>
  );
}
