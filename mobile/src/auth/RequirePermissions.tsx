import { Redirect } from "expo-router";
import React from "react";

import { hasAllPermissions } from "@/auth/permissions";
import { useSession } from "@/auth/session";

export function RequirePermissions(props: { permissions: string[]; children: React.ReactNode }) {
  const { session, isHydrating, isIdentityLoading } = useSession();

  if (isHydrating || isIdentityLoading) return null;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!hasAllPermissions(session, props.permissions)) return <Redirect href="/(tabs)/unauthorized" />;

  return <>{props.children}</>;
}

