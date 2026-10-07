import { Lock, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../shared/auth'
import Modal from '../shared/Modal'

/** Confirms the current password before revealing a sensitive settings page -
 *  a second, short-lived check on top of the normal login session. */
export default function ReauthGate({
  title,
  onSuccess,
  onCancel,
}: {
  title: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const { reauth } = useAuth()
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setChecking(true)
    try {
      await reauth(password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Modal onClose={onCancel} panelClassName="w-80 rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800" labelledBy="reauth-title">
      <form onSubmit={submit}>
        <div className="mb-3 flex items-center justify-between">
          <h2 id="reauth-title" className="flex items-center gap-1.5 text-base font-semibold text-gray-800 dark:text-gray-100">
            <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400" /> {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Confirm your password to continue - this area holds sensitive credentials.
        </p>
        <input
          type="password"
          required
          autoFocus
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={checking}
          className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {checking ? 'Checking...' : 'Continue'}
        </button>
      </form>
    </Modal>
  )
}
