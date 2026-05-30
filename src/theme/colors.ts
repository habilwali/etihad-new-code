/**
 * Etihad Airways Brand Colour System
 *
 * COLOUR RATIO RULES (follow strictly):
 * ─────────────────────────────────────────────────────────────────────────────
 * • PRIMARY (Etihad Gold):     ~50% ratio across all UI
 * • SECONDARY (Qasr Stone +    ~30% ratio across all UI
 *   Midnight Dune):
 * • TERTIARY (Desert Sunrise,  ~5% combined — use sparingly
 *   Liwa Orange, Saadiyat      Must be endorsed by Brand team
 *   Blue, Jebel Grey):
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const Colors = {
  // ─────────────────────────────────────────
  // PRIMARY — Etihad Gold
  // Use at ~50% ratio across all UI
  // ─────────────────────────────────────────
  gold: {
    50: '#FEF9EE',
    100: '#EDE2D0',
    200: '#DEC39B',
    300: '#C8AA7F',
    400: '#B8935A',
    500: '#B08747', // ← PRIMARY BRAND GOLD (use this as default)
    600: '#99753D',
    700: '#826332',
  },

  // Shorthand aliases
  primary: '#B08747', // Etihad Gold 500 — main brand colour
  primaryLight: '#C8AA7F', // Gold 300 — for subtle tints
  primaryDark: '#826332', // Gold 700 — for pressed/active states

  // ─────────────────────────────────────────
  // SECONDARY — Qasr Stone & Midnight Dune
  // Use at ~30% ratio across all UI
  // ─────────────────────────────────────────

  // Qasr Stone — light, neutral background
  // IMPORTANT: No Pantone; print as CMYK only
  qasrStone: '#FDF9EF', // HEX FDF9EF | RGB 253,249,239

  // Midnight Dune — dark background for digital
  // Use for dark mode screens, headers, and contrast areas
  midnightDune: {
    300: '#6A95AE',
    400: '#456577',
    500: '#2E4755', // ← BASE Midnight Dune
    600: '#263A46',
    700: '#1B2932',
  },
  midnight: '#2E4755', // Midnight Dune 500 — shorthand

  // ─────────────────────────────────────────
  // TERTIARY — Use sparingly (~5% combined)
  // Must be endorsed by Brand team before use
  // ─────────────────────────────────────────

  // Desert Sunrise (warm yellow/amber)
  desertSunrise: {
    300: '#FFC575',
    400: '#FFB33F',
    500: '#FEAA00', // ← BASE
    600: '#DD9300',
    700: '#BD7D00',
  },

  // Liwa Orange (terracotta/rust)
  liwaOrange: {
    300: '#FA9278',
    400: '#F4706F',
    500: '#F05D38', // ← BASE
    600: '#D1502F',
    700: '#B24527',
  },

  // Saadiyat Blue (teal)
  saadiyatBlue: {
    300: '#70BDC9',
    400: '#3BAABA',
    500: '#00A1B2', // ← BASE
    600: '#00B89A',
    700: '#007683',
  },

  // Jebel Grey (neutral grey)
  jebelGrey: {
    300: '#8F8F8F',
    400: '#717171',
    500: '#636363', // ← BASE
    600: '#555555',
    700: '#474747',
  },

  // ─────────────────────────────────────────
  // MONOTONE
  // ─────────────────────────────────────────
  black: '#000000',
  white: '#FFFFFF',

  // ─────────────────────────────────────────
  // SEMANTIC / UI ALIASES
  // Map brand colours to functional roles
  // ─────────────────────────────────────────
  background: {
    primary: '#FDF9EF', // Qasr Stone — main app background
    dark: '#1B1B1B', // App background — all pages
    white: '#FFFFFF',
  },

  text: {
    primary: '#B08747', // Gold — headlines and brand text
    dark: '#1B2932', // Midnight Dune 700 — body text on light bg
    light: '#FFFFFF', // White — text on dark backgrounds
    muted: '#636363', // Jebel Grey — secondary/helper text
  },

  button: {
    primary: '#B08747', // Gold fill
    primaryText: '#FFFFFF', // White label on gold
    secondary: '#2E4755', // Midnight Dune fill
    secondaryText: '#FFFFFF',
    outline: '#B08747', // Gold border
    outlineText: '#B08747',
  },

  border: {
    default: '#C8AA7F', // Gold 300
    light: '#EDE2D0', // Gold 100
    dark: '#456577', // Midnight Dune 400
  },

  // Status colours (use tertiary colours for these)
  status: {
    warning: '#FEAA00', // Desert Sunrise
    error: '#F05D38', // Liwa Orange
    info: '#00A1B2', // Saadiyat Blue
    neutral: '#636363', // Jebel Grey
  },

  // ─────────────────────────────────────────
  // OVERLAYS & TINTS (avoid arbitrary rgba)
  // Gold tints for hover/pressed; Midnight for overlays
  // ─────────────────────────────────────────
  overlay: {
    gold: {
      5: 'rgba(176,135,71,0.05)',
      6: 'rgba(176,135,71,0.06)',
      8: 'rgba(176,135,71,0.08)',
      10: 'rgba(176,135,71,0.10)',
      12: 'rgba(176,135,71,0.12)',
      14: 'rgba(176,135,71,0.14)',
      15: 'rgba(176,135,71,0.15)',
      18: 'rgba(176,135,71,0.18)',
      20: 'rgba(176,135,71,0.20)',
      30: 'rgba(176,135,71,0.30)',
      35: 'rgba(176,135,71,0.35)',
      40: 'rgba(176,135,71,0.40)',
      75: 'rgba(176,135,71,0.75)',
    },
    midnight: {
      50: 'rgba(46,71,85,0.5)',
      60: 'rgba(46,71,85,0.6)',
      70: 'rgba(46,71,85,0.7)',
      72: 'rgba(46,71,85,0.72)',
      85: 'rgba(46,71,85,0.85)',
      88: 'rgba(46,71,85,0.88)',
      96: 'rgba(46,71,85,0.96)',
      97: 'rgba(46,71,85,0.97)',
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
      gold20: 'rgba(200,170,127,0.20)',
      gold10: 'rgba(200,170,127,0.10)',
    },
  },
} as const;
