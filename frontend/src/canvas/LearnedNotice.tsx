import { Sparkles, X } from 'lucide-react'

/** Shown after a run when the profile learned something from it. Only appears while learning
 *  is on; the full list lives on the My profile page. */
export default function LearnedNotice({ notes, onClose }: { notes: string[]; onClose: () => void }) {
  return (
    <div
      role="status"
      aria-label="Learned from this run"
      className="fixed bottom-6 left-6 z-40 w-80 rounded-xl border border-sky-200 bg-white p-4 shadow-xl dark:border-sky-800 dark:bg-gray-800"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Learned from this run
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mb-2 list-disc space-y-0.5 pl-5 text-xs text-gray-600 dark:text-gray-300">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        See everything on My profile. Turn learning off there at any time.
      </p>
    </div>
  )
}
