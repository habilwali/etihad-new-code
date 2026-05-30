/**
 * Etihad Plaza — Occupational Health & Safety
 * React Native Android TV — full D-pad remote navigation
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────┐
 * │  TOPBAR: weather │ logo │ title                         │
 * ├─────────────────────────────────────────────────────────┤
 * │                                                         │
 * │  ┌──────────────────────────┐  ┌─────────────────────┐ │
 * │  │   VIDEO / HERO PLAYER    │  │   DETAIL PANEL      │ │
 * │  │   (active item media)    │  │   name + desc +     │ │
 * │  └──────────────────────────┘  │   highlight +       │ │
 * │                                │   contact +         │ │
 * │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐│   resources         │ │
 * │  │  │ │  │ │  │ │  │ │  │ │  ││                     │ │
 * │  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘└─────────────────────┘ │
 * │                                                         │
 * ├─────────────────────────────────────────────────────────┤
 * │  BACK                    nav hints                      │
 * └─────────────────────────────────────────────────────────┘
 *
 * Remote nav:
 *   categories (← →): 0-5 cards + 6=back
 *   UP/DOWN while on cards: no-op (single row)
 *   UP from back → cards
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
  DeviceEventEmitter,
  ImageSourcePropType,
  ScrollView,
  type LayoutChangeEvent,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { FontFamily } from '../theme/typography';
import { Colors } from '../theme/colors';
import { BackButton, PulseDot } from '../components/common';
import { AppHeader } from '../components/common/AppHeader';
import { useAppHeaderClock } from '../hooks/useAppHeaderClock';
import StreamVideoPlayer from '../components/StreamVideoPlayer';
import { fetchHealthSafetyItems } from '../services/healthSafetyApi';

/* ─── DIMENSIONS ─────────────────────────────────────────── */
const { width: SW, height: SH } = Dimensions.get('window');

const BOTTOM_H   = 52;
const H_PAD      = 40;
const DETAIL_W   = Math.round(SW * 0.29);
const LEFT_W     = SW - H_PAD * 2 - DETAIL_W - 16;
const CARD_STRIP = 130;          // height of thumbnail strip
const CARD_W     = Math.round((LEFT_W - 5 * 10) / 6); // 6 cards, 10px gap

/* ─── THEME (Facilities-aligned — white body copy + Etihad gold accents) ─── */
const C = {
  bg: Colors.background.dark,
  surface: Colors.midnightDune[600],
  gold: Colors.primary,
  gold2: Colors.primaryLight,
  text: Colors.text.light,
  border: Colors.overlay.gold[15],
  red: '#C8443A',
  green: '#4CAF7D',
  blue: '#4A9FD4',
  amber: '#D4960A',
};

type ContentType = 'VIDEO' | 'PDF' | 'INFO' | 'TRAINING' | 'EMERGENCY' | 'POLICY';

const TYPE_META: Record<ContentType, { bg: string; color: string; icon: string; label: string }> = {
  VIDEO:     { bg: 'rgba(74,159,212,0.22)',  color: C.blue,  icon: '▶',  label: 'VIDEO'     },
  PDF:       { bg: 'rgba(200,68,58,0.22)',   color: C.red,   icon: '⬇',  label: 'PDF'       },
  INFO:      { bg: 'rgba(200,170,127,0.18)', color: C.gold,  icon: 'ℹ',  label: 'INFO'      },
  TRAINING:  { bg: 'rgba(76,175,125,0.22)',  color: C.green, icon: '✦',  label: 'TRAINING'  },
  EMERGENCY: { bg: 'rgba(200,68,58,0.28)',   color: C.red,   icon: '⚠',  label: 'EMERGENCY' },
  POLICY:    { bg: 'rgba(212,150,10,0.22)',  color: C.amber, icon: '◈',  label: 'POLICY'    },
};

