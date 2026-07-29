import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { LocationFormScreen } from "@/features/locations";

export default function InventoryLocationEditRoute() {
  return (
    <RequirePermissions permissions={["locations.write"]}>
      <LocationFormScreen mode="edit" />
    </RequirePermissions>
  );
}
