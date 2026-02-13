import React from "react";
import { ActivityIndicator, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Button } from "@/ui/components/Button";
import { Stack } from "@/ui/components/Stack";
import { theme } from "@/ui/theme";

export function LoadingState({ title = "Loading…" }: { title?: string }) {
  return (
    <Stack gap={10} style={{ alignItems: "center", paddingVertical: 18 }}>
      <ActivityIndicator />
      <AppText muted>{title}</AppText>
    </Stack>
  );
}

export function EmptyState({
  title = "Nothing here",
  subtitle,
  actionTitle,
  onAction,
}: {
  title?: string;
  subtitle?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  return (
    <Stack gap={10} style={{ alignItems: "center", paddingVertical: 18 }}>
      <AppText variant="h2">{title}</AppText>
      {subtitle ? <AppText muted style={{ textAlign: "center" }}>{subtitle}</AppText> : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} /> : null}
    </Stack>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retryTitle = "Retry",
  onRetry,
}: {
  title?: string;
  message?: string;
  retryTitle?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 18 }}>
      <Stack gap={10} style={{ alignItems: "center" }}>
        <AppText variant="h2" style={{ color: theme.colors.danger }}>
          {title}
        </AppText>
        {message ? <AppText muted style={{ textAlign: "center" }}>{message}</AppText> : null}
        {onRetry ? <Button title={retryTitle} variant="secondary" onPress={onRetry} /> : null}
      </Stack>
    </View>
  );
}

