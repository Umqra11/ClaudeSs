// ============================================================
// Presence — "çalışıyor" kararı (saf, test edilebilir).
// ============================================================

import type { UserProfile } from '../services/shared'

/**
 * Bir üye "çalışıyor" (canlı) mı? Seansın KENDİSİNE güvenir: üye açıkça
 * Duraklat/Durdur demedikçe (isStudying=false) çalışıyor sayılır. Heartbeat
 * tazeliğine BAĞLAMAYIZ — mobil tarayıcı arka plandaki sekmede setInterval'i
 * dondurduğu için arka planda (ör. YouTube'da ders videosu) çalışan biri
 * heartbeat gönderemez; kısa bir TTL onu haksız yere "çalışmıyor"a düşürürdü.
 *
 * Tradeoff: Durdur demeden uygulamayı tamamen kapatan biri, canlı sıralamada
 * bir süre "çalışıyor" görünebilir (hayalet oturum). Bu yalnız KOZMETİK canlı
 * sıralamayı etkiler; şampiyonluk ödülü tamamlanmış haftanın kalıcı `days`
 * verisinden hesaplandığından hayaletten etkilenmez.
 */
export function isLiveStudying(m: UserProfile): boolean {
  return m.isStudying && m.sessionStartedAt != null
}
