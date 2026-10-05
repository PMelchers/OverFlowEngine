import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  MarkerType,
  type Node,
  type OnSelectionChangeParams,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { type AlignmentGuides } from '../alignment'
import AuthModal from '../AuthModal'
import { useAuth } from '../auth'
import CanvasHeader from './CanvasHeader'
import CanvasSidebar from './CanvasSidebar'
import { nodeTypes } from './canvasGraph'
import FlowsPanel from '../FlowsPanel'
import GroupNameModal from '../GroupNameModal'
import { QuickAddContext } from '../nodes/QuickAddContext'
import {
  CALENDAR_PROVIDER_TO_APP,
  type BlockDataPatch,
  type BlockNodeData,
  type VariableBlockData,
  type VariableType,
} from '../nodes/types'
import Palette from '../Palette'
import { useTheme } from '../theme'
import { useBlockCreation } from './useBlockCreation'
import { useCustomBlockEditing } from './useCustomBlockEditing'
import { useFlowPersistence } from './useFlowPersistence'
import { useWorkflowRun } from './useWorkflowRun'

/** Dashed lines shown while dragging a block that lines up with another block's edge/center. */
function AlignmentGuideLines({ guides }: { guides: AlignmentGuides }) {
  const { x: vx, y: vy, zoom } = useViewport()
  return (
    <>
      {guides.x !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: guides.x * zoom + vx,
            top: 0,
            bottom: 0,
            width: 0,
            borderLeft: '1px dashed #2563eb',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
      {guides.y !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: guides.y * zoom + vy,
            left: 0,
            right: 0,
            height: 0,
            borderTop: '1px dashed #2563eb',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        />
      )}
    </>
  )
}

interface CanvasProps {
  /** Flow to load into a fresh canvas on mount, e.g. when opened from the dashboard's flow list. */
  initialFlowId?: number | null
  /** Template to drop onto a fresh canvas on mount, e.g. from one of the dashboard's quick-start chips. */
  initialTemplateId?: string | null
  onExitToDashboard?: () => void
  onOpenSettings?: (subPage?: 'connected-apps') => void
  onOpenMarketplace?: () => void
}

