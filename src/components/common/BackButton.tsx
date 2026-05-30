/**
 * Reusable back button with TV focus support.
 * Typography: CTA uses FontFamily.medium per Etihad brand guidelines.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet, ViewStyle } from 'react-native';
import { FontFamily } from '../../theme/typography';
import { Colors } from '../../theme/colors';

const GOLD = Colors.primaryLight;
const TEXT = Colors.text.light;

interface BackButtonProps {
  onPress: () => void;
  focused?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: { circle: 34, fontSize: 14, arrowSize: 20 },
  md: { circle: 42, fontSize: 16, arrowSize: 26 },
};

export const BackButton = React.memo(function BackButton({
  onPress,
  focused = false,
  label = 'Back',
  size = 'sm',
}: BackButtonProps) {
  const { circle, fontSize, arrowSize } = SIZES[size];
  const circleHalf = circle / 2;

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={onPress}
      activeOpacity={0.7}
      focusable
    >
      <View
        style={[
          styles.circle,
          {
            width: circle,
            height: circle,
            borderRadius: circleHalf,
          },
          focused && styles.circleFocused,
        ]}
      >
        <Text
          style={[
            styles.arrow,
            { fontSize: arrowSize },
            focused && { color: GOLD },
          ]}
        >
          ‹
        </Text>
      </View>
      <Text style={[styles.text, { fontSize }, focused && { color: GOLD }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  circle: {
    borderWidth: 2,
    borderColor: TEXT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFocused: {
    borderColor: GOLD,
    backgroundColor: Colors.overlay.gold[15],
  },
  arrow: { color: TEXT, lineHeight: 24, marginTop: -2 },
  text: { fontFamily: FontFamily.book, color: TEXT, letterSpacing: 0.5 },
});

