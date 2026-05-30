import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet,
  TouchableHighlight, Animated,
  DeviceEventEmitter, Platform,
} from 'react-native';
import { useEmergencyAlert } from '../context/EmergencyAlertContext';

const SEVERITY_STYLES = {
  info:     { bg: '#0D2137', border: '#378ADD', badge: '#B5D4F4' },
  warning:  { bg: '#2A1A00', border: '#EF9F27', badge: '#FAC775' },
  critical: { bg: '#2A0808', border: '#E24B4A', badge: '#F7C1C1' },
};

export const EmergencyAlertModal: React.FC = () => {
  const { alertData, isVisible, dismissAlert } = useEmergencyAlert();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: isVisible ? 1 : 0, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: isVisible ? 0 : -30, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [isVisible, opacity, translateY]);

  // Remote: Back (4), OK/Select (23), Enter (66) -> dismiss modal
  useEffect(() => {
    if (Platform.OS !== 'android' || !isVisible) return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode: number }) => {
      if (evt.keyCode === 4 || evt.keyCode === 23 || evt.keyCode === 66) {
        dismissAlert();
      }
    });
    return () => sub.remove();
  }, [isVisible, dismissAlert]);

  if (!alertData) return null;

  const severityKey =
    alertData.severity in SEVERITY_STYLES ? alertData.severity : 'info';
  const s = SEVERITY_STYLES[severityKey];

  return (
    <Modal visible={isVisible} transparent animationType="none" onRequestClose={dismissAlert}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: s.bg, borderColor: s.border },
            { opacity, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.badge, { borderColor: s.border }]}>
            <Text style={[styles.badgeText, { color: s.badge }]}>
              {severityKey.toUpperCase()}
            </Text>
          </View>

          <Text style={styles.title}>{alertData.title}</Text>
          <Text style={styles.message}>{alertData.message}</Text>

          <View style={styles.actions}>
            {alertData.ctaLabel && (
              <TouchableHighlight
                style={[styles.ctaBtn, { borderColor: s.border }]}
                underlayColor={s.border + '33'}
                onPress={dismissAlert}
                {...({ focusable: true } as any)}
              >
                <Text style={[styles.ctaText, { color: s.badge }]}>{alertData.ctaLabel}</Text>
              </TouchableHighlight>
            )}
            <TouchableHighlight
              style={styles.dismissBtn}
              underlayColor="#ffffff15"
              onPress={dismissAlert}
              {...({ focusable: true, hasTVPreferredFocus: !alertData.ctaLabel } as any)}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableHighlight>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  card:        { width: '58%', maxWidth: 780, borderWidth: 1.5, borderRadius: 14, padding: 44 },
  badge:       { alignSelf: 'center', borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 18 },
  badgeText:   { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textAlign: 'center' },
  title:       { fontSize: 34, fontWeight: '700', color: '#ffffff', marginBottom: 14, textAlign: 'center' },
  message:     { fontSize: 22, color: '#bbbbbb', lineHeight: 34, marginBottom: 36, textAlign: 'center' },
  actions:     { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  ctaBtn:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 34, paddingVertical: 14 },
  ctaText:     { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  dismissBtn:  { borderWidth: 1, borderColor: '#ffffff25', borderRadius: 8, paddingHorizontal: 34, paddingVertical: 14 },
  dismissText: { fontSize: 20, color: '#888888', textAlign: 'center' },
});

