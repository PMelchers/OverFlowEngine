import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEdges, useNodeId } from 'reactflow'
import { useQuickAdd } from './QuickAddContext'
import { PALETTE_ITEMS } from './types'

/**
 * The green "+" next to a block's output handle - click it to add and connect a new
 * block in one step, instead of dragging one in from the palette and then dragging a
 * connection to it by hand. Rendered by withQuickAdd (Canvas.tsx) as a sibling of the
 * node's own content, so it sits right where you'd otherwise start dragging an arrow.
 * Hidden once that output already has an outgoing edge - every eligible node type has
 * exactly one (unnamed) source handle, so "has any outgoing edge" means "fully connected".
 */
export default function QuickAddButton() {
  const nodeId = useNodeId()
  const quickAdd = useQuickAdd()
  const edges = useEdges()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  if (!nodeId) return null
  if (edges.some((e) => e.source === nodeId)) return null

  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.top ?? 0) - 4
  const left = (rect?.right ?? 0) + 8

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        title="Add a connected block"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="nodrag nopan absolute right-0 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 translate-x-9 items-center justify-center rounded-full border-2 border-white bg-green-500 text-white shadow-md transition-transform hover:scale-110 hover:bg-green-600 dark:border-gray-900"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
            <div
              style={{ top, left }}
              className="fixed z-[101] max-h-96 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800"
            >
              <p className="mb-1 px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Add a connected block
              </p>
              {PALETTE_ITEMS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => {
                    quickAdd(nodeId, item.kind)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-green-50 dark:text-gray-200 dark:hover:bg-green-950/40"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${item.badgeClassName}`}
                  >
                    <item.icon className="h-3 w-3" />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
