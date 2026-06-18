'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthActions } from '@convex-dev/auth/react'

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard',       icon: '◈' },
  { href: '/catalog',   label: 'Catálogo',         icon: '▦' },
  { href: '/import',    label: 'Importador',       icon: '↓' },
  { href: '/planner',   label: 'Planner',          icon: '▦' },
  { href: '/review',    label: 'Cola de revisión', icon: '◐' },
  { href: '/analytics', label: 'Analytics',        icon: '↗' },
  { href: '/settings',  label: 'Settings',         icon: '⚙' },
]

function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuthActions()

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          SuperheroesInColor
        </p>
        <p className="text-xs text-gray-500 mt-0.5">CMS Editorial</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-2 py-4 border-t border-gray-700">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <span>↩</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