/* ─── ITEM TYPE ──────────────────────────────────────────── */
export type OHSItem = {
  id: string;
  label: string;
  type: ContentType;
  icon: string;
  img: string;
  videoUrl: string;
  hasVideo: boolean;
  name: string;
  desc: string;
  contact: string;
  highlight: string;
  resources: Array<{ label: string; type: ContentType }>;
};

const VALID_CONTENT_TYPES = new Set<ContentType>(['VIDEO', 'PDF', 'INFO', 'TRAINING', 'EMERGENCY', 'POLICY']);
function toContentType(v: unknown): ContentType {
  const s = String(v ?? '').toUpperCase();
  return (VALID_CONTENT_TYPES.has(s as ContentType) ? s : 'INFO') as ContentType;
}

/** Split a name into a two-line card label (≤2 words per line). */
function splitLabel(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return name;
  const mid = Math.ceil(words.length / 2);
  return `${words.slice(0, mid).join(' ')}\n${words.slice(mid).join(' ')}`;
}

/* ─── DATA ───────────────────────────────────────────────── */
// Public domain / CC0 video sources — used as fallback when API is unavailable
const VIDEOS = {
  emergency: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  fire:      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  ergo:      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  incident:  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  health:    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  ppe:       'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
};

const FALLBACK_ITEMS: OHSItem[] = [
  {
    id: 'emergency',
    label: 'Emergency\nProcedures',
    type: 'EMERGENCY' as ContentType,
    icon: '🚨',
    img: 'https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=600&h=400&q=75&fit=crop',
    videoUrl: VIDEOS.emergency,
    hasVideo: true,
    name: 'Emergency Procedures',
    desc: 'Know what to do in any emergency. Covers fire evacuation routes, assembly points, emergency contact numbers, and first response protocols for all areas of Etihad Plaza.',
    contact: 'Emergency: 999  ·  Security: 02 511 5911',
    highlight: 'Assembly Point: Main Car Park — Gate B',
    resources: [
      { label: 'Evacuation Floor Plan',    type: 'PDF'      as ContentType },
      { label: 'Emergency Response Video', type: 'VIDEO'    as ContentType },
      { label: 'First Aid Guide',          type: 'PDF'      as ContentType },
    ],
  },
  {
    id: 'fire',
    label: 'Fire Safety',
    type: 'TRAINING' as ContentType,
    icon: '🔥',
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&q=75&fit=crop',
    videoUrl: VIDEOS.fire,
    hasVideo: true,
    name: 'Fire Safety Awareness',
    desc: 'Our fire safety programme covers prevention, detection systems, extinguisher types and usage, and evacuation drills. All staff complete annual training. Review evacuation notices posted in every room.',
    contact: 'Fire Safety Officer: 02 511 5920',
    highlight: 'Last Drill: March 2026 — All Clear',
    resources: [
      { label: 'Fire Safety Training',  type: 'VIDEO'    as ContentType },
      { label: 'Fire Warden Handbook',  type: 'PDF'      as ContentType },
      { label: 'Extinguisher Guide',    type: 'INFO'     as ContentType },
    ],
  },
  {
    id: 'ergonomics',
    label: 'Ergonomics &\nWellness',
    type: 'INFO' as ContentType,
    icon: '🪑',
    img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&q=75&fit=crop',
    videoUrl: VIDEOS.ergo,
    hasVideo: true,
    name: 'Ergonomics & Workplace Wellness',
    desc: 'Prolonged sitting and poor posture are leading causes of workplace injury. Guidance on workstation setup, posture correction, micro-break exercises, and eye strain reduction.',
    contact: 'Wellness Desk: 02 511 5200',
    highlight: 'Book a free ergonomic assessment — Dial 5200',
    resources: [
      { label: 'Self-Assessment Form',      type: 'PDF'      as ContentType },
      { label: 'Posture & Stretching',      type: 'VIDEO'    as ContentType },
      { label: 'Workstation Setup Guide',   type: 'INFO'     as ContentType },
    ],
  },
  {
    id: 'incident',
    label: 'Incident\nReporting',
    type: 'POLICY' as ContentType,
    icon: '📋',
    img: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&h=400&q=75&fit=crop',
    videoUrl: VIDEOS.incident,
    hasVideo: true,
    name: 'Incident Reporting',
    desc: 'All accidents, near-misses, and unsafe conditions must be reported immediately. Etihad Plaza operates a no-blame reporting culture. Submit via front desk, QR code in room, or directly to OHS.',
    contact: 'OHS Hotline: 02 511 5950',
    highlight: 'Report any incident within 24 hours',
    resources: [
      { label: 'Incident Report Form',   type: 'PDF'      as ContentType },
      { label: 'How to Report — Video',  type: 'VIDEO'    as ContentType },
      { label: 'Near-Miss Guidance',     type: 'INFO'     as ContentType },
    ],
  },
  {
    id: 'health',
    label: 'Occupational\nHealth',
    type: 'INFO' as ContentType,
    icon: '🏥',
    img: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&q=75&fit=crop',
    videoUrl: VIDEOS.health,
    hasVideo: true,
    name: 'Occupational Health Services',
    desc: 'Supporting physical and mental wellbeing of all staff. Services include health screenings, stress management, vaccination programmes, and return-to-work assessments — all fully confidential.',
    contact: 'EAMC Clinic: 02 511 5555',
    highlight: 'EAMC — First aeromedical centre in the region',
    resources: [
      { label: 'Health Screening Info',      type: 'PDF'      as ContentType },
      { label: 'Mental Wellbeing Resources', type: 'INFO'     as ContentType },
      { label: 'Vaccination Programme',      type: 'TRAINING' as ContentType },
    ],
  },
  {
    id: 'ppe',
    label: 'PPE & Safe\nPractices',
    type: 'TRAINING' as ContentType,
    icon: '🦺',
    img: 'https://images.unsplash.com/photo-1581092160562-40aa08e8b7c7?w=600&h=400&q=75&fit=crop',
    videoUrl: VIDEOS.ppe,
    hasVideo: true,
    name: 'PPE & Safe Working Practices',
    desc: 'Personal Protective Equipment is mandatory in designated areas. Covers PPE selection, fitting, maintenance, and disposal. Guides available for housekeeping, engineering, and F&B roles.',
    contact: 'Safety Coordinator: 02 511 5930',
    highlight: 'PPE required: Engineering, Kitchen & Pool areas',
    resources: [
      { label: 'PPE Selection Guide',        type: 'PDF'      as ContentType },
      { label: 'Safe Practices Training',    type: 'VIDEO'    as ContentType },
      { label: 'PPE Maintenance Checklist',  type: 'PDF'      as ContentType },
    ],
  },
];


