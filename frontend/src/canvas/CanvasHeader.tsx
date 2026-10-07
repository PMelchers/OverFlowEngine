import { Blocks, FolderOpen, Home, Layers, Pencil, Save, Store, Trash2, X, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AboutDropdown from '../AboutDropdown'
import type { AuthUser } from '../auth'
import { DRAG_DATA_FORMAT } from './Palette'
import type { CustomBlock } from './customBlocks'
import { TEMPLATE_DRAG_PREFIX, TEMPLATES, type WorkflowTemplate } from '../templates'

interface CanvasHeaderProps {
  editingBlock: CustomBlock | null
  onSaveEditedBlock: () => void
  onExitEditMode: () => void
  insertTemplate: (template: WorkflowTemplate) => void
  canGroup: boolean
  selectedCount: number
  onGroupSelected: () => void
  onWipeData: () => void
  onExitToDashboard?: () => void
  user: AuthUser | null
  onOpenFlowsPanel: () => void
  onOpenMarketplace?: () => void
  onOpenSettings?: (subPage?: 'connected-apps') => void
  onOpenAuthModal: () => void
}

export default function CanvasHeader({
  editingBlock,
  onSaveEditedBlock,
  onExitEditMode,
  insertTemplate,
  canGroup,
  selectedCount,
  onGroupSelected,
  onWipeData,
  onExitToDashboard,
  user,
  onOpenFlowsPanel,
  onOpenMarketplace,
  onOpenSettings,
  onOpenAuthModal,
}: CanvasHeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const logoRef = useRef<HTMLButtonElement>(null)
  const templatesButtonRef = useRef<HTMLButtonElement>(null)

  if (editingBlock) {
    return (
      <header className="flex items-center gap-4 border-b border-blue-300/60 bg-gradient-to-r from-blue-50 via-blue-50 to-red-50 px-5 py-2.5 shadow-sm dark:border-blue-800/60 dark:from-blue-950 dark:via-blue-950 dark:to-red-950">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Pencil className="h-4 w-4" />
          </div>
          <h1 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Editing <span className="font-bold">"{editingBlock.label}"</span>
          </h1>
        </div>
        <span className="flex-1 truncate text-xs text-blue-500 dark:text-blue-300">
          Edit the chain below like any other workflow, then save your changes back to this saved block.
        </span>
        <button
          type="button"
          onClick={onSaveEditedBlock}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow active:scale-[0.97]"
        >
          <Save className="h-4 w-4" /> Save Changes
        </button>
        <button
          type="button"
          onClick={onExitEditMode}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm transition-all duration-150 hover:bg-white active:scale-[0.97] dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
      </header>
    )
  }

  return (
    <header className="flex items-center gap-3 border-b border-gray-200/80 bg-white/95 px-5 py-2.5 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <button
        ref={logoRef}
        type="button"
        onClick={() => setAboutOpen((o) => !o)}
        className="flex shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-red-600 text-white shadow-sm">
          <Zap className="h-4 w-4" fill="currentColor" />
        </div>
        <h1 className="text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
          OverFlowEngine
        </h1>
      </button>
      {aboutOpen && <AboutDropdown anchorRef={logoRef} onClose={() => setAboutOpen(false)} />}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="relative">
          <button
            ref={templatesButtonRef}
            type="button"
            onClick={() => setTemplatesOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-100 hover:shadow active:scale-[0.97] dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            <Blocks className="h-4 w-4" /> Templates
          </button>
          {templatesOpen &&
            (() => {
              const rect = templatesButtonRef.current?.getBoundingClientRect()
              const top = (rect?.bottom ?? 0) + 8
              const right = rect ? window.innerWidth - rect.right : 16
              // Rendered through a portal straight into <body>, positioned with fixed
              // viewport coordinates from the button's own rect - anchoring it inside the
              // header instead let some ancestor's stacking context (backdrop-blur, or
              // React Flow's own internal z-index) trap it below the canvas pane, so drags
              // and even plain clicks landed on the pane underneath instead of the menu.
              return createPortal(
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setTemplatesOpen(false)} />
                  <div
                    style={{ top, right }}
                    className="fixed z-[101] w-80 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <p className="mb-1 px-2 pt-1 text-[11px] text-gray-400 dark:text-gray-500">
                      Click anywhere on a template to drop it into the canvas, or drag it to place it
                      exactly where you want.
                    </p>
                    {TEMPLATES.map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_DATA_FORMAT, TEMPLATE_DRAG_PREFIX + t.id)
                          // Close the dropdown (and its backdrop) the instant the drag starts -
                          // otherwise the backdrop still covers the canvas mid-drag and the drop
                          // never reaches it.
                          setTemplatesOpen(false)
                        }}
                        onClick={() => {
                          insertTemplate(t)
                          setTemplatesOpen(false)
                        }}
                        className="cursor-pointer rounded-lg p-2 transition-colors duration-100 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
                      </div>
                    ))}
                  </div>
                </>,
                document.body,
              )
            })()}
        </div>

        <button
          type="button"
          onClick={onGroupSelected}
          disabled={!canGroup}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 shadow-sm transition-all duration-150 hover:border-blue-300 hover:bg-blue-100 hover:shadow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          <Layers className="h-4 w-4" /> Group{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>

        <button
          type="button"
          onClick={onWipeData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 shadow-sm transition-all duration-150 hover:border-red-300 hover:bg-red-100 hover:shadow active:scale-[0.97] dark:border-red-900 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
        >
          <Trash2 className="h-4 w-4" /> Wipe Data
        </button>

        <div className="mx-0.5 h-6 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />

        {onExitToDashboard && (
          <button
            type="button"
            onClick={onExitToDashboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Home className="h-4 w-4" /> Dashboard
          </button>
        )}
        {user && (
          <button
            type="button"
            onClick={onOpenFlowsPanel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FolderOpen className="h-4 w-4" /> My Flows
          </button>
        )}
        {onOpenMarketplace && (
          <button
            type="button"
            onClick={onOpenMarketplace}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Store className="h-4 w-4" /> Marketplace
          </button>
        )}
        {user ? (
          <button
            type="button"
            onClick={() => onOpenSettings?.()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-red-500 text-[9px] font-bold text-white">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </span>
            {user.name || user.email}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow active:scale-[0.97]"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}
