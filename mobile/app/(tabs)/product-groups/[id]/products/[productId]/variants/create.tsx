import React from "react";

import { RequirePermissions } from "@/auth/RequirePermissions";
import VariantCreateScreen from "@/features/variants/screens/VariantCreateScreen";

export default function VariantsCreateRoute() {
  return (
    <RequirePermissions permissions={["catalog.write"]}>
      <VariantCreateScreen />
    </RequirePermissions>
  );
}
