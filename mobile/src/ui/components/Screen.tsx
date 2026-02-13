import React from "react";
import { SafeAreaView, ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";

import { theme } from "@/ui/theme";
import { Container } from "@/ui/components/Container";

export type ScreenProps = {
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
} & Pick<ScrollViewProps, "refreshControl">;

export function Screen({ scroll, style, contentStyle, children, refreshControl }: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]}>
        <ScrollView
          refreshControl={refreshControl}
          contentContainerStyle={[{ paddingVertical: 16 }, contentStyle]}
        >
          <Container>{children}</Container>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]}>
      <Container style={[{ paddingVertical: 16, flex: 1 }, contentStyle]}>{children}</Container>
    </SafeAreaView>
  );
}

