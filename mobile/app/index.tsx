import { Redirect } from "expo-router";

import { useSession } from "@/auth/session";

export default function Index() {
  const { session, isHydrating } = useSession();

  if (isHydrating) return null;

  if (!session) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href="/(tabs)/sync" />;
}

