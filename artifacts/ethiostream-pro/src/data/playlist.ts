export interface Track {
  id: string
  title: string
  artist: string
  category: string
  youtubeId: string | null
  url?: string
}

export const PLAYLIST: Track[] = [
  // ── JJ Favorites (user-added links) ──────────────────────────────────────
  { id: 'jj_1', title: 'Forex Trading Motivation', artist: 'JJ Favorites', youtubeId: 'xALCpLXcIYY', category: 'JJ Favorites' },
  { id: 'jj_2', title: 'Trading Mindset', artist: 'JJ Favorites', youtubeId: 'iOxzG3jjFkY', category: 'JJ Favorites' },
  { id: 'jj_3', title: 'Market Flow', artist: 'JJ Favorites', youtubeId: 's_TUESTU7_4', category: 'JJ Favorites' },
  { id: 'jj_4', title: 'Gold & Pips', artist: 'JJ Favorites', youtubeId: 'p_d1iNXis4c', category: 'JJ Favorites' },
  { id: 'jj_5', title: 'SMC Energy', artist: 'JJ Favorites', youtubeId: 'IPfJnp1guPc', category: 'JJ Favorites' },
  { id: 'jj_6', title: 'JJ Playlist Mix 1', artist: 'JJ Favorites', youtubeId: 'Bc1A16p_Fk0', category: 'JJ Favorites' },

  // ── International ─────────────────────────────────────────────────────────
  { id: 'yt_daylight', title: 'Daylight', artist: 'David Kushner', youtubeId: 'LHCob76kigA', category: 'International' },
  { id: 'yt_pitbull', title: 'Options', artist: 'Pitbull ft. Stephen Marley', youtubeId: 'sV3AHDSk6Eg', category: 'International' },
  { id: 'yt_hope', title: 'Hope', artist: 'XXXTentacion', youtubeId: 'asqB4XUwCG0', category: 'International' },
  { id: 'yt_khalid', title: 'Young Dumb & Broke', artist: 'Khalid', youtubeId: 'GFSiNMxHHtk', category: 'International' },
  { id: 'yt_7years', title: '7 Years', artist: 'Lukas Graham', youtubeId: 'LTrjZjECLT4', category: 'International' },
  { id: 'yt_papaoute', title: 'Papaoute', artist: 'MHD', youtubeId: 'SxTCzEkqCdI', category: 'International' },
  { id: 'yt_ego', title: 'Ego', artist: 'Beyoncé', youtubeId: 'It4j7bLRDisc', category: 'International' },
  { id: 'yt_lil_uzi', title: 'What You Say', artist: 'Lil Uzi Vert', youtubeId: 'WRiAiTCBJBM', category: 'International' },

  // ── Ethiopian ─────────────────────────────────────────────────────────────
  { id: 'yt_rophnan1', title: 'Neger', artist: 'Rophnan', youtubeId: '0mLuj_x_tGY', category: 'Ethiopian' },
  { id: 'yt_rophnan2', title: 'Sew Lemenged', artist: 'Rophnan', youtubeId: 'oHWtfhyDlVQ', category: 'Ethiopian' },
  { id: 'yt_teddy1', title: 'Tikur Sew', artist: 'Teddy Afro', youtubeId: 'GxKqHMU2VbI', category: 'Ethiopian' },
  { id: 'yt_teddy2', title: 'Ethiopia', artist: 'Teddy Afro', youtubeId: '7VGFbhLyGUA', category: 'Ethiopian' },
  { id: 'yt_kuku', title: 'Fikir Eske Mekabir', artist: 'Kuku Sebsebe', youtubeId: 'rVtXM3V4EVo', category: 'Ethiopian' },

  // ── Ambient (YouTube-based, no CDN dependency) ────────────────────────────
  { id: 'ambient1', title: 'Lofi Trading Focus', artist: 'JJ NEXUS PRO', youtubeId: 'jfKfPfyJRdk', category: 'Ambient' },
  { id: 'ambient2', title: 'Deep Concentration', artist: 'JJ NEXUS PRO', youtubeId: '5qap5aO4i9A', category: 'Ambient' },
  { id: 'ambient3', title: 'Trading Flow Chill', artist: 'JJ NEXUS PRO', youtubeId: 'DWcJFNfaw9c', category: 'Ambient' },
]

export const PLAYLIST_CATEGORIES = ['JJ Favorites', 'International', 'Ethiopian', 'Ambient'] as const
