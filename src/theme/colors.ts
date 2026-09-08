/**
 * Copthorne Hotel Sharjah visual theme.
 *
 * The existing semantic keys are intentionally preserved so all current
 * screens and API-driven components continue to work without changing their
 * data/image loading behaviour. Only the visual palette has been re-skinned.
 */
export const Colors = {
  // ── Copthorne gold ────────────────────────────────────────────────────────
  gold: {
    50: '#FCF8F0',
    100: '#F2E7D1',
    200: '#E5CFA8',
    300: '#D0AD6A',
    400: '#BD913E',
    500: '#A87A2B',
    600: '#916722',
    700: '#76531A',
  },

  primary: '#A87A2B',
  primaryLight: '#C8A25A',
  primaryDark: '#76531A',

  // ── Light stone / navy brand surfaces ───────────────────────────────────
  qasrStone: '#F8F5EF',

  // Kept under the legacy key because many existing screens use these values
  // for panels. They are now light Copthorne surfaces rather than dark Etihad
  // surfaces.
  midnightDune: {
    300: '#E7E0D3',
    400: '#DAD0BF',
    500: '#FBF9F5',
    600: '#F7F3EC',
    700: '#EEE7DB',
  },
  midnight: '#102746',

  desertSunrise: {
    300: '#F2C46F',
    400: '#E7AD42',
    500: '#D99618',
    600: '#BD7E0D',
    700: '#9E680A',
  },

  liwaOrange: {
    300: '#EFA18D',
    400: '#E77C62',
    500: '#D95D3F',
    600: '#BE4C32',
    700: '#9D3F2A',
  },

  saadiyatBlue: {
    300: '#86B7C7',
    400: '#5E9EAF',
    500: '#3B8498',
    600: '#2F6D7D',
    700: '#245361',
  },

  jebelGrey: {
    300: '#8B93A0',
    400: '#717B89',
    500: '#626D7A',
    600: '#515B67',
    700: '#414A54',
  },

  black: '#000000',
  white: '#FFFFFF',

  background: {
    primary: '#F8F5EF',
    // Existing screens use "dark" as their page/surface background token.
    // Making it translucent preserves the API-provided room/background image.
    dark: 'rgba(248,245,239,0.94)',
    white: '#FFFFFF',
  },

  text: {
    primary: '#A87A2B',
    dark: '#102746',
    // Legacy pages commonly use text.light for body text; in the new light
    // theme it maps to navy so page copy remains readable.
    light: '#102746',
    muted: '#687486',
    secondary: '#C9D0D9',
  },

  button: {
    primary: '#A87A2B',
    primaryText: '#FFFFFF',
    secondary: '#102746',
    secondaryText: '#FFFFFF',
    outline: '#A87A2B',
    outlineText: '#A87A2B',
  },

  border: {
    default: '#D7BE8E',
    light: '#E9DDC8',
    dark: '#102746',
  },

  status: {
    warning: '#D99618',
    error: '#D95D3F',
    info: '#3B8498',
    neutral: '#626D7A',
  },

  overlay: {
    gold: {
      5: 'rgba(168,122,43,0.05)',
      6: 'rgba(168,122,43,0.06)',
      8: 'rgba(168,122,43,0.08)',
      10: 'rgba(168,122,43,0.10)',
      12: 'rgba(168,122,43,0.12)',
      14: 'rgba(168,122,43,0.14)',
      15: 'rgba(168,122,43,0.15)',
      18: 'rgba(168,122,43,0.18)',
      20: 'rgba(168,122,43,0.20)',
      30: 'rgba(168,122,43,0.30)',
      35: 'rgba(168,122,43,0.35)',
      40: 'rgba(168,122,43,0.40)',
      75: 'rgba(168,122,43,0.75)',
    },
    midnight: {
      50: 'rgba(16,39,70,0.50)',
      60: 'rgba(16,39,70,0.60)',
      70: 'rgba(16,39,70,0.70)',
      72: 'rgba(16,39,70,0.72)',
      85: 'rgba(16,39,70,0.85)',
      88: 'rgba(16,39,70,0.88)',
      96: 'rgba(16,39,70,0.96)',
      97: 'rgba(16,39,70,0.97)',
    },
    black: {
      45: 'rgba(0,0,0,0.45)',
      55: 'rgba(0,0,0,0.55)',
      75: 'rgba(0,0,0,0.75)',
      78: 'rgba(0,0,0,0.78)',
    },
    white: {
      5: 'rgba(255,255,255,0.05)',
      6: 'rgba(255,255,255,0.06)',
      7: 'rgba(255,255,255,0.07)',
      8: 'rgba(255,255,255,0.08)',
      12: 'rgba(255,255,255,0.12)',
      35: 'rgba(255,255,255,0.35)',
    },
    border: {
      gold20: 'rgba(168,122,43,0.20)',
      gold10: 'rgba(168,122,43,0.10)',
    },
  },
} as const;
