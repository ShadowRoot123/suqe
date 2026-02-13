import React from "react";
import { View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Row } from "@/ui/components/Row";

export type SectionHeaderProps = {
  title: string;
  right?: React.ReactNode;
};

export function SectionHeader({ title, right }: SectionHeaderProps) {
  return (
    <Row justify="space-between" align="center">
      <AppText variant="h2">{title}</AppText>
      <View>{right}</View>
    </Row>
  );
}

