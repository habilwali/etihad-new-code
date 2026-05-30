/**
 * Animated pulse dot indicator – shared across Channel and Dining screens.
 * Default colour: Etihad Gold (primary).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../theme/colors';

interface PulseDotProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export const PulseDot = React.memo(function PulseDot({
  size = 8,
  color = Colors.primary,
  style,
}: PulseDotProps) {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 1100, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: anim },
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  dot: {},
});

