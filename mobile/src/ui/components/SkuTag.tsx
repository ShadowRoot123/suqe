import React from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { theme } from "@/ui/theme";

/** A SKU set apart from the product name, so a cashier can read it off a shelf label at a glance. */
export function SkuTag({ sku }: { sku: string }) {
  return (
    <View style={styles.tag}>
      <AppText variant="caption" numberOfLines={1} style={styles.text}>
        {sku}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: { fontSize: theme.typography.size.xs, color: theme.colors.textSecondary },
});
