// ============================================================
// Haftalık çalışma kilometre taşları
//
// Haftalık toplam süre (saniye) bir eşiği aşınca ana ekranda kısa
// süreli bir kutlama pop-up'ı çıkar. Eşikler, gerçekçi bir "taş
// çatlasa ~40 saat/hafta" tavanına göre 1 saatten 40 saate kadar
// artan 9 basamaktır; her birinin bir adı ve motivasyon mesajı vardır.
// ============================================================

export interface Milestone {
  /** Eşik — saniye cinsinden haftalık toplam. */
  sec: number
  /** Kısa ad (pop-up başlığı). */
  name: string
  /** Motivasyon mesajı. */
  message: string
}

const H = 3600

export const MILESTONES: Milestone[] = [
  { sec: 1 * H, name: 'İlk Adım', message: 'Yolculuk tek bir adımla başlar. Başladın bile!' },
  { sec: 5 * H, name: 'Isınma Turu', message: 'Ritmi yakaladın. Böyle devam!' },
  { sec: 10 * H, name: 'İvme', message: 'Çift haneli saatler! Momentum artık sende.' },
  { sec: 15 * H, name: 'Kararlı', message: 'Disiplin, yeteneği yener — kanıtlıyorsun.' },
  { sec: 20 * H, name: 'Yarı Yol', message: 'Haftanın zirvesine yarı yoldasın. Harikasın!' },
  { sec: 25 * H, name: 'Azimli', message: 'Çoğu kişinin bıraktığı yerde sen devam ediyorsun.' },
  { sec: 30 * H, name: 'Maratoncu', message: 'Bu tempo şampiyonların temposu.' },
  { sec: 35 * H, name: 'Zirveye Yakın', message: 'Neredeyse zirvedesin, bir gayret daha!' },
  { sec: 40 * H, name: 'Efsane', message: 'Taş çatlasa bu kadar! Efsane bir hafta çıkardın.' },
]

/** Verilen haftalık toplamla kazanılmış (eşiği aşılmış) tüm rozetler. */
export function earnedMilestones(weekSec: number): Milestone[] {
  return MILESTONES.filter((m) => weekSec >= m.sec)
}

/** Henüz kazanılmamış ilk rozet (bir sonraki hedef); hepsi geçildiyse null. */
export function nextMilestone(weekSec: number): Milestone | null {
  return MILESTONES.find((m) => weekSec < m.sec) ?? null
}
