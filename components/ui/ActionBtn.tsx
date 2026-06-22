'use client'
import { useState } from 'react'

export const ACTION_VARIANTS = {
  green:      'bg-green-600 hover:bg-green-700 text-white',
  amber:      'bg-amber-500 hover:bg-amber-600 text-white',
  red:        'bg-red-600 hover:bg-red-700 text-white',
  ghost:      'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200',
  'red-ghost':'bg-white hover:bg-red-50 text-red-600 border border-red-200',
} as const

export function ActionBtn({ onClick, disabled, variant, icon, full, children }: {
  onClick: () => void
  disabled?: boolean
  variant: keyof typeof ACTION_VARIANTS
  icon: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors ${ACTION_VARIANTS[variant]} ${full ? 'w-full justify-start' : ''}`}
    >
      <span>{icon}</span>
      <span>{children}</span>
    </button>
  )
}

/** Drop-in delete button: first click shows confirm, second executes, blur resets. */
export function DeleteBtn({ onDelete, label = 'Eliminar', full }: {
  onDelete: () => void
  label?: string
  full?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <div className={`flex gap-2 ${full ? 'w-full' : ''}`}>
      <ActionBtn onClick={() => { setConfirming(false); onDelete() }} variant="red" icon="✓" full={full}>
        Confirmar
      </ActionBtn>
      <ActionBtn onClick={() => setConfirming(false)} variant="ghost" icon="✕" full={full}>
        Cancelar
      </ActionBtn>
    </div>
  ) : (
    <ActionBtn onClick={() => setConfirming(true)} variant="red-ghost" icon="🗑" full={full}>
      {label}
    </ActionBtn>
  )
}
