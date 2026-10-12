import { Star, X } from 'lucide-react'
import { useState } from 'react'

/** Small pop-up shown after a run that produced an AI reply. Stars are required; a comment is optional.
 *  Saved to the signed-in user's profile only - nothing is sent anywhere else. */
export default function RatingPrompt({
  label,
  reply,
  authedFetch,
  onClose,
}: {
  label: string
  reply: string
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
  onClose: () => void
}) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const send = async () => {
    if (rating === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await authedFetch('/profile/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result_type: label, rating, text: comment.trim() || null }),
      })
      if (!res.ok) throw new Error('Could not save your rating')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating')
    } finally {
      setSaving(false)
    }
  }

  const shown = hover || rating

  return (
    <div
      role="dialog"
      aria-label="Rate this response"
      className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">How good was this response?</p>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          aria-label="Skip"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
        {label}: "{reply}"
      </p>

      <div className="mb-3 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setRating(n)
              setShowComment(true)
            }}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            className="p-0.5"
          >
            <Star
              className={`h-6 w-6 ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
            />
          </button>
        ))}
      </div>

      {showComment && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Want to say more? (optional)"
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      )}

      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={send}
          disabled={rating === 0 || saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
