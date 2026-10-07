import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import BlockHeader from '../nodes/BlockHeader'
import { GROUP_ICON, PALETTE_ITEMS, type BlockKind, type PaletteCategory } from '../nodes/types'
import type { CustomBlock } from './customBlocks'

export const DRAG_DATA_FORMAT = 'application/overflowengine-block'
export const CUSTOM_DRAG_PREFIX = 'custom:'

const DESCRIPTIONS_KEY = 'overflowengine.paletteDescriptions'
const COLLAPSED_KEY = 'overflowengine.paletteCollapsed'

const TABS: { key: PaletteCategory; label: string }[] = [
  { key: 'core', label: 'Core Blocks' },
  { key: 'agentic', label: 'Agentic Blocks' },
]

function loadShowDescriptions(): boolean {
  try {
    return localStorage.getItem(DESCRIPTIONS_KEY) !== 'off'
  } catch {
    return true
  }
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'on'
  } catch {
    return false
  }
}

interface PaletteProps {
  customBlocks: CustomBlock[]
  onDeleteCustomBlock: (id: string) => void
  onEditCustomBlock: (block: CustomBlock) => void
  editingBlockId?: string | null
}

export default function Palette({ customBlocks, onDeleteCustomBlock, onEditCustomBlock, editingBlockId }: PaletteProps) {
  const [showDescriptions, setShowDescriptions] = useState(loadShowDescriptions)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [tab, setTab] = useState<PaletteCategory>('core')

  const toggleDescriptions = () => {
    setShowDescriptions((prev) => {
      const next = !prev
      try {
        localStorage.setItem(DESCRIPTIONS_KEY, next ? 'on' : 'off')
      } catch {
        // ignore - purely a UI preference
      }
      return next
    })
  }

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? 'on' : 'off')
      } catch {
        // ignore - purely a UI preference
      }
      return next
    })
  }

  const onDragStart = (event: React.DragEvent, kind: BlockKind) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, kind)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragStartCustom = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, `${CUSTOM_DRAG_PREFIX}${id}`)
    event.dataTransfer.effectAllowed = 'move'
  }

  const items = PALETTE_ITEMS.filter((item) => item.category === tab)

  if (collapsed) {
    return (
      <aside className="flex w-7 shrink-0 flex-col items-center border-r border-gray-200 bg-gray-50 py-3 dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Show blocks"
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="palette-scroll w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Blocks</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleDescriptions}
            title={showDescriptions ? 'Hide descriptions' : 'Show descriptions'}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {showDescriptions ? 'Hide info' : 'Show info'}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Hide blocks"
            className="rounded border border-gray-300 p-1 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1 ${
              tab === t.key
                ? t.key === 'agentic'
                  ? 'bg-red-600 text-white'
                  : 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showDescriptions && (
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          {tab === 'agentic'
            ? 'Blocks that call out to an AI model.'
            : 'Drag a block onto the canvas.'}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.kind}
            draggable
            onDragStart={(e) => onDragStart(e, item.kind)}
            className={`cursor-grab rounded-lg border-2 px-3 py-2 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${item.color}`}
          >
            <BlockHeader icon={<item.icon className="h-3 w-3" />} badgeClassName={item.badgeClassName}>
              <span className="font-medium text-gray-800 dark:text-gray-100">{item.label}</span>
            </BlockHeader>
            {showDescriptions && (
              <div className="text-xs text-gray-500 dark:text-gray-400">{item.description}</div>
            )}
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-gray-700 dark:text-gray-200">My Blocks</h2>
      {customBlocks.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Select 2+ blocks on the canvas and click "Group Selected" to save a reusable chain here.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {customBlocks
          .filter((block) => block.id !== editingBlockId)
          .map((block) => (
            <div
              key={block.id}
              draggable
              onDragStart={(e) => onDragStartCustom(e, block.id)}
              className="group relative cursor-grab rounded-lg border-2 border-indigo-400 bg-indigo-50 px-3 py-2 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:border-indigo-700 dark:bg-indigo-950"
            >
              <BlockHeader icon={<GROUP_ICON className="h-3 w-3" />} badgeClassName="bg-indigo-600">
                <span className="font-medium text-gray-800 dark:text-gray-100">{block.label}</span>
              </BlockHeader>
              {showDescriptions && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {block.subgraph.nodes.length} blocks chained
                </div>
              )}
              <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                <button
                  type="button"
                  title="Edit this saved block"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditCustomBlock(block)
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-blue-100 hover:text-blue-600"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Delete saved block"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteCustomBlock(block.id)
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-red-100 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </aside>
  )
}
