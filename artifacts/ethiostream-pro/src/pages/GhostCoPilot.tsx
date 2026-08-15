import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ghost, Play, Square, Volume2, Mic, ChevronDown, RefreshCcw, Shield, Radio, Zap, Brain } from 'lucide-react'
import { ghostCoPilotFree } from '@/utils/freeAI'
import { useLivePrices } from '@/utils/livePrices'

const PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','EURJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','XAGUSD','BTCUSD']

interface Whisper {
  id: string
  time: string
  pair: string
  text: string
  price: string
}

function WaveformBars({ active, color = '#D4AF37' }: { active: boolean; color?: string }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[4, 7, 5, 9, 6, 8, 4, 7, 5].map((h, i) => (
        <motion.div key={i}
          className="w-1 rounded-full"
          style={{ background: color, minHeight: 2 }}
          animate={active ? { height: [2, h * 2, 2] } : { height: 2 }}
          transition={{ duration: 0.6, repeat: active ? Infinity : 0, delay: i * 0.07, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export default function GhostCoPilot() {
  const [pair, setPair] = useState('XAUUSD')
  const [autopilot, setAutopilot] = useState(false)
  const [intervalMin, setIntervalMin] = useState(5)
  const [whispers, setWhispers] = useState<Whisper[]>([])
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voice, setVoice] = useState('')
  const [speed, setSpeed] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [volume, setVolumeVal] = useState(1)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [recentTargets, setRecentTargets] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [countdown, setCountdown] = useState(0)

  const { prices, loading: pricesLoading, refresh: refreshPrices, formatPrice } = useLivePrices()

  const livePrice = prices[pair] || 0
  const livePriceStr = livePrice > 0 ? formatPrice(pair, livePrice) : '—'

  useEffect(() => {
    const load = () => { const v = window.speechSynthesis.getVoices(); if (v.length) setVoices(v) }
    load(); window.speechSynthesis.onvoiceschanged = load
  }, [])

  // Check for scanner-deployed pair on mount
  useEffect(() => {
    const deployedPair = sessionStorage.getItem('ghost_setup_pair')
    if (deployedPair && PAIRS.includes(deployedPair)) {
      setPair(deployedPair)
      sessionStorage.removeItem('ghost_setup_pair')
    }
  }, [])

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = speed; utt.pitch = pitch; utt.volume = volume
    if (voice) { const v = voices.find(v => v.name === voice); if (v) utt.voice = v }
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utt)
    setSpeaking(true)
  }, [speed, pitch, volume, voice, voices])

  const fetchWhisper = useCallback(async () => {
    setLoading(true)
    const price = prices[pair] || 0
    try {
      const text = await ghostCoPilotFree(pair, price)
      const w: Whisper = {
        id: Date.now().toString(), time: new Date().toLocaleTimeString(),
        pair, text: text.trim(), price: price > 0 ? formatPrice(pair, price) : '—',
      }
      setWhispers(prev => [w, ...prev].slice(0, 20))
      setRecentTargets(prev => [pair, ...prev.filter(p => p !== pair)].slice(0, 3))
      speak(text.trim())
    } catch (e: any) {
      setWhispers(prev => [{ id: Date.now().toString(), time: new Date().toLocaleTimeString(), pair, text: `⚠️ ${e.message}`, price: livePriceStr }, ...prev].slice(0, 20))
    } finally { setLoading(false) }
  }, [pair, prices, speak, formatPrice, livePriceStr])

  useEffect(() => {
    if (autopilot) {
      setCountdown(intervalMin * 60)
      timerRef.current = setInterval(fetchWhisper, intervalMin * 60 * 1000)
      countdownRef.current = setInterval(() => setCountdown(c => c > 0 ? c - 1 : intervalMin * 60), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      setCountdown(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [autopilot, intervalMin, fetchWhisper])

  const playLast = () => { if (whispers.length) speak(whispers[0].text) }

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60); const sec = s % 60
    return `T-MINUS ${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col gap-4">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden px-6 py-4" style={{ background: 'linear-gradient(135deg, #050510, #0a0814)', border: '1px solid rgba(212,175,55,0.2)' }}>
        {['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r','bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'].map((c,i) => (
          <div key={i} className={`absolute w-4 h-4 ${c} border-[rgba(212,175,55,0.4)]`} />
        ))}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 3, repeat: Infinity }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.35)' }}>
                <Ghost className="w-5 h-5 text-[#D4AF37]" />
              </div>
            </motion.div>
            <div>
              <h1 className="font-black text-xl tracking-[0.15em] uppercase text-[#D4AF37]">Ghost Intel Unit</h1>
              <p className="text-[9px] text-gray-600 tracking-widest uppercase font-mono">Classified Trade Intelligence · AI Whisper Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {speaking && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500/30 bg-green-500/10">
                <WaveformBars active color="#22c55e" />
                <span className="text-xs text-green-400 font-mono font-bold">TRANSMITTING</span>
              </div>
            )}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black tracking-widest ${autopilot ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-gray-700 text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${autopilot ? 'bg-green-500 animate-pulse' : 'bg-gray-700'}`} />
              {autopilot ? 'ACTIVE' : 'STANDBY'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-3">

          {/* Asset Target */}
          <div className="rounded-xl p-4 flex flex-col gap-4" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.18)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Asset Target</span>
            </div>
            <div className="relative">
              <select value={pair} onChange={e => setPair(e.target.value)}
                className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2.5 text-white font-black font-mono appearance-none cursor-pointer focus:outline-none focus:border-[#D4AF37]">
                {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <div className="text-center p-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.1)' }}>
              <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1 font-mono">Live Price</div>
              <div className={`font-mono font-black text-2xl ${livePrice > 0 ? 'text-[#D4AF37]' : 'text-gray-700'}`}>
                {pricesLoading && livePrice === 0 ? (
                  <span className="flex items-center justify-center gap-2 text-sm">
                    <RefreshCcw className="w-4 h-4 animate-spin text-gray-600" />
                    <span className="text-gray-600">Fetching...</span>
                  </span>
                ) : livePriceStr}
              </div>
              <button onClick={refreshPrices} className="text-[9px] text-gray-700 hover:text-[#D4AF37] mt-1 flex items-center gap-1 mx-auto font-mono">
                <RefreshCcw className="w-2.5 h-2.5" />REFRESH
              </button>
            </div>
            {/* Waveform when loading */}
            <div className="flex items-center justify-center h-8">
              <WaveformBars active={loading || speaking} />
            </div>
            {/* Recent targets */}
            {recentTargets.length > 0 && (
              <div>
                <div className="text-[8px] text-gray-700 uppercase tracking-widest font-mono mb-1.5">Recent Targets</div>
                <div className="flex gap-1.5 flex-wrap">
                  {recentTargets.map(p => (
                    <button key={p} onClick={() => setPair(p)}
                      className="text-[9px] px-2 py-0.5 rounded border border-[rgba(212,175,55,0.2)] text-[#D4AF37] hover:bg-[rgba(212,175,55,0.1)] font-mono font-bold transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Autopilot Relay */}
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.18)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Autopilot Relay</span>
              </div>
              <button onClick={() => setAutopilot(v => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors ${autopilot ? 'bg-[#D4AF37]' : 'bg-gray-800 border border-gray-700'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${autopilot ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>
            {autopilot && countdown > 0 && (
              <div className="flex items-center gap-2 text-xs text-green-400 font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {formatCountdown(countdown)}
              </div>
            )}
            <div>
              <label className="text-[9px] text-gray-600 uppercase tracking-widest font-mono mb-1.5 block">Interval: {intervalMin} min</label>
              <input type="range" min={1} max={30} value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))}
                className="w-full accent-[#D4AF37] h-1" />
            </div>
            <button onClick={fetchWhisper} disabled={loading}
              className="w-full py-3 rounded-xl font-black text-sm text-black disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              style={{ background: loading ? 'rgba(212,175,55,0.4)' : '#D4AF37', boxShadow: loading ? 'none' : '0 0 20px rgba(212,175,55,0.3)' }}>
              {loading ? (
                <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />WHISPERING...</>
              ) : (
                <><Ghost className="w-4 h-4" />GET WHISPER NOW</>
              )}
            </button>
          </div>

          {/* Neural Voice Synthesis */}
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.18)' }}>
            <div className="flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="text-[9px] text-gray-600 uppercase tracking-widest font-bold">Neural Voice Synthesis</span>
            </div>
            <select value={voice} onChange={e => setVoice(e.target.value)}
              className="w-full bg-black/60 border border-[rgba(212,175,55,0.2)] rounded-lg px-3 py-2 text-white text-xs font-mono appearance-none focus:outline-none focus:border-[#D4AF37]">
              <option value="">Default Voice</option>
              {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
            {[
              { label: 'Speed', val: speed, set: setSpeed, min: 0.5, max: 2, step: 0.1, display: `${speed.toFixed(1)}x` },
              { label: 'Pitch', val: pitch, set: setPitch, min: 0.5, max: 2, step: 0.1, display: pitch.toFixed(1) },
              { label: 'Volume', val: volume, set: setVolumeVal, min: 0, max: 1, step: 0.05, display: `${Math.round(volume*100)}%` },
            ].map(({ label, val, set, min, max, step, display }) => (
              <div key={label}>
                <div className="flex justify-between mb-1">
                  <span className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">{label}</span>
                  <span className="text-[9px] text-[#D4AF37] font-mono">{display}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))}
                  className="w-full accent-[#D4AF37] h-1" />
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Voice controls */}
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.18)' }}>
            <button onClick={playLast} disabled={!whispers.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black border border-[rgba(212,175,55,0.3)] text-[#D4AF37] hover:bg-[rgba(212,175,55,0.1)] transition-colors disabled:opacity-40">
              <Play className="w-4 h-4" />REPLAY LAST
            </button>
            <button onClick={() => window.speechSynthesis.cancel()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-white/10 text-gray-500 hover:bg-white/5 transition-colors">
              <Square className="w-4 h-4" />STOP
            </button>
            <button onClick={() => speak('Ghost unit online. Gold is approaching a bearish order block. High probability short setup forming. Caution advised.')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-white/10 text-gray-500 hover:bg-white/5 transition-colors">
              <Mic className="w-4 h-4" />TEST
            </button>
            <div className="ml-auto flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-gray-700" />
              {speaking && <WaveformBars active color="#D4AF37" />}
            </div>
          </div>

          {/* Whisper Feed */}
          <div className="flex-1 rounded-xl flex flex-col overflow-hidden" style={{ background: 'rgba(5,5,15,0.95)', border: '1px solid rgba(212,175,55,0.18)' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'rgba(212,175,55,0.1)', background: 'rgba(0,0,0,0.5)' }}>
              <div className="flex items-center gap-2">
                <Ghost className="w-4 h-4 text-[#D4AF37]" />
                <span className="font-black text-white tracking-wider text-sm">WHISPER FEED</span>
                <span className="text-[8px] font-mono text-gray-700 uppercase tracking-widest ml-1">CLASSIFIED</span>
              </div>
              <span className="text-[10px] text-gray-700 font-mono">{whispers.length} TRANSMISSIONS</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {whispers.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-700 gap-4 py-12">
                  <motion.div animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 3, repeat: Infinity }}>
                    <Ghost className="w-16 h-16 opacity-20" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-sm font-bold uppercase tracking-wider text-gray-600">No Transmissions Received</p>
                    <p className="text-xs text-gray-800 mt-1 font-mono">Click GET WHISPER NOW to contact Ghost AI</p>
                    <p className="text-[10px] text-gray-800 mt-0.5 font-mono">Requires API key in Settings</p>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {whispers.map((w, i) => (
                  <motion.div key={w.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    className={`rounded-xl overflow-hidden border ${i === 0 ? 'border-[rgba(212,175,55,0.4)]' : 'border-[rgba(212,175,55,0.08)]'}`}
                    style={{ background: i === 0 ? 'rgba(212,175,55,0.04)' : 'rgba(0,0,0,0.3)' }}>
                    {/* Header bar */}
                    <div className="px-3 py-1.5 flex items-center gap-2 border-b" style={{ background: 'rgba(0,0,0,0.5)', borderColor: i === 0 ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)' }}>
                      <Ghost className={`w-3 h-3 ${i === 0 ? 'text-[#D4AF37]' : 'text-gray-700'}`} />
                      <span className="text-[8px] font-mono text-gray-600 uppercase tracking-widest">TRANSMISSION #{whispers.length - i}</span>
                      <span className="text-[8px] font-mono text-gray-700">{w.time}</span>
                      <span className="ml-auto text-[8px] font-black text-[#D4AF37] font-mono">{w.pair}</span>
                      <span className="text-[8px] font-mono text-gray-600">@ {w.price}</span>
                      {i === 0 && <span className="text-[7px] font-black text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded border border-green-500/25">LATEST</span>}
                    </div>
                    {/* Classified bar */}
                    <div className="px-3 py-1" style={{ background: 'rgba(212,175,55,0.04)' }}>
                      <span className="text-[7px] font-mono text-[rgba(212,175,55,0.3)] tracking-widest">████ CLASSIFIED INTEL ████ EYES ONLY ████</span>
                    </div>
                    {/* Text */}
                    <div className="p-3">
                      <p className={`text-sm leading-relaxed italic font-mono ${i === 0 ? 'text-white' : 'text-gray-500'}`}>
                        "{w.text}"
                      </p>
                      {i === 0 && (
                        <button onClick={() => speak(w.text)}
                          className="mt-2 flex items-center gap-1 text-xs text-[#D4AF37] hover:text-yellow-300 font-mono font-bold">
                          <Play className="w-3 h-3" />REPLAY TRANSMISSION
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
