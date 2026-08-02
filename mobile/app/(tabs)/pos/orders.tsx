import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { SalesHistoryScreen } from "@/features/pos";

export default function PosOrdersRoute() {
  return (
    <RequirePermissions permissions={["pos.sell"]}>
      <SalesHistoryScreen />
    </RequirePermissions>
  );
}
