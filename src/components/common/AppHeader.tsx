/**
 * Copthorne Hotel Sharjah app-wide header.
 *
 * The component keeps the same public API used throughout the project so no
 * screen/data logic needs to change. It only replaces the former Etihad visual
 * treatment with the Copthorne logo, warmer-place tagline and navy/gold hotel
 * styling shown in the approved reference theme.
 */

import React from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Colors} from '../../theme/colors';
import {FontFamily} from '../../theme/typography';

const {width: WINDOW_WIDTH} = Dimensions.get('window');
const DESIGN_WIDTH = 1280;
const sc = WINDOW_WIDTH / DESIGN_WIDTH;
const s = (n: number) => Math.round(n * sc);

export interface AppHeaderProps {
  date?: string;
  time?: string;
  temperature?: number;
  weatherCondition?: string;
}

export function AppHeader({
  date = '',
  time = '',
  temperature = 23,
  weatherCondition = 'Clear',
}: AppHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.96)',
          'rgba(255,255,255,0.84)',
          'rgba(255,255,255,0.20)',
          'rgba(255,255,255,0.00)',
        ]}
        locations={[0, 0.28, 0.58, 1]}
        start={{x: 0, y: 0.5}}
        end={{x: 1, y: 0.5}}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={styles.row}>
        <View style={styles.brandGroup}>
          <Image
            source={require('../../assets/copthorne/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.brandDivider} />
          <View style={styles.taglineWrap}>
            <Text style={styles.tagline}>A WARMER</Text>
            <Text style={styles.tagline}>PLACE TO BE</Text>
          </View>
        </View>

        <View style={styles.rightGroup}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeText}>{time}</Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>

          <View style={styles.vDivider} />

          <View style={styles.weatherBlock}>
            <View style={styles.tempTextCol}>
              <Text style={styles.tempText}>{temperature}°C</Text>
              <Text style={styles.conditionText}>{weatherCondition}</Text>
            </View>
            <Image
              source={require('../../assets/copthorne/icon_weather_clear.png')}
              style={styles.weatherIcon}
              resizeMode="contain"
              tintColor={Colors.primaryLight}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    height: s(104),
    justifyContent: 'center',
    zIndex: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(34),
    paddingVertical: s(10),
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    height: s(78),
  },
  logo: {
    width: s(230),
    height: s(82),
  },
  brandDivider: {
    width: 1,
    height: s(52),
    marginLeft: s(10),
    marginRight: s(24),
    backgroundColor: 'rgba(16,39,70,0.58)',
  },
  taglineWrap: {
    justifyContent: 'center',
    gap: s(2),
  },
  tagline: {
    fontFamily: FontFamily.medium,
    fontSize: s(12),
    lineHeight: s(15),
    letterSpacing: s(4.1),
    color: Colors.text.dark,
    includeFontPadding: false,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(20),
    minHeight: s(74),
    paddingHorizontal: s(22),
    paddingVertical: s(10),
    borderRadius: s(10),
    backgroundColor: 'rgba(16,39,70,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  timeBlock: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontFamily: FontFamily.book,
    fontSize: s(33),
    lineHeight: s(35),
    color: Colors.white,
    includeFontPadding: false,
  },
  dateText: {
    fontFamily: FontFamily.book,
    fontSize: s(13),
    lineHeight: s(17),
    color: Colors.white,
    includeFontPadding: false,
  },
  vDivider: {
    width: 1,
    height: s(48),
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  weatherBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
  },
  tempTextCol: {
    alignItems: 'flex-start',
  },
  tempText: {
    fontFamily: FontFamily.book,
    fontSize: s(31),
    lineHeight: s(34),
    color: Colors.white,
    includeFontPadding: false,
  },
  conditionText: {
    fontFamily: FontFamily.book,
    fontSize: s(13),
    lineHeight: s(17),
    color: Colors.white,
    includeFontPadding: false,
  },
  weatherIcon: {
    width: s(50),
    height: s(50),
  },
});
