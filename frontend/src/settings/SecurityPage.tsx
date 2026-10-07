import { ArrowLeft, Check, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth'

export default function SecurityPage({ onBack }: { onBack: () => void }) {
  const { changePassword } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Settings
        </button>
        <h1 className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
          <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Security
        </h1>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Password</h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Change the password you use to sign in.
          </p>
          <form onSubmit={savePassword} className="mt-4 space-y-3">
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              Current password
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              New password
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="block text-sm text-gray-600 dark:text-gray-300">
              Confirm new password
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {saved && !error && (
              <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Password changed
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
