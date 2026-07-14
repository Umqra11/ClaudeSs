import { useEffect, useMemo, useRef, useState } from 'react'
import { formatWeekTotal } from '../lib/format'
import { getDayId, getWeekId } from '../lib/week'
import { activeSessionByDay, getStats, isSessionRunning } from '../lib/stats'
import type { UserProfile } from '../services/db'

interface ProfileProps {
  user: UserProfile
}

const DAY_MS = 86_400_000
const CHART_DAYS = 14

const dayLabelFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'short',
})

/** dayId ("2026-07-03") → o günün öğle anı (TZ güvenli etiketleme için). */
function dayIdToDate(dayId: string): Date {
  return new Date(`${dayId}T12:00:00+03:00`)
}

function dayLabel(dayId: string): string {
  return dayLabelFmt.format(dayIdToDate(dayId))
}

interface DayPoint {
  dayId: string
  sec: number
}

// ---- Çizgi grafik (tek seri: günlük çalışma saati) ----
// Tasarım sistemi renkleri; tek seri olduğu için legend yok, yalnızca
// tepe nokta etiketlenir; dokununca/nüzerine gelince tooltip çıkar.

const W = 320
const H = 150
const PAD_L = 30
const PAD_R = 10
const PAD_T = 22
const PAD_B = 22

