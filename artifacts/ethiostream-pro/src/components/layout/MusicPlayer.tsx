import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music2, Play, Pause, SkipBack, SkipForward, Shuffle,
  Repeat, Volume2, VolumeX, X, ChevronUp, Youtube,
  Search, Clock, Heart, Zap, Moon, Coffee, Flame, Wind, Star
} from 'lucide-react';
import { PLAYLIST, type Track } from '@/data/playlist';

const CATEGORY_COLORS: Record<string, string> = {
  'JJ Favorites': 'text-[var(--gold)] bg-[rgba(212,175,55,0.15)]',
  International: 'text-blue-400 bg-blue-400/10',
  Ethiopian: 'text-green-400 bg-green-400/10',
  Ambient: 'text-purple-400 bg-purple-400/10',
};

// ── Mood Presets ──────────────────────────────────────────────────────────────
const MOODS = [
  { id: 'focus', label: 'Deep Focus', icon: Coffee, color: 'text-blue-400', filter: ['Ambient'] },
  { id: 'hype', label: 'Hype Mode', icon: Flame, color: 'text-orange-400', filter: ['JJ Favorites', 'International'] },
  { id: 'chill', label: 'Chill Zone', icon: Wind, color: 'text-purple-400', filter: ['Ambient', 'Ethiopian'] },
  { id: 'victory', label: 'Victory Lap', icon: Star, color: 'text-yellow-400', filter: ['JJ Favorites'] },
  { id: 'zen', label: 'Zen Mode', icon: Moon, color: 'text-indigo-400', filter: ['Ethiopian', 'Ambient'] },
];

