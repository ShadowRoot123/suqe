import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { ReceiveOrderScreen } from "@/features/purchasing";

export default function ReceiveOrderRoute() {
  return (
    <RequirePermissions permissions={["purchasing.receive"]}>
      <ReceiveOrderScreen />
    </RequirePermissions>
  );
}