function LineChart({ points }: { points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const maxSec = Math.max(...points.map((p) => p.sec), 3600) // en az 1 saat ölçek
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const x = (i: number) => PAD_L + (i / (points.length - 1)) * innerW
  const y = (sec: number) => PAD_T + innerH - (sec / maxSec) * innerH

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.sec).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${x(points.length - 1).toFixed(1)},${(PAD_T + innerH).toFixed(1)} L${PAD_L},${(PAD_T + innerH).toFixed(1)} Z`

  // Tepe nokta (seçici doğrudan etiket): en yüksek değerli gün
  let peakIdx = 0
  points.forEach((p, i) => {
    if (p.sec > points[peakIdx].sec) peakIdx = i
  })
  const hasData = points.some((p) => p.sec > 0)

  function onMove(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD_L) / innerW) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  const gridYs = [0.5, 1] // %50 ve %100 çizgileri (çekinik)
  const maxHours = maxSec / 3600
  const yTickLabel =
    maxHours >= 2 ? `${Math.round(maxHours)}s` : `${Math.round(maxHours * 60)}dk`

  const tip = hover != null ? points[hover] : null

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="day-chart"
        role="img"
        aria-label="Son 14 günün günlük çalışma süreleri"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {/* çekinik grid */}
        {gridYs.map((g) => (
          <line
            key={g}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + innerH - g * innerH}
            y2={PAD_T + innerH - g * innerH}
            className="chart-grid"
          />
        ))}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + innerH}
          y2={PAD_T + innerH}
          className="chart-axis"
        />

        {/* y ekseni uçları */}
        <text x={PAD_L - 6} y={PAD_T + innerH + 3} className="chart-tick" textAnchor="end">
          0
        </text>
        <text x={PAD_L - 6} y={PAD_T + 3} className="chart-tick" textAnchor="end">
          {yTickLabel}
        </text>

        {/* x ekseni: ilk / orta / son gün */}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            className="chart-tick"
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
          >
            {dayLabel(points[i].dayId)}
          </text>
        ))}

        {hasData && (
          <>
            <path d={area} className="chart-area" />
            <path d={path} className="chart-line" />
            {/* tepe nokta: işaret + seçici etiket */}
            {points[peakIdx].sec > 0 && (
              <>
                <circle cx={x(peakIdx)} cy={y(points[peakIdx].sec)} r={4} className="chart-dot" />
                <text
                  x={x(peakIdx)}
                  y={y(points[peakIdx].sec) - 8}
                  className="chart-peak-label"
                  textAnchor="middle"
                >
                  {formatWeekTotal(points[peakIdx].sec)}
                </text>
              </>
            )}
          </>
        )}

        {/* hover/dokunma katmanı */}
        {tip && (
          <>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD_T}
              y2={PAD_T + innerH}
              className="chart-crosshair"
            />
            <circle cx={x(hover!)} cy={y(tip.sec)} r={4.5} className="chart-dot chart-dot-hover" />
          </>
        )}
      </svg>
      <p className="chart-tip" aria-live="polite">
        {tip
          ? `${dayLabel(tip.dayId)} · ${tip.sec > 0 ? formatWeekTotal(tip.sec) : 'çalışma yok'}`
          : hasData
            ? 'Bir güne dokun: ayrıntıyı gör'
            : 'Henüz kayıt yok — kronometreyi durdurunca günler burada birikir'}
      </p>
    </div>
  )
}

export default function Profile({ user }: ProfileProps) {
  const stats = getStats(user)

  // Aktif seans koşuyorsa toplamlar canlı aksın diye saniyelik tick
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!isSessionRunning(user.uid)) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [user.uid])

  const { chartPoints, weekRows, todaySec, daysThisWeekSec } = useMemo(() => {
    const now = Date.now()
    const todayId = getDayId()
    const currentWeekId = getWeekId()

    // Son 14 gün (bugün dahil), eksik günler 0
    const chartPoints: DayPoint[] = []
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const dayId = getDayId(new Date(now - i * DAY_MS))
      chartPoints.push({ dayId, sec: stats.days[dayId] ?? 0 })
    }

    // Haftalık toplamlar: tüm kayıtlı günleri hafta anahtarına grupla
    const byWeek = new Map<string, number>()
    for (const [dayId, sec] of Object.entries(stats.days)) {
      const weekId = getWeekId(dayIdToDate(dayId))
      byWeek.set(weekId, (byWeek.get(weekId) ?? 0) + sec)
    }
    const weekRows = [...byWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 8)

    return {
      chartPoints,
      weekRows,
      todaySec: stats.days[todayId] ?? 0,
      daysThisWeekSec: byWeek.get(currentWeekId) ?? 0,
    }
  }, [stats, stats.days, stats.allTimeSec])

  // --- Canlı görünüm değerleri ---
  // Aktif (koşan/duraklatılmış) seans henüz güne işlenmedi; GÜN-BAZLI
  // dağıtılarak canlı gösterilir — gece yarısını kesen seansta 00:00
  // öncesi önceki günde kalır, "Bugün" yalnızca sonrası payı gösterir.
  // Ayrıca günlük takip sonradan eklendiği için bu haftanın kayıtlı
  // haftalık toplamı günlerden büyükse aradaki fark (eski süreler)
  // tüm zamanlara ve bu haftaya eklenir — gösterim düzeyinde.
  const activeByDay = activeSessionByDay(user.uid)
  let activeSec = 0
  for (const sec of Object.values(activeByDay)) activeSec += sec
  activeSec = Math.floor(activeSec)
  const todayId = getDayId()
  const activeTodaySec = Math.floor(activeByDay[todayId] ?? 0)
  const currentWeekIdNow = getWeekId()
  let activeThisWeekSec = 0
  for (const [dayId, sec] of Object.entries(activeByDay)) {
    if (getWeekId(dayIdToDate(dayId)) === currentWeekIdNow) {
      activeThisWeekSec += sec
    }
  }
  activeThisWeekSec = Math.floor(activeThisWeekSec)

  // Tümü days-türevi: weekTotalSec alanına (bayat/eski-bozuk-dönem verisi
  // taşıyabilir) güvenilmez — Scoreboard ile bire bir tutarlı.
  const displayAllTime = stats.allTimeSec + activeSec
  const displayThisWeek = daysThisWeekSec + activeThisWeekSec
  const displayToday = todaySec + activeTodaySec

  // Grafik + günlük listede HER günün noktası kendi aktif payını içerir
  const livePoints = chartPoints.map((p) =>
    activeByDay[p.dayId]
      ? { ...p, sec: p.sec + Math.floor(activeByDay[p.dayId]) }
      : p,
  )

  // Günlük liste: son 7 gün, yeniden eskiye
  const dailyRows = [...livePoints].slice(-7).reverse()

  return (
    <main className="page profile-page">
      <header>
        <h1 className="page-title">{user.name}</h1>
      </header>

      <div className="stat-tiles">
        <div className="stat-tile stat-tile-hero">
          <span className="stat-label">Tüm zamanlar</span>
          <span className="stat-value">{formatWeekTotal(displayAllTime)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Bu hafta</span>
          <span className="stat-value">{formatWeekTotal(displayThisWeek)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Bugün</span>
          <span className="stat-value">{formatWeekTotal(displayToday)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Şampiyonluk</span>
          <span className="stat-value">🏆 {user.championshipCount ?? 0}</span>
        </div>
      </div>

      <section className="profile-section">
        <h2 className="section-title">Son 14 gün</h2>
        <LineChart points={livePoints} />
      </section>

      <section className="profile-section">
        <h2 className="section-title">Günlük</h2>
        <div className="history-list">
          {dailyRows.map((d) => (
            <div key={d.dayId} className="history-row">
              <span className="history-label">{dayLabel(d.dayId)}</span>
              <span className="history-value">
                {d.sec > 0 ? formatWeekTotal(d.sec) : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {weekRows.length > 0 && (
        <section className="profile-section">
          <h2 className="section-title">Haftalık</h2>
          <div className="history-list">
            {weekRows.map(([weekId, sec]) => (
              <div key={weekId} className="history-row">
                <span className="history-label">{dayLabel(weekId)} haftası</span>
                <span className="history-value">{formatWeekTotal(sec)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="reset-note profile-note">
        Aktif seans toplamlara canlı yansır; kalıcı kayıt kronometre
        durdurulunca güne işlenir.
      </p>
    </main>
  )
}
