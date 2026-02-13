import React from "react";
import { View } from "react-native";

import { AppText } from "@/ui/components/AppText";
import { Row } from "@/ui/components/Row";
import { TextField } from "@/ui/components/TextField";

export type DateRangeValue = { start: string; end: string };

export type DateRangeFieldProps = {
  label?: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
};

export function DateRangeField({ label, value, onChange }: DateRangeFieldProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <AppText variant="caption">{label}</AppText> : null}
      <Row gap={10} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Start"
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            value={value.start}
            onChangeText={(start) => onChange({ start, end: value.end })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="End"
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            value={value.end}
            onChangeText={(end) => onChange({ start: value.start, end })}
          />
        </View>
      </Row>
    </View>
  );
}

