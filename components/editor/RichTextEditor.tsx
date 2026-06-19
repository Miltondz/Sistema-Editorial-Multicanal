'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useEffect, useCallback } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading:         false,
        codeBlock:       false,
        code:            false,
        blockquote:      false,
        horizontalRule:  false,
        bulletList:      false,
        orderedList:     false,
        listItem:        false,
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-indigo-600 underline' } }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'min-h-[80px] px-3 py-2 focus:outline-none prose prose-sm max-w-none text-gray-800 [&_p]:my-1 [&_strong]:font-bold [&_em]:italic [&_a]:text-indigo-600 [&_a]:underline',
      },
    },
  })

  // Sync when value changes externally (after AI generation)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value && value !== undefined) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL del enlace:', prev ?? '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }, [editor])

  if (!editor) return null

  const btnBase = 'w-7 h-7 rounded text-sm font-medium transition-colors flex items-center justify-center'
  const btnActive = 'bg-indigo-600 text-white'
  const btnInactive = 'text-gray-700 hover:bg-gray-200'

  return (
    <div className="border border-gray-300 rounded overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
        <button
          type="button"
          title="Negrita (Ctrl+B)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className={`${btnBase} font-bold ${editor.isActive('bold') ? btnActive : btnInactive}`}
        >
          B
        </button>
        <button
          type="button"
          title="Cursiva (Ctrl+I)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          className={`${btnBase} italic ${editor.isActive('italic') ? btnActive : btnInactive}`}
        >
          I
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          title="Insertar enlace"
          onMouseDown={e => { e.preventDefault(); setLink() }}
          className={`px-2 h-7 rounded text-xs font-medium transition-colors ${editor.isActive('link') ? btnActive : btnInactive}`}
        >
          Link
        </button>
        {editor.isActive('link') && (
          <button
            type="button"
            title="Quitar enlace"
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetLink().run() }}
            className={`px-2 h-7 rounded text-xs font-medium transition-colors ${btnInactive}`}
          >
            ✕ Link
          </button>
        )}
        <span className="ml-auto text-[10px] text-gray-400 select-none pr-1">máx 3 párrafos</span>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  )
}
