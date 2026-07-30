import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { SuppliersListScreen } from "@/features/suppliers";

export default function SuppliersRoute() {
  return (
    <RequirePermissions permissions={["purchasing.read"]}>
      <SuppliersListScreen />
    </RequirePermissions>
  );
}
