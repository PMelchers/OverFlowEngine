import { Download, FileDown, X } from 'lucide-react'

export interface TripPdf {
  filename: string
  base64: string
}

function downloadPdf(pdf: TripPdf) {
  const bytes = atob(pdf.base64)
  const array = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i)
  const blob = new Blob([array], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = pdf.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Renders a "Trip Summary PDF" block's result as a download card instead of leaving the
 *  file stuck as a base64 string in the console - shown in the sidebar once a run produces
 *  a `pdf` step. */
export default function TripPdfCard({ pdf, onClose }: { pdf: TripPdf; onClose: () => void }) {
  return (
    <div className="mb-3 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          <FileDown className="h-3.5 w-3.5" /> Trip PDF
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="truncate text-xs text-slate-600 dark:text-slate-400" title={pdf.filename}>
          {pdf.filename}
        </span>
        <button
          type="button"
          onClick={() => downloadPdf(pdf)}
          className="ml-2 flex shrink-0 items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500"
        >
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>
    </div>
  )
}
