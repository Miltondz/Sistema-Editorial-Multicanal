'use client'

interface GaugeChartProps {
  value: number
  max: number
  label: string
}

export function GaugeChart({ value, max, label }: GaugeChartProps) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const color = pct > 0.9 ? '#EF4444' : pct > 0.8 ? '#F59E0B' : '#22C55E'

  // SVG: semicircle. Center=(100,100), r=70
  // Arc from 180° to 0° (left to right across bottom half)
  const cx = 100
  const cy = 100
  const r = 70
  const startAngle = Math.PI      // 180°
  const endAngle   = 0            // 0°
  const arcAngle   = startAngle - endAngle  // π radians = 180°

  function polar(angle: number) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy - r * Math.sin(angle),
    }
  }

  const bgStart = polar(startAngle)
  const bgEnd   = polar(endAngle)
  const fgEnd   = polar(startAngle - pct * arcAngle)

  const bgPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${bgEnd.x} ${bgEnd.y}`

  let fgPath = ''
  if (pct > 0) {
    const largeArc = pct > 0.5 ? 1 : 0
    fgPath = `M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${largeArc} 1 ${fgEnd.x} ${fgEnd.y}`
  }

  const pctDisplay = Math.round(pct * 100)

  return (
    <svg viewBox="0 0 200 120" className="w-full" style={{ maxWidth: 200 }}>
      {/* Background arc */}
      <path d={bgPath} fill="none" stroke="#E2E8F0" strokeWidth="14" strokeLinecap="round" />
      {/* Foreground arc */}
      {pct > 0 && (
        <path d={fgPath} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      {/* Value */}
      <text x="100" y="88" textAnchor="middle" className="font-bold" style={{ fontSize: 26, fill: '#0F172A', fontWeight: 700 }}>
        {value}
      </text>
      <text x="100" y="105" textAnchor="middle" style={{ fontSize: 11, fill: '#64748B' }}>
        {label}
      </text>
      <text x="100" y="118" textAnchor="middle" style={{ fontSize: 10, fill: color, fontWeight: 600 }}>
        {pctDisplay}%
      </text>
    </svg>
  )
}
