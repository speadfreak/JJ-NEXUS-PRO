export type NotificationType = 'signal' | 'alert' | 'calendar' | 'info'

export interface JJNotification {
  id: string
  title: string
  body: string
  timestamp: number
  read: boolean
  type?: NotificationType
}

export class AlertService {
  private static priceAlerts: Map<string, { price: number; direction: 'above' | 'below'; pair: string }> = new Map()
  private static notificationsEnabled = false
  private static listeners: Array<(n: JJNotification) => void> = []

  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    const permission = await Notification.requestPermission()
    this.notificationsEnabled = permission === 'granted'
    return this.notificationsEnabled
  }

  static onNotification(cb: (n: JJNotification) => void) {
    this.listeners.push(cb)
    return () => { this.listeners = this.listeners.filter(l => l !== cb) }
  }

  static notify(title: string, body: string, icon = '/jj-trades-logo.jpg', type: NotificationType = 'info') {
    const notification: JJNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      body,
      timestamp: Date.now(),
      read: false,
      type,
    }

    if (this.notificationsEnabled && Notification.permission === 'granted') {
      new Notification(title, { body, icon })
    }

    window.dispatchEvent(new CustomEvent('jjnexus-notification', { detail: notification }))
    this.listeners.forEach(l => l(notification))
  }

  static signal(title: string, body: string) {
    this.notify(title, body, '/jj-trades-logo.jpg', 'signal')
  }

  static alert(title: string, body: string) {
    this.notify(title, body, '/jj-trades-logo.jpg', 'alert')
  }

  static calendar(title: string, body: string) {
    this.notify(title, body, '/jj-trades-logo.jpg', 'calendar')
  }

  static addPriceAlert(pair: string, targetPrice: number, direction: 'above' | 'below') {
    const id = `${pair}-${direction}-${targetPrice}`
    this.priceAlerts.set(id, { price: targetPrice, direction, pair })
    this.notify('✅ Alert Set', `${pair} alert set for ${direction} $${targetPrice}`, '/jj-trades-logo.jpg', 'alert')
  }

  static checkPriceAlerts(currentPrices: Record<string, number>) {
    this.priceAlerts.forEach((alert, id) => {
      const currentPrice = currentPrices[alert.pair]
      if (!currentPrice) return
      const triggered =
        alert.direction === 'above' ? currentPrice >= alert.price : currentPrice <= alert.price
      if (triggered) {
        this.notify(
          `🚨 ${alert.pair} Alert Triggered!`,
          `Price is now ${alert.direction} $${alert.price}. Current: ${currentPrice.toFixed(5)}`,
          '/jj-trades-logo.jpg',
          'alert'
        )
        this.priceAlerts.delete(id)
      }
    })
  }

  static scheduleEventAlert(eventId: string, eventDate: string, eventTitle: string, minutesBefore: number) {
    const alertTime = new Date(eventDate).getTime() - minutesBefore * 60 * 1000
    const now = Date.now()
    if (alertTime <= now) return
    const delay = alertTime - now
    setTimeout(() => {
      this.notify(`⏰ Upcoming: ${eventTitle}`, `${eventTitle} starts in ${minutesBefore} minutes!`, '/jj-trades-logo.jpg', 'calendar')
    }, delay)
  }

  static getPriceAlerts() {
    return Array.from(this.priceAlerts.entries()).map(([id, alert]) => ({ id, ...alert }))
  }

  static removePriceAlert(id: string) {
    this.priceAlerts.delete(id)
  }
}
