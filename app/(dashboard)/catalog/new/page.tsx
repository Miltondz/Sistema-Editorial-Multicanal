'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ContentEditor } from '@/components/editor/ContentEditor'
import type { Id } from '@/convex/_generated/dataModel'

export default function NewItemPage() {
  const router = useRouter()

  function handleSaved(id: Id<'contentItems'>) {
    router.push(`/catalog/${id}`)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← Volver al catálogo
        </Link>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <ContentEditor mode="create" onSaved={handleSaved} />
      </div>
    </div>
  )
}
