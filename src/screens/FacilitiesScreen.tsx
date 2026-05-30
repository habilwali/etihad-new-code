/**
 * Etihad Facilities — React Native TV App
 * Full remote navigation: UP/DOWN/LEFT/RIGHT moves focus, OK selects, BACK exits.
 */

import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
  DeviceEventEmitter,
  ImageSourcePropType,
  ActivityIndicator,
  Image,
} from 'react-native';
import FastImage from 'react-native-fast-image';

/* ─── IMAGE SIZE OPTIMIZER ────────────────────────────────────
   Appends ?w=640&h=360 to CMS image URLs so the server can
   return a downscaled version — reduces memory pressure on
   low-RAM TVs (Videocon E43EL1100 ~512MB–1GB).
   Only appends when the URL has no existing size params.
────────────────────────────────────────────────────────────── */
const TV_IMG_W = 640;
const TV_IMG_H = 360;

function optimizeImageUrl(url: string): string {
  if (!url) return url;
  try {
    const hasSize = /[?&](w|width|h|height|size)=/i.test(url);
    if (hasSize) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}w=${TV_IMG_W}&h=${TV_IMG_H}&fit=crop`;
  } catch {
    return url;
  }
}

/* ─── RETRY IMAGE ─────────────────────────────────────────────
   Uses react-native-fast-image (Glide on Android) for:
   - Proper disk + memory caching (immutable cache strategy)
   - Better OOM resistance on low-RAM devices
   - Auto-retries up to MAX_RETRIES times on network error
   No animations, no spinners — renders instantly from cache.
────────────────────────────────────────────────────────────── */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function RetryImage({
  uri,
  resizeMode = FastImage.resizeMode.cover,
}: {
  uri: string;
  resizeMode?: typeof FastImage.resizeMode[keyof typeof FastImage.resizeMode];
}) {
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimizedUri = optimizeImageUrl(uri);

  useEffect(() => { setAttempt(0); }, [uri]);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const handleError = useCallback(() => {
    if (attempt >= MAX_RETRIES) return;
    retryTimer.current = setTimeout(() => setAttempt(a => a + 1), RETRY_DELAY_MS);
  }, [attempt]);

  return (
    <FastImage
      key={`${optimizedUri}-${attempt}`}
      source={{
        uri: optimizedUri,
        priority: FastImage.priority.normal,
        cache: FastImage.cacheControl.immutable,
      }}
      style={StyleSheet.absoluteFill}
      resizeMode={resizeMode}
      onError={handleError}
    />
  );
}
import {FontFamily} from '../theme/typography';
import {Colors} from '../theme/colors';
import {BackButton} from '../components/common';
import {AppHeader} from '../components/common/AppHeader';
import {useAppHeaderClock} from '../hooks/useAppHeaderClock';
import {
  fetchGuestFacilities,
  mapFacilityDto,
  type FacilityRow,
} from '../services/facilitiesApi';

/* ─── DIMENSIONS ─────────────────────────────────────────── */
const {width: SW, height: SH} = Dimensions.get('window');

const H_PAD = 40;
const TITLE_H = 52;
const BOTTOM_H = 52;
const MAIN_PAD_V = 12;
const CELL_H_GAP = Math.round(SW * 0.06); // horizontal gap between the 2 card columns
const CELL_V_GAP = Math.round(SH * 0.04);  // vertical gap between the 2 card rows
const GRID_DETAIL_GAP = 32;
const GRID_INSET_H = 32;

const DETAIL_W = Math.round(SW * 0.36);
const GRID_W = SW - H_PAD * 2 - DETAIL_W - GRID_DETAIL_GAP;

// Card height = 27% of screen height → scales correctly on 720p and 1080p TVs
const CARD_LABEL_H = 30;
const CARD_LABEL_MT = 8;
const CARD_TARGET_H = Math.round(SH * 0.27);

/* ─── THEME ───────────────────────────────────────────────── */
const C = {
  gold: Colors.primary,
  gold2: Colors.primaryLight,
  text: Colors.text.light,
  muted: Colors.text.muted,
  sep: Colors.overlay.white[7],
};

type Facility = FacilityRow;

/* ─── Grid nav ─────────────────────────────────────────────── */
const GRID_NAV_FULL: Record<string, Record<number, number>> = {
  right: {0: 1, 2: 3},
  left: {1: 0, 3: 2},
  down: {0: 2, 1: 3, 2: 4, 3: 4},
  up: {2: 0, 3: 1, 4: 2},
};

function buildGridNav(n: number): Record<string, Record<number, number>> {
  if (n >= 4) return GRID_NAV_FULL;
  if (n === 3) return {right:{0:1},left:{1:0},down:{0:2,1:4,2:4},up:{2:0,4:2}};
  if (n === 2) return {right:{0:1},left:{1:0},down:{0:4,1:4},up:{4:0}};
  if (n === 1) return {down:{0:4},up:{4:0},left:{0:0,4:4},right:{0:0,4:4}};
  return {};
}

function gridMove(dir: string, cur: number, n: number): number {
  if (n <= 0) return cur;
  return buildGridNav(n)[dir]?.[cur] ?? cur;
}

/* ─── Props ──────────────────────────────────────────────── */
export interface FacilitiesScreenProps {
  guestName?: string;
  date?: string;
  time?: string;
  temperature?: number;
  weatherCondition?: string;
  backgroundImageSource?: ImageSourcePropType | null;
  onBack: () => void;
  isActive?: boolean;
}

/* ─── GRID CARD ─────────────────────────────────────────────
   Uses flex:1 so it fills whatever height the row gives it.
   Image area fills the card; label is a fixed-height strip below.
──────────────────────────────────────────────────────────── */
const GridCard = React.memo(function GridCard({
  item,
  focused,
  onPress,
}: {
  item: Facility;
  focused: boolean;
  onPress: (item: Facility) => void;
}) {
  const press = useCallback(() => onPress(item), [item, onPress]);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={press}
      style={st.cardOuter}>
      {/* Image fills all available height */}
      <View style={[st.cardImgBox, focused && st.cardImgBoxFocused]}>
        <RetryImage uri={item.img} resizeMode="cover" />
      </View>
      {/* Fixed-height label below the image */}
      <Text
        style={[st.cardLabel, focused && st.cardLabelFocused]}
        numberOfLines={2}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
});

/* ─── DETAIL PANEL ───────────────────────────────────────── */
const DetailPanel = React.memo(function DetailPanel({
  facility,
}: {
  facility: Facility;
}) {
  return (
    <View style={st.detail}>
      {/* Image — takes 38% of the detail column height */}
      <View style={st.detailImg}>
        <RetryImage uri={facility.img} resizeMode="cover" />
      </View>
      <View style={st.detailInfo}>
        <Text style={st.dName} numberOfLines={2}>
          {facility.name}
        </Text>
        <Text style={st.dDesc} numberOfLines={8}>
          {facility.desc}
        </Text>
        {!!facility.phone && (
          <Text style={st.dPhone}>
            <Text style={st.dPhoneBold}>Phone: </Text>
            {facility.phone}
          </Text>
        )}
        <Text style={st.dHoursTitle}>Hours:</Text>
        {facility.hours.map(([day, time], i) => (
          <View
            key={day}
            style={st.dHourRow}>
            <Text style={st.dHourDay}>{day}</Text>
            <Text style={st.dHourTime}>{time}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

/* ─── MAIN SCREEN ────────────────────────────────────────── */
const BACK_FOCUS = 4;

export default function FacilitiesScreen({
  temperature: temperatureProp,
  weatherCondition: weatherConditionProp,
  onBack,
  isActive = false,
}: FacilitiesScreenProps) {
  const headerClock = useAppHeaderClock({
    ...(temperatureProp !== undefined ? {temperature: temperatureProp} : {}),
    ...(weatherConditionProp !== undefined && weatherConditionProp.trim() !== ''
      ? {weatherCondition: weatherConditionProp}
      : {}),
  });
  const {date, time: clock, temperature, weatherCondition} = headerClock;

  const [loadState, setLoadState] = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const [selected, setSelected] = useState<Facility | null>(null);

  const focusIdxRef = useRef(0);
  const onBackRef = useRef(onBack);
  const facilitiesRef = useRef(facilities);

  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  useEffect(() => { focusIdxRef.current = focusIdx; }, [focusIdx]);
  useEffect(() => { facilitiesRef.current = facilities; }, [facilities]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    setLoadState('loading');
    setErrorMsg('');
    (async () => {
      const res = await fetchGuestFacilities();
      if (cancelled) return;
      if (!res.ok) {
        setFacilities([]); setSelected(null); setErrorMsg(res.message);
        setLoadState('error'); setFocusIdx(BACK_FOCUS); focusIdxRef.current = BACK_FOCUS;
        return;
      }
      setFacilities(res.facilities.map(mapFacilityDto));
      setLoadState('ready');
    })();
    return () => { cancelled = true; };
  }, [isActive, reloadToken]);

  useEffect(() => {
    if (!isActive || loadState !== 'ready') return;
    if (facilities.length === 0) {
      setFocusIdx(BACK_FOCUS); focusIdxRef.current = BACK_FOCUS; setSelected(null); return;
    }
    const idx = Math.min(3, Math.min(4, facilities.length) - 1);
    focusIdxRef.current = idx; setFocusIdx(idx); setSelected(facilities[idx]!);
  }, [isActive, loadState, facilities]);

  const moveFocus = useCallback((dir: string) => {
    const n = Math.min(4, facilitiesRef.current.length);
    if (n <= 0) return;
    const next = gridMove(dir, focusIdxRef.current, n);
    if (next === focusIdxRef.current) return;
    focusIdxRef.current = next; setFocusIdx(next);
    if (next < 4) setSelected(facilitiesRef.current[next]!);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isActive) return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: {keyCode: number}) => {
      const kc = evt.keyCode;
      if (kc === 4) { onBackRef.current?.(); }
      else if (kc === 19) { moveFocus('up'); }
      else if (kc === 20) { moveFocus('down'); }
      else if (kc === 21) { moveFocus('left'); }
      else if (kc === 22) { moveFocus('right'); }
      else if (kc === 23 || kc === 66 || kc === 109) {
        if (focusIdxRef.current === BACK_FOCUS) { onBackRef.current?.(); }
        else { const f = facilitiesRef.current[focusIdxRef.current]; if (f) setSelected(f); }
      }
    });
    return () => sub.remove();
  }, [isActive, moveFocus]);

  const padded: (Facility | null)[] = [...facilities.slice(0, 4)];
  while (padded.length < 4) padded.push(null);
  const [tl, tr, bl, br] = padded;

  /* ── Body content (rendered inside main flex-row) ── */
  const mainBody = () => {
    if (loadState === 'loading' || loadState === 'idle') {
      return (
        <View style={st.mainCenter}>
          <ActivityIndicator size="large" color={C.gold} />
          <Text style={st.mainHint}>Loading facilities…</Text>
        </View>
      );
    }
    if (loadState === 'error') {
      return (
        <View style={st.mainCenter}>
          <Text style={st.mainErrorTitle}>Could not load facilities</Text>
          <Text style={st.mainErrorBody}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setReloadToken(t => t + 1)} style={st.retryBtn} focusable>
            <Text style={st.retryBtnTxt}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (facilities.length === 0) {
      return (
        <View style={st.mainCenter}>
          <Text style={st.mainHint}>No facilities available.</Text>
        </View>
      );
    }

    return (
      <>
        {/* LEFT COLUMN: title + 2×2 grid — width fixed, height fills flex parent */}
        <View style={st.gridColumn}>

          {/* Title centered within the grid column */}
          <View style={st.titleBar}>
            <Text style={st.titleText}>Etihad Facilities</Text>
          </View>

          {/* Grid rows — vertically centered; rows have fixed height so cards don't overflow */}
          <View style={st.gridArea}>
            {/* Row 1 */}
            <View style={st.gridRow}>
              {tl
                ? <GridCard item={tl} focused={focusIdx === 0} onPress={() => { focusIdxRef.current=0; setFocusIdx(0); setSelected(tl); }} />
                : <View style={st.cardOuter} />}
              <View style={{width: CELL_H_GAP}} />
              {tr
                ? <GridCard item={tr} focused={focusIdx === 1} onPress={() => { focusIdxRef.current=1; setFocusIdx(1); setSelected(tr); }} />
                : <View style={st.cardOuter} />}
            </View>

            <View style={{height: CELL_V_GAP}} />

            {/* Row 2 */}
            <View style={st.gridRow}>
              {bl
                ? <GridCard item={bl} focused={focusIdx === 2} onPress={() => { focusIdxRef.current=2; setFocusIdx(2); setSelected(bl); }} />
                : <View style={st.cardOuter} />}
              <View style={{width: CELL_H_GAP}} />
              {br
                ? <GridCard item={br} focused={focusIdx === 3} onPress={() => { focusIdxRef.current=3; setFocusIdx(3); setSelected(br); }} />
                : <View style={st.cardOuter} />}
            </View>
          </View>

        </View>

        <View style={{width: GRID_DETAIL_GAP}} />

        {/* RIGHT: detail panel */}
        {selected
          ? <DetailPanel facility={selected} />
          : <View style={[st.detail, st.detailEmpty]}><Text style={st.dDesc}>Select a facility</Text></View>}
      </>
    );
  };

  return (
    <View style={st.root}>
      <StatusBar hidden />

      <AppHeader
        date={date}
        time={clock}
        temperature={temperature}
        weatherCondition={weatherCondition}
      />

      <View style={st.main}>{mainBody()}</View>

      <View style={st.bottombar}>
        <BackButton onPress={onBack} focused={focusIdx === BACK_FOCUS} size="sm" />
      </View>
    </View>
  );
}

/* ─── STYLES ─────────────────────────────────────────────── */
const st = StyleSheet.create({
  root: {flex: 1, backgroundColor: 'transparent'},

  /* MAIN — fills all space between AppHeader and bottombar */
  main: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingVertical: MAIN_PAD_V,
  },

  mainCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mainHint: {fontFamily: FontFamily.book, fontSize: 12, color: C.muted, textAlign: 'center'},
  mainErrorTitle: {fontFamily: FontFamily.medium, fontSize: 15, color: C.gold, marginBottom: 8, textAlign: 'center'},
  mainErrorBody: {fontFamily: FontFamily.book, fontSize: 12, color: C.text, textAlign: 'center', lineHeight: 18},
  retryBtn: {marginTop: 8, borderWidth: 1, borderColor: C.gold, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 10},
  retryBtnTxt: {fontFamily: FontFamily.medium, color: C.gold, fontSize: 11, letterSpacing: 2},

  /* ── LEFT COLUMN ──────────────────────────────────────────
     Fixed width; height fills main via flex parent (column).
  ────────────────────────────────────────────────────────── */
  gridColumn: {
    width: GRID_W,
    flexDirection: 'column',
  },

  /* Title — centered within grid column width */
  titleBar: {
    height: TITLE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontFamily: FontFamily.book,
    fontSize: 24,
    color: C.text,
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  /* Grid area — vertically centers both rows + gap in available space */
  gridArea: {
    flex: 1,
    paddingHorizontal: GRID_INSET_H,
    flexDirection: 'column',
    justifyContent: 'center',
  },

  /* Each row has a fixed height based on screen size — never overflows */
  gridRow: {
    height: CARD_TARGET_H,
    flexDirection: 'row',
  },

  /* Each card fills its row's width; image has fixed height, label below */
  cardOuter: {
    flex: 1,
    flexDirection: 'column',
  },
  cardImgBox: {
    height: CARD_TARGET_H - CARD_LABEL_MT - CARD_LABEL_H,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardImgBoxFocused: {
    borderColor: C.gold,
  },
  cardLabel: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    color: C.text,
    textAlign: 'center',
    height: CARD_LABEL_H,
    marginTop: CARD_LABEL_MT,
    lineHeight: 18,
  },
  cardLabelFocused: {
    fontFamily: FontFamily.text,
  },

  /* ── RIGHT: DETAIL PANEL ──────────────────────────────────
     flex:1 fills the remaining row width after gridColumn + gap.
  ────────────────────────────────────────────────────────── */
  detail: {
    flex: 1,
    flexDirection: 'column',
  },
  detailEmpty: {justifyContent: 'center', alignItems: 'center'},

  /* Detail image — 78% of the detail column height */
  detailImg: {
    flex: 0.78,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  detailInfo: {
    flex: 1,
    minHeight: 0,
  },

  dName: {fontFamily: FontFamily.book, fontSize: 13, color: C.text, lineHeight: 18, marginBottom: 6, letterSpacing: 0.2},
  dDesc: {fontFamily: FontFamily.book, fontSize: 10, lineHeight: 15, color: C.text, marginBottom: 8},
  dPhone: {fontFamily: FontFamily.book, fontSize: 10, color: C.text, marginBottom: 8},
  dPhoneBold: {fontFamily: FontFamily.book, color: C.text},
  dHoursTitle: {fontFamily: FontFamily.book, fontSize: 10, color: C.text, marginBottom: 3},
  dHourRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, alignItems: 'center'},
  dHourSep: {},
  dHourDay: {fontFamily: FontFamily.book, fontSize: 10, color: C.text},
  dHourTime: {fontFamily: FontFamily.book, fontSize: 10, color: C.text},

  /* BOTTOMBAR */
  bottombar: {
    height: BOTTOM_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
  },
});