/* ─── Remote nav ─────────────────────────────────────────── */
// Sections: 'cards' | 'back'
// Within cards: index 0-5
// back = 6
type NavSection = 'cards' | 'back';

/* ─── Props ──────────────────────────────────────────────── */
export interface OHSScreenProps {
  guestName?:             string;
  temperature?:           number;
  weatherCondition?:      string;
  backgroundImageSource?: ImageSourcePropType | null;
  onBack:                 () => void;
  isActive?:              boolean;
}

/* ─── TypePill ───────────────────────────────────────────── */
function TypePill({ type, small }: { type: ContentType; small?: boolean }) {
  const m = TYPE_META[type];
  return (
    <View style={[st.pill, { backgroundColor: m.bg }, small && st.pillSm]}>
      <Text style={[st.pillTxt, { color: m.color }, small && st.pillTxtSm]}>
        {m.icon}  {m.label}
      </Text>
    </View>
  );
}

/* ─── ResourceRow ────────────────────────────────────────── */
function ResourceRow({ label, type, last }: { label: string; type: ContentType; last?: boolean }) {
  const m = TYPE_META[type];
  return (
    <View style={[st.resRow, last && { borderBottomWidth: 0 }]}>
      <View style={[st.resIconWrap, { backgroundColor: m.bg }]}>
        <Text style={[st.resIcon, { color: m.color }]}>{m.icon}</Text>
      </View>
      <Text style={st.resLabel} numberOfLines={1}>{label}</Text>
      <View style={[st.resBadge, { backgroundColor: m.bg }]}>
        <Text style={[st.resBadgeTxt, { color: m.color }]}>{m.label}</Text>
      </View>
    </View>
  );
}

