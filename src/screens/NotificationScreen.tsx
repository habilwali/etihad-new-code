/**
 * Notifications screen — lists previous + new notifications with seen/unseen states.
 * Integrates with NotificationContext (WebSocket + REST).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableHighlight,
  Platform,
  StatusBar,
  DeviceEventEmitter,
  Animated,
} from 'react-native';
import { AppHeader } from '../components/common/AppHeader';
import { useAppHeaderClock } from '../hooks/useAppHeaderClock';
import { useNotifications } from '../context/NotificationContext';
import { Colors } from '../theme/colors';
import { FontFamily } from '../theme/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'unseen' | 'seen';

interface DisplayNotification {
  id: string;
  app: string;
  icon: string;
  seen: boolean;
  title: string;
  preview: string;
  body: string;
  time: string;
  fullTime: string;
  actions: string[];
  thumbColor?: string;
}

// Etihad brand: Gold for System/Alert, overlay for default
const APP_COLORS: Record<string, string> = {
  System: Colors.overlay.gold[20],
  Alert: Colors.overlay.gold[30],
  default: Colors.overlay.white[8],
};

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unseen', value: 'unseen' },
  { label: 'Seen', value: 'seen' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 60000;
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    if (diff < 10080) return `${Math.floor(diff / 1440)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatFullTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function toDisplayNotification(n: { id: string; title: string; message: string; createdAt: string; seen: boolean }): DisplayNotification {
  return {
    id: n.id,
    app: 'System',
    icon: '🔔',
    seen: n.seen,
    title: n.title,
    preview: n.message.length > 50 ? n.message.slice(0, 47) + '...' : n.message,
    body: n.message,
    time: formatTimeShort(n.createdAt),
    fullTime: formatFullTime(n.createdAt),
    actions: [],
    thumbColor: undefined,
  };
}

// ─── Filter Tab ───────────────────────────────────────────────────────────────

interface FilterTabProps {
  label: string;
  active: boolean;
  onPress: () => void;
  isFocused?: boolean;
}

const FilterTab: React.FC<FilterTabProps> = React.memo(({ label, active, onPress, isFocused }) => {
  return (
    <TouchableHighlight
      onPress={onPress}
      underlayColor="transparent"
      style={styles.filterTabTouch}
      {...({ focusable: true } as any)}
    >
      <View
        style={[
          styles.filterTab,
          active && styles.filterTabActive,
          isFocused && styles.filterTabFocused,
        ]}
      >
        <Text style={[styles.filterTabText, active && styles.filterTabTextActive, isFocused && styles.filterTabTextFocused]}>
          {label}
        </Text>
      </View>
    </TouchableHighlight>
  );
});

// ─── Notification Item ────────────────────────────────────────────────────────

interface NotifItemProps {
  item: DisplayNotification;
  isSelected: boolean;
  isFocused?: boolean;
  onPress: () => void;
}

const NotifItem: React.FC<NotifItemProps> = React.memo(({ item, isSelected, isFocused, onPress }) => {
  const bg = APP_COLORS[item.app] ?? APP_COLORS.default;

  return (
    <TouchableHighlight
      onPress={onPress}
      underlayColor="transparent"
      {...({ focusable: true } as any)}
    >
      <View
        style={[
          styles.notifItem,
          isSelected && styles.notifItemSelected,
          isFocused && styles.notifItemFocused,
          item.seen && styles.notifItemSeen,
        ]}
      >
        {!item.seen && <View style={[styles.unreadBar, { backgroundColor: Colors.primary }]} />}
        <View style={styles.notifItemInner}>
          <View style={styles.notifItemHeader}>
            <View style={[styles.notifIcon, { backgroundColor: bg }]}>
              <Text style={styles.notifIconText}>{item.icon}</Text>
            </View>
            <Text style={styles.notifAppName}>{item.app}</Text>
            <Text style={styles.notifTime}>{item.time}</Text>
            {!item.seen && <View style={styles.unseenDot} />}
          </View>
          <Text style={[styles.notifTitle, item.seen && styles.notifTitleSeen]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifPreview} numberOfLines={1}>
            {item.preview}
          </Text>
        </View>
      </View>
    </TouchableHighlight>
  );
});

// ─── Action Button ────────────────────────────────────────────────────────────

interface ActionBtnProps {
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  isFocused?: boolean;
}

const ActionBtn: React.FC<ActionBtnProps> = React.memo(({ label, variant, onPress, hasTVPreferredFocus, isFocused }) => {
  return (
    <TouchableHighlight
      onPress={onPress}
      underlayColor="transparent"
      {...({ focusable: true, ...(hasTVPreferredFocus ? { hasTVPreferredFocus: true } : {}) } as any)}
    >
      <View
        style={[
          styles.actionBtn,
          variant === 'primary' && styles.actionBtnPrimary,
          variant === 'danger' && styles.actionBtnDanger,
          variant === 'secondary' && styles.actionBtnSecondary,
          isFocused && styles.actionBtnFocused,
        ]}
      >
        <Text
          style={[
            styles.actionBtnText,
            variant === 'primary' && styles.actionBtnTextPrimary,
            variant === 'danger' && styles.actionBtnTextDanger,
            variant === 'secondary' && styles.actionBtnTextSecondary,
          ]}
        >
          {label}
        </Text>
      </View>
    </TouchableHighlight>
  );
});

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  notification: DisplayNotification | null;
  onAction: (action: string, id: string) => void;
  focusedActionIndex?: number;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ notification, onAction, focusedActionIndex = 0 }) => {
  if (!notification) {
    return (
      <View style={styles.detailEmpty}>
        <Text style={styles.detailEmptyIcon}>🔔</Text>
        <Text style={styles.detailEmptyText}>Select a message</Text>
      </View>
    );
  }

  const n = notification;
  const bg = APP_COLORS[n.app] ?? APP_COLORS.default;

  return (
    <View style={styles.detailContent}>
      <View style={styles.detailHeader}>
        <View style={[styles.detailIcon, { backgroundColor: bg }]}>
          <Text style={styles.detailIconText}>{n.icon}</Text>
        </View>
        <View style={styles.detailMeta}>
          <Text style={styles.detailApp}>{n.app.toUpperCase()}</Text>
          <Text style={styles.detailTitle}>{n.title}</Text>
          <Text style={styles.detailTime}>{n.fullTime}</Text>
        </View>
        <View style={[styles.statusBadge, n.seen ? styles.statusSeen : styles.statusUnseen]}>
          <Text style={[styles.statusText, n.seen ? styles.statusTextSeen : styles.statusTextUnseen]}>
            {n.seen ? '✓  Seen' : '●  New'}
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      {n.thumbColor && (
        <View style={[styles.thumb, { backgroundColor: n.thumbColor }]}>
          <View style={styles.thumbPlay}>
            <Text style={styles.thumbPlayIcon}>▶</Text>
          </View>
          <View style={styles.thumbLabel}>
            <Text style={styles.thumbLabelText}>{n.app}</Text>
          </View>
        </View>
      )}
      <Text style={styles.detailBody}>{n.body}</Text>
      <View style={styles.actionRow}>
        {n.actions.map((action, i) => {
          const variant = i === 0 ? 'primary' : i === n.actions.length - 1 ? 'danger' : 'secondary';
          return (
            <ActionBtn
              key={action}
              label={action}
              variant={variant as 'primary' | 'secondary' | 'danger'}
              onPress={() => onAction(action, n.id)}
              hasTVPreferredFocus={i === 0}
              isFocused={focusedActionIndex === i}
            />
          );
        })}
      </View>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const KEYCODES = { BACK: 4, DPAD_UP: 19, DPAD_DOWN: 20, DPAD_LEFT: 21, DPAD_RIGHT: 22, ENTER: 66, SELECT: 23 };
const KEY_THROTTLE_MS = 130; // Prevents rapid key repeat from causing jittery navigation when holding D-pad
const SIDEBAR_HEADER_H = 140;
const ITEM_H = { section: 36, notif: 92 };
type NavZone = 'filters' | 'list' | 'detail';

export interface NotificationScreenProps {
  isActive: boolean;
  onBack: () => void;
}

const NotificationScreen: React.FC<NotificationScreenProps> = ({ isActive, onBack }) => {
  const headerClock = useAppHeaderClock();
  const { notifications, markAsSeen, removeNotification, unreadCount } = useNotifications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [navZone, setNavZone] = useState<NavZone>('filters');
  const [filterIdx, setFilterIdx] = useState(0);
  const [listIdx, setListIdx] = useState(0);
  const [detailIdx, setDetailIdx] = useState(0);
  const listRef = useRef<FlatList>(null);
  const navZoneRef = useRef<NavZone>(navZone);
  const filterIdxRef = useRef(filterIdx);
  const listIdxRef = useRef(listIdx);
  const detailIdxRef = useRef(detailIdx);
  const onBackRef = useRef(onBack);
  const handleSelectRef = useRef<(id: string) => void>(() => {});
  const handleActionRef = useRef<(action: string, id: string) => void>(() => {});
  const combinedDataRef = useRef<(DisplayNotification | { type: 'section'; label: string })[]>([]);
  const notifIndicesRef = useRef<number[]>([]);
  const selectedNotifRef = useRef<DisplayNotification | null>(null);

  const displayList = notifications.map(toDisplayNotification);

  const filtered = useCallback(() => {
    if (filter === 'unseen') return displayList.filter((n) => !n.seen);
    if (filter === 'seen') return displayList.filter((n) => n.seen);
    return displayList;
  }, [displayList, filter]);

  const filteredData = filtered();
  const unseenItems = filteredData.filter((n) => !n.seen);
  const seenItems = filteredData.filter((n) => n.seen);
  const selectedNotif = displayList.find((n) => n.id === selectedId) ?? null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    markAsSeen(id);
  };

  const handleAction = (action: string, id: string) => {
    if (action === 'Dismiss' || action === 'Skip') {
      removeNotification(id);
      setSelectedId(null);
    }
  };

  const combinedData: (DisplayNotification | { type: 'section'; label: string })[] = [];
  if (filter === 'all') {
    unseenItems.forEach((n) => combinedData.push(n));
    if (seenItems.length > 0) {
      combinedData.push({ type: 'section', label: 'Earlier' });
      seenItems.forEach((n) => combinedData.push(n));
    }
  } else {
    filteredData.forEach((n) => combinedData.push(n));
  }

  const notifIndices = combinedData
    .map((item, i) => ('type' in item ? -1 : i))
    .filter((i) => i >= 0);
  const notifCount = notifIndices.length;
  const detailActionCount = selectedNotif?.actions.length ?? 0;

  // Keep refs updated so key handler always has latest values
  combinedDataRef.current = combinedData;
  notifIndicesRef.current = notifIndices;
  selectedNotifRef.current = selectedNotif;
  handleSelectRef.current = handleSelect;
  handleActionRef.current = handleAction;
  navZoneRef.current = navZone;
  filterIdxRef.current = filterIdx;
  listIdxRef.current = listIdx;
  detailIdxRef.current = detailIdx;

  const lastKeyRef = useRef<{ keyCode: number; time: number }>({ keyCode: -1, time: 0 });

  const scrollToListIndex = useCallback((index: number, goingDown?: boolean) => {
    const idx = notifIndicesRef.current[index];
    if (idx == null) return;
    const data = combinedDataRef.current;
    let offset = SIDEBAR_HEADER_H;
    for (let i = 0; i < idx && i < data.length; i++) {
      offset += 'type' in data[i] ? ITEM_H.section : ITEM_H.notif;
    }
    const doScroll = () => {
      listRef.current?.scrollToOffset({ offset, animated: goingDown ?? true });
    };
    if (goingDown === false) {
      requestAnimationFrame(() => requestAnimationFrame(doScroll));
    } else {
      requestAnimationFrame(doScroll);
    }
  }, []);

  useEffect(() => {
    if (!isActive || Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode?: number }) => {
      const kc = evt?.keyCode ?? (evt as any).keyCode;
      if (typeof kc !== 'number') return;
      const now = Date.now();
      const last = lastKeyRef.current;
      if (last.keyCode === kc && now - last.time < KEY_THROTTLE_MS) return;
      lastKeyRef.current = { keyCode: kc, time: now };
      const zone = navZoneRef.current;
      const fIdx = filterIdxRef.current;
      const lIdx = listIdxRef.current;
      const dIdx = detailIdxRef.current;
      const data = combinedDataRef.current;
      const indices = notifIndicesRef.current;
      const nCount = indices.length;
      const selNotif = selectedNotifRef.current;
      const dCount = selNotif?.actions.length ?? 0;

      if (kc === KEYCODES.BACK) {
        onBackRef.current?.();
        return;
      }

      if (zone === 'filters') {
        if (kc === KEYCODES.DPAD_LEFT) {
          const next = Math.max(0, fIdx - 1);
          filterIdxRef.current = next;
          setFilterIdx(next);
          setFilter(FILTERS[next].value);
        } else if (kc === KEYCODES.DPAD_RIGHT) {
          const next = Math.min(2, fIdx + 1);
          filterIdxRef.current = next;
          setFilterIdx(next);
          setFilter(FILTERS[next].value);
        } else if (kc === KEYCODES.DPAD_DOWN) {
          if (nCount > 0) {
            navZoneRef.current = 'list';
            setNavZone('list');
            listIdxRef.current = 0;
            setListIdx(0);
            scrollToListIndex(0, true);
          } else if (selNotif && dCount > 0) {
            navZoneRef.current = 'detail';
            setNavZone('detail');
            detailIdxRef.current = 0;
            setDetailIdx(0);
          }
        } else if (kc === KEYCODES.ENTER || kc === KEYCODES.SELECT) {
          setFilter(FILTERS[fIdx].value);
        }
        return;
      }

      if (zone === 'list') {
        if (kc === KEYCODES.DPAD_UP) {
          if (lIdx > 0 && indices[lIdx - 1] != null) {
            const prev = lIdx - 1;
            listIdxRef.current = prev;
            setListIdx(prev);
            scrollToListIndex(prev, false);
          } else {
            navZoneRef.current = 'filters';
            setNavZone('filters');
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
            });
          }
        } else if (kc === KEYCODES.DPAD_DOWN) {
          const next = Math.min(nCount - 1, lIdx + 1);
          if (next !== lIdx && indices[next] != null) {
            listIdxRef.current = next;
            setListIdx(next);
            scrollToListIndex(next, true);
          }
        } else if (kc === KEYCODES.DPAD_RIGHT && selNotif && dCount > 0) {
          navZoneRef.current = 'detail';
          setNavZone('detail');
          detailIdxRef.current = 0;
          setDetailIdx(0);
        } else if (kc === KEYCODES.ENTER || kc === KEYCODES.SELECT) {
          const idx = indices[lIdx];
          if (idx != null && idx >= 0 && idx < data.length) {
            const item = data[idx];
            if (item && !('type' in item)) handleSelectRef.current?.((item as DisplayNotification).id);
          }
        }
        return;
      }

      if (zone === 'detail' && selNotif) {
        if (kc === KEYCODES.DPAD_LEFT) {
          if (dIdx > 0) {
            const prev = Math.max(0, dIdx - 1);
            detailIdxRef.current = prev;
            setDetailIdx(prev);
          } else {
            navZoneRef.current = 'list';
            setNavZone('list');
          }
        } else if (kc === KEYCODES.DPAD_UP && nCount > 0) {
          navZoneRef.current = 'list';
          setNavZone('list');
        } else if (kc === KEYCODES.DPAD_RIGHT) {
          const next = Math.min(dCount - 1, dIdx + 1);
          detailIdxRef.current = next;
          setDetailIdx(next);
        } else if (kc === KEYCODES.ENTER || kc === KEYCODES.SELECT) {
          const action = selNotif.actions[dIdx];
          if (action) handleActionRef.current?.(action, selNotif.id);
        }
        return;
      }
    });
    return () => sub.remove();
  }, [isActive, scrollToListIndex]);

  const ListHeader = () => (
    <View style={styles.sidebarHeader}>
      <View style={styles.sidebarTitleRow}>
        <Text style={styles.sidebarTitle}>MESSAGES</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map((f, i) => (
          <FilterTab
            key={f.value}
            label={f.label}
            active={filter === f.value}
            onPress={() => setFilter(f.value)}
            isFocused={navZone === 'filters' && filterIdx === i}
          />
        ))}
      </View>
    </View>
  );

  const renderItem = ({ item, index }: { item: DisplayNotification | { type: 'section'; label: string }; index: number }) => {
    if ('type' in item && item.type === 'section') {
      return <Text style={styles.sectionLabel}>{item.label}</Text>;
    }
    const n = item as DisplayNotification;
    const posInList = notifIndices.indexOf(index);
    const focused = navZone === 'list' && listIdx === posInList;
    return (
      <NotifItem
        item={n}
        isSelected={n.id === selectedId}
        isFocused={focused}
        onPress={() => handleSelect(n.id)}
      />
    );
  };

  const keyExtractor = (item: DisplayNotification | { type: 'section'; label: string }) =>
    'type' in item ? `section-${item.label}` : (item as DisplayNotification).id;

  const SIDEBAR_HEADER_H = 140;
  const ITEM_H = { section: 36, notif: 92 };
  const getItemLayout = (_data: ArrayLike<DisplayNotification | { type: 'section'; label: string }> | null | undefined, index: number) => {
    const list = _data ? Array.from(_data) : [];
    let offset = SIDEBAR_HEADER_H;
    for (let i = 0; i < index && i < list.length; i++) {
      offset += 'type' in list[i] ? ITEM_H.section : ITEM_H.notif;
    }
    const item = list[index];
    const length = item && 'type' in item ? ITEM_H.section : ITEM_H.notif;
    return { length, offset, index };
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background.dark} />
      <View style={styles.root}>
        <AppHeader
          date={headerClock.date}
          time={headerClock.time}
          temperature={headerClock.temperature}
          weatherCondition={headerClock.weatherCondition}
        />
        <View style={styles.contentRow}>
          <View style={styles.sidebar}>
            <FlatList
              ref={listRef}
              data={combinedData}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
              ListHeaderComponent={ListHeader}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              removeClippedSubviews
              maxToRenderPerBatch={4}
              windowSize={3}
              initialNumToRender={6}
              updateCellsBatchingPeriod={50}
              contentContainerStyle={styles.listContent}
              onScrollToIndexFailed={() => {}}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>🔔</Text>
                  <Text style={styles.emptyText}>No messages yet</Text>
                </View>
              }
            />
          </View>
          <View style={styles.detailPanel}>
            <DetailPanel
              notification={selectedNotif}
              onAction={handleAction}
              focusedActionIndex={navZone === 'detail' ? detailIdx : -1}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 320,
    borderRightWidth: 2,
    borderRightColor: Colors.overlay.gold[20],
  },
  listContent: {
    paddingBottom: 32,
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.overlay.white[7],
  },
  sidebarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sidebarTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.overlay.white[35],
    letterSpacing: 1.2,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.black,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterTabTouch: {
    borderRadius: 20,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: Colors.overlay.white[12],
  },
  filterTabActive: {
    backgroundColor: Colors.overlay.gold[20],
    borderColor: Colors.primaryLight,
  },
  filterTabFocused: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.overlay.gold[20],
  },
  filterTabText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.overlay.white[35],
  },
  filterTabTextActive: {
    color: Colors.gold[100],
  },
  filterTabTextFocused: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.medium,
  },
  sectionLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 10,
    color: Colors.overlay.white[35],
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  notifItem: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  notifItemSelected: {
    backgroundColor: Colors.overlay.gold[12],
    borderLeftColor: Colors.primary,
  },
  notifItemSeen: {
    opacity: 0.7,
  },
  notifItemFocused: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.overlay.gold[12],
  },
  unreadBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  notifItemInner: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  notifItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  notifIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconText: {
    fontSize: 13,
  },
  notifAppName: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.overlay.white[35],
  },
  notifTime: {
    fontFamily: FontFamily.book,
    fontSize: 10,
    color: Colors.text.muted,
  },
  unseenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginLeft: 4,
  },
  notifTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.text.light,
    marginBottom: 3,
  },
  notifTitleSeen: {
    fontFamily: FontFamily.book,
    color: Colors.overlay.white[35],
  },
  notifPreview: {
    fontFamily: FontFamily.book,
    fontSize: 11,
    color: Colors.text.muted,
  },
  detailPanel: {
    flex: 1,
  },
  detailEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  detailEmptyIcon: {
    fontSize: 36,
    opacity: 0.2,
  },
  detailEmptyText: {
    fontFamily: FontFamily.book,
    fontSize: 14,
    color: Colors.overlay.white[35],
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 36,
    opacity: 0.3,
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: FontFamily.book,
    fontSize: 14,
    color: Colors.text.muted,
  },
  detailContent: {
    flex: 1,
    padding: 36,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
    marginBottom: 24,
  },
  detailIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailIconText: {
    fontSize: 24,
  },
  detailMeta: {
    flex: 1,
    gap: 4,
  },
  detailApp: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.overlay.white[35],
    letterSpacing: 1.0,
  },
  detailTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 22,
    color: Colors.text.light,
    lineHeight: 28,
  },
  detailTime: {
    fontFamily: FontFamily.book,
    fontSize: 12,
    color: Colors.text.muted,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  statusUnseen: {
    backgroundColor: Colors.overlay.gold[15],
    borderColor: Colors.primary,
  },
  statusSeen: {
    backgroundColor: Colors.overlay.white[5],
    borderColor: Colors.overlay.white[12],
  },
  statusText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
  },
  statusTextUnseen: {
    color: Colors.primaryLight,
  },
  statusTextSeen: {
    color: Colors.text.muted,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.overlay.white[7],
    marginBottom: 24,
  },
  thumb: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.overlay.white[12],
    borderWidth: 1,
    borderColor: Colors.overlay.white[35],
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlayIcon: {
    fontSize: 16,
    color: Colors.white,
    marginLeft: 3,
  },
  thumbLabel: {
    position: 'absolute',
    bottom: 10,
    left: 14,
    backgroundColor: Colors.overlay.black[55],
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  thumbLabelText: {
    fontFamily: FontFamily.book,
    fontSize: 11,
    color: Colors.text.light,
  },
  detailBody: {
    fontFamily: FontFamily.book,
    fontSize: 15,
    color: Colors.text.muted,
    lineHeight: 24,
    marginBottom: 32,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 0.5,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.overlay.gold[35],
    borderColor: Colors.primary,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.overlay.white[5],
    borderColor: Colors.overlay.white[12],
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(240,93,56,0.12)',
    borderColor: 'rgba(240,93,56,0.35)',
  },
  actionBtnFocused: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.overlay.gold[20],
  },
  actionBtnText: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
  },
  actionBtnTextPrimary: {
    color: Colors.gold[100],
  },
  actionBtnTextSecondary: {
    color: Colors.overlay.white[35],
  },
  actionBtnTextDanger: {
    color: Colors.liwaOrange[300],
  },
});

export default NotificationScreen;