function CanvasInner({
  initialFlowId = null,
  initialTemplateId = null,
  onExitToDashboard,
  onOpenSettings,
  onOpenMarketplace,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [flowsPanelOpen, setFlowsPanelOpen] = useState(false)
  const [appConnections, setAppConnections] = useState<Record<string, boolean>>({})
  const { user, authedFetch } = useAuth()
  const { theme } = useTheme()
  const { screenToFlowPosition, fitView, zoomTo, getZoom } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Smooth, rounded connector lines with a matching arrowhead instead of React Flow's
  // thin default bezier - recomputed only when the theme flips so the color stays readable.
  const defaultEdgeOptions = useMemo<DefaultEdgeOptions>(() => {
    const stroke = theme === 'dark' ? '#93c5fd' : '#2563eb'
    return {
      type: 'smoothstep',
      pathOptions: { borderRadius: 16 },
      style: { stroke, strokeWidth: 2.5 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: stroke },
    }
  }, [theme])

  const nodesRef = useRef<Node<BlockNodeData>[]>([])
  const edgesRef = useRef<Edge[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams) => {
    setSelectedIds(new Set(selected.map((n) => n.id)))
  }, [])

  const updateNodeData = useCallback(
    (id: string, patch: BlockDataPatch) => {
      // patch is always produced by that same node's own onChange (wired 1:1 per node
      // below), so it always matches n.data's actual kind - but this function is kind-
      // agnostic infrastructure serving every kind, so TS can't verify that pairing here.
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } as BlockNodeData } : n)),
      )
    },
    [setNodes],
  )

  const { logs, setLogs, costSummary, setCostSummary, tripPdf, setTripPdf, variables, pendingChoice, addLog, runWorkflow, resolveChoice, wipeData } =
    useWorkflowRun({ nodesRef, edgesRef, setNodes, updateNodeData, authedFetch })

  // Which real apps are actually connected (right now, only Google/Microsoft Calendar
  // have an OAuth flow - everything else in APP_TRIGGER_SOURCES stays unconnected until
  // it gets one). Missing keys just read as "not connected" wherever this is consumed.
  // Also handed to nodes (as onAppConnected) so the in-canvas connect modal can ask for
  // a refresh the moment its popup finishes, instead of waiting for the next canvas visit.
  const refreshAppConnections = useCallback(() => {
    authedFetch('/calendar/connections')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { provider: string; connected: boolean }[]) => {
        const map: Record<string, boolean> = {}
        for (const c of list) {
          const app = CALENDAR_PROVIDER_TO_APP[c.provider]
          if (app) map[app] = c.connected
        }
        setAppConnections(map)
      })
      .catch(() => {})
  }, [authedFetch])

  useEffect(() => {
    refreshAppConnections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const appConnectionsRef = useRef(appConnections)
  useEffect(() => {
    appConnectionsRef.current = appConnections
  }, [appConnections])

  // Stable identity (unlike onOpenSettings itself, which App.tsx recreates every render)
  // so it's safe to hand straight to nodes without churning their data on every render.
  const onOpenSettingsRef = useRef(onOpenSettings)
  useEffect(() => {
    onOpenSettingsRef.current = onOpenSettings
  }, [onOpenSettings])
  const openConnectedApps = useCallback(() => onOpenSettingsRef.current?.('connected-apps'), [])

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.data.kind === 'appTrigger' || n.data.kind === 'appAction'
          ? { ...n, data: { ...n.data, appConnections, onOpenSettings: openConnectedApps, onAppConnected: refreshAppConnections } }
          : n,
      ),
    )
  }, [appConnections, openConnectedApps, refreshAppConnections, setNodes])

  // Variables the If block can offer as a pick-list, so people don't have to retype an
  // exact name from memory. Sourced from both Variable blocks currently on the canvas
  // AND variables already saved in the backend (so a variable a prior run saved is
  // still recognized even if its block was later deleted or the page was reloaded).
  // Reduced to stable string keys so this only recomputes when the underlying set of
  // names/types actually changes - not on every unrelated node/data edit.
  const canvasVariableKey = nodes
    .filter((n): n is Node<VariableBlockData> => n.data.kind === 'variable')
    .map((n) => `${n.data.label}:${n.data.varType ?? 'string'}`)
    .join('|')
  const savedVariableKey = Object.entries(variables)
    .map(([name, v]) => `${name}:${v.type}`)
    .join('|')

  const availableVariables = useMemo(() => {
    const merged = new Map<string, VariableType>()
    for (const entry of savedVariableKey ? savedVariableKey.split('|') : []) {
      const [name, varType] = entry.split(':')
      merged.set(name, (varType as VariableType) || 'string')
    }
    // Canvas blocks win over saved state: they reflect the latest, possibly-unsaved edit.
    for (const entry of canvasVariableKey ? canvasVariableKey.split('|') : []) {
      const [name, varType] = entry.split(':')
      merged.set(name, (varType as VariableType) || 'string')
    }
    return Array.from(merged.entries()).map(([name, varType]) => ({ name, varType }))
  }, [canvasVariableKey, savedVariableKey])

  // So a brand-new If block can be seeded with the current variable list immediately
  // on creation, instead of waiting for availableVariables to next change (which,
  // if the variable set was already stable, might never happen).
  const availableVariablesRef = useRef(availableVariables)
  useEffect(() => {
    availableVariablesRef.current = availableVariables
  }, [availableVariables])

  // nodeTypes must stay referentially stable - React Flow remounts every node
  // (breaking focus/clicks mid-edit) whenever this object's identity changes.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.data?.kind === 'if' ||
        n.data?.kind === 'ifOne' ||
        n.data?.kind === 'log' ||
        n.data?.kind === 'task' ||
        n.data?.kind === 'appAction' ||
        n.data?.kind === 'mapsAction' ||
        n.data?.kind === 'activitySuggestion' ||
        n.data?.kind === 'costEstimate' ||
        n.data?.kind === 'tripSummary' ||
        n.type === 'if' ||
        n.type === 'ifOne' ||
        n.type === 'log' ||
        n.type === 'task' ||
        n.type === 'appAction' ||
        n.type === 'mapsAction' ||
        n.type === 'activitySuggestion' ||
        n.type === 'costEstimate' ||
        n.type === 'tripSummary'
          ? { ...n, data: { ...n.data, availableVariables } }
          : n,
      ),
    )
  }, [availableVariables, setNodes])

  const { customBlocks, editingBlock, addCustomBlock, removeCustomBlock, startEditingBlock, exitEditMode, saveEditedBlock } =
    useCustomBlockEditing({
      nodesRef,
      edgesRef,
      setNodes,
      setEdges,
      setSelectedIds,
      updateNodeData,
      runWorkflow,
      availableVariablesRef,
      appConnectionsRef,
      openConnectedApps,
      refreshAppConnections,
      fitView,
      addLog,
    })

  const {
    alignGuides,
    pendingGroup,
    setPendingGroup,
    quickAddBlock,
    insertTemplate,
    onDragOver,
    onDrop,
    onNodeDrag,
    onNodeDragStop,
    groupSelected,
    confirmGroupSelected,
  } = useBlockCreation({
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    updateNodeData,
    runWorkflow,
    availableVariablesRef,
    appConnectionsRef,
    openConnectedApps,
    refreshAppConnections,
    selectedIds,
    customBlocks,
    addCustomBlock,
    addLog,
    fitView,
    screenToFlowPosition,
  })

  const { saveCurrentFlow, loadFlow } = useFlowPersistence({
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    setSelectedIds,
    updateNodeData,
    runWorkflow,
    availableVariablesRef,
    appConnectionsRef,
    openConnectedApps,
    refreshAppConnections,
    authedFetch,
    addLog,
    fitView,
    initialFlowId,
    initialTemplateId,
    insertTemplate,
  })

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  )

  // React Flow's built-in pinch/ctrl+scroll zoom has no speed knob and feels sluggish on
  // a touchpad. React registers wheel listeners as passive by default (for scroll
  // perf), which silently blocks preventDefault() from a JSX onWheel/onWheelCapture
  // prop - so this needs a real addEventListener with {passive: false} to actually be
  // able to intercept the gesture before React Flow's own (non-passive, DOM-level)
  // zoom handler processes it. Plain two-finger scroll (no ctrlKey) is left alone so
  // panning is unaffected.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
      const ZOOM_SPEED = 3
      const factor = Math.exp(-event.deltaY * 0.01 * ZOOM_SPEED)
      zoomTo(getZoom() * factor, { duration: 0 })
    }
    el.addEventListener('wheel', handler, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', handler, { capture: true })
  }, [zoomTo, getZoom])

  const canGroup = selectedIds.size >= 2

  return (
    <div className="h-screen w-screen flex flex-col dark:bg-gray-900">
      <CanvasHeader
        editingBlock={editingBlock}
        onSaveEditedBlock={saveEditedBlock}
        onExitEditMode={exitEditMode}
        insertTemplate={insertTemplate}
        canGroup={canGroup}
        selectedCount={selectedIds.size}
        onGroupSelected={groupSelected}
        onWipeData={wipeData}
        onExitToDashboard={onExitToDashboard}
        user={user}
        onOpenFlowsPanel={() => setFlowsPanelOpen(true)}
        onOpenMarketplace={onOpenMarketplace}
        onOpenSettings={onOpenSettings}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {pendingGroup && (
        <GroupNameModal
          defaultLabel={pendingGroup.defaultLabel}
          blockCount={pendingGroup.selected.length}
          onConfirm={confirmGroupSelected}
          onCancel={() => setPendingGroup(null)}
        />
      )}
      {flowsPanelOpen && (
        <FlowsPanel onClose={() => setFlowsPanelOpen(false)} onLoad={loadFlow} onSaveCurrent={saveCurrentFlow} />
      )}
      <div className="flex flex-1 min-h-0">
        <Palette
          customBlocks={customBlocks}
          onDeleteCustomBlock={removeCustomBlock}
          onEditCustomBlock={startEditingBlock}
          editingBlockId={editingBlock?.id}
        />
        <div className="flex-1 dark:bg-gray-900" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
          <QuickAddContext.Provider value={quickAddBlock}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode={['Meta', 'Control']}
              selectionKeyCode={['Shift']}
              edgesFocusable
              elementsSelectable
              snapToGrid
              snapGrid={[10, 10]}
              defaultEdgeOptions={defaultEdgeOptions}
              proOptions={{ hideAttribution: true }}
              fitView
            >
              <Background gap={10} color={theme === 'dark' ? '#374151' : undefined} />
              <Controls />
              <AlignmentGuideLines guides={alignGuides} />
            </ReactFlow>
          </QuickAddContext.Provider>
          <datalist id="overflowengine-variable-names">
            {availableVariables.map((v) => (
              <option key={v.name} value={v.name} />
            ))}
          </datalist>
        </div>
        <CanvasSidebar
          pendingChoice={pendingChoice}
          onResolveChoice={resolveChoice}
          variables={variables}
          costSummary={costSummary}
          onCloseCostSummary={() => setCostSummary(null)}
          tripPdf={tripPdf}
          onCloseTripPdf={() => setTripPdf(null)}
          logs={logs}
          onClearLogs={() => setLogs([])}
        />
      </div>
    </div>
  )
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
