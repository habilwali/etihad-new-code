/**
 * Gold gradient divider line – shared across screens.
 * Uses Etihad brand gold (primary ~50% ratio).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors } from '../../theme/colors';

interface GoldRuleProps {
  height?: number;
  colors?: string[];
}

export const GoldRule = React.memo(function GoldRule({
  height = 1,
  colors = ['transparent', Colors.primary, Colors.primaryLight, Colors.primary, 'transparent'],
}: GoldRuleProps) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.rule, { height }]}
    />
  );
});

const styles = StyleSheet.create({
  rule: { width: '100%' },
});

