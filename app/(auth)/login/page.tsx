'use client'
import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await signIn('password', { email, password, flow })
      if (flow === 'signUp') {
        setSuccess('Cuenta creada. Redirigiendo...')
      }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al autenticar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h1 className="text-center text-2xl font-bold text-gray-900">
            SuperheroesInColor
          </h1>
          <h2 className="text-center text-sm text-gray-600 mt-1">CMS Editorial</h2>
        </div>

        <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => { setFlow('signIn'); setError(null) }}
            className={`flex-1 py-2 font-medium transition-colors ${
              flow === 'signIn' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => { setFlow('signUp'); setError(null) }}
            className={`flex-1 py-2 font-medium transition-colors ${
              flow === 'signUp' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña {flow === 'signUp' && <span className="text-gray-400 font-normal">(mín. 8 caracteres)</span>}
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? (flow === 'signIn' ? 'Entrando...' : 'Creando cuenta...')
              : (flow === 'signIn' ? 'Iniciar sesión' : 'Crear cuenta')}
          </button>
        </form>
      </div>
    </div>
  )
}
