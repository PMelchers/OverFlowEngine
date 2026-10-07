import { Zap } from 'lucide-react'
import { type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Opened by clicking the app logo. Rendered through a portal straight into
 * <body>, positioned from the logo's own rect - anchoring it inline instead let
 * an ancestor's stacking context (backdrop-blur, React Flow's own z-index) trap
 * dropdowns below the canvas pane in an earlier bug; this sidesteps that entirely.
 */
export default function AboutDropdown({
  anchorRef,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.bottom ?? 0) + 8
  const left = rect?.left ?? 16

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        style={{ top, left }}
        className="fixed z-[101] w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-red-600 text-white shadow-sm">
            <Zap className="h-4 w-4" fill="currentColor" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-50">OverFlowEngine</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Visual agentic workflow builder</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Drag blocks onto a canvas to wire up triggers, AI agents, and real actions in other apps - no
          code required.
        </p>
      </div>
    </>,
    document.body,
  )
}
