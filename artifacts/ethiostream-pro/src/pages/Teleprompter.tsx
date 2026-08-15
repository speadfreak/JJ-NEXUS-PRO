import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ScrollText, Play, Pause, RotateCcw, ChevronDown, Video } from 'lucide-react'
import { generateStreamScript } from '@/lib/claudeAPI'
import { useCamera } from '@/context/CameraContext'

const PAIRS = ['XAUUSD','EURUSD','GBPUSD','USDJPY','GBPJPY','AUDUSD','USDCAD','XAGUSD']
const DURATIONS = ['3 min','5 min','7 min','10 min']
const STYLES = ['Educational','Analytical','Hype / Energetic','Calm & Professional','Beginner-Friendly']

export default function Teleprompter() {
  const { stream } = useCamera()
  const [pair, setPair] = useState('XAUUSD')
  const [duration, setDuration] = useState('5 min')
  const [style, setStyle] = useState('Educational')
  const [script, setScript] = useState('')
  const [loading, setLoading] = useState(false)

  // Teleprompter state
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(40) // px per second
  const [fontSize, setFontSize] = useState(32)
  const [mirrored, setMirrored] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [currentLineIdx, setCurrentLineIdx] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp
    const dt = (timestamp - lastTimeRef.current) / 1000
    lastTimeRef.current = timestamp
    setScrollY(prev => {
      const next = prev + speed * dt
      if (scrollRef.current) scrollRef.current.scrollTop = next
      return next
    })
    animRef.current = requestAnimationFrame(animate)
  }, [speed])

  useEffect(() => {
    if (running && !paused) {
      lastTimeRef.current = 0
      animRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(animRef.current)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [running, paused, animate])

  const handleGenerate = async () => {
    setLoading(true)
    setScript('')
    try {
      const res = await generateStreamScript(pair, `${duration} ${style} stream about ${pair}`)
      setScript(res)
      setScrollY(0)
      setRunning(false)
      setPaused(false)
    } catch (e: any) {
      setScript(`⚠️ Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleStart = () => {
    setScrollY(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setRunning(true)
    setPaused(false)
  }

  const handlePause = () => setPaused(p => !p)
  const handleRestart = () => {
    setScrollY(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setRunning(false)
    setTimeout(() => setRunning(true), 50)
    setPaused(false)
  }

  const lines = script.split('\n').filter(l => l.trim())

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <ScrollText className="w-7 h-7 text-[var(--gold)]" />
        <div>
          <h1 className="font-serif font-bold text-2xl text-[var(--gold)]">AI TELEPROMPTER</h1>
          <p className="text-xs text-gray-500">Generate stream scripts and read them live with auto-scroll</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        {/* Left — Setup */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-5 flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Script Setup</h3>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Pair</label>
              <div className="relative">
                <select value={pair} onChange={e => setPair(e.target.value)}
                  className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2.5 text-white font-bold appearance-none focus:outline-none focus:border-[var(--gold)]">
                  {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Duration</label>
                <select value={duration} onChange={e => setDuration(e.target.value)}
                  className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white appearance-none focus:outline-none focus:border-[var(--gold)]">
                  {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Style</label>
                <select value={style} onChange={e => setStyle(e.target.value)}
                  className="w-full bg-black/60 border border-[rgba(212,175,55,0.3)] rounded-lg px-3 py-2 text-white appearance-none focus:outline-none focus:border-[var(--gold)]">
                  {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleGenerate} disabled={loading}
              className="w-full py-3 bg-[var(--gold)] text-black font-bold rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Generating Script...</>
              ) : (
                <><ScrollText className="w-4 h-4" /> Generate AI Script</>
              )}
            </button>
          </div>

          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-5 flex flex-col gap-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Teleprompter Controls</h3>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Scroll Speed: {speed} px/s</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setSpeed(s => Math.max(5, s - 5))} className="w-7 h-7 rounded-full bg-white/10 text-white font-bold hover:bg-white/20">−</button>
                <input type="range" min={5} max={200} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="flex-1 accent-[var(--gold)]" />
                <button onClick={() => setSpeed(s => Math.min(200, s + 5))} className="w-7 h-7 rounded-full bg-white/10 text-white font-bold hover:bg-white/20">+</button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Font Size: {fontSize}px</label>
              <input type="range" min={16} max={72} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-full accent-[var(--gold)]" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Mirror text</span>
              <button onClick={() => setMirrored(v => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors ${mirrored ? 'bg-[var(--gold)]' : 'bg-gray-700'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${mirrored ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={handleStart} disabled={!script}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500 transition-colors disabled:opacity-40 text-sm">
                <Play className="w-4 h-4" /> Start
              </button>
              <button onClick={handlePause} disabled={!running}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40 text-sm">
                <Pause className="w-4 h-4" /> {paused ? 'Resume' : 'Pause'}
              </button>
              <button onClick={handleRestart} disabled={!script}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40 text-sm">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* PiP Camera */}
          <div className="border border-[rgba(212,175,55,0.2)] rounded-xl bg-[hsl(var(--card))] p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-[var(--gold)]" />
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Camera PiP</span>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              {stream ? (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">No camera — enable in Studio</div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Teleprompter Display */}
        <div className="lg:col-span-3 flex flex-col border border-[rgba(212,175,55,0.2)] rounded-xl bg-black overflow-hidden">
          <div className="px-4 py-3 border-b border-[rgba(212,175,55,0.1)] flex items-center gap-3 shrink-0 bg-[#0a0a0a]">
            <ScrollText className="w-4 h-4 text-[var(--gold)]" />
            <span className="font-bold text-sm text-white">LIVE READING MODE</span>
            {running && !paused && (
              <div className="ml-auto flex items-center gap-2 text-green-400 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                SCROLLING
              </div>
            )}
            {running && paused && (
              <div className="ml-auto flex items-center gap-2 text-yellow-400 text-xs">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                PAUSED
              </div>
            )}
          </div>
          <div
            ref={scrollRef}
            className="flex-1 overflow-hidden p-8"
            style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
          >
            {!script && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-3">
                <ScrollText className="w-16 h-16 opacity-20" />
                <p className="text-center">Generate a script using the controls on the left, then click Start.</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-10 h-10 border-2 border-[rgba(212,175,55,0.3)] border-t-[var(--gold)] rounded-full animate-spin" />
                <p className="text-gray-500">AI is writing your script...</p>
              </div>
            )}
            {script && !loading && (
              <div style={{ fontSize, lineHeight: 1.7 }}>
                {lines.map((line, i) => (
                  <p key={i}
                    className={`mb-4 transition-colors duration-300 ${
                      running && !paused && i === currentLineIdx
                        ? 'text-[var(--gold)] font-bold'
                        : 'text-white'
                    }`}
                    style={{
                      opacity: running && !paused && Math.abs(i - currentLineIdx) > 3 ? 0.4 : 1,
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
