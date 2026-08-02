import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { PosCartScreen } from "@/features/pos";

export default function PosRoute() {
  return (
    <RequirePermissions permissions={["pos.sell"]}>
      <PosCartScreen />
    </RequirePermissions>
  );
}
