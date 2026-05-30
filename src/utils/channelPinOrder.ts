import type {ChannelItem} from '../data/channelData';

/**
 * These names are forced to the top of the channel sidebar (in this order) for
 * "All Channels" and for each category tab, when a matching row exists in the list.
 * Match is case-insensitive; whitespace is normalized.
 */
export const PINNED_CHANNEL_NAMES_ORDER: readonly string[] = [
  'Dubai International HD',
  'AL SHARJAH HD',
  'AL Arabia HD',
  'Al Mashhad',
  'Rotana Music',
  'Rotana Drama',
  'Rotana Khalijia',
  'ON SPORT',
  'BBC Arabic',
  'Al Jazeera Documentary',
  'Fujairah TV HD',
  'Zee Aflam',
  'Sky News Arabia HD',
];

function normalizeChannelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const PINNED_NORMALIZED = PINNED_CHANNEL_NAMES_ORDER.map(normalizeChannelName);

/**
 * Returns a new array: pinned rows first (in {@link PINNED_CHANNEL_NAMES_ORDER}),
 * then remaining rows in their original relative order.
 */
export function orderChannelsWithPinsFirst(
  list: readonly ChannelItem[],
): ChannelItem[] {
  if (list.length === 0) {
    return [];
  }
  const usedIds = new Set<number>();
  const pinned: ChannelItem[] = [];

  for (const pinNorm of PINNED_NORMALIZED) {
    for (const ch of list) {
      if (usedIds.has(ch.id)) {
        continue;
      }
      if (normalizeChannelName(ch.name) === pinNorm) {
        pinned.push(ch);
        usedIds.add(ch.id);
        break;
      }
    }
  }

  const rest: ChannelItem[] = [];
  for (const ch of list) {
    if (!usedIds.has(ch.id)) {
      rest.push(ch);
    }
  }
  return [...pinned, ...rest];
}
