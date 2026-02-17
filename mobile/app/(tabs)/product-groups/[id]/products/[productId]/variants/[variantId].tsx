import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import VariantEditScreen from "@/features/variants/screens/VariantEditScreen";

export default function VariantsEditRoute() {
  return (
    <RequirePermissions permissions={["catalog.write"]}>
      <VariantEditScreen />
    </RequirePermissions>
  );
}
