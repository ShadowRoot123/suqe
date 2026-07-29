import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import { LocationsListScreen } from "@/features/locations";

export default function InventoryLocationsRoute() {
  return (
    <RequirePermissions permissions={["locations.read"]}>
      <LocationsListScreen />
    </RequirePermissions>
  );
}
