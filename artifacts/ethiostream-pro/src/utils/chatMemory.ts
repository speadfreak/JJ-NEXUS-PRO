const DB_NAME = 'jjnexuspro_db'
const DB_VERSION = 2

export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant'
  content: string
  pair?: string
  timestamp?: number
}

export interface AlchemistAnalysis {
  id?: number
  pair: string
  livePrice: number
  bias: string
  probability: number
  htfStructure: string
  entry: { low: number; high: number }
  stopLoss: number
  tp1: number
  tp2: number
  tp3: number
  riskReward: number
  confluence: number
  keyLevels: KeyLevel[]
  fullAnalysis: string
  timestamp: number
  session: string
  grade: 'A+' | 'A' | 'B' | 'C' | 'No Trade'
}

export interface KeyLevel {
  id: string
  type: 'OB_BULLISH' | 'OB_BEARISH' | 'FVG_BULLISH' | 'FVG_BEARISH' | 'LIQUIDITY_BSL' | 'LIQUIDITY_SSL' | 'STRUCTURE_HIGH' | 'STRUCTURE_LOW' | 'ENTRY_ZONE' | 'STOP_LOSS' | 'TAKE_PROFIT'
  price?: string
  high?: string
  low?: string
  description: string
  strength: number
}

class ChatMemoryDB {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('chats')) {
          const store = db.createObjectStore('chats', { keyPath: 'id', autoIncrement: true })
          store.createIndex('timestamp', 'timestamp')
          store.createIndex('pair', 'pair')
        }
        if (!db.objectStoreNames.contains('analyses')) {
          const store = db.createObjectStore('analyses', { keyPath: 'id', autoIncrement: true })
          store.createIndex('timestamp', 'timestamp')
          store.createIndex('pair', 'pair')
        }
        if (!db.objectStoreNames.contains('context')) {
          db.createObjectStore('context', { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains('discipline')) {
          const store = db.createObjectStore('discipline', { keyPath: 'id', autoIncrement: true })
          store.createIndex('date', 'date')
        }
      }
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('chats', 'readwrite')
      tx.objectStore('chats').add({ ...message, timestamp: message.timestamp || Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getHistory(limit = 50): Promise<ChatMessage[]> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('chats', 'readonly')
      const store = tx.objectStore('chats')
      const index = store.index('timestamp')
      const req = index.openCursor(null, 'prev')
      const results: ChatMessage[] = []
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result
        if (cursor && results.length < limit) {
          results.push(cursor.value)
          cursor.continue()
        } else {
          resolve(results.reverse())
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  async saveContext(key: string, value: any): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('context', 'readwrite')
      tx.objectStore('context').put({ key, value, updated: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getContext(key: string): Promise<any> {
    if (!this.db) await this.init()
    return new Promise((resolve) => {
      const tx = this.db!.transaction('context', 'readonly')
      const req = tx.objectStore('context').get(key)
      req.onsuccess = () => resolve(req.result?.value)
      req.onerror = () => resolve(null)
    })
  }

  async saveAnalysis(analysis: AlchemistAnalysis): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('analyses', 'readwrite')
      tx.objectStore('analyses').add({ ...analysis, timestamp: analysis.timestamp || Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getAnalysisHistory(pair?: string, limit = 20): Promise<AlchemistAnalysis[]> {
    if (!this.db) await this.init()
    return new Promise((resolve) => {
      const tx = this.db!.transaction('analyses', 'readonly')
      const store = tx.objectStore('analyses')
      const req = store.getAll()
      req.onsuccess = () => {
        let results = req.result || []
        if (pair) results = results.filter((a: any) => a.pair === pair)
        results.sort((a: any, b: any) => b.timestamp - a.timestamp)
        resolve(results.slice(0, limit))
      }
      req.onerror = () => resolve([])
    })
  }

  async clearHistory(): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['chats', 'analyses'], 'readwrite')
      tx.objectStore('chats').clear()
      tx.objectStore('analyses').clear()
      tx.oncomplete = () => resolve()
    })
  }
}

export const chatMemory = new ChatMemoryDB()

export async function buildAIContext(currentPair: string): Promise<string> {
  try {
    const history = await chatMemory.getHistory(10)
    const recentAnalyses = await chatMemory.getAnalysisHistory(currentPair, 3)
    const userProfile = await chatMemory.getContext('user_profile')

    let context = `CONVERSATION CONTEXT:\n`
    if (userProfile) {
      context += `User: ${userProfile.name || 'Trader'}. Experience: ${userProfile.experience || 'intermediate'}. Preferred pairs: ${userProfile.favoritePairs?.join(', ') || 'XAUUSD'}.\n`
    }
    if (recentAnalyses.length > 0) {
      context += `\nRECENT ${currentPair} ANALYSES:\n`
      recentAnalyses.forEach(a => {
        context += `- ${new Date(a.timestamp).toLocaleDateString()}: Bias=${a.bias}, Entry=${a.entry?.low}-${a.entry?.high}, Grade=${a.grade}\n`
      })
    }
    if (history.length > 0) {
      context += `\nRECENT CONVERSATION:\n`
      history.slice(-6).forEach(msg => {
        context += `${msg.role === 'user' ? 'Trader' : 'Alchemist AI'}: ${msg.content.slice(0, 200)}\n`
      })
    }
    return context
  } catch {
    return ''
  }
}
