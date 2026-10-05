import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Edge, Node, useReactFlow } from 'reactflow'
import { TRIGGER_NODE_TYPES, defaultDataFor, nextId, sanitizeData } from './canvasGraph'
import type { BlockDataPatch, BlockNodeData, FormField, SubgraphEdge, SubgraphNode, VariableType } from '../nodes/types'
import { TEMPLATES, type WorkflowTemplate } from '../templates'

interface UseFlowPersistenceArgs {
  nodesRef: RefObject<Node<BlockNodeData>[]>
  edgesRef: RefObject<Edge[]>
  setNodes: Dispatch<SetStateAction<Node<BlockNodeData>[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  updateNodeData: (id: string, patch: BlockDataPatch) => void
  runWorkflow: (formOverride?: { nodeId: string; fields: FormField[] }) => Promise<void>
  availableVariablesRef: RefObject<{ name: string; varType: VariableType }[]>
  appConnectionsRef: RefObject<Record<string, boolean>>
  openConnectedApps: () => void
  refreshAppConnections: () => void
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
  addLog: (message: string) => void
  fitView: ReturnType<typeof useReactFlow>['fitView']
  initialFlowId: number | null
  initialTemplateId: string | null
  insertTemplate: (template: WorkflowTemplate, dropPosition?: { x: number; y: number }) => void
}

export function useFlowPersistence({
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
}: UseFlowPersistenceArgs) {
  const saveCurrentFlow = useCallback(
    async (name: string) => {
      const currentNodes = nodesRef.current
      const currentEdges = edgesRef.current
      if (currentNodes.length === 0) {
        throw new Error('Add at least one block before saving')
      }
      const payload = {
        name,
        nodes: currentNodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'block',
          data: sanitizeData(n.data),
          position: n.position,
        })),
        edges: currentEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
      }
      const res = await authedFetch('/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? 'Could not save this flow')
      }
      addLog(`Saved flow "${name}"`)
    },
    [authedFetch, addLog, nodesRef, edgesRef],
  )

  const loadFlow = useCallback(
    (flowNodes: SubgraphNode[], flowEdges: SubgraphEdge[]) => {
      if (nodesRef.current.length > 0 && !window.confirm('Loading this flow will replace your current canvas. Continue?')) {
        return
      }
      const loadedNodes: Node<BlockNodeData>[] = flowNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          ...n.data,
          status: 'idle',
          onChange: (patch: BlockDataPatch) => updateNodeData(n.id, patch),
          ...(TRIGGER_NODE_TYPES.has(n.type) ? { onTrigger: runWorkflow } : {}),
          ...(n.type === 'if' ||
          n.type === 'ifOne' ||
          n.type === 'log' ||
          n.type === 'task' ||
          n.type === 'appAction' ||
          n.type === 'mapsAction' ||
          n.type === 'activitySuggestion' ||
          n.type === 'costEstimate' ||
          n.type === 'tripSummary'
            ? { availableVariables: availableVariablesRef.current }
            : {}),
          ...(n.type === 'appTrigger' || n.type === 'appAction'
            ? {
                appConnections: appConnectionsRef.current,
                onOpenSettings: openConnectedApps,
                onAppConnected: refreshAppConnections,
              }
            : {}),
        },
      }))
      const loadedEdges: Edge[] = flowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }))
      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setSelectedIds(new Set())
      addLog('Loaded flow')
      requestAnimationFrame(() => fitView({ padding: 0.3 }))
    },
    [
      setNodes,
      setEdges,
      updateNodeData,
      runWorkflow,
      fitView,
      addLog,
      openConnectedApps,
      refreshAppConnections,
      nodesRef,
      setSelectedIds,
      availableVariablesRef,
      appConnectionsRef,
    ],
  )

  // Opened straight from a dashboard "Open" click - load that flow onto the (empty) canvas
  // as soon as we mount. nodesRef.current is always empty at this point, so loadFlow's
  // "replace the canvas?" confirm never fires here.
  useEffect(() => {
    if (initialFlowId == null) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await authedFetch(`/flows/${initialFlowId}`)
        if (!res.ok || cancelled) return
        const body = await res.json()
        if (!cancelled) loadFlow(body.nodes, body.edges)
      } catch {
        // Ignore - the user just starts from an empty canvas instead.
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFlowId])

  // Opened via one of the dashboard's quick-start template chips - drop that template onto
  // the (empty) canvas as soon as we mount. Guarded by a ref (not just the effect body)
  // because React 18 StrictMode deliberately runs mount effects twice in dev to surface
  // exactly this kind of bug - without the guard, insertTemplate had no cleanup to undo
  // the first run, so the whole template landed on the canvas twice, stacked on top of
  // itself. The ref survives that mount/cleanup/remount cycle, so only the first run acts.
  const insertedTemplateRef = useRef(false)
  useEffect(() => {
    if (!initialTemplateId || insertedTemplateRef.current) return
    const template = TEMPLATES.find((t) => t.id === initialTemplateId)
    if (template) {
      insertedTemplateRef.current = true
      insertTemplate(template)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId])

  // A brand-new blank workflow (not opened from a saved flow or a template) starts
  // with an App Trigger already wired to an App Action, instead of an empty canvas -
  // a starting point to edit rather than a blank slate. Guarded by a ref (not just
  // the initialFlowId/initialTemplateId check) for the same StrictMode double-mount
  // reason as the template effect above.
  const insertedStarterRef = useRef(false)
  useEffect(() => {
    if (initialFlowId != null || initialTemplateId || insertedStarterRef.current) return
    insertedStarterRef.current = true

    const num = nextId()
    const triggerId = `starter-trigger-${num}`
    const actionId = `starter-action-${num}`
    const triggerNode: Node<BlockNodeData> = {
      id: triggerId,
      type: 'appTrigger',
      position: { x: 0, y: 0 },
      data: {
        ...defaultDataFor('appTrigger', 'App Trigger'),
        status: 'idle',
        onChange: (patch: BlockDataPatch) => updateNodeData(triggerId, patch),
        onTrigger: runWorkflow,
        appConnections: appConnectionsRef.current,
        onOpenSettings: openConnectedApps,
        onAppConnected: refreshAppConnections,
      },
    }
    const actionNode: Node<BlockNodeData> = {
      id: actionId,
      type: 'appAction',
      position: { x: 380, y: 0 },
      data: {
        ...defaultDataFor('appAction', 'App Action'),
        status: 'idle',
        onChange: (patch: BlockDataPatch) => updateNodeData(actionId, patch),
        availableVariables: availableVariablesRef.current,
        appConnections: appConnectionsRef.current,
        onOpenSettings: openConnectedApps,
        onAppConnected: refreshAppConnections,
      },
    }
    setNodes([triggerNode, actionNode])
    setEdges([{ id: `starter-edge-${num}`, source: triggerId, target: actionId }])
    requestAnimationFrame(() => fitView({ padding: 0.3 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { saveCurrentFlow, loadFlow }
}
