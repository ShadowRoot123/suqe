import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { SaleReceiptScreen } from "@/features/pos";

export default function SaleReceiptRoute() {
  return (
    <RequirePermissions permissions={["pos.sell"]}>
      <SaleReceiptScreen />
    </RequirePermissions>
  );
}
