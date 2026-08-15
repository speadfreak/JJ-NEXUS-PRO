type AlertType = 'follow' | 'subscribe' | 'donate' | 'gift' | 'raid' | 'host' | 'comment' | 'share' | 'setup_found' | 'price_alert' | 'custom'

export interface StreamAlert {
  id: string
  type: AlertType
  username: string
  message?: string
  amount?: number
  currency?: string
  timestamp: Date
}

export interface AlertConfig {
  type: AlertType
  enabled: boolean
  soundUrl: string
  volume: number
  overlayDuration: number
  overlayText: string
  overlayColor: string
  ttsEnabled: boolean
  ttsText: string
}

// tone: scheme for built-in Web Audio tones (no CDN)
// format: "tone:<freq>:<duration_ms>:<wave>" e.g. "tone:440:300:sine"
export const DEFAULT_ALERT_CONFIGS: AlertConfig[] = [
  {
    type: 'follow',
    enabled: true,
    soundUrl: 'tone:523:250:sine',
    volume: 0.8,
    overlayDuration: 5,
    overlayText: '❤️ {username} just followed!',
    overlayColor: '#E91E8C',
    ttsEnabled: true,
    ttsText: 'Thank you {username} for following!'
  },
  {
    type: 'subscribe',
    enabled: true,
    soundUrl: 'tone:659:400:sine',
    volume: 0.9,
    overlayDuration: 7,
    overlayText: '🌟 {username} just subscribed!',
    overlayColor: '#9B59B6',
    ttsEnabled: true,
    ttsText: '{username} just subscribed! Welcome to the family!'
  },
  {
    type: 'donate',
    enabled: true,
    soundUrl: 'tone:784:500:sine',
    volume: 1.0,
    overlayDuration: 10,
    overlayText: '💰 {username} donated {amount} {currency}!',
    overlayColor: '#D4AF37',
    ttsEnabled: true,
    ttsText: '{username} donated {amount} {currency}! Thank you so much!'
  },
  {
    type: 'gift',
    enabled: true,
    soundUrl: 'tone:523:250:sine',
    volume: 0.9,
    overlayDuration: 8,
    overlayText: '🎁 {username} sent a gift!',
    overlayColor: '#E74C3C',
    ttsEnabled: true,
    ttsText: '{username} sent a gift! Amazing!'
  },
  {
    type: 'raid',
    enabled: true,
    soundUrl: 'tone:880:600:square',
    volume: 1.0,
    overlayDuration: 15,
    overlayText: '⚔️ {username} is raiding with {amount} viewers!',
    overlayColor: '#E67E22',
    ttsEnabled: true,
    ttsText: 'Incoming raid from {username} with {amount} viewers! Welcome everyone!'
  },
  {
    type: 'setup_found',
    enabled: true,
    soundUrl: 'tone:1047:300:triangle',
    volume: 0.7,
    overlayDuration: 6,
    overlayText: '🎯 A+ Setup Found: {username}',
    overlayColor: '#D4AF37',
    ttsEnabled: false,
    ttsText: ''
  },
  {
    type: 'price_alert',
    enabled: true,
    soundUrl: 'tone:1047:300:triangle',
    volume: 0.8,
    overlayDuration: 5,
    overlayText: '🚨 {username}',
    overlayColor: '#E74C3C',
    ttsEnabled: true,
    ttsText: 'Price alert: {username}'
  },
  {
    type: 'custom',
    enabled: true,
    soundUrl: 'tone:523:250:sine',
    volume: 0.8,
    overlayDuration: 5,
    overlayText: '🔔 {username}',
    overlayColor: '#D4AF37',
    ttsEnabled: false,
    ttsText: ''
  }
]

class StreamAlertService {
  private audioCache: Map<string, HTMLAudioElement> = new Map()
  private alertQueue: StreamAlert[] = []
  private isProcessing = false
  private overlayCallback: ((alert: StreamAlert, config: AlertConfig) => void) | null = null
  private configs: AlertConfig[] = this.loadConfigs()

  loadConfigs(): AlertConfig[] {
    try {
      const saved = localStorage.getItem('jjnexus_alert_configs')
      if (saved) {
        const parsed = JSON.parse(saved)
        const merged = DEFAULT_ALERT_CONFIGS.map(def => {
          const found = parsed.find((p: AlertConfig) => p.type === def.type)
          return found ? { ...def, ...found } : def
        })
        return merged
      }
    } catch {}
    return [...DEFAULT_ALERT_CONFIGS]
  }

