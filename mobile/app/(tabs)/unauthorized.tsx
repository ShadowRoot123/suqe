import { router } from "expo-router";
import React from "react";

import { AppText, Button, Screen, Stack } from "@/ui/components";

export default function UnauthorizedScreen() {
  return (
    <Screen scroll>
      <Stack gap={12}>
        <AppText variant="h1">Unauthorized</AppText>
        <AppText muted>You don’t have permission to view this page.</AppText>
        <Button title="Go back" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}

