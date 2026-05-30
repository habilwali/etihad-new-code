/**
 * Etihad Airways branded Text component.
 * Enforces typography rules via variant prop.
 * Use sentence case; never ALL CAPS or italics.
 */
import React from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { Typography, TypographyVariant } from '../../theme/typography';

interface BrandTextProps extends TextProps {
  variant?: TypographyVariant;
}

export const BrandText: React.FC<BrandTextProps> = ({
  variant = 'body',
  style,
  ...props
}) => {
  return <RNText style={[Typography[variant], style]} {...props} />;
};

