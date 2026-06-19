'use client'
import Link from 'next/link'

const MOCK_RECOMMENDATIONS = [
  {
    title: 'Milestone Comics Spotlight',
    desc: 'Alta relevancia y baja frecuencia reciente.',
    score: 92,
    color: '#6366F1',
  },
  {
    title: 'Aniversario: Kamala Khan',
    desc: 'Hoy es un buen día para publicar.',
    score: 88,
    color: '#22C55E',
  },
  {
    title: 'Villanos infravalorados',
    desc: 'Tendencia en crecimiento en X.',
    score: 76,
    color: '#F59E0B',
  },
]

function scoreBadge(score: number) {
  const cls = score >= 90 ? 'bg-indigo-100 text-indigo-700' : score >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{score}</span>
  )
}

export function AIInsightsPanel() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAF2] p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-base font-semibold text-slate-900">Recomendado por IA</span>
        </div>
        <Link href="/catalog" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Ver todos →</Link>
      </div>

      <div className="relative">
        <div className="space-y-3">
          {MOCK_RECOMMENDATIONS.map((rec, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {/* Thumbnail */}
              <div
                className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                style={{ background: rec.color + '20' }}
              >
                <div className="w-5 h-5 rounded-lg" style={{ background: rec.color }} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{rec.title}</p>
                <p className="text-xs text-slate-400 truncate">{rec.desc}</p>
              </div>

              {scoreBadge(rec.score)}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-xl">
          <span
            className="text-slate-400 font-bold tracking-widest uppercase select-none"
            style={{ fontSize: 20, transform: 'rotate(-35deg)', whiteSpace: 'nowrap', opacity: 0.4 }}
          >
            PRÓXIMAMENTE
          </span>
        </div>
      </div>
    </div>
  )
}
