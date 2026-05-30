/**
 * Etihad Airways Brand Typography Guidelines
 *
 * BRAND RULES (enforce throughout):
 * ✅ DO:
 *   - Use sentence case for ALL headlines (never ALL CAPS)
 *   - Use Etihad Altis Book as the default weight
 *   - Use Medium weight ONLY for price points, CTAs, and body subheadings
 *   - Use Bold weight ONLY on app/website digital contexts
 *   - Use Light weight for large/billboard headlines
 *   - Keep line length 45–90 characters for body copy
 *   - Separate paragraphs with a full line break
 *   - Never use preheader and subheader together in the same layout
 *   - Always display numbers in Arabic content using Latin font
 *
 * ❌ DON'T:
 *   - Never use ALL CAPS
 *   - Never use italics
 *   - Never use excessive kerning
 *   - Never use Arial unless Etihad Altis is unavailable
 *   - Never use Medium or Bold for general headlines
 *   - Never have line length too wide (>90 chars) or too narrow (<45 chars)
 */

// ─── Font Family Constants ───────────────────────────────────────────────────
export const FontFamily = {
  // Latin
  light: 'EtihadAltis-Light',
  book: 'EtihadAltis-Book', // DEFAULT weight
  text: 'EtihadAltis-Text',
  medium: 'EtihadAltis-Medium', // Only for price points, CTAs, subheadings in body
  bold: 'EtihadAltis-Bold', // Only for app and website
  // Arabic
  arabic: 'EtihadArabic',
  // Substitute (only when Etihad Altis unavailable, e.g. email body)
  fallback: 'Arial',
} as const;

// ─── Typography Colors ──────────────────────────────────────────────────────
// Uses Colors from theme (primary = Etihad Gold 500)
export const TypographyColors = {
  gold: '#B08747', // Colors.primary — headlines and brand text
  dark: '#1B2932', // Colors.text.dark / Midnight Dune 700
  light: '#FFFFFF', // Colors.white
} as const;

// ─── Type Scale ──────────────────────────────────────────────────────────────
// Base headline size for reference (adjust per screen context, e.g. TV scaling)
const BASE_HEADLINE = 48;

export const TypeScale = {
  headline: BASE_HEADLINE, // 100%
  preheader: BASE_HEADLINE * 0.5, // 50%
  subheader: BASE_HEADLINE * 0.5, // 50%
  body: BASE_HEADLINE * 0.25, // 25% → ~12-16px typically
} as const;

// ─── Typography Styles ──────────────────────────────────────────────────────
export const Typography = {
  // PREHEADER
  preheader: {
    fontFamily: FontFamily.text,
    fontSize: TypeScale.preheader,
    lineHeight: TypeScale.preheader * 1.0,
    letterSpacing: -0.02 * TypeScale.preheader,
    textTransform: 'none' as const,
  },

  // HEADLINES (use Light for billboards, Book as default, Text as heavier)
  headlineLight: {
    fontFamily: FontFamily.light,
    fontSize: TypeScale.headline,
    lineHeight: TypeScale.headline * 1.0,
    letterSpacing: -0.02 * TypeScale.headline,
    textTransform: 'none' as const,
  },
  headlineBook: {
    fontFamily: FontFamily.book,
    fontSize: TypeScale.headline,
    lineHeight: TypeScale.headline * 1.0,
    letterSpacing: -0.02 * TypeScale.headline,
    textTransform: 'none' as const,
  },
  headlineText: {
    fontFamily: FontFamily.text,
    fontSize: TypeScale.headline,
    lineHeight: TypeScale.headline * 1.0,
    letterSpacing: -0.02 * TypeScale.headline,
    textTransform: 'none' as const,
  },

  // SUBHEADER
  subheader: {
    fontFamily: FontFamily.book,
    fontSize: TypeScale.subheader,
    lineHeight: TypeScale.subheader * 1.0,
    letterSpacing: -0.02 * TypeScale.subheader,
    textTransform: 'none' as const,
  },

  // BODY COPY
  body: {
    fontFamily: FontFamily.book,
    fontSize: 16,
    lineHeight: 16 * 1.25,
    letterSpacing: 0,
    textTransform: 'none' as const,
  },
  bodyMedium: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
    lineHeight: 16 * 1.25,
    letterSpacing: 0,
    textTransform: 'none' as const,
  },

  // PRICE POINTS & CTAs (Medium weight only)
  pricePoint: {
    fontFamily: FontFamily.medium,
    fontSize: 18,
    lineHeight: 18 * 1.0,
    letterSpacing: 0,
    textTransform: 'none' as const,
  },
  cta: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
    lineHeight: 16 * 1.0,
    letterSpacing: 0,
    textTransform: 'none' as const,
  },

  // ARABIC
  arabicHeadline: {
    fontFamily: FontFamily.arabic,
    fontSize: TypeScale.headline,
    lineHeight: TypeScale.headline * 1.0,
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
  },
  arabicBody: {
    fontFamily: FontFamily.arabic,
    fontSize: 16,
    lineHeight: 16 * 1.25,
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
  },
  // IMPORTANT: Numbers in Arabic context must always use Latin font
  arabicNumbers: {
    fontFamily: FontFamily.book,
    fontSize: 16,
  },
} as const;

export type TypographyVariant = keyof typeof Typography;
