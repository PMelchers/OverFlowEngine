import { useState } from 'react'
import { useAuth } from './auth'

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-80 rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800"
      >
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-gray-100">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h2>

        <label className="mb-2 block text-sm text-gray-600 dark:text-gray-300">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="mb-3 block text-sm text-gray-600 dark:text-gray-300">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => {
              setError(null)
              setMode(mode === 'login' ? 'register' : 'login')
            }}
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </form>
    </div>
  )
}
