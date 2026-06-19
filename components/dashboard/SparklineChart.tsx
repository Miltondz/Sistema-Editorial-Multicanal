'use client'

interface SparklineChartProps {
  data: number[]
  color: string
  width?: number
  height?: number
}

export function SparklineChart({ data, color, width = 80, height = 32 }: SparklineChartProps) {
  if (!data || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + ((1 - (v - min) / range) * (height - pad * 2))
    return `${x},${y}`
  })

  const pathD = `M ${points.join(' L ')}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <path d={pathD} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
