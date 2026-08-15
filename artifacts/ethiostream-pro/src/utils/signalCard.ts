function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export async function generateSignalCard(
  pair: string,
  bias: string,
  probability: number,
  entry: string,
  sl: string,
  tp1: string,
  rr: number,
  price: number
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1080
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, 1080, 1080)

  const gradient = ctx.createLinearGradient(0, 0, 0, 1080)
  gradient.addColorStop(0, 'rgba(212,175,55,0.08)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1080, 1080)

  ctx.strokeStyle = '#D4AF37'
  ctx.lineWidth = 8
  roundedRect(ctx, 20, 20, 1040, 1040, 20)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(212,175,55,0.25)'
  ctx.lineWidth = 2
  roundedRect(ctx, 36, 36, 1008, 1008, 14)
  ctx.stroke()

  ctx.fillStyle = '#D4AF37'
  ctx.font = 'bold 34px Arial'
  ctx.fillText('JJ NEXUS PRO', 60, 90)

  ctx.fillStyle = 'rgba(212,175,55,0.4)'
  ctx.font = '18px Arial'
  ctx.fillText('ALCHEMIST AI • ELITE FOREX INTELLIGENCE', 60, 118)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 86px Arial'
  ctx.fillText(pair, 60, 220)

  const isBullish = bias.toLowerCase().includes('bullish')
  ctx.fillStyle = isBullish ? '#16a34a' : '#dc2626'
  ctx.font = 'bold 54px Arial'
  ctx.fillText(isBullish ? '📈 BULLISH' : '📉 BEARISH', 60, 302)

  ctx.fillStyle = '#D4AF37'
  ctx.font = 'bold 36px Arial'
  ctx.fillText(`Live Price: $${price.toFixed(price > 500 ? 2 : 5)}`, 60, 372)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 44px Arial'
  ctx.fillText(`Win Probability: ${probability}%`, 60, 440)

  ctx.fillStyle = 'rgba(212,175,55,0.1)'
  ctx.strokeStyle = 'rgba(212,175,55,0.5)'
  ctx.lineWidth = 2
  roundedRect(ctx, 60, 480, 960, 380, 16)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#D4AF37'
  ctx.font = 'bold 34px Arial'
  ctx.fillText('TRADE PLAN', 100, 535)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = '30px Arial'
  const lines = [
    `Entry Zone:  ${entry}`,
    `Stop Loss:   ${sl}`,
    `Take Profit: ${tp1}`,
    `Risk:Reward: 1:${rr}`
  ]
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 3 ? '#D4AF37' : '#FFFFFF'
    ctx.fillText(line, 100, 590 + i * 58)
  })

  ctx.strokeStyle = 'rgba(212,175,55,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, 890)
  ctx.lineTo(1020, 890)
  ctx.stroke()

  ctx.fillStyle = 'rgba(212,175,55,0.55)'
  ctx.font = '20px Arial'
  ctx.fillText('— Alchemist AI | JJ NEXUS PRO | Not financial advice', 60, 930)

  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '18px Arial'
  ctx.fillText(new Date().toLocaleString(), 60, 960)

  return canvas.toDataURL('image/png', 0.95)
}

export function downloadSignalCard(dataUrl: string, pair: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${pair}-signal-${Date.now()}.png`
  a.click()
}
