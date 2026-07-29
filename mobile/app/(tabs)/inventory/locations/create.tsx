import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { LocationFormScreen } from "@/features/locations";

export default function InventoryLocationCreateRoute() {
  return (
    <RequirePermissions permissions={["locations.write"]}>
      <LocationFormScreen mode="create" />
    </RequirePermissions>
  );
}
