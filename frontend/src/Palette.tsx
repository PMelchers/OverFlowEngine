import { useState } from 'react'
import BlockHeader from './nodes/BlockHeader'
import { PALETTE_ITEMS, type BlockKind, type PaletteCategory } from './nodes/types'
import type { CustomBlock } from './customBlocks'

export const DRAG_DATA_FORMAT = 'application/overflowengine-block'
export const CUSTOM_DRAG_PREFIX = 'custom:'

const DESCRIPTIONS_KEY = 'overflowengine.paletteDescriptions'

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

interface PaletteProps {
  customBlocks: CustomBlock[]
  onDeleteCustomBlock: (id: string) => void
  onEditCustomBlock: (block: CustomBlock) => void
  editingBlockId?: string | null
}

export default function Palette({ customBlocks, onDeleteCustomBlock, onEditCustomBlock, editingBlockId }: PaletteProps) {
  const [showDescriptions, setShowDescriptions] = useState(loadShowDescriptions)
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

  const onDragStart = (event: React.DragEvent, kind: BlockKind) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, kind)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDragStartCustom = (event: React.DragEvent, id: string) => {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, `${CUSTOM_DRAG_PREFIX}${id}`)
    event.dataTransfer.effectAllowed = 'move'
  }

  const items = PALETTE_ITEMS.filter((item) => item.category === tab)

  return (
    <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Blocks</h2>
        <button
          type="button"
          onClick={toggleDescriptions}
          title={showDescriptions ? 'Hide descriptions' : 'Show descriptions'}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          {showDescriptions ? 'Hide info' : 'Show info'}
        </button>
      </div>

      <div className="mb-3 flex overflow-hidden rounded border border-gray-300 text-xs font-semibold">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1 ${
              tab === t.key
                ? t.key === 'agentic'
                  ? 'bg-fuchsia-600 text-white'
                  : 'bg-gray-700 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showDescriptions && (
        <p className="mb-3 text-xs text-gray-400">
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
            <BlockHeader icon={item.icon} badgeClassName={item.badgeClassName}>
              <span className="font-medium text-gray-800">{item.label}</span>
            </BlockHeader>
            {showDescriptions && <div className="text-xs text-gray-500">{item.description}</div>}
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-5 text-sm font-semibold text-gray-700">My Blocks</h2>
      {customBlocks.length === 0 && (
        <p className="text-xs text-gray-400">
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
              className="group relative cursor-grab rounded-lg border-2 border-indigo-400 bg-indigo-50 px-3 py-2 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
            >
              <BlockHeader icon="⬡" badgeClassName="bg-indigo-600">
                <span className="font-medium text-gray-800">{block.label}</span>
              </BlockHeader>
              {showDescriptions && (
                <div className="text-xs text-gray-500">{block.subgraph.nodes.length} blocks chained</div>
              )}
              <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                <button
                  type="button"
                  title="Edit this saved block"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditCustomBlock(block)
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-indigo-100 hover:text-indigo-600"
                >
                  ✎
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
                  ×
                </button>
              </div>
            </div>
          ))}
      </div>
    </aside>
  )
}
