import Link from 'next/link'

export default function ContentPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Contenido</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestión de biblioteca de contenido editorial.</p>
      </div>
      <div className="bg-white rounded-2xl border border-[#E5EAF2] p-16 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Vista de biblioteca</h2>
        <p className="text-sm text-gray-500 max-w-md mb-6">
          Esta sección mostrará una vista alternativa del catálogo con filtros avanzados y agrupación por colecciones. Por ahora usa el Catálogo.
        </p>
        <Link
          href="/catalog"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Ir al Catálogo →
        </Link>
      </div>
    </div>
  )
}
