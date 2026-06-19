'use client'
import { useEffect, useState } from 'react'

const MESSAGES: Record<string, string[]> = {
  search: [
    'Buscando en la web...',
    'Consultando League of Comic Geeks...',
    'Verificando créditos de creadores...',
    'Revisando bases de datos de cómics...',
    'Consultando Marvel Wiki y DC Wiki...',
    'Analizando representación...',
    'Cotejando fuentes...',
    'Extrayendo datos relevantes...',
    'Casi listo...',
  ],
  generate: [
    'Consultando con la IA...',
    'Buscando información del título...',
    'Aplicando tono editorial...',
    'Nombrando creadores por nombre...',
    'Revisando estilo y tono...',
    'Construyendo la variante...',
    'Puliendo el texto...',
    'Casi listo...',
  ],
  extract: [
    'Leyendo el post original...',
    'Identificando campos clave...',
    'Extrayendo título y creadores...',
    'Clasificando tags de representación...',
    'Analizando contexto...',
    'Preparando propuesta...',
  ],
}

interface AILoadingSpinnerProps {
  model?: string
  type?: keyof typeof MESSAGES
  className?: string
}

export function AILoadingSpinner({
  model,
  type = 'search',
  className = '',
}: AILoadingSpinnerProps) {
  const msgs = MESSAGES[type] ?? MESSAGES.search
  const [idx, setIdx] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setIdx(i => (i + 1) % msgs.length)
    }, 1800)
    return () => clearInterval(msgTimer)
  }, [msgs.length])

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'))
    }, 400)
    return () => clearInterval(dotTimer)
  }, [])

  const displayMsg = msgs[idx].replace(/\.\.\.$/, '')

  return (
    <div className={`flex flex-col items-center gap-3 py-6 select-none ${className}`}>
      {/* Spinner */}
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-gray-600 font-medium min-h-[1.25rem] text-center">
        {displayMsg}<span className="inline-block w-6 text-left">{dots}</span>
      </p>

      {/* Model badge */}
      {model && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          {model}
        </span>
      )}
    </div>
  )
}
