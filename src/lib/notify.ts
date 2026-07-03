// ============================================================
// Çalışma bildirimi (yalnızca "en iyi çaba")
//
// Amaç: kronometre çalışırken telefonda görünür bir iz bırakmak.
// Sınır: web'de kilit ekranında SANİYE SANİYE akan bir sayaç
// göstermek mümkün değildir (bu yalnızca native "Live Activity" /
// ongoing chronometer ile olur). Bu yüzden başlangıç saatini içeren
// tek, kalıcı bir bildirim gösterir; uygulamaya dönünce tazelenir.
//
// Android'de (özellikle ana ekrana eklenmiş PWA'da) kalıcı görünür;
// iOS'ta yalnızca yüklenmiş PWA + izinle sınırlı çalışır. Desteğin
// olmadığı yerde tüm fonksiyonlar sessizce hiçbir şey yapmaz.
// ============================================================

const TAG = 'kpss-study'

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  )
}

/** Başlangıç saatini "14:32" gibi biçimler. */
function clockOf(ms: number): string {
  return new Date(ms).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Bildirim iznini ister (yalnızca kullanıcı hareketiyle çağrılmalı).
 * Zaten verilmiş/reddedilmişse yeniden sormaz. İzin verildiyse true.
 */
export async function ensureStudyPermission(): Promise<boolean> {
  if (!supported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Çalışma bildirimini gösterir/tazeler (izin varsa). */
export async function showStudyNotification(startedAtMs: number): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification('Çalışıyorsun 📚', {
      body: `${clockOf(startedAtMs)}'de başladın · odaklan`,
      tag: TAG,
      renotify: false,
      silent: true,
      requireInteraction: true,
      badge: '/icon-192.png',
      icon: '/icon-192.png',
    } as NotificationOptions)
  } catch {
    /* servis çalışanı hazır değil vb. — yok say */
  }
}

/** Varsa çalışma bildirimini kapatır. */
export async function clearStudyNotification(): Promise<void> {
  if (!supported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const list = await reg.getNotifications({ tag: TAG })
    list.forEach((n) => n.close())
  } catch {
    /* yok say */
  }
}