function Equalizer({ playing, bars = 5 }: { playing: boolean; bars?: number }) {
  const heights = [0.6, 1, 0.75, 0.9, 0.5, 0.8, 0.65].slice(0, bars);
  return (
    <span className="flex items-end gap-[2px] h-4 shrink-0">
      {heights.map((h, i) => (
        <span key={i} className="w-[3px] rounded-sm bg-[var(--gold)]"
          style={{
            height: playing ? `${h * 14}px` : '3px',
            animation: playing ? `eq-bar 0.55s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
            transition: 'height 0.25s',
          }} />
      ))}
    </span>
  );
}

function CircularProgress({ progress, duration, size = 48 }: { progress: number; duration: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = duration > 0 ? progress / duration : 0;
  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(212,175,55,0.1)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gold)" strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s' }} />
    </svg>
  );
}

export function MusicPlayer({ collapsed, sidebarWidth }: { collapsed: boolean; sidebarWidth: number }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ytKey, setYtKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('music_favorites') || '[]') } catch { return [] }
  });
  const [sleepTimer, setSleepTimer] = useState<number | null>(null); // minutes
  const [sleepTimeout, setSleepTimeoutRef] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [showMoodPanel, setShowMoodPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'playlist' | 'moods' | 'favorites'>('playlist');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const track = PLAYLIST[currentIndex];
  const isAmbient = !track?.youtubeId && !!track?.url;
  const isYouTube = !!track?.youtubeId;

  // Load saved state
  useEffect(() => {
    const v = localStorage.getItem('musicVolume');
    if (v) setVolume(Number(v));
    const idx = localStorage.getItem('musicTrackIdx');
    if (idx) { const n = Number(idx); if (n >= 0 && n < PLAYLIST.length) setCurrentIndex(n); }
    const sh = localStorage.getItem('musicShuffle');
    if (sh) setShuffle(sh === 'true');
    const rp = localStorage.getItem('musicRepeat');
    if (rp) setRepeat(rp === 'true');
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    localStorage.setItem('musicVolume', String(volume));
  }, [volume]);

  useEffect(() => { localStorage.setItem('musicShuffle', String(shuffle)); }, [shuffle]);
  useEffect(() => { localStorage.setItem('musicRepeat', String(repeat)); }, [repeat]);

  // Sleep timer
  const startSleepTimer = (minutes: number) => {
    if (sleepTimeout) clearTimeout(sleepTimeout);
    setSleepTimer(minutes);
    const t = setTimeout(() => {
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
      setSleepTimer(null);
    }, minutes * 60 * 1000);
    setSleepTimeoutRef(t);
  };

  const cancelSleepTimer = () => {
    if (sleepTimeout) clearTimeout(sleepTimeout);
    setSleepTimer(null);
    setSleepTimeoutRef(null);
  };

  const toggleFavorite = (trackId: string) => {
    const next = favorites.includes(trackId)
      ? favorites.filter(f => f !== trackId)
      : [...favorites, trackId];
    setFavorites(next);
    localStorage.setItem('music_favorites', JSON.stringify(next));
  };

  const switchTrack = useCallback((idx: number, autoplay = true) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setIsPlaying(false); setProgress(0); setCurrentIndex(idx); setYtKey(k => k + 1);
    localStorage.setItem('musicTrackIdx', String(idx));
    const t = PLAYLIST[idx];
    if (autoplay) {
      if (!t?.youtubeId && t?.url) {
        setTimeout(() => {
          if (!audioRef.current) return;
          audioRef.current.src = t.url!;
          audioRef.current.volume = volume;
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }, 60);
      } else if (t?.youtubeId) { setIsPlaying(true); }
    }
  }, [volume]);

  const getNextIdx = useCallback((cur: number) => {
    if (shuffle) { let n = cur; while (n === cur && PLAYLIST.length > 1) n = Math.floor(Math.random() * PLAYLIST.length); return n; }
    return (cur + 1) % PLAYLIST.length;
  }, [shuffle]);

  const getPrevIdx = useCallback((cur: number) => {
    if (shuffle) return Math.floor(Math.random() * PLAYLIST.length);
    return (cur - 1 + PLAYLIST.length) % PLAYLIST.length;
  }, [shuffle]);

  const handleTogglePlay = useCallback(() => {
    if (!track) return;
    if (isAmbient) {
      if (!audioRef.current) return;
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
      else { audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}); }
    } else if (isYouTube) {
      setIsPlaying(p => { if (!p) setYtKey(k => k + 1); return !p; });
    }
  }, [track, isAmbient, isYouTube, isPlaying]);

  const handleNext = useCallback(() => switchTrack(getNextIdx(currentIndex)), [switchTrack, getNextIdx, currentIndex]);
  const handlePrev = useCallback(() => switchTrack(getPrevIdx(currentIndex)), [switchTrack, getPrevIdx, currentIndex]);
  const handleEnded = useCallback(() => { if (repeat) audioRef.current?.play().catch(() => {}); else handleNext(); }, [repeat, handleNext]);
  const handleTimeUpdate = () => { if (!audioRef.current) return; setProgress(audioRef.current.currentTime); setDuration(audioRef.current.duration || 0); };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => { const t = Number(e.target.value); setProgress(t); if (audioRef.current) audioRef.current.currentTime = t; };
  const fmt = (s: number) => !s || isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const categories = ['All', 'JJ Favorites', 'International', 'Ethiopian', 'Ambient', '❤️ Favorites'] as const;

  const getFilteredTracks = (): Track[] => {
    let tracks = PLAYLIST;
    if (activeMood) {
      const mood = MOODS.find(m => m.id === activeMood);
      if (mood) tracks = tracks.filter(t => mood.filter.includes(t.category));
    }
    if (activeTab === 'favorites') tracks = tracks.filter(t => favorites.includes(t.id));
    else if (activeCategory === '❤️ Favorites') tracks = tracks.filter(t => favorites.includes(t.id));
    else if (activeCategory !== 'All') tracks = tracks.filter(t => t.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tracks = tracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
    }
    return tracks;
  };

  const filteredTracks = getFilteredTracks();

  // ── Floating YouTube iframe ──
  const ytPlayer = isYouTube && isPlaying && track?.youtubeId
    ? createPortal(
        <div className="fixed z-[9990] shadow-2xl border border-[rgba(212,175,55,0.4)] rounded-xl overflow-hidden"
          style={{ bottom: 80, right: 24 }}>
          <div className="flex items-center justify-between bg-[#0a0a0a] px-3 py-1.5 border-b border-[rgba(212,175,55,0.15)]">
            <div className="flex items-center gap-2">
              <Youtube className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[11px] font-medium text-white truncate max-w-[180px]">{track.title}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handlePrev} className="p-1 text-gray-500 hover:text-white"><SkipBack className="w-3 h-3" /></button>
              <button onClick={handleNext} className="p-1 text-gray-500 hover:text-white"><SkipForward className="w-3 h-3" /></button>
              <button onClick={() => setIsPlaying(false)} className="p-1 text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <iframe key={ytKey}
            src={`https://www.youtube.com/embed/${track.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            title={track.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
            className="block" style={{ width: 320, height: 180, border: 'none' }} />
          <div className="bg-[#0a0a0a] px-3 py-1 text-center">
            <p className="text-[9px] text-gray-700">JJ NEXUS PRO · Music</p>
          </div>
        </div>,
        document.body
      )
    : null;

  // ── Full playlist panel ──
  const playlistPanel = panelOpen
    ? createPortal(
        <div className="fixed inset-0 z-[9980]" style={{ pointerEvents: 'none' }}>
          <div className="absolute inset-0 bg-black/50" style={{ pointerEvents: 'auto' }} onClick={() => setPanelOpen(false)} />
          <motion.div
            initial={{ x: -380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -380, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="absolute top-0 bottom-0 bg-[#080808] border-r border-[rgba(212,175,55,0.2)] flex flex-col shadow-2xl"
            style={{ left: sidebarWidth, width: 380, pointerEvents: 'auto' }}
            onClick={e => e.stopPropagation()}>

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(212,175,55,0.15)] shrink-0 bg-[rgba(212,175,55,0.03)]">
              <div className="flex items-center gap-2">
                <Music2 className="w-4 h-4 text-[var(--gold)]" />
                <span className="font-black text-sm text-white tracking-wider">JJ MUSIC STUDIO</span>
                <span className="text-[10px] text-gray-600">{PLAYLIST.length} tracks</span>
              </div>
              <button onClick={() => setPanelOpen(false)} className="text-gray-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
            </div>

            {/* Sleep timer banner */}
            {sleepTimer && (
              <div className="flex items-center justify-between px-4 py-2 bg-indigo-900/30 border-b border-indigo-500/20 shrink-0">
                <div className="flex items-center gap-2 text-xs text-indigo-300">
                  <Moon className="w-3.5 h-3.5" />
                  <span>Sleep timer: {sleepTimer} min</span>
                </div>
                <button onClick={cancelSleepTimer} className="text-[10px] text-indigo-400 hover:text-white">Cancel</button>
              </div>
            )}

            {/* Now playing card */}
            {track && (
              <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] bg-[rgba(212,175,55,0.04)] shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-[rgba(212,175,55,0.12)] border border-[rgba(212,175,55,0.2)] flex items-center justify-center shrink-0 relative">
                    {isYouTube ? <Youtube className="w-6 h-6 text-red-500" /> : <Equalizer playing={isPlaying} bars={7} />}
                    {isAmbient && <CircularProgress progress={progress} duration={duration} size={48} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{track.title}</p>
                    <p className="text-[11px] text-gray-400 truncate">{track.artist}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[track.category] ?? ''}`}>
                      {track.category}
                    </span>
                    <button onClick={() => toggleFavorite(track.id)} className={`p-1 rounded transition-colors ${favorites.includes(track.id) ? 'text-red-400' : 'text-gray-600 hover:text-red-400'}`}>
                      <Heart className="w-3.5 h-3.5" fill={favorites.includes(track.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>

                {/* Progress (ambient) */}
                {isAmbient && duration > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] text-gray-600 font-mono w-8">{fmt(progress)}</span>
                    <input type="range" min={0} max={duration} step={0.5} value={progress} onChange={handleSeek}
                      className="flex-1 h-1 accent-[var(--gold)] cursor-pointer" />
                    <span className="text-[9px] text-gray-600 font-mono w-8 text-right">{fmt(duration)}</span>
                  </div>
                )}

                {/* Controls */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setShuffle(v => !v)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors ${shuffle ? 'bg-[rgba(212,175,55,0.2)] text-[var(--gold)]' : 'text-gray-600 hover:text-gray-300'}`}>
                    <Shuffle className="w-3 h-3" /> Shuffle
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={handlePrev} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/5"><SkipBack className="w-4 h-4" /></button>
                    <button onClick={handleTogglePlay}
                      className="w-10 h-10 rounded-full bg-[var(--gold)] flex items-center justify-center text-black hover:bg-yellow-300 shadow-[0_0_20px_rgba(212,175,55,0.5)] transition-all">
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                    <button onClick={handleNext} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/5"><SkipForward className="w-4 h-4" /></button>
                  </div>
                  <button onClick={() => setRepeat(v => !v)}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors ${repeat ? 'bg-[rgba(212,175,55,0.2)] text-[var(--gold)]' : 'text-gray-600 hover:text-gray-300'}`}>
                    <Repeat className="w-3 h-3" /> Repeat
                  </button>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-2 mb-2">
                  <VolumeX className="w-3 h-3 text-gray-600 shrink-0 cursor-pointer" onClick={() => setVolume(0)} />
                  <input type="range" min={0} max={1} step={0.02} value={volume} onChange={e => setVolume(Number(e.target.value))}
                    className="flex-1 h-1 accent-[var(--gold)] cursor-pointer" />
                  <Volume2 className="w-3 h-3 text-gray-400 shrink-0 cursor-pointer" onClick={() => setVolume(1)} />
                  <span className="text-[9px] font-mono text-gray-500 w-7 text-right">{Math.round(volume * 100)}%</span>
                </div>

                {/* Sleep timer */}
                <div className="flex items-center gap-1.5">
                  <Moon className="w-3 h-3 text-gray-600" />
                  <span className="text-[9px] text-gray-600">Sleep:</span>
                  {[15, 30, 60, 90].map(m => (
                    <button key={m} onClick={() => sleepTimer === m ? cancelSleepTimer() : startSleepTimer(m)}
                      className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${sleepTimer === m ? 'bg-indigo-500/30 text-indigo-300' : 'text-gray-600 hover:text-gray-400 bg-white/5'}`}>
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0 border-b border-[rgba(212,175,55,0.1)] shrink-0">
              {[
                { key: 'playlist', label: '🎵 Playlist' },
                { key: 'moods', label: '✨ Moods' },
                { key: 'favorites', label: `❤️ Favs (${favorites.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key as any)}
                  className={`flex-1 py-2 text-[10px] font-bold transition-colors border-b-2 ${activeTab === t.key ? 'border-[var(--gold)] text-[var(--gold)]' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* PLAYLIST TAB */}
            {activeTab === 'playlist' && (
              <>
                {/* Search */}
                <div className="px-3 py-2 border-b border-[rgba(212,175,55,0.08)] shrink-0">
                  <div className="flex items-center gap-2 bg-black/40 border border-[rgba(212,175,55,0.15)] rounded-lg px-2.5 py-1.5">
                    <Search className="w-3 h-3 text-gray-600" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search tracks..."
                      className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none" />
                    {searchQuery && <button onClick={() => setSearchQuery('')} className="text-gray-600 hover:text-white"><X className="w-3 h-3" /></button>}
                  </div>
                </div>
                {/* Category tabs */}
                <div className="flex gap-1 px-3 py-2 border-b border-[rgba(212,175,55,0.08)] shrink-0 overflow-x-auto scrollbar-hide">
                  {['All', 'JJ Favorites', 'International', 'Ethiopian', 'Ambient', '❤️ Favorites'].map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${activeCategory === cat ? 'bg-[var(--gold)] text-black' : 'text-gray-500 hover:text-white bg-white/5'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Active mood badge */}
                {activeMood && (
                  <div className="px-3 py-1.5 bg-[rgba(212,175,55,0.05)] border-b border-[rgba(212,175,55,0.08)] shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-[var(--gold)]" />
                      <span className="text-[10px] text-[var(--gold)]">Mood: {MOODS.find(m => m.id === activeMood)?.label}</span>
                    </div>
                    <button onClick={() => setActiveMood(null)} className="text-[9px] text-gray-600 hover:text-white">Clear</button>
                  </div>
                )}
                {/* Track list */}
                <div className="flex-1 overflow-y-auto">
                  {filteredTracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                      <Music2 className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-xs">No tracks match</p>
                    </div>
                  )}
                  {filteredTracks.map((t: Track) => {
                    const idx = PLAYLIST.indexOf(t);
                    const isCurrent = idx === currentIndex;
                    const isFav = favorites.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => switchTrack(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all group border-l-2 ${isCurrent ? 'bg-[rgba(212,175,55,0.08)] border-[var(--gold)]' : 'border-transparent hover:bg-white/5'}`}>
                        <div className="w-5 shrink-0 flex items-center justify-center">
                          {isCurrent && isPlaying
                            ? <Equalizer playing />
                            : <span className={`text-[10px] font-mono ${isCurrent ? 'text-[var(--gold)]' : 'text-gray-600 group-hover:text-gray-400'}`}>{String(idx + 1).padStart(2, '0')}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${isCurrent ? 'text-[var(--gold)]' : 'text-gray-200'}`}>{t.title}</p>
                          <p className="text-[10px] text-gray-500 truncate">{t.artist}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isFav && <Heart className="w-2.5 h-2.5 text-red-400" fill="currentColor" />}
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[t.category] ?? 'text-gray-500 bg-white/5'}`}>
                            {t.category === 'Ethiopian' ? 'ET' : t.category === 'International' ? 'INT' : t.category === 'JJ Favorites' ? 'JJ' : 'AMB'}
                          </span>
                          {t.youtubeId && <Youtube className="w-3 h-3 text-red-500/50" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* MOODS TAB */}
            {activeTab === 'moods' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-xs text-gray-500 mb-4">Choose a mood to filter tracks to match your trading state</p>
                {MOODS.map(mood => {
                  const isActive = activeMood === mood.id;
                  const moodTracks = PLAYLIST.filter(t => mood.filter.includes(t.category));
                  return (
                    <button key={mood.id} onClick={() => { setActiveMood(isActive ? null : mood.id); setActiveTab('playlist'); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                        isActive ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)]' : 'border-white/5 bg-white/3 hover:bg-white/5'
                      }`}>
                      <div className={`w-10 h-10 rounded-xl ${isActive ? 'bg-[rgba(212,175,55,0.2)]' : 'bg-white/5'} flex items-center justify-center`}>
                        <mood.icon className={`w-5 h-5 ${isActive ? 'text-[var(--gold)]' : mood.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-bold text-sm ${isActive ? 'text-[var(--gold)]' : 'text-white'}`}>{mood.label}</div>
                        <div className="text-[10px] text-gray-600">{moodTracks.length} tracks · {mood.filter.join(', ')}</div>
                      </div>
                      {isActive && <span className="text-[10px] text-[var(--gold)] bg-[rgba(212,175,55,0.2)] px-2 py-0.5 rounded-full">ACTIVE</span>}
                    </button>
                  );
                })}
                <div className="mt-4 p-3 rounded-xl bg-black/30 border border-white/5">
                  <p className="text-[10px] text-gray-600 text-center">Moods filter your playlist to tracks that match the energy. Select a mood then browse your playlist.</p>
                </div>
              </div>
            )}

            {/* FAVORITES TAB */}
            {activeTab === 'favorites' && (
              <div className="flex-1 overflow-y-auto">
                {favorites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                    <Heart className="w-8 h-8 opacity-20 mb-2" />
                    <p className="text-xs">No favorites yet</p>
                    <p className="text-[10px] text-gray-700 mt-1">Click the heart icon on any track</p>
                  </div>
                ) : (
                  PLAYLIST.filter(t => favorites.includes(t.id)).map(t => {
                    const idx = PLAYLIST.indexOf(t);
                    const isCurrent = idx === currentIndex;
                    return (
                      <button key={t.id} onClick={() => switchTrack(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all group border-l-2 ${isCurrent ? 'bg-[rgba(212,175,55,0.08)] border-[var(--gold)]' : 'border-transparent hover:bg-white/5'}`}>
                        <div className="w-5 shrink-0 flex items-center justify-center">
                          {isCurrent && isPlaying ? <Equalizer playing /> : <Heart className="w-3.5 h-3.5 text-red-400" fill="currentColor" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${isCurrent ? 'text-[var(--gold)]' : 'text-gray-200'}`}>{t.title}</p>
                          <p className="text-[10px] text-gray-500 truncate">{t.artist}</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); toggleFavorite(t.id); }} className="p-1 text-red-400 hover:text-red-300">
                          <Heart className="w-3.5 h-3.5" fill="currentColor" />
                        </button>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <div className="px-4 py-2 border-t border-[rgba(212,175,55,0.08)] shrink-0 flex items-center justify-between">
              <p className="text-[9px] text-gray-700">YouTube: floating · Ambient: inline</p>
              {sleepTimer && <p className="text-[9px] text-indigo-400">💤 Sleep in {sleepTimer}m</p>}
            </div>
          </motion.div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <style>{`
        @keyframes eq-bar { from { transform: scaleY(0.25); } to { transform: scaleY(1); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>

      <audio ref={audioRef} preload="none"
        onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleTimeUpdate}
        onEnded={handleEnded} onError={() => setIsPlaying(false)} />

      {/* ── Mini player in sidebar ── */}
      <div className="border-t border-[rgba(212,175,55,0.1)] px-2 py-2 shrink-0">
        {collapsed ? (
          <button onClick={() => setPanelOpen(v => !v)}
            className={`w-full flex justify-center items-center py-1.5 rounded transition-colors ${isPlaying ? 'text-[var(--gold)]' : 'text-gray-500 hover:text-[var(--gold)]'}`}
            title="Music Studio">
            {isPlaying ? <Equalizer playing /> : <Music2 className="w-5 h-5" />}
          </button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button onClick={() => setPanelOpen(v => !v)} className="flex items-center gap-2 w-full text-left group min-w-0">
              <div className={`shrink-0 ${isPlaying ? 'text-[var(--gold)]' : 'text-gray-500'}`}>
                {isPlaying ? <Equalizer playing /> : <Music2 className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white truncate leading-tight">{track?.title ?? 'No track'}</p>
                <p className="text-[9px] text-gray-500 truncate leading-tight">{track?.artist ?? ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {sleepTimer && <Moon className="w-2.5 h-2.5 text-indigo-400" />}
                {favorites.includes(track?.id ?? '') && <Heart className="w-2.5 h-2.5 text-red-400" fill="currentColor" />}
                <ChevronUp className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${panelOpen ? 'rotate-180' : 'rotate-0'}`} />
              </div>
            </button>

            {isAmbient && duration > 0 && (
              <input type="range" min={0} max={duration} step={0.5} value={progress} onChange={handleSeek}
                className="w-full h-0.5 accent-[var(--gold)] cursor-pointer rounded-full" />
            )}

            <div className="flex items-center justify-between">
              <button onClick={() => setShuffle(v => !v)} className={`p-1 rounded ${shuffle ? 'text-[var(--gold)]' : 'text-gray-600 hover:text-gray-400'}`}><Shuffle className="w-3 h-3" /></button>
              <button onClick={handlePrev} className="p-1 text-gray-400 hover:text-white"><SkipBack className="w-3.5 h-3.5" /></button>
              <button onClick={handleTogglePlay}
                className="w-7 h-7 rounded-full bg-[var(--gold)] flex items-center justify-center text-black hover:bg-yellow-300 shadow-[0_0_8px_rgba(212,175,55,0.4)]">
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
              </button>
              <button onClick={handleNext} className="p-1 text-gray-400 hover:text-white"><SkipForward className="w-3.5 h-3.5" /></button>
              <button onClick={() => setRepeat(v => !v)} className={`p-1 rounded ${repeat ? 'text-[var(--gold)]' : 'text-gray-600 hover:text-gray-400'}`}><Repeat className="w-3 h-3" /></button>
            </div>

            <div className="flex items-center gap-1.5">
              <VolumeX className="w-3 h-3 text-gray-600 shrink-0" />
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))}
                className="flex-1 h-0.5 accent-[var(--gold)] cursor-pointer" />
              <span className="text-[9px] font-mono text-gray-600 w-6 text-right">{Math.round(volume * 100)}</span>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>{playlistPanel}</AnimatePresence>
      {ytPlayer}
    </>
  );
}
