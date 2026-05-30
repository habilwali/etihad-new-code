/**
 * Channel data configuration for reusable ChannelScreen.
 * Supports multiple variants: general TV channels and Etihad-related content.
 */

export interface ChannelCategory {
  id: string;
  label: string;
}

export interface ChannelItem {
  id: number;
  cat: string;
  name: string;
  program: string;
  time: string;
  progress: number;
  hd: boolean;
  live: boolean;
  k4?: boolean;
  color: string;
  videoUrl: string;
}

export interface ChannelDataConfig {
  categories: ChannelCategory[];
  channels: ChannelItem[];
  sidebarTitle: string;
}

/**
 * Logs merged “All Channels” order in __DEV__ only (id, name, category package id).
 * Omits stream URLs and other heavy fields.
 */
export function logDevAllChannelList(
  source: string,
  items: readonly ChannelItem[],
): void {
  if (!__DEV__) {
    return;
  }
  const rows = items.map(c => ({id: c.id, name: c.name, cat: c.cat}));
  console.log(`[AllChannelList:${source}] count=${rows.length}`, rows);
}

// Demo entries only (CMS builds use `stream_url`). Static test stream (HLS) for dev checks.
const STATIC_TEST_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const V = {
  nasa_tv:   STATIC_TEST_STREAM,
  dw_news:   STATIC_TEST_STREAM,
  france24:  STATIC_TEST_STREAM,
  tears:     STATIC_TEST_STREAM,
  blazes:    STATIC_TEST_STREAM,
  escapes:   STATIC_TEST_STREAM,
  fun:       STATIC_TEST_STREAM,
  joyrides:  STATIC_TEST_STREAM,
  meltdowns: STATIC_TEST_STREAM,
  subaru:    STATIC_TEST_STREAM,
  vw:        STATIC_TEST_STREAM,
  bullrun:   STATIC_TEST_STREAM,
};

/** General TV channels — news, sports, documentary, etc. */
export const TV_CHANNELS_DATA: ChannelDataConfig = {
  sidebarTitle: 'CHANNELS',
  categories: [
    { id: 'all',           label: 'All Channels'  },
    { id: 'news',          label: 'News'          },
    { id: 'sports',        label: 'Sports'        },
    { id: 'entertainment', label: 'Entertainment' },
    { id: 'arabic',        label: 'Arabic'        },
    { id: 'kids',          label: 'Kids'          },
    { id: 'documentary',   label: 'Documentary'   },
    { id: 'movies',        label: 'Movies'        },
  ],
  channels: [
    { id: 201, cat: 'news',          name: 'BBC World',   program: 'News Hour',             time: '21:00 – 22:00', progress: 38, hd: true,  live: true,           color: '#F0EDE6', videoUrl: V.nasa_tv   },
    { id: 202, cat: 'news',          name: 'CNN',         program: 'The Situation Room',    time: '21:00 – 22:00', progress: 55, hd: true,  live: true,           color: '#E8C97A', videoUrl: V.dw_news   },
    { id: 203, cat: 'news',          name: 'Al Jazeera',  program: 'نشرة الأخبار',          time: '21:00 – 22:00', progress: 60, hd: true,  live: true,           color: '#E8D870', videoUrl: V.france24  },
    { id: 301, cat: 'sports',        name: 'beIN Sports', program: 'UEFA Champions League', time: '21:00 – 23:00', progress: 22, hd: false, live: true,  k4: true, color: '#E07070', videoUrl: V.blazes    },
    { id: 302, cat: 'sports',        name: 'ESPN',        program: 'SportsCenter Live',     time: '21:00 – 00:00', progress: 30, hd: true,  live: true,           color: '#88C8A0', videoUrl: V.subaru    },
    { id: 401, cat: 'documentary',   name: 'Nat Geo',     program: 'Kingdom of the Deep',   time: '20:30 – 22:00', progress: 70, hd: true,  live: false,          color: '#FFC300', videoUrl: V.tears     },
    { id: 402, cat: 'documentary',   name: 'Discovery',   program: "How It's Made",         time: '21:00 – 22:00', progress: 45, hd: true,  live: false,          color: '#C8D8E8', videoUrl: V.vw        },
    { id: 501, cat: 'arabic',        name: 'MBC 1',       program: 'برنامج نجوم العرب',     time: '21:00 – 23:00', progress: 42, hd: true,  live: true,           color: '#8FB3E8', videoUrl: V.escapes   },
    { id: 502, cat: 'arabic',        name: 'ART Movies',  program: 'ليالي هوليود',          time: '21:30 – 23:30', progress: 17, hd: true,  live: false,          color: '#E8A87C', videoUrl: V.fun       },
    { id: 601, cat: 'entertainment', name: 'Netflix',     program: 'Featured Originals',    time: 'On Demand',     progress: 0,  hd: false, live: false, k4: true, color: '#E8C97A', videoUrl: V.meltdowns },
    { id: 701, cat: 'kids',          name: 'Disney+',     program: 'Disney Classics Night', time: '20:00 – 22:00', progress: 85, hd: false, live: false, k4: true, color: '#6BAED6', videoUrl: V.joyrides  },
    { id: 801, cat: 'movies',        name: 'HBO',         program: 'The Grand Budapest',    time: '22:00 – 23:45', progress: 0,  hd: false, live: false, k4: true, color: '#C8A8E8', videoUrl: V.bullrun   },
  ],
};

