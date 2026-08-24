import React, {useEffect, useRef, useState} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableHighlight,
  Animated,
  DeviceEventEmitter,
  BackHandler,
  Platform,
} from 'react-native';
import {useEmergencyAlert} from '../context/EmergencyAlertContext';
import {Colors} from '../theme/colors';

const SEVERITY_STYLES = {
  info: {bg: '#0D2137', border: '#378ADD', badge: '#B5D4F4'},
  warning: {bg: '#2A1A00', border: '#EF9F27', badge: '#FAC775'},
  critical: {bg: '#2A0808', border: '#E24B4A', badge: '#F7C1C1'},
};

/**
 * Full-screen emergency alert.
 * Remote: focus the Dismiss button then press OK, or press BACK — both dismiss
 * permanently so the same alert will not return from CMS polling.
 */
export const EmergencyAlertModal: React.FC = () => {
  const {alertData, isVisible, dismissAlert} = useEmergencyAlert();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-30)).current;
  const [dismissFocused, setDismissFocused] = useState(true);
  const [ctaFocused, setCtaFocused] = useState(false);
  // Survives re-render so ACTION_UP BackHandler (App) still sees we handled BACK.
  const backHandledRef = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: isVisible ? 1 : 0,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isVisible ? 0 : -30,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
    if (isVisible) {
      setDismissFocused(true);
      setCtaFocused(false);
    }
  }, [isVisible, opacity, translateY]);

  // BACK / OK on remote: select Dismiss (user dismiss = permanent, won't come again)
  useEffect(() => {
    if (Platform.OS !== 'android' || !isVisible) {
      return;
    }

    const onKeyDown = DeviceEventEmitter.addListener(
      'onKeyDown',
      (evt: {keyCode: number}) => {
        // BACK
        if (evt.keyCode === 4) {
          backHandledRef.current = true;
          dismissAlert();
          return;
        }
        // OK / CENTER / ENTER — activate the focused dismiss control
        if (evt.keyCode === 23 || evt.keyCode === 66) {
          backHandledRef.current = true;
          dismissAlert();
        }
      },
    );

    // Consume hardwareBackPress so App.tsx does not navigate home.
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backHandledRef.current || isVisible) {
        backHandledRef.current = false;
        return true;
      }
      return false;
    });

    return () => {
      onKeyDown.remove();
      backSub.remove();
    };
  }, [isVisible, dismissAlert]);

  if (!alertData) {
    return null;
  }

  const severityKey =
    alertData.severity in SEVERITY_STYLES ? alertData.severity : 'info';
  const s = SEVERITY_STYLES[severityKey as keyof typeof SEVERITY_STYLES];

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={dismissAlert}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {backgroundColor: s.bg, borderColor: s.border},
            {opacity, transform: [{translateY}]},
          ]}>
          <View style={[styles.badge, {borderColor: s.border}]}>
            <Text style={[styles.badgeText, {color: s.badge}]}>
              {severityKey.toUpperCase()}
            </Text>
          </View>

          <Text style={styles.title}>{alertData.title}</Text>
          <Text style={styles.message}>{alertData.message}</Text>

          <View style={styles.actions}>
            {alertData.ctaLabel ? (
              <TouchableHighlight
                style={[
                  styles.ctaBtn,
                  {borderColor: s.border},
                  ctaFocused && {backgroundColor: s.border + '33'},
                ]}
                underlayColor={s.border + '33'}
                onPress={dismissAlert}
                onFocus={() => {
                  setCtaFocused(true);
                  setDismissFocused(false);
                }}
                onBlur={() => setCtaFocused(false)}
                {...({focusable: true, hasTVPreferredFocus: false} as object)}>
                <Text style={[styles.ctaText, {color: s.badge}]}>
                  {alertData.ctaLabel}
                </Text>
              </TouchableHighlight>
            ) : null}

            {/* Primary remote target — OK / BACK dismisses permanently */}
            <TouchableHighlight
              style={[
                styles.dismissBtn,
                dismissFocused && styles.dismissBtnFocused,
              ]}
              underlayColor="#ffffff22"
              onPress={dismissAlert}
              onFocus={() => {
                setDismissFocused(true);
                setCtaFocused(false);
              }}
              onBlur={() => setDismissFocused(false)}
              {...({focusable: true, hasTVPreferredFocus: true} as object)}>
              <Text
                style={[
                  styles.dismissText,
                  dismissFocused && styles.dismissTextFocused,
                ]}>
                Dismiss
              </Text>
            </TouchableHighlight>
          </View>

          <Text style={styles.hint}>Press OK or BACK to dismiss</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '58%',
    maxWidth: 780,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 44,
  },
  badge: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 18,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 14,
    textAlign: 'center',
  },
  message: {
    fontSize: 22,
    color: '#bbbbbb',
    lineHeight: 34,
    marginBottom: 36,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  ctaBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 34,
    paddingVertical: 14,
  },
  ctaText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  dismissBtn: {
    borderWidth: 2,
    borderColor: '#ffffff25',
    borderRadius: 8,
    paddingHorizontal: 34,
    paddingVertical: 14,
    minWidth: 160,
  },
  dismissBtnFocused: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(200,170,127,0.18)',
  },
  dismissText: {
    fontSize: 20,
    color: '#888888',
    textAlign: 'center',
    fontWeight: '600',
  },
  dismissTextFocused: {
    color: Colors.primary,
  },
  hint: {
    marginTop: 18,
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
});