/* ─── ThumbCard ──────────────────────────────────────────── */
const ThumbCard = React.memo(function ThumbCard({
  item, active, focused, onPress,
}: {
  item: OHSItem; active: boolean; focused: boolean; onPress: () => void;
}) {
  const m = TYPE_META[item.type];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[st.thumb, active && st.thumbActive, focused && st.thumbFocused]}
    >
      <Image source={{ uri: item.img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={active
          ? ['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.82)']
          : ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.70)']}
        style={StyleSheet.absoluteFill}
      />

      {/* Active gold top line */}
      {active && <View style={st.thumbActiveLine} />}

      {/* Type dot top-left */}
      <View style={[st.thumbDot, { backgroundColor: m.color }]} />

      {/* Icon + label */}
      <View style={st.thumbBottom}>
        <Text style={st.thumbIcon}>{item.icon}</Text>
        <Text style={[st.thumbLabel, active && st.thumbLabelActive]} numberOfLines={2}>
          {item.label}
        </Text>
      </View>

      {/* Video badge */}
      {item.hasVideo && (
        <View style={st.thumbVideoBadge}>
          <Text style={st.thumbVideoBadgeTxt}>▶</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

/* ─── DetailPanel ────────────────────────────────────────── */
const DetailPanel = React.memo(function DetailPanel({ item }: { item: OHSItem }) {
  return (
    <View style={st.detail}>
      {/* Title area */}
      <View style={st.detailTitleRow}>
        <Text style={st.detailIcon}>{item.icon}</Text>
        <View style={st.detailTitleText}>
          <TypePill type={item.type} small />
          <Text style={st.detailName} numberOfLines={2}>{item.name}</Text>
        </View>
      </View>

      <View style={st.detailDivider} />

      <ScrollView
        style={st.detailScroll}
        contentContainerStyle={st.detailScrollContent}
        showsVerticalScrollIndicator={true}
        scrollEnabled
        bounces={false}>
        {/* Description */}
        <Text style={st.detailDesc}>{item.desc}</Text>

        {/* Highlight callout */}
        <View style={st.highlight}>
          <View style={st.highlightBar} />
          <Text style={st.highlightTxt}>{item.highlight}</Text>
        </View>

        {/* Contact */}
        {!!item.contact && (
          <View style={st.contactRow}>
            <Text style={st.contactIcon}>📞</Text>
            <Text style={st.contactTxt}>{item.contact}</Text>
          </View>
        )}

        {/* Resources */}
        <View style={st.resSection}>
          <Text style={st.resSectionTitle}>RESOURCES</Text>
          {item.resources.map((r, i) => (
            <ResourceRow
              key={i}
              label={r.label}
              type={r.type}
              last={i === item.resources.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

/* ─── MAIN SCREEN ────────────────────────────────────────── */
export default function OccupationalHealthSafetyScreen({
  guestName        = 'Nancy',
  temperature: temperatureProp,
  weatherCondition: weatherConditionProp,
  onBack,
  isActive         = false,
}: OHSScreenProps) {

  const [items, setItems] = useState<OHSItem[]>(FALLBACK_ITEMS);
  const itemsRef = useRef<OHSItem[]>(FALLBACK_ITEMS);
  itemsRef.current = items;

  const [activeIdx,  setActiveIdx]  = useState(0);
  const [focusIdx,   setFocusIdx]   = useState(0);
  const [navSection, setNavSection] = useState<NavSection>('cards');
  const { date, time, temperature: headerTemp, weatherCondition: headerWeather } =
    useAppHeaderClock({
      ...(temperatureProp !== undefined ? {temperature: temperatureProp} : {}),
      ...(weatherConditionProp !== undefined && weatherConditionProp.trim() !== ''
        ? {weatherCondition: weatherConditionProp}
        : {}),
    });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef   = useRef(false);
  const lastFsToggleAtRef = useRef(0);
  const visitKeyRef       = useRef(0);

  const INITIAL_BOUNDS = { x: 0, y: 0, width: LEFT_W, height: Math.round(SH * 0.5) };
  const [playerBounds, setPlayerBounds] = useState(INITIAL_BOUNDS);
  const lastBoundsRef  = useRef(INITIAL_BOUNDS);
  const [playerReady, setPlayerReady]   = useState(false);
  const playerPaneRef  = useRef<View>(null);
  const boundsRafRef   = useRef<number | null>(null);

  const activeIdxRef  = useRef(0);
  const focusIdxRef   = useRef(0);
  const navSectionRef = useRef<NavSection>('cards');
  const onBackRef     = useRef(onBack);
  onBackRef.current   = onBack;

  const measurePlayerPane = useCallback(() => {
    playerPaneRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 8 && height > 8) {
        setPlayerReady(true);
        const p = lastBoundsRef.current;
        if (
          Math.abs(x - p.x) >= 2 || Math.abs(y - p.y) >= 2 ||
          Math.abs(width - p.width) >= 2 || Math.abs(height - p.height) >= 2
        ) {
          lastBoundsRef.current = { x, y, width, height };
          setPlayerBounds({ x, y, width, height });
        }
      }
    });
  }, []);

  const onPlayerPaneLayout = useCallback((_e: LayoutChangeEvent) => {
    if (isFullscreen) return;
    if (boundsRafRef.current != null) cancelAnimationFrame(boundsRafRef.current);
    boundsRafRef.current = requestAnimationFrame(() => {
      boundsRafRef.current = null;
      measurePlayerPane();
    });
  }, [isFullscreen, measurePlayerPane]);

  /** Enter fullscreen only (OK on active card). Short debounce stops remote OK double-fire; ref reset on exit so re-enter is never blocked by the old enter timestamp. */
  const tryToggleFullscreen = useCallback(() => {
    if (isFullscreenRef.current) return;
    const now = Date.now();
    if (now - lastFsToggleAtRef.current < 100) return;
    lastFsToggleAtRef.current = now;
    isFullscreenRef.current = true;
    setIsFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (!isFullscreenRef.current) return;
    isFullscreenRef.current = false;
    lastFsToggleAtRef.current = 0;
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    if (isActive) {
      visitKeyRef.current += 1;
      activeIdxRef.current  = 0; setActiveIdx(0);
      focusIdxRef.current   = 0; setFocusIdx(0);
      navSectionRef.current = 'cards'; setNavSection('cards');
      isFullscreenRef.current = false;
      lastFsToggleAtRef.current = 0;
      setIsFullscreen(false);
      setPlayerReady(false);
      lastBoundsRef.current = { x: -9999, y: -9999, width: 1, height: 1 };
      requestAnimationFrame(() => requestAnimationFrame(measurePlayerPane));
    } else {
      isFullscreenRef.current = false;
      lastFsToggleAtRef.current = 0;
      setIsFullscreen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Fetch real items from CMS when screen becomes active; fall back to static data.
  useEffect(() => {
    if (!isActive) return;
    const ctrl = new AbortController();
    fetchHealthSafetyItems(ctrl.signal)
      .then(({ items: apiItems }) => {
        if (ctrl.signal.aborted || apiItems.length === 0) return;
        const mapped: OHSItem[] = apiItems.map((raw, i) => {
          const videoUrl = String(raw.videoUrl ?? raw.video_url ?? raw.video ?? '');
          return {
            id:        String(raw.id ?? `ohs-${i}`),
            label:     String(raw.label ?? splitLabel(String(raw.name ?? raw.title ?? ''))),
            type:      toContentType(raw.type ?? raw.content_type),
            icon:      String(raw.icon ?? raw.emoji ?? '📋'),
            img:       String(raw.img ?? raw.image ?? raw.thumbnail ?? raw.image_url ?? raw.thumb ?? ''),
            videoUrl,
            hasVideo:  Boolean(raw.hasVideo ?? raw.has_video ?? !!videoUrl),
            name:      String(raw.name ?? raw.title ?? ''),
            desc:      String(raw.desc ?? raw.description ?? raw.body ?? ''),
            contact:   String(raw.contact ?? raw.phone ?? ''),
            highlight: String(raw.highlight ?? raw.callout ?? ''),
            resources: Array.isArray(raw.resources)
              ? raw.resources.map(r => ({
                  label: String(r.label ?? r.name ?? ''),
                  type:  toContentType(r.type ?? r.content_type),
                }))
              : [],
          };
        });
        setItems(mapped);
        // Reset selection to first item of new data
        setActiveIdx(0); activeIdxRef.current = 0;
        setFocusIdx(0);  focusIdxRef.current  = 0;
      })
      .catch(() => { /* keep fallback */ });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const selectCard = useCallback((idx: number) => {
    activeIdxRef.current = idx;
    focusIdxRef.current  = idx;
    setActiveIdx(idx);
    setFocusIdx(idx);
    navSectionRef.current = 'cards';
    setNavSection('cards');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode: number }) => {
      const kc  = evt.keyCode;
      const sec = navSectionRef.current;

      // BACK key — exit fullscreen first, then navigate away
      if (kc === 4) {
        if (isFullscreenRef.current) {
          exitFullscreen();
        } else {
          onBackRef.current?.();
        }
        return;
      }

      // While fullscreen only OK exits it (BACK handled above)
      if (isFullscreenRef.current) {
        if (kc === 23 || kc === 66 || kc === 109) {
          exitFullscreen();
        }
        return;
      }

      if (sec === 'cards') {
        if (kc === 22) {
          const next = Math.min(itemsRef.current.length - 1, focusIdxRef.current + 1);
          focusIdxRef.current = next; setFocusIdx(next);
        } else if (kc === 21) {
          const next = Math.max(0, focusIdxRef.current - 1);
          focusIdxRef.current = next; setFocusIdx(next);
        } else if (kc === 20) {
          navSectionRef.current = 'back'; setNavSection('back');
        } else if (kc === 23 || kc === 66 || kc === 109) {
          // OK on the already-active card → go fullscreen; otherwise select card
          if (focusIdxRef.current === activeIdxRef.current) {
            tryToggleFullscreen();
          } else {
            selectCard(focusIdxRef.current);
          }
        }
      } else if (sec === 'back') {
        if (kc === 19) {
          navSectionRef.current = 'cards'; setNavSection('cards');
        } else if (kc === 23 || kc === 66 || kc === 109) {
          onBackRef.current?.();
        }
      }
    });
    return () => sub.remove();
  }, [isActive, selectCard, tryToggleFullscreen, exitFullscreen]);

  const activeItem = items[activeIdx] ?? items[0] ?? FALLBACK_ITEMS[0];

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <AppHeader
        date={date}
        time={time}
        temperature={headerTemp}
        weatherCondition={headerWeather}
      />
      <View style={st.headerTitleRow}>
        <Text style={st.pageTitle}>OCCUPATIONAL HEALTH & SAFETY</Text>
      </View>

      {/* ── MAIN CONTENT ── */}
      <View style={st.main}>

        {/* LEFT COLUMN: video player + thumbnail cards stacked vertically */}
        <View style={st.leftCol}>

          {/* ── VIDEO PLACEHOLDER (measures position for root-level player) ── */}
          <View
            ref={playerPaneRef}
            onLayout={onPlayerPaneLayout}
            collapsable={false}
            style={st.player}
          >
            {!playerReady && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', borderRadius: 8 }]} />
            )}

            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.55)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={st.playerTopLeft}>
              <View style={st.playerLiveBadge}>
                <PulseDot size={5} color={C.red} />
                <Text style={st.playerLiveTxt}>OHS · {activeItem.type}</Text>
              </View>
            </View>
            <View style={st.playerTopRight}>
              <TypePill type={activeItem.type} />
            </View>
            <LinearGradient
              colors={['transparent', 'rgba(6,6,12,0.92)']}
              style={st.playerBottom}
              pointerEvents="none"
            >
              <Text style={st.playerIcon}>{activeItem.icon}</Text>
              <View style={st.playerBottomText}>
                <Text style={st.playerTitle}>{activeItem.name}</Text>
                <Text style={st.playerSubtitle} numberOfLines={1}>{activeItem.highlight}</Text>
              </View>
              <View style={st.playerVideoTag}>
                <Text style={st.playerVideoTagTxt}>▶  VIDEO</Text>
              </View>
            </LinearGradient>

            {navSection === 'cards' && focusIdx === activeIdx && !isFullscreen && (
              <View style={st.fsBadge} pointerEvents="none">
                <Text style={st.fsBadgeTxt}>OK · Fullscreen</Text>
              </View>
            )}
          </View>

          {/* ── THUMBNAIL STRIP (below player, detail panel spans full height on right) ── */}
          <View style={st.strip}>
            {items.map((item, i) => (
              <ThumbCard
                key={item.id}
                item={item}
                active={i === activeIdx}
                focused={navSection === 'cards' && i === focusIdx}
                onPress={() => selectCard(i)}
              />
            ))}
          </View>

        </View>

        {/* GAP */}
        <View style={{ width: 16 }} />

        {/* RIGHT: detail panel — spans full height (alongside both player and strip) */}
        <DetailPanel item={activeItem} />

      </View>

      {/* ── BOTTOMBAR ── */}
      <View style={st.bottombar}>
        <BackButton
          onPress={onBack}
          focused={navSection === 'back'}
          size="sm"
        />
      </View>

      {/* VIDEO PLAYER - root level so fullscreen can cover the whole screen */}
      {isActive && (
        <View
          style={[
            st.videoLayer,
            isFullscreen
              ? [StyleSheet.absoluteFillObject, { borderRadius: 0 }]
              : {
                  position: 'absolute',
                  left: playerBounds.x,
                  top: playerBounds.y,
                  width: playerBounds.width,
                  height: playerBounds.height,
                  opacity: playerReady ? 1 : 0,
                },
          ]}
        >
          <StreamVideoPlayer
            key={`ohs-${activeItem.videoUrl}-${visitKeyRef.current}`}
            uri={activeItem.videoUrl}
            style={StyleSheet.absoluteFill as object}
            paused={false}
            isFullscreen={isFullscreen}
          />
          {isFullscreen && (
            <View style={st.fsExitBadge} pointerEvents="none">
              <Text style={st.fsExitBadgeTxt}>OK / BACK · Exit fullscreen</Text>
            </View>
          )}
        </View>
      )}

    </View>
  );
}

/* ─── STYLES ─────────────────────────────────────────────── */
const st = StyleSheet.create({

  root: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },

  videoLayer: {
    zIndex: 50,
    backgroundColor: '#000',
    overflow: 'hidden',
    borderRadius: 8,
  },

  fsBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(6,6,12,0.75)',
    borderRadius: 3, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(200,170,127,0.35)',
  },
  fsBadgeTxt: {
    fontFamily: FontFamily.book,
    color: 'rgba(200,170,127,0.8)',
    fontSize: 9, letterSpacing: 1.5,
  },

  fsExitBadge: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: 'rgba(6,6,12,0.75)',
    borderRadius: 3, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(200,170,127,0.35)',
  },
  fsExitBadgeTxt: {
    fontFamily: FontFamily.book,
    color: 'rgba(200,170,127,0.8)',
    fontSize: 10, letterSpacing: 1.5,
  },

  headerTitleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    paddingHorizontal: H_PAD,
  },
  pageTitle: {
    fontFamily: FontFamily.book,
    fontSize: 24,
    lineHeight: 30,
    color: C.text,
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  /* MAIN */
  main: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 8,
  },

  leftCol: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },

  /* VIDEO PLAYER */
  player: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: C.border,
  },
  playerTopLeft: {
    position: 'absolute', top: 12, left: 14,
  },
  playerLiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(6,6,12,0.72)',
    borderRadius: 3, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(200,68,58,0.3)',
  },
  playerLiveTxt: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 0.2,
    color: C.text,
  },
  playerTopRight: {
    position: 'absolute', top: 12, right: 14,
  },
  playerBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 40, paddingBottom: 14,
    gap: 12,
  },
  playerIcon: { fontSize: 28, marginBottom: 2 },
  playerBottomText: { flex: 1 },
  playerTitle: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    color: C.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  playerSubtitle: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
  },
  playerVideoTag: {
    backgroundColor: 'rgba(74,159,212,0.22)',
    borderRadius: 3, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(74,159,212,0.35)',
    alignSelf: 'flex-end',
  },
  playerVideoTagTxt: {
    fontFamily: FontFamily.medium,
    fontSize: 8,
    letterSpacing: 1.2,
    color: C.text,
  },

  /* THUMBNAIL STRIP — inside leftCol, below the video player */
  strip: {
    flexDirection: 'row',
    gap: 10,
    height: CARD_STRIP,
    marginTop: 12,
  },
  thumb: {
    width: CARD_W,
    flexShrink: 0,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  thumbActive: {
    borderColor: C.gold,
  },
  thumbFocused: {
    borderColor: C.gold2,
  },
  thumbActiveLine: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 2, backgroundColor: C.gold, zIndex: 2,
  },
  thumbDot: {
    position: 'absolute', top: 8, left: 8,
    width: 6, height: 6, borderRadius: 3,
  },
  thumbBottom:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8 },
  thumbIcon:         { fontSize: 14, marginBottom: 2 },
  thumbLabel: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.2,
  },
  thumbLabelActive: { fontFamily: FontFamily.text, color: C.text },
  thumbVideoBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 2, width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbVideoBadgeTxt: { color: C.text, fontSize: 8, fontFamily: FontFamily.book },

  /* TYPE PILL */
  pill:      { borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', flexDirection: 'row' },
  pillSm:    { paddingHorizontal: 6, paddingVertical: 2 },
  pillTxt: { fontFamily: FontFamily.medium, fontSize: 8, letterSpacing: 1.2 },
  pillTxtSm: { fontSize: 7 },

  /* DETAIL PANEL */
  detail: {
    width: DETAIL_W,
    minHeight: 0,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(12,12,18,0.6)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
    backgroundColor: 'rgba(200,170,127,0.04)',
  },
  detailIcon:      { fontSize: 28, marginTop: 2 },
  detailTitleText: { flex: 1, gap: 6 },
  detailName: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    lineHeight: 18,
    color: C.text,
    letterSpacing: 0.2,
    marginTop: 4,
  },
  detailDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 0 },
  detailScroll: {
    flex: 1,
    minHeight: 0,
  },
  detailScrollContent: {
    padding: 14,
    paddingBottom: 24,
  },

  detailDesc: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
    marginBottom: 12,
  },

  /* Highlight */
  highlight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(200,170,127,0.07)',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  highlightBar: { width: 2, borderRadius: 1, backgroundColor: C.gold, alignSelf: 'stretch' },
  highlightTxt: {
    flex: 1,
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
  },

  /* Contact */
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  contactIcon: { fontSize: 11 },
  contactTxt: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
    flex: 1,
  },

  /* Resources */
  resSection:      { gap: 0 },
  resSectionTitle: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  resRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  resIconWrap:  { width: 24, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resIcon:      { fontSize: 10 },
  resLabel: {
    flex: 1,
    fontFamily: FontFamily.book,
    fontSize: 10,
    lineHeight: 15,
    color: C.text,
    letterSpacing: 0.2,
  },
  resBadge:     { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  resBadgeTxt:  { fontFamily: FontFamily.medium, fontSize: 7, letterSpacing: 1 },

  /* BOTTOMBAR */
  bottombar: {
    height: BOTTOM_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
  },
});