/** Etihad-related channels — corporate, safety, training, employee content */
export const ETIHAD_CHANNELS_DATA: ChannelDataConfig = {
  sidebarTitle: 'ETIHAD CHANNELS',
  categories: [
    { id: 'all',        label: 'All Channels'     },
    { id: 'news',       label: 'Etihad News'     },
    { id: 'safety',     label: 'Safety & Health' },
    { id: 'training',   label: 'Training'        },
    { id: 'culture',    label: 'Culture'         },
    { id: 'events',     label: 'Events'          },
  ],
  channels: [
    { id: 101, cat: 'news',     name: 'Etihad News',        program: 'Corporate Update',           time: '08:00 – 09:00', progress: 25, hd: true,  live: true,  color: '#C8A878', videoUrl: V.nasa_tv   },
    { id: 102, cat: 'news',     name: 'EY Plaza Today',    program: 'Daily Briefing',              time: '09:00 – 10:00', progress: 0,  hd: true,  live: true,  color: '#D4B896', videoUrl: V.dw_news   },
    { id: 103, cat: 'news',     name: 'Etihad Insider',    program: 'Employee Spotlight',         time: 'On Demand',     progress: 0,  hd: false, live: false, color: '#E8D4B8', videoUrl: V.france24  },
    { id: 111, cat: 'safety',  name: 'Safety First',      program: 'Occupational Health',        time: 'On Demand',     progress: 0,  hd: true,  live: false, color: '#88C8A0', videoUrl: V.tears     },
    { id: 112, cat: 'safety',  name: 'Fire & Emergency', program: 'Evacuation Procedures',       time: 'On Demand',     progress: 0,  hd: true,  live: false, color: '#C07070', videoUrl: V.blazes    },
    { id: 121, cat: 'training', name: 'Onboarding',      program: 'New Employee Guide',         time: 'On Demand',     progress: 0,  hd: false, live: false, color: '#6BAED6', videoUrl: V.escapes   },
    { id: 122, cat: 'training', name: 'Compliance',      program: 'Policy & Procedures',        time: 'On Demand',     progress: 0,  hd: true,  live: false, color: '#8FB3E8', videoUrl: V.subaru    },
    { id: 131, cat: 'culture',  name: 'Values & Vision',   program: 'Etihad Way',                 time: 'On Demand',     progress: 0,  hd: false, live: false, color: '#C8A8E8', videoUrl: V.fun       },
    { id: 132, cat: 'culture',  name: 'Diversity',       program: 'Inclusion Matters',           time: 'On Demand',     progress: 0,  hd: false, live: false, color: '#E8A87C', videoUrl: V.joyrides  },
    { id: 141, cat: 'events',   name: 'Town Hall',        program: 'Live Q&A with Leadership',   time: '14:00 – 15:00', progress: 0,  hd: true,  live: true,  color: '#E8C97A', videoUrl: V.vw        },
    { id: 142, cat: 'events',   name: 'Recognition',     program: 'Employee Awards',             time: 'On Demand',     progress: 0,  hd: false, live: false, color: '#FFC300', videoUrl: V.meltdowns },
    { id: 143, cat: 'events',   name: 'Plaza Events',     program: 'Upcoming Activities',        time: 'On Demand',     progress: 0,  hd: false, live: false, color: '#D4B896', videoUrl: V.bullrun   },
  ],
};
