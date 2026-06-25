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
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar,
  DeviceEventEmitter,
  BackHandler,
  Animated,
  Linking,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Video from 'react-native-video';
import RNFetchBlob from 'react-native-blob-util';
import Pdf from 'react-native-pdf';
import { AppHeader } from '../components/common/AppHeader';
import { useAppHeaderClock } from '../hooks/useAppHeaderClock';
import { useNotifications } from '../context/NotificationContext';
import type { NotificationAttachment } from '../context/NotificationContext';
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
  attachment?: NotificationAttachment;
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

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeToIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  return '📎';
}

function toDisplayNotification(n: { id: string; title: string; message: string; createdAt: string; seen: boolean; attachment?: NotificationAttachment }): DisplayNotification {
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
    attachment: n.attachment,
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
            {item.attachment && (
              <Text style={styles.attachmentBadge}>📎</Text>
            )}
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
  onOpenAttachment: (url: string, mime: string, name: string) => void;
  downloadingUrl: string | null;
  focusedActionIndex?: number;
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  notification,
  onAction,
  onOpenAttachment,
  downloadingUrl,
  focusedActionIndex = -1,
}) => {
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
  const att = n.attachment;
  const isImage = att?.mime.startsWith('image/');
  const isVideo = att?.mime.startsWith('video/');
  const attachIdx = n.actions.length;
  const isAttachFocused = focusedActionIndex === attachIdx;

  return (
    <View style={styles.detailContent}>
      {/* ── Fixed header ── */}
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

      {/* ── Scrollable body ── */}
      <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
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

        {/* ── Inline image — focusable, ENTER opens fullscreen ── */}
        {isImage && att && (
          <TouchableHighlight
            onPress={() => onOpenAttachment(att.url, att.mime, att.name)}
            underlayColor="transparent"
            {...({ focusable: true } as any)}
          >
            <View style={[styles.attachmentImageWrap, isAttachFocused && styles.attachmentImageWrapFocused]}>
              <FastImage
                source={{ uri: att.url, priority: FastImage.priority.normal }}
                style={styles.attachmentImage}
                resizeMode={FastImage.resizeMode.contain}
              />
              {isAttachFocused && (
                <View style={styles.mediaFocusHint}>
                  <Text style={styles.mediaFocusHintText}>↵  Full screen</Text>
                </View>
              )}
            </View>
          </TouchableHighlight>
        )}

        {/* ── Inline video — focusable, ENTER opens fullscreen viewer ── */}
        {isVideo && att && (
          <TouchableHighlight
            onPress={() => onOpenAttachment(att.url, att.mime, att.name)}
            underlayColor="transparent"
            {...({ focusable: true } as any)}
          >
            <View style={[styles.attachmentVideoWrap, isAttachFocused && styles.attachmentVideoWrapFocused]}>
              <Video
                source={{ uri: att.url }}
                style={styles.attachmentVideo}
                resizeMode="contain"
                paused
                controls={false}
              />
              {/* Fullscreen overlay hint */}
              <View style={styles.videoPlayOverlay}>
                <View style={[styles.videoPlayBtn, isAttachFocused && styles.videoPlayBtnFocused]}>
                  <Text style={styles.videoPlayIcon}>▶</Text>
                </View>
                {isAttachFocused && (
                  <Text style={styles.videoFocusHintText}>↵  Full screen</Text>
                )}
              </View>
            </View>
          </TouchableHighlight>
        )}

        {/* ── Message body ── */}
        <Text style={styles.detailBody}>{n.body}</Text>

        {/* ── File card for non-media attachments (PDF, etc.) ── */}
        {att && !isImage && !isVideo && (() => {
          const isDownloading = downloadingUrl === att.url;
          return (
            <TouchableHighlight
              onPress={() => onOpenAttachment(att.url, att.mime, att.name)}
              underlayColor="transparent"
              {...({ focusable: true } as any)}
            >
              <View style={[styles.attachmentCard, isAttachFocused && styles.attachmentCardFocused]}>
                <View style={[styles.attachmentCardIcon, isAttachFocused && styles.attachmentCardIconFocused]}>
                  <Text style={styles.attachmentCardIconText}>
                    {isDownloading ? '⏳' : mimeToIcon(att.mime)}
                  </Text>
                </View>
                <View style={styles.attachmentCardInfo}>
                  <Text style={[styles.attachmentCardName, isAttachFocused && styles.attachmentCardNameFocused]} numberOfLines={1}>
                    {att.name}
                  </Text>
                  <Text style={styles.attachmentCardMeta}>
                    {isDownloading
                      ? 'Downloading…'
                      : [att.mime.split('/').pop()?.toUpperCase(), formatFileSize(att.size)].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
                <Text style={[styles.attachmentOpenHint, isAttachFocused && styles.attachmentOpenHintFocused]}>
                  {isDownloading ? '' : isAttachFocused ? '▶  Open' : '↵'}
                </Text>
              </View>
            </TouchableHighlight>
          );
        })()}

        {/* ── Action buttons ── */}
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
      </ScrollView>
    </View>
  );
};

// ─── PDF Viewer Modal ─────────────────────────────────────────────────────────

interface PdfViewerModalProps {
  url: string | null;
  title: string;
  onClose: () => void;
}

/**
 * Full-screen PDF viewer rendered as an absolutely-positioned View (NOT a Modal).
 * Reason: on Android, a Modal creates a separate Dialog window. Key events go to
 * that Dialog — not to MainActivity.dispatchKeyEvent — so onKeyDown never fires
 * inside a Modal. By using a plain View with zIndex, we stay in the same Activity
 * window and receive all D-pad events normally.
 */
const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ url, title, onClose }) => {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageRef = useRef(1);
  const totalRef = useRef(0);
  const loadedRef = useRef(false);
  const pdfRef = useRef<any>(null);

  // Reset state on new URL
  useEffect(() => {
    if (url) {
      setPage(1); pageRef.current = 1;
      setTotalPages(0); totalRef.current = 0;
      loadedRef.current = false;
      setLoading(true); setError(false);
    }
  }, [url]);

  // D-pad handler for page navigation only (UP/DOWN).
  // BACK is intentionally NOT handled here — the parent NotificationScreen's
  // onKeyDown + BackHandler combo handles it reliably via a plain ref.
  useEffect(() => {
    if (!url || Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode?: number }) => {
      const code = evt?.keyCode ?? 0;

      // Don't attempt page navigation until the PDF is fully loaded
      if (!loadedRef.current || totalRef.current === 0) return;

      if (code === 19) {                               // UP → prev page
        const prev = Math.max(1, pageRef.current - 1);
        if (prev !== pageRef.current) {
          pageRef.current = prev;
          setPage(prev);
          try { pdfRef.current?.setPage(prev); } catch { /* ignore */ }
        }
      } else if (code === 20) {                        // DOWN → next page
        const next = Math.min(totalRef.current, pageRef.current + 1);
        if (next !== pageRef.current) {
          pageRef.current = next;
          setPage(next);
          try { pdfRef.current?.setPage(next); } catch { /* ignore */ }
        }
      }
    });
    return () => sub.remove();
  }, [url, onClose]);

  if (!url) return null;

  return (
    <View style={pdfStyles.overlay}>
      {/* Header */}
      <View style={pdfStyles.header}>
        <TouchableHighlight onPress={onClose} underlayColor="transparent" {...({ focusable: true } as any)}>
          <View style={pdfStyles.closeBtn}>
            <Text style={pdfStyles.closeBtnText}>✕  Close</Text>
          </View>
        </TouchableHighlight>
        <Text style={pdfStyles.headerTitle} numberOfLines={1}>{title}</Text>
        {totalPages > 0 && (
          <Text style={pdfStyles.pageCount}>{page} / {totalPages}</Text>
        )}
      </View>

      {/* D-pad hint */}
      {totalPages > 1 && !loading && (
        <View style={pdfStyles.dpadHint}>
          <Text style={pdfStyles.dpadHintText}>▲ prev page  ·  ▼ next page  ·  BACK to close</Text>
        </View>
      )}

      {/* Native PDF renderer */}
      <Pdf
        ref={pdfRef}
        key={url}
        source={{ uri: url, cache: true }}
        style={pdfStyles.pdf}
        page={page}
        trustAllCerts={false}
        fitPolicy={2}
        scale={1.0}
        minScale={0.5}
        maxScale={2.0}
        spacing={8}
        enablePaging
        onLoadComplete={(pages) => {
          totalRef.current = pages;
          loadedRef.current = true;
          setTotalPages(pages);
          setLoading(false);
        }}
        onPageChanged={(p) => { setPage(p); pageRef.current = p; }}
        onError={(err) => {
          if (__DEV__) console.warn('[PdfViewer] error:', err);
          setLoading(false); setError(true);
        }}
        onLoadProgress={() => { if (totalRef.current === 0) setLoading(true); }}
      />

      {/* Loading overlay — only on initial load */}
      {loading && !error && (
        <View style={pdfStyles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={pdfStyles.loadingText}>Loading PDF…</Text>
        </View>
      )}

      {/* Error state */}
      {error && (
        <View style={pdfStyles.loadingOverlay}>
          <Text style={pdfStyles.errorIcon}>⚠️</Text>
          <Text style={[pdfStyles.loadingText, pdfStyles.errorText]}>
            {'Could not load file.\nCheck your network and try again.'}
          </Text>
        </View>
      )}
    </View>
  );
};

const pdfStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    zIndex: 1000,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.overlay.black[55],
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.overlay.white[12],
    gap: 16,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.overlay.white[12],
    backgroundColor: Colors.overlay.white[5],
  },
  closeBtnText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.text.light,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.text.light,
  },
  pdf: {
    flex: 1,
    backgroundColor: '#fff',
    width: '100%',
  },
  pageCount: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    color: Colors.text.secondary,
    marginLeft: 'auto',
  },
  dpadHint: {
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: Colors.overlay.black[55],
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.overlay.white[12],
  },
  dpadHintText: {
    fontFamily: FontFamily.book,
    fontSize: 12,
    color: Colors.text.secondary,
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: FontFamily.book,
    fontSize: 14,
    color: Colors.text.light,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    color: '#ff8a80',
    textAlign: 'center',
    lineHeight: 22,
  },
});

// ─── Video Viewer Modal ───────────────────────────────────────────────────────

interface VideoViewerModalProps {
  url: string | null;
  title: string;
  onClose: () => void;
}

/**
 * Full-screen video player — absolutely-positioned View so key events stay in
 * MainActivity (same pattern as PdfViewerModal). Auto-plays on open.
 * ENTER / OK toggles play-pause. BACK is handled by the parent's backHandledRef.
 */
const VideoViewerModal: React.FC<VideoViewerModalProps> = ({ url, title, onClose }) => {
  const [paused, setPaused] = useState(false); // auto-play on open
  const [ended, setEnded] = useState(false);
  const pausedRef = useRef(false);

  // Reset state whenever a new video URL is provided
  useEffect(() => {
    if (url) {
      setPaused(false);
      pausedRef.current = false;
      setEnded(false);
    }
  }, [url]);

  // D-pad: ENTER toggles play/pause. BACK is handled by parent's backHandledRef.
  useEffect(() => {
    if (!url || Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode?: number }) => {
      const code = evt?.keyCode ?? 0;
      if (code === 23 || code === 66) {               // ENTER / OK → play-pause
        const next = !pausedRef.current;
        pausedRef.current = next;
        setPaused(next);
        if (ended && !next) setEnded(false);
      }
    });
    return () => sub.remove();
  }, [url, ended]);

  if (!url) return null;

  return (
    <View style={vidStyles.overlay}>
      {/* Header */}
      <View style={vidStyles.header}>
        <TouchableHighlight onPress={onClose} underlayColor="transparent" {...({ focusable: true } as any)}>
          <View style={vidStyles.closeBtn}>
            <Text style={vidStyles.closeBtnText}>✕  Close</Text>
          </View>
        </TouchableHighlight>
        <Text style={vidStyles.headerTitle} numberOfLines={1}>{title}</Text>
        <Text style={vidStyles.hint}>↵ play/pause  ·  BACK to close</Text>
      </View>

      {/* Full-screen video */}
      <Video
        key={url}
        source={{ uri: url }}
        style={vidStyles.video}
        resizeMode="contain"
        paused={paused}
        controls={false}
        onEnd={() => { setPaused(true); pausedRef.current = true; setEnded(true); }}
      />

      {/* Play/pause overlay — always visible so the user knows the state */}
      <View pointerEvents="none" style={vidStyles.playOverlay}>
        <View style={[vidStyles.playBtn, !paused && vidStyles.playBtnPlaying]}>
          <Text style={vidStyles.playIcon}>{ended ? '↺' : paused ? '▶' : '⏸'}</Text>
        </View>
        {paused && (
          <Text style={vidStyles.playHint}>{ended ? 'Replay  ↵' : 'Play  ↵'}</Text>
        )}
      </View>
    </View>
  );
};

const vidStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1002,
    elevation: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    gap: 16,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.overlay.white[12],
    backgroundColor: Colors.overlay.white[5],
  },
  closeBtnText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.text.light,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.text.light,
  },
  hint: {
    fontFamily: FontFamily.book,
    fontSize: 12,
    color: Colors.text.secondary,
  },
  video: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 52,           // below header
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnPlaying: {
    opacity: 0,         // invisible while actively playing
  },
  playIcon: {
    fontSize: 28,
    color: '#fff',
    marginLeft: 3,
  },
  playHint: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.primaryLight,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
});

// ─── Image Viewer Modal ───────────────────────────────────────────────────────

interface ImageViewerModalProps {
  url: string | null;
  title: string;
  onClose: () => void;
}

/**
 * Full-screen image viewer — same absolutely-positioned View pattern as
 * PdfViewerModal so key events stay in MainActivity and the parent's
 * backHandledRef approach works correctly.
 */
const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ url, title, onClose }) => {
  if (!url) return null;

  return (
    <View style={imgStyles.overlay}>
      <View style={imgStyles.header}>
        <TouchableHighlight onPress={onClose} underlayColor="transparent" {...({ focusable: true } as any)}>
          <View style={imgStyles.closeBtn}>
            <Text style={imgStyles.closeBtnText}>✕  Close</Text>
          </View>
        </TouchableHighlight>
        <Text style={imgStyles.headerTitle} numberOfLines={1}>{title}</Text>
        <Text style={imgStyles.hint}>BACK to close</Text>
      </View>
      <FastImage
        key={url}
        source={{ uri: url, priority: FastImage.priority.high }}
        style={imgStyles.image}
        resizeMode={FastImage.resizeMode.contain}
      />
    </View>
  );
};

const imgStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1001,
    elevation: 21,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 16,
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.overlay.white[12],
    backgroundColor: Colors.overlay.white[5],
  },
  closeBtnText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.text.light,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.text.light,
  },
  hint: {
    fontFamily: FontFamily.book,
    fontSize: 12,
    color: Colors.text.secondary,
  },
  image: {
    flex: 1,
    width: '100%',
  },
});

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
  const handleOpenAttachmentRef = useRef<(url: string, mime: string, name: string) => void>(() => {});
  const combinedDataRef = useRef<(DisplayNotification | { type: 'section'; label: string })[]>([]);
  const notifIndicesRef = useRef<number[]>([]);
  const selectedNotifRef = useRef<DisplayNotification | null>(null);
  const detailActionCountRef = useRef(0);

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

  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState('');
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [imageViewerTitle, setImageViewerTitle] = useState('');
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [videoViewerTitle, setVideoViewerTitle] = useState('');
  // Stop fullscreen video when navigating away from the notification screen
  useEffect(() => {
    if (!isActive) setVideoViewerUrl(null);
  }, [isActive]);

  const handleOpenAttachment = useCallback((url: string, mime = 'application/octet-stream', name = 'attachment') => {
    // Images → fullscreen image viewer
    if (mime.startsWith('image/')) {
      setImageViewerTitle(name);
      setImageViewerUrl(url);
      return;
    }

    // Videos → fullscreen video viewer (auto-plays)
    if (mime.startsWith('video/')) {
      setVideoViewerTitle(name);
      setVideoViewerUrl(url);
      return;
    }

    // PDFs and any document type → in-app PDF viewer
    const isDoc =
      mime === 'application/pdf' ||
      mime.includes('document') ||
      mime.includes('word') ||
      mime.includes('sheet') ||
      mime.includes('text');

    if (isDoc) {
      setPdfViewerTitle(name);
      setPdfViewerUrl(url);
      return;
    }

    // Other file types (zip, apk, etc.) → download then open with system viewer
    if (downloadingUrl) return;
    setDownloadingUrl(url);

    const ext = name.includes('.') ? name.split('.').pop() : mime.split('/').pop();
    const localPath = `${RNFetchBlob.fs.dirs.CacheDir}/hoteltv_attach_${Date.now()}.${ext}`;

    RNFetchBlob.config({ path: localPath })
      .fetch('GET', url)
      .then((res) => {
        setDownloadingUrl(null);
        RNFetchBlob.android.actionViewIntent(res.path(), mime);
      })
      .catch((err) => {
        setDownloadingUrl(null);
        if (__DEV__) console.warn('[NotificationScreen] attachment download failed:', err);
      });
  }, [downloadingUrl]);

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
  // All attachment types (image, video, PDF, file) each get one focusable D-pad slot.
  const detailActionCount =
    (selectedNotif?.actions.length ?? 0) + (selectedNotif?.attachment ? 1 : 0);

  // Keep refs updated so key handler always has latest values
  combinedDataRef.current = combinedData;
  notifIndicesRef.current = notifIndices;
  selectedNotifRef.current = selectedNotif;
  detailActionCountRef.current = detailActionCount;
  handleSelectRef.current = handleSelect;
  handleActionRef.current = handleAction;
  handleOpenAttachmentRef.current = handleOpenAttachment;
  navZoneRef.current = navZone;
  filterIdxRef.current = filterIdx;
  listIdxRef.current = listIdx;
  detailIdxRef.current = detailIdx;

  const lastKeyRef = useRef<{ keyCode: number; time: number }>({ keyCode: -1, time: 0 });
  const scrollOffsetRef = useRef(0);   // updated by FlatList onScroll
  const listHeightRef = useRef(600);   // updated by FlatList onLayout

  const scrollToListIndex = useCallback((index: number) => {
    const idx = notifIndicesRef.current[index];
    if (idx == null) return;
    const data = combinedDataRef.current;

    // Calculate item top and bottom in the full scroll-content coordinate space
    let itemTop = SIDEBAR_HEADER_H;
    for (let i = 0; i < idx && i < data.length; i++) {
      itemTop += 'type' in data[i] ? ITEM_H.section : ITEM_H.notif;
    }
    const itemHeight = (() => {
      const it = data[idx];
      return it && 'type' in it ? ITEM_H.section : ITEM_H.notif;
    })();
    const itemBottom = itemTop + itemHeight;

    const EDGE_PAD = 8; // breathing room so the item isn't flush with the viewport edge
    const viewportTop = scrollOffsetRef.current;
    const viewportBottom = viewportTop + listHeightRef.current;

    let targetOffset: number | null = null;

    if (itemTop < viewportTop + EDGE_PAD) {
      // Item is above (or too close to top of) the visible area — scroll up
      targetOffset = itemTop - EDGE_PAD;
    } else if (itemBottom > viewportBottom - EDGE_PAD) {
      // Item is below (or too close to bottom of) the visible area — scroll down
      targetOffset = itemBottom - listHeightRef.current + EDGE_PAD;
    }
    // else: already fully visible — no scroll needed

    if (targetOffset === null) return;
    const offset = Math.max(0, targetOffset);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset, animated: true });
    });
  }, []);

  const pdfViewerUrlRef = useRef<string | null>(null);
  pdfViewerUrlRef.current = pdfViewerUrl;
  const imageViewerUrlRef = useRef<string | null>(null);
  imageViewerUrlRef.current = imageViewerUrl;
  const videoViewerUrlRef = useRef<string | null>(null);
  videoViewerUrlRef.current = videoViewerUrl;

  // Set to true when onKeyDown handles BACK while any fullscreen viewer is open
  // (ACTION_DOWN). The BackHandler useEffect reads this to consume ACTION_UP,
  // preventing App.tsx from navigating home. Using a plain ref ensures it
  // survives the React re-render that fires between ACTION_DOWN and ACTION_UP.
  const backHandledRef = useRef(false);

  // Stable BackHandler registered for the lifetime of this screen.
  // Consumes ACTION_UP (hardwareBackPress) when onKeyDown already handled the
  // BACK key press (e.g. to close the PDF viewer).
  useEffect(() => {
    if (!isActive || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backHandledRef.current) {
        backHandledRef.current = false;
        return true; // consumed — do NOT navigate home
      }
      return false; // let App.tsx handle normal back-to-home
    });
    return () => sub.remove();
  }, [isActive]);

  useEffect(() => {
    if (!isActive || Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('onKeyDown', (evt: { keyCode?: number }) => {
      const kc = evt?.keyCode ?? (evt as any).keyCode;
      if (typeof kc !== 'number') return;

      // When any fullscreen viewer is open: BACK closes it (marks backHandledRef so
      // the BackHandler absorbs ACTION_UP). All other keys are ignored.
      if (pdfViewerUrlRef.current || imageViewerUrlRef.current || videoViewerUrlRef.current) {
        if (kc === KEYCODES.BACK) {
          backHandledRef.current = true;
          if (pdfViewerUrlRef.current) setPdfViewerUrl(null);
          if (imageViewerUrlRef.current) setImageViewerUrl(null);
          if (videoViewerUrlRef.current) setVideoViewerUrl(null);
        }
        return;
      }

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
      // Full slot count: actions + optional attachment slot (PDF / file cards)
      const dCount = detailActionCountRef.current;

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
            scrollToListIndex(0);
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
            scrollToListIndex(prev);
          } else {
            navZoneRef.current = 'filters';
            setNavZone('filters');
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            });
          }
        } else if (kc === KEYCODES.DPAD_DOWN) {
          const next = Math.min(nCount - 1, lIdx + 1);
          if (next !== lIdx && indices[next] != null) {
            listIdxRef.current = next;
            setListIdx(next);
            scrollToListIndex(next);
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
          if (action) {
            handleActionRef.current?.(action, selNotif.id);
          } else if (selNotif.attachment && dIdx === selNotif.actions.length) {
            const att = selNotif.attachment;
            // All attachment types open their respective fullscreen viewer
            handleOpenAttachmentRef.current?.(att.url, att.mime, att.name);
          }
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
              onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
              onLayout={(e) => { listHeightRef.current = e.nativeEvent.layout.height; }}
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
              onOpenAttachment={handleOpenAttachment}
              downloadingUrl={downloadingUrl}
              focusedActionIndex={navZone === 'detail' ? detailIdx : -1}
            />
          </View>
        </View>
      </View>

      {/* In-app PDF / document viewer */}
      <PdfViewerModal
        url={pdfViewerUrl}
        title={pdfViewerTitle}
        onClose={() => setPdfViewerUrl(null)}
      />

      {/* In-app full-screen image viewer */}
      <ImageViewerModal
        url={imageViewerUrl}
        title={imageViewerTitle}
        onClose={() => setImageViewerUrl(null)}
      />

      {/* In-app full-screen video viewer */}
      <VideoViewerModal
        url={videoViewerUrl}
        title={videoViewerTitle}
        onClose={() => setVideoViewerUrl(null)}
      />
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
    paddingBottom: 0,
  },
  detailScroll: {
    flex: 1,
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
    marginBottom: 24,
  },
  // Inline image wrapper (focusable)
  attachmentImageWrap: {
    width: '100%',
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  attachmentImageWrapFocused: {
    borderColor: Colors.primary,
  },
  attachmentImage: {
    width: '100%',
    height: 220,
    backgroundColor: Colors.overlay.white[5],
  },
  mediaFocusHint: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    backgroundColor: Colors.overlay.black[55],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mediaFocusHintText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.primaryLight,
  },
  // Inline video
  attachmentVideoWrap: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: Colors.overlay.black[55],
    borderWidth: 2,
    borderColor: 'transparent',
  },
  attachmentVideoWrapFocused: {
    borderColor: Colors.primary,
  },
  attachmentVideo: {
    width: '100%',
    height: '100%',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoPlayBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.overlay.black[55],
    borderWidth: 1.5,
    borderColor: Colors.overlay.white[35],
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayBtnFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.overlay.gold[20],
    borderWidth: 2,
  },
  videoPlayIcon: {
    fontSize: 20,
    color: Colors.white,
    marginLeft: 4,
  },
  videoFocusHintText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.primaryLight,
    backgroundColor: Colors.overlay.black[55],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
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
  // Attachment — list row badge
  attachmentBadge: {
    fontSize: 12,
    opacity: 0.7,
  },
  // Attachment — detail panel card
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.overlay.white[5],
    borderWidth: 0.5,
    borderColor: Colors.overlay.white[12],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  attachmentCardFocused: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.overlay.gold[12],
  },
  attachmentCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.overlay.gold[15],
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentCardIconFocused: {
    backgroundColor: Colors.overlay.gold[30],
  },
  attachmentCardIconText: {
    fontSize: 20,
  },
  attachmentCardInfo: {
    flex: 1,
    gap: 4,
  },
  attachmentCardName: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.text.light,
  },
  attachmentCardNameFocused: {
    color: Colors.primaryLight,
  },
  attachmentCardMeta: {
    fontFamily: FontFamily.book,
    fontSize: 11,
    color: Colors.text.muted,
    letterSpacing: 0.3,
  },
  attachmentOpenHint: {
    fontFamily: FontFamily.book,
    fontSize: 13,
    color: Colors.overlay.white[35],
    paddingLeft: 4,
  },
  attachmentOpenHintFocused: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.medium,
  },
});

export default NotificationScreen;

