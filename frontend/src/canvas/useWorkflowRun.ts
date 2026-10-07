import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Edge, Node } from 'reactflow'
import { API_BASE } from '../shared/apiBase'
import { TRIGGER_NODE_TYPES, expandGraph, sanitizeData, sleep, timestamp } from './canvasGraph'
import type { BlockDataPatch, BlockNodeData, CostBreakdown, FormField } from '../nodes/types'
import type { TripPdf } from './TripPdfCard'

export interface RunStep {
  node_id: string | null
  type: string
  label: string
  message: string
  branch?: string
  options?: string[]
  costBreakdown?: CostBreakdown | null
  pdf?: TripPdf | null
}

export interface StoredVariable {
  type: string
  value: string
}

export interface RunResult {
  status: 'completed' | 'awaiting_choice' | 'error'
  run_id?: string | number
  node_id?: string
  label?: string
  options?: string[]
  steps: RunStep[]
  variables?: Record<string, StoredVariable>
  message?: string
}

export interface PendingChoice {
  runId: string
  nodeId: string
  label: string
  options: string[]
}

interface UseWorkflowRunArgs {
  nodesRef: RefObject<Node<BlockNodeData>[]>
  edgesRef: RefObject<Edge[]>
  setNodes: Dispatch<SetStateAction<Node<BlockNodeData>[]>>
  updateNodeData: (id: string, patch: BlockDataPatch) => void
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
}

export function useWorkflowRun({ nodesRef, edgesRef, setNodes, updateNodeData, authedFetch }: UseWorkflowRunArgs) {
  const [logs, setLogs] = useState<string[]>([])
  const [costSummary, setCostSummary] = useState<CostBreakdown | null>(null)
  const [tripPdf, setTripPdf] = useState<TripPdf | null>(null)
  const [running, setRunning] = useState(false)
  const [variables, setVariables] = useState<Record<string, StoredVariable>>({})
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null)

  const addLog = useCallback((message: string) => {
    setLogs((l) => [...l, `[${timestamp()}] ${message}`])
  }, [])

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/state`)
      const data = await res.json()
      setVariables(data.variables ?? {})
    } catch {
      // backend unreachable; leave last known state as-is
    }
  }, [])

  const activateNode = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: 'active' } } : n)),
      )
      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: 'idle' } } : n)),
        )
      }, 700)
    },
    [setNodes],
  )

  const playResult = useCallback(
    async (result: RunResult) => {
      if (result.status === 'error') {
        addLog(`Error: ${result.message ?? 'workflow failed'}`)
        setPendingChoice(null)
        setRunning(false)
        return
      }

      // Map an internal (possibly namespaced "group::inner") node id back to the
      // top-level node actually visible on the canvas, so grouped blocks still flash.
      const canvasIds = new Set(nodesRef.current.map((n) => n.id))
      const visibleId = (id: string) => {
        if (canvasIds.has(id)) return id
        const outer = id.split('::')[0]
        return canvasIds.has(outer) ? outer : null
      }

      for (const step of result.steps) {
        if (step.node_id) {
          const target = visibleId(step.node_id)
          if (target) activateNode(target)
        }
        addLog(step.message)
        if (step.costBreakdown) setCostSummary(step.costBreakdown)
        if (step.pdf) setTripPdf(step.pdf)
        await sleep(450)
      }

      setVariables(result.variables ?? {})

      if (result.status === 'awaiting_choice' && result.run_id && result.node_id && result.options) {
        setPendingChoice({
          runId: String(result.run_id),
          nodeId: result.node_id,
          label: result.label ?? result.node_id,
          options: result.options,
        })
      } else {
        setPendingChoice(null)
        setRunning(false)
      }
    },
    [addLog, activateNode, nodesRef],
  )

  const runWorkflow = useCallback(
    async (formOverride?: { nodeId: string; fields: FormField[] }) => {
      if (running) return
      setRunning(true)

      // Apply the just-submitted form values to a local copy of the node list rather than
      // going through setNodes first - a state update wouldn't be reflected in nodesRef
      // until after this render, so building the run payload from a fresh setNodes would
      // race and send the *previous* field values.
      const currentNodes = formOverride
        ? nodesRef.current.map((n) =>
            n.id === formOverride.nodeId ? { ...n, data: { ...n.data, fields: formOverride.fields } } : n,
          )
        : nodesRef.current
      const currentEdges = edgesRef.current
      if (formOverride) updateNodeData(formOverride.nodeId, { fields: formOverride.fields })

      const { nodes: flatNodes, edges: flatEdges } = expandGraph(
        currentNodes.map((n) => ({ id: n.id, type: n.type ?? 'block', data: n.data })),
        currentEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
      )

      let result: RunResult
      try {
        // authedFetch, not plain fetch - so a Task block can attribute the tasks it
        // creates to the signed-in user. Anonymous runs still work fine (no header sent).
        const res = await authedFetch('/workflows/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodes: flatNodes.map((n) => ({ id: n.id, type: n.type, data: sanitizeData(n.data) })),
            edges: flatEdges,
          }),
        })
        if (!res.ok) throw new Error(`backend returned ${res.status}`)
        result = await res.json()
      } catch {
        addLog('Error: could not reach backend at ' + API_BASE + ' - workflow was not run')
        setRunning(false)
        return
      }

      await playResult(result)
    },
    [running, addLog, playResult, authedFetch, updateNodeData, nodesRef, edgesRef],
  )

  const resolveChoice = useCallback(
    async (option: string) => {
      if (!pendingChoice) return
      const { runId } = pendingChoice
      setPendingChoice(null)

      let result: RunResult
      try {
        const res = await authedFetch('/workflows/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: runId, choice: option }),
        })
        if (!res.ok) throw new Error(`backend returned ${res.status}`)
        result = await res.json()
      } catch {
        addLog('Error: could not reach backend to continue the workflow')
        setRunning(false)
        return
      }

      await playResult(result)
    },
    [pendingChoice, addLog, playResult, authedFetch],
  )

  const wipeData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/state`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`backend returned ${res.status}`)
      setVariables({})
      setLogs([])
      addLog('Saved data wiped')
    } catch {
      addLog('Error: could not reach backend, nothing was wiped')
    }
  }, [addLog])

  useEffect(() => {
    fetchState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the trigger node's onTrigger pointing at the latest runWorkflow closure.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => (n.type && TRIGGER_NODE_TYPES.has(n.type) ? { ...n, data: { ...n.data, onTrigger: runWorkflow } } : n)),
    )
  }, [runWorkflow, setNodes])

  return {
    logs,
    setLogs,
    costSummary,
    setCostSummary,
    tripPdf,
    setTripPdf,
    running,
    variables,
    pendingChoice,
    addLog,
    runWorkflow,
    resolveChoice,
    wipeData,
  }
}
