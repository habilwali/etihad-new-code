/**
 * App-wide header bar — Etihad Plaza TV
 *
 * Layout (left → right):
 *   [Etihad marketing logo]  ···  [Time + Date]  [Temp + Icon]  [Condition]
 *
 * No background is applied; the caller owns the backdrop.
 * A gold gradient rule is drawn below the info row.
 *
 * Date/time/weather usually come from `useAppHeaderClock()` (Open-Meteo for Abu Dhabi).
 *
 * Usage:
 *   const h = useAppHeaderClock();
 *   <AppHeader date={h.date} time={h.time} temperature={h.temperature} weatherCondition={h.weatherCondition} />
 */

import React from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../theme/colors';
import { FontFamily } from '../../theme/typography';

const { width: WINDOW_WIDTH } = Dimensions.get('window');
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
  weatherCondition = 'Sunny',
}: AppHeaderProps) {
  return (
    <View style={styles.wrapper}>
      {/* ── Main row ─────────────────────────────────────────────────── */}
      <View style={styles.row}>
        {/* Left — brand logo */}
        <Image
          source={require('../../assets/header/ethiad-logo-marketing.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Right — time / weather */}
        <View style={styles.rightGroup}>
          {/* Time + date (stacked) */}
          <View style={styles.timeBlock}>
            <Text style={styles.timeText}>{time}</Text>
            <Text style={styles.dateText}>{date}</Text>
          </View>

          <View style={styles.vDivider} />

          {/* Temp + condition + icon */}
          <View style={styles.weatherBlock}>
            {/* Left: temp number + condition stacked tightly */}
            <View style={styles.tempTextCol}>
              <View style={styles.tempRow}>
                <Text style={styles.tempNum}>{temperature}</Text>
                <View style={styles.degreeBlock}>
                  <Text style={styles.degreeSym}>°</Text>
                  <Text style={styles.degreeC}>C</Text>
                </View>
              </View>
              <Text style={styles.conditionText}>{weatherCondition}</Text>
            </View>
            {/* Right: weather icon */}
            <Image
              source={require('../../assets/header/Weather.png')}
              style={styles.weatherIcon}
              resizeMode="contain"
            />
          </View>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    left: 0,
    right: 0,
    marginTop: s(18),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(32),
    paddingVertical: s(18),
  },

  // ── Logo ────────────────────────────────────────────────────────────
  logo: {
    width: s(176),
    height: s(52),
  },

  // ── Right group ─────────────────────────────────────────────────────
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(24),
  },

  vDivider: {
    width: 1,
    height: s(48),
    backgroundColor: Colors.overlay.white[35],
  },

  // ── Time block — Etihad Altis Book, white ────────────────────────────
  timeBlock: {
    alignItems: 'flex-end',
    gap: 0,
  },
  timeText: {
    fontFamily: FontFamily.book,
    fontSize: s(36),          // large — matches "15:08" in spec
    color: Colors.white,
    lineHeight: s(36),
    includeFontPadding: false,
  },
  dateText: {
    fontFamily: FontFamily.book,
    fontSize: s(14),          // small — matches "19 Feb 2026" in spec
    color: Colors.white,
    lineHeight: s(14),
    includeFontPadding: false,
  },

  // ── Weather block ────────────────────────────────────────────────────
  weatherBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  tempTextCol: {
    alignItems: 'flex-start',
    gap: 0,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: s(2),
  },
  tempNum: {
    fontFamily: FontFamily.book,
    fontSize: s(36),          // same size as time — matches "23" in spec
    color: Colors.white,
    lineHeight: s(36),
    includeFontPadding: false,
  },
  // °C stacked: ° small on top, C larger below — both Etihad Gold #826332
  degreeBlock: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: s(3),
  },
  degreeSym: {
    fontFamily: FontFamily.book,
    fontSize: s(11),
    color: Colors.white,
    lineHeight: s(11),
    includeFontPadding: false,
  },
  degreeC: {
    fontFamily: FontFamily.book,
    fontSize: s(20),
    color: Colors.white,
    lineHeight: s(20),
    includeFontPadding: false,
  },
  conditionText: {
    fontFamily: FontFamily.book,
    fontSize: s(14),          // same size as date — matches "Sunny" in spec
    color: Colors.white,
    lineHeight: s(14),
    includeFontPadding: false,
  },
  weatherIcon: {
    width: s(58),
    height: s(58),
  },
});

