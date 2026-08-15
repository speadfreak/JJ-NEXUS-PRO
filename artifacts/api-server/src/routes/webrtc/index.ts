import { Router } from 'express'

const router = Router()

interface Session {
  offer?: string
  answer?: string
  callerIce: string[]
  calleeIce: string[]
  callerIceIndex: number
  calleeIceIndex: number
  created: number
  reconnectSignal: number  // bumped by laptop Quick Reconnect → phone polls and re-offers
}

const sessions = new Map<string, Session>()

setInterval(() => {
  const now = Date.now()
  for (const [id, s] of sessions) {
    if (now - s.created > 600_000) sessions.delete(id)
  }
}, 60_000)

function makeId() {
  return Math.random().toString(36).slice(2, 9).toUpperCase()
}

function freshSession(): Session {
  return {
    callerIce: [], calleeIce: [],
    callerIceIndex: 0, calleeIceIndex: 0,
    created: Date.now(),
    reconnectSignal: 0
  }
}

router.post('/session', (_req, res) => {
  const id = makeId()
  sessions.set(id, freshSession())
  res.json({ sessionId: id })
})

router.get('/session/:id/offer', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s?.offer) return void res.json({ offer: null })
  res.json({ offer: s.offer })
})

router.post('/session/:id/offer', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return void res.status(404).json({ error: 'Session not found' })
  s.offer = req.body.sdp
  res.json({ ok: true })
})

router.get('/session/:id/answer', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s?.answer) return void res.json({ answer: null })
  res.json({ answer: s.answer })
})

router.post('/session/:id/answer', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return void res.status(404).json({ error: 'Session not found' })
  s.answer = req.body.sdp
  res.json({ ok: true })
})

router.post('/session/:id/ice/caller', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return void res.status(404).json({ error: 'Session not found' })
  const cands: string[] = Array.isArray(req.body.candidates) ? req.body.candidates : []
  s.callerIce.push(...cands)
  res.json({ ok: true })
})

router.get('/session/:id/ice/caller', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return void res.status(404).json({ candidates: [] })
  const from = Number(req.query.from) || 0
  const slice = s.callerIce.slice(from)
  res.json({ candidates: slice, nextIndex: from + slice.length })
})

router.post('/session/:id/ice/callee', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return void res.status(404).json({ error: 'Session not found' })
  const cands: string[] = Array.isArray(req.body.candidates) ? req.body.candidates : []
  s.calleeIce.push(...cands)
  res.json({ ok: true })
})

router.get('/session/:id/ice/callee', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) return void res.status(404).json({ candidates: [] })
  const from = Number(req.query.from) || 0
  const slice = s.calleeIce.slice(from)
  res.json({ candidates: slice, nextIndex: from + slice.length })
})

// ── Reset: clears stale offer/answer/ICE and bumps reconnectSignal ──────────
// Called by laptop Quick Reconnect so the phone knows to re-initiate.
router.post('/session/:id/reset', (req, res) => {
  let s = sessions.get(req.params.id)
  if (!s) {
    // Recreate if expired — phone may still be open with old URL
    s = freshSession()
    sessions.set(req.params.id, s)
  }
  s.offer = undefined
  s.answer = undefined
  s.callerIce = []
  s.calleeIce = []
  s.callerIceIndex = 0
  s.calleeIceIndex = 0
  s.reconnectSignal = Date.now()
  res.json({ ok: true, reconnectSignal: s.reconnectSignal })
})

// ── Status: phone polls this to detect reconnect signal changes ──────────────
router.get('/session/:id/status', (req, res) => {
  const s = sessions.get(req.params.id)
  if (!s) {
    // Return signal=0 so phone can at least check — laptop may recreate the session
    return void res.json({ reconnectSignal: 0, exists: false })
  }
  res.json({ reconnectSignal: s.reconnectSignal, exists: true })
})

export default router