  saveConfigs(configs: AlertConfig[]) {
    this.configs = configs
    localStorage.setItem('jjnexus_alert_configs', JSON.stringify(configs))
  }

  getConfigs(): AlertConfig[] {
    return this.configs
  }

  setOverlayCallback(cb: (alert: StreamAlert, config: AlertConfig) => void) {
    this.overlayCallback = cb
  }

  async preloadSounds() {
    // tone: scheme uses Web Audio — nothing to preload
  }

  playToneScheme(soundUrl: string, volume: number) {
    // Parse "tone:<freq>:<duration_ms>:<wave>"
    const parts = soundUrl.split(':')
    const freq = parseFloat(parts[1]) || 440
    const duration = parseInt(parts[2]) || 300
    const wave = (parts[3] || 'sine') as OscillatorType
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = wave
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration / 1000)
    } catch {}
  }

  async playSound(type: AlertType) {
    const config = this.configs.find(c => c.type === type)
    if (!config?.enabled) return

    if (config.soundUrl?.startsWith('tone:')) {
      this.playToneScheme(config.soundUrl, config.volume)
      return
    }

    try {
      let audio = this.audioCache.get(type)
      if (!audio || audio.src !== config.soundUrl) {
        audio = new Audio(config.soundUrl)
        this.audioCache.set(type, audio)
      }
      audio.volume = config.volume
      audio.currentTime = 0
      await audio.play()
    } catch {
      this.generateAlertTone(type)
    }
  }

  generateAlertTone(type: AlertType) {
    try {
      const ctx = new AudioContext()
      const tones: Record<string, number[]> = {
        follow: [440, 550, 660],
        subscribe: [550, 660, 770, 880],
        donate: [330, 440, 550, 660, 770],
        gift: [440, 660, 880],
        raid: [220, 330, 440, 550],
        host: [440, 550],
        comment: [440],
        share: [440, 550],
        setup_found: [880, 660, 880],
        price_alert: [440, 880, 440],
        custom: [440, 550, 660]
      }
      const frequencies = tones[type] || [440]
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4)
        osc.start(ctx.currentTime + i * 0.15)
        osc.stop(ctx.currentTime + i * 0.15 + 0.4)
      })
    } catch {}
  }

  speakAlert(text: string) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.1
    utterance.volume = 0.9
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = voices.find(v =>
      v.name.includes('Google') || v.name.includes('Microsoft') || v.lang === 'en-US'
    )
    if (preferredVoice) utterance.voice = preferredVoice
    window.speechSynthesis.speak(utterance)
  }

  processTemplate(template: string, alert: StreamAlert): string {
    return template
      .replace(/{username}/g, alert.username)
      .replace(/{amount}/g, String(alert.amount || ''))
      .replace(/{currency}/g, alert.currency || '')
      .replace(/{message}/g, alert.message || '')
  }

  async triggerAlert(type: AlertType, data: Partial<StreamAlert>) {
    const alert: StreamAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      username: data.username || 'Anonymous',
      message: data.message,
      amount: data.amount,
      currency: data.currency,
      timestamp: new Date()
    }
    this.alertQueue.push(alert)
    if (!this.isProcessing) this.processQueue()
  }

  private async processQueue() {
    this.isProcessing = true
    while (this.alertQueue.length > 0) {
      const alert = this.alertQueue.shift()!
      const config = this.configs.find(c => c.type === alert.type)
      if (!config?.enabled) continue
      await this.playSound(alert.type)
      if (this.overlayCallback) {
        this.overlayCallback(alert, config)
      }
      if (config.ttsEnabled && config.ttsText) {
        const ttsText = this.processTemplate(config.ttsText, alert)
        setTimeout(() => this.speakAlert(ttsText), 600)
      }
      await new Promise(resolve => setTimeout(resolve, (config.overlayDuration + 1) * 1000))
    }
    this.isProcessing = false
  }

  getConfig(type: AlertType): AlertConfig | undefined {
    return this.configs.find(c => c.type === type)
  }

  updateConfig(type: AlertType, updates: Partial<AlertConfig>) {
    this.configs = this.configs.map(c => c.type === type ? { ...c, ...updates } : c)
    this.saveConfigs(this.configs)
  }
}

export const streamAlertService = new StreamAlertService()
