import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  DeviceEventEmitter,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import {UpdateInfo} from '../services/updateService';
import {Colors} from '../theme/colors';
import {FontFamily} from '../theme/typography';

/* ─── brand tokens ─────────────────────────────────────────────────────── */
const GOLD   = Colors.primary;           // #B08747
const DARK   = Colors.midnightDune[700]; // #1B2932
const DARKER = Colors.midnightDune[600]; // #263A46
const WHITE  = Colors.white;
const MUTED  = 'rgba(255,255,255,0.55)';
const GREEN  = '#34C97A';
const RED    = '#F05D38';

/* ─── TV remote key codes ───────────────────────────────────────────────── */
const KEY_BACK  = 4;
const KEY_LEFT  = 21;
const KEY_RIGHT = 22;
const KEY_OK    = 23;
const KEY_ENTER = 66;

type FocusedBtn = 'later' | 'update';
type Phase =
  | 'idle'        // show buttons
  | 'downloading' // progress bar visible
  | 'installing'  // APK saved, intent launched
  | 'success'     // installer opened — show "follow instructions"
  | 'error';      // something went wrong

interface Props {
  visible: boolean;
  updateData: UpdateInfo | null;
  onDismiss: () => void;
}

export function UpdateModal({visible, updateData, onDismiss}: Props): React.JSX.Element | null {
  const scaleAnim   = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  /* animated width of the progress bar fill (0–100 mapped to flex 0–1) */
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [phase,    setPhase]    = useState<Phase>('idle');
  const [focused,  setFocused]  = useState<FocusedBtn>('update');
  const [progress, setProgress] = useState(0); // 0-100
  const [errMsg,   setErrMsg]   = useState('');

  /* ── open/close animation ───────────────────────────────────────────── */
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setFocused('update');
      setProgress(0);
      progressAnim.setValue(0);
      setErrMsg('');
      Animated.parallel([
        Animated.timing(opacityAnim, {toValue: 1, duration: 220, useNativeDriver: true}),
        Animated.spring(scaleAnim,   {toValue: 1, tension: 80, friction: 9, useNativeDriver: true}),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, {toValue: 0, duration: 180, useNativeDriver: true}),
        Animated.timing(scaleAnim,   {toValue: 0.88, duration: 180, useNativeDriver: true}),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim, progressAnim]);

  /* ── pulse on focused update button ────────────────────────────────── */
  useEffect(() => {
    if (focused !== 'update' || phase !== 'idle') {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {toValue: 1.04, duration: 600, useNativeDriver: true}),
        Animated.timing(pulseAnim, {toValue: 1.00, duration: 600, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [focused, phase, pulseAnim]);

  /* ── progress bar animation ─────────────────────────────────────────── */
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  /* ── download + install ─────────────────────────────────────────────── */
  const startDownload = useCallback(() => {
    const url = updateData?.apk_url;
    if (!url) {
      setErrMsg('APK URL is not configured in the CMS.');
      setPhase('error');
      return;
    }

    setPhase('downloading');
    setProgress(0);

    const destPath = `${RNBlobUtil.fs.dirs.CacheDir}/etihad_update.apk`;

    console.log('[UpdateModal] Downloading APK:', url, '→', destPath);

    RNBlobUtil.config({fileCache: true, path: destPath})
      .fetch('GET', url)
      .progress((received: number, total: number) => {
        if (total > 0) {
          const pct = Math.min(100, Math.round((received / total) * 100));
          setProgress(pct);
        }
      })
      .then(res => {
        console.log('[UpdateModal] Download complete:', res.path());
        setProgress(100);
        setPhase('installing');

        return RNBlobUtil.android.actionViewIntent(
          res.path(),
          'application/vnd.android.package-archive',
        );
      })
      .then(() => {
        console.log('[UpdateModal] Installer intent dispatched');
        setPhase('success');
      })
      .catch((err: Error) => {
        console.warn('[UpdateModal] Error:', err);
        setErrMsg(err?.message ?? 'Download failed. Please try again.');
        setPhase('error');
      });
  }, [updateData]);

  /* ── hardware back ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (updateData?.is_force_update) return true;
      if (phase === 'downloading') return true; // block back during download
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, phase, updateData, onDismiss]);

  /* ── TV remote ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;

    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: {keyCode: number}) => {
      const {keyCode} = evt;

      if (phase === 'downloading') return; // lock controls during download

      if (keyCode === KEY_LEFT) {
        if (!updateData?.is_force_update && phase === 'idle') setFocused('later');
        return;
      }
      if (keyCode === KEY_RIGHT) {
        if (phase === 'idle') setFocused('update');
        return;
      }
      if (keyCode === KEY_OK || keyCode === KEY_ENTER) {
        if (phase === 'idle') {
          if (focused === 'later') onDismiss();
          else startDownload();
        } else if (phase === 'success' || phase === 'error') {
          onDismiss();
        }
        return;
      }
      if (keyCode === KEY_BACK) {
        if (!updateData?.is_force_update && phase !== 'downloading') onDismiss();
      }
    });

    return () => sub.remove();
  }, [visible, phase, focused, updateData, onDismiss, startDownload]);

  if (!updateData) return null;

  const {version_name, version_code, release_notes, is_force_update} = updateData;
  const bullets = release_notes.split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {
        if (!is_force_update && phase !== 'downloading') onDismiss();
      }}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, {opacity: opacityAnim}]} />

        <Animated.View
          style={[styles.card, {opacity: opacityAnim, transform: [{scale: scaleAnim}]}]}
        >
          {/* gold accent bar */}
          <View style={styles.accentBar} />

          {/* title */}
          <View style={styles.titleArea}>
            {is_force_update && (
              <View style={styles.forceBadge}>
                <Text style={styles.forceBadgeText}>Required update</Text>
              </View>
            )}
            <Text style={styles.title}>
              {is_force_update ? 'Update required' : 'New update available'}
            </Text>
            <Text style={styles.subtitle}>
              A new version of the app is ready to install
            </Text>
          </View>

          {/* version row */}
          <View style={styles.versionRow}>
            <View style={styles.versionBlock}>
              <Text style={styles.versionLabel}>Version</Text>
              <Text style={styles.versionValue}>{version_name}</Text>
            </View>
            <View style={styles.versionDivider} />
            <View style={styles.versionBlock}>
              <Text style={styles.versionLabel}>Build</Text>
              <Text style={styles.versionValue}>{version_code}</Text>
            </View>
          </View>

          {/* release notes — only show during idle */}
          {phase === 'idle' && bullets.length > 0 && (
            <View style={styles.notesWrap}>
              <Text style={styles.notesTitle}>What's new</Text>
              <ScrollView style={styles.notesList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {bullets.map((line, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.bulletText}>{line}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* force warning */}
          {phase === 'idle' && is_force_update && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                You must update to continue using the app.
              </Text>
            </View>
          )}

          {/* ── DOWNLOADING ────────────────────────────────────────────── */}
          {phase === 'downloading' && (
            <View style={styles.statusBox}>
              <Text style={styles.statusTitle}>Downloading update…</Text>
              <Text style={styles.statusSub}>{progress}% complete</Text>

              {/* progress bar */}
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressHint}>
                Please wait, do not close the app.
              </Text>
            </View>
          )}

          {/* ── INSTALLING ─────────────────────────────────────────────── */}
          {phase === 'installing' && (
            <View style={styles.statusBox}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkIcon}>↓</Text>
              </View>
              <Text style={[styles.statusTitle, {color: GOLD}]}>
                Opening installer…
              </Text>
              <Text style={styles.statusSub}>
                Launching the Android package installer.
              </Text>
            </View>
          )}

          {/* ── SUCCESS ────────────────────────────────────────────────── */}
          {phase === 'success' && (
            <View style={styles.statusBox}>
              <View style={[styles.checkCircle, styles.checkCircleGreen]}>
                <Text style={[styles.checkIcon, {color: GREEN}]}>✓</Text>
              </View>
              <Text style={[styles.statusTitle, {color: GREEN}]}>
                Installer opened!
              </Text>
              <Text style={styles.statusSub}>
                Follow the on-screen instructions to complete the installation.
                The app will restart automatically after install.
              </Text>
              {!is_force_update && (
                <TouchableHighlight
                  style={styles.dismissBtn}
                  underlayColor="rgba(176,135,71,0.15)"
                  onPress={onDismiss}
                  {...({focusable: true, hasTVPreferredFocus: true} as any)}
                >
                  <Text style={styles.dismissBtnText}>Dismiss</Text>
                </TouchableHighlight>
              )}
            </View>
          )}

          {/* ── ERROR ──────────────────────────────────────────────────── */}
          {phase === 'error' && (
            <View style={styles.statusBox}>
              <View style={[styles.checkCircle, styles.checkCircleRed]}>
                <Text style={[styles.checkIcon, {color: RED}]}>✕</Text>
              </View>
              <Text style={[styles.statusTitle, {color: RED}]}>
                Download failed
              </Text>
              <Text style={styles.statusSub}>{errMsg}</Text>
              <TouchableHighlight
                style={[styles.dismissBtn, styles.retryBtn]}
                underlayColor={Colors.primaryDark}
                onPress={() => { setPhase('idle'); }}
                {...({focusable: true, hasTVPreferredFocus: true} as any)}
              >
                <Text style={[styles.dismissBtnText, {color: WHITE}]}>
                  Try again
                </Text>
              </TouchableHighlight>
            </View>
          )}

          {/* ── IDLE BUTTONS ───────────────────────────────────────────── */}
          {phase === 'idle' && (
            <View style={styles.btnRow}>
              {!is_force_update && (
                <TouchableHighlight
                  style={[styles.btnLater, focused === 'later' && styles.btnLaterFocused]}
                  underlayColor="rgba(176,135,71,0.15)"
                  onPress={onDismiss}
                  onFocus={() => setFocused('later')}
                  onBlur={() => {}}
                  {...({focusable: true} as any)}
                >
                  <Text style={[styles.btnLaterText, focused === 'later' && styles.btnLaterTextFocused]}>
                    Later
                  </Text>
                </TouchableHighlight>
              )}

              <Animated.View
                style={[
                  styles.btnUpdateWrap,
                  is_force_update && styles.btnUpdateWrapFull,
                  focused === 'update' && {transform: [{scale: pulseAnim}]},
                ]}
              >
                <TouchableHighlight
                  style={[styles.btnUpdate, focused === 'update' && styles.btnUpdateFocused]}
                  underlayColor={Colors.primaryDark}
                  onPress={startDownload}
                  onFocus={() => setFocused('update')}
                  onBlur={() => {}}
                  {...({focusable: true, hasTVPreferredFocus: true} as any)}
                >
                  <Text style={styles.btnUpdateText}>Update now</Text>
                </TouchableHighlight>
              </Animated.View>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ─── styles ────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '48%',
    backgroundColor: DARK,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(176,135,71,0.30)',
  },

  accentBar: {height: 3, backgroundColor: GOLD},

  /* title */
  titleArea: {alignItems: 'center', paddingHorizontal: 28, paddingTop: 22, paddingBottom: 18},
  forceBadge: {
    backgroundColor: 'rgba(240,93,56,0.18)',
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 12,
  },
  forceBadgeText: {fontFamily: FontFamily.book, color: RED, fontSize: 11, letterSpacing: 0.6},
  title: {fontFamily: FontFamily.medium, fontSize: 22, color: WHITE, textAlign: 'center', marginBottom: 6, includeFontPadding: false},
  subtitle: {fontFamily: FontFamily.book, fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18},

  /* version row */
  versionRow: {
    flexDirection: 'row',
    marginHorizontal: 24,
    backgroundColor: DARKER,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  versionBlock: {flex: 1, alignItems: 'center', paddingVertical: 12},
  versionDivider: {width: 1, backgroundColor: 'rgba(176,135,71,0.20)', marginVertical: 8},
  versionLabel: {fontFamily: FontFamily.book, color: MUTED, fontSize: 10, letterSpacing: 0.8, marginBottom: 4},
  versionValue: {fontFamily: FontFamily.medium, color: GOLD, fontSize: 16, includeFontPadding: false},

  /* release notes */
  notesWrap: {marginHorizontal: 24, marginBottom: 16},
  notesTitle: {fontFamily: FontFamily.book, color: MUTED, fontSize: 10, letterSpacing: 0.8, marginBottom: 8},
  notesList: {maxHeight: 90, backgroundColor: DARKER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8},
  bulletRow: {flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6},
  bullet: {width: 5, height: 5, borderRadius: 3, backgroundColor: GOLD, marginTop: 6, marginRight: 8, flexShrink: 0},
  bulletText: {flex: 1, fontFamily: FontFamily.book, color: 'rgba(255,255,255,0.80)', fontSize: 12, lineHeight: 18},

  /* warning */
  warningBox: {
    marginHorizontal: 24, marginBottom: 16,
    backgroundColor: 'rgba(240,93,56,0.10)',
    borderWidth: 1, borderColor: 'rgba(240,93,56,0.30)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  warningText: {fontFamily: FontFamily.book, color: '#F9A89A', fontSize: 12, lineHeight: 17, textAlign: 'center'},

  /* shared status box */
  statusBox: {
    alignItems: 'center',
    marginHorizontal: 24,
    marginBottom: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: DARKER,
    borderRadius: 10,
  },
  statusTitle: {fontFamily: FontFamily.medium, fontSize: 16, color: WHITE, marginBottom: 6, includeFontPadding: false},
  statusSub: {fontFamily: FontFamily.book, fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8},

  /* progress bar */
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 4,
  },
  progressHint: {fontFamily: FontFamily.book, fontSize: 11, color: MUTED, marginTop: 2},

  /* icon circle */
  checkCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(176,135,71,0.12)',
    borderWidth: 2, borderColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  checkCircleGreen: {backgroundColor: 'rgba(52,201,122,0.12)', borderColor: GREEN},
  checkCircleRed:   {backgroundColor: 'rgba(240,93,56,0.12)',  borderColor: RED},
  checkIcon: {fontSize: 22, color: GOLD, fontFamily: FontFamily.medium, includeFontPadding: false},

  /* dismiss / retry */
  dismissBtn: {
    marginTop: 14,
    borderWidth: 1, borderColor: 'rgba(176,135,71,0.40)',
    borderRadius: 8, paddingHorizontal: 28, paddingVertical: 10,
  },
  retryBtn: {backgroundColor: GOLD, borderColor: GOLD},
  dismissBtnText: {fontFamily: FontFamily.book, color: GOLD, fontSize: 13},

  /* idle buttons */
  btnRow: {flexDirection: 'row', marginHorizontal: 24, marginBottom: 24, gap: 12},

  btnLater: {
    flex: 1, borderWidth: 1.5, borderColor: 'rgba(176,135,71,0.40)',
    borderRadius: 8, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  btnLaterFocused: {borderColor: GOLD, borderWidth: 2, backgroundColor: 'rgba(176,135,71,0.10)'},
  btnLaterText: {fontFamily: FontFamily.book, color: MUTED, fontSize: 14},
  btnLaterTextFocused: {color: GOLD},

  btnUpdateWrap: {flex: 1, borderRadius: 8},
  btnUpdateWrapFull: {flex: 1},

  btnUpdate: {
    flex: 1, backgroundColor: GOLD, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  btnUpdateFocused: {backgroundColor: Colors.primaryLight, borderColor: WHITE, borderWidth: 2},
  btnUpdateText: {fontFamily: FontFamily.medium, color: WHITE, fontSize: 14},
});
