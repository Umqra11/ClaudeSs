// ============================================================
// Kilometre taşı geçişini yakalayan hook.
//
// Haftalık toplam bir eşiği CANLI aştığında kutlanacak milestone'u
// döndürür. Kutlananlar localStorage'da hafta anahtarıyla saklanır;
// böylece sayfa yenilense bile aynı taş tekrar kutlanmaz. İlk mount'ta
// zaten geçilmiş eşikler SESSİZCE işaretlenir (yenileme spam'i olmaz);
// yalnızca mount sonrası yeni aşılan eşik pop-up olarak döner.
// Hafta değişince (Salı 00:00) kutlanan liste sıfırlanır.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { MILESTONES, type Milestone } from '../lib/milestones'
import { getWeekId } from '../lib/week'

const KEY = 'kpss.milestones'
const SHOW_MS = 4500

interface Store {
  uid: string
  weekId: string
  reachedSec: number[]
}

function load(uid: string, weekId: string): Set<number> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Store
      if (s.uid === uid && s.weekId === weekId && Array.isArray(s.reachedSec)) {
        return new Set(s.reachedSec)
      }
    }
  } catch {
    /* bozuk kayıt — yok say */
  }
  return new Set()
}

function save(uid: string, weekId: string, reached: Set<number>): void {
  try {
    const store: Store = { uid, weekId, reachedSec: [...reached] }
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* yok say */
  }
}

export function useMilestone(uid: string, weekSec: number): Milestone | null {
  const [achievement, setAchievement] = useState<Milestone | null>(null)
  const reached = useRef<Set<number> | null>(null)
  const weekIdRef = useRef<string>('')
  const seeded = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const weekId = getWeekId()
    // İlk yükleme ya da hafta değişimi: kutlananları (yeniden) yükle
    if (reached.current === null || weekIdRef.current !== weekId) {
      weekIdRef.current = weekId
      reached.current = load(uid, weekId)
      seeded.current = false
    }
    const set = reached.current

    // İlk turda mevcut toplamın altındaki eşikleri sessizce işaretle
    if (!seeded.current) {
      seeded.current = true
      let changed = false
      for (const m of MILESTONES) {
        if (weekSec >= m.sec && !set.has(m.sec)) {
          set.add(m.sec)
          changed = true
        }
      }
      if (changed) save(uid, weekId, set)
      return
    }

    // Sonraki turlarda: yeni aşılan en yüksek eşiği kutla
    let latest: Milestone | null = null
    let changed = false
    for (const m of MILESTONES) {
      if (weekSec >= m.sec && !set.has(m.sec)) {
        set.add(m.sec)
        changed = true
        latest = m
      }
    }
    if (changed) {
      save(uid, weekId, set)
      if (latest) {
        setAchievement(latest)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setAchievement(null), SHOW_MS)
      }
    }
  }, [uid, weekSec])

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    [],
  )

  return achievement
}
