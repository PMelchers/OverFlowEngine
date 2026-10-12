import { test, expect } from './fixtures/auth'
import type { APIRequestContext } from '@playwright/test'

const API_BASE = process.env.API_BASE || 'http://localhost:8000'

/**
 * Variables are scoped to a single run and paused runs live in Postgres (see
 * md/DECISIONS.md). These drive the API directly - what matters here is the executor's
 * isolation between runs, which the canvas UI can't make two of at once.
 */

type Node = { id: string; type: string; data: Record<string, unknown> }
type Edge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: null }

function edge(source: string, target: string, sourceHandle: string | null = null): Edge {
  return { id: `${source}-${target}`, source, target, sourceHandle, targetHandle: null }
}

/** Trigger -> Variable x = value -> [Choice A/B ->] Log "x is {x}, y is {y}". */
function flow(value: string, { withChoice = false } = {}) {
  const nodes: Node[] = [
    { id: 't', type: 'trigger', data: { label: 'Start' } },
    { id: 'v', type: 'variable', data: { label: 'x', varType: 'string', value } },
    { id: 'l', type: 'log', data: { label: 'Log', message: 'x is {x}, y is {y}' } },
  ]
  const edges: Edge[] = [edge('t', 'v')]
  if (withChoice) {
    nodes.push({ id: 'c', type: 'choice', data: { label: 'Pick', options: ['A', 'B'] } })
    edges.push(edge('v', 'c'), edge('c', 'l', 'A'))
  } else {
    edges.push(edge('v', 'l'))
  }
  return { nodes, edges }
}

function authHeader(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function run(api: APIRequestContext, body: ReturnType<typeof flow>, token?: string) {
  const res = await api.post(`${API_BASE}/workflows/run`, { data: body, headers: authHeader(token) })
  expect(res.ok()).toBeTruthy()
  return res.json()
}

async function continueRun(api: APIRequestContext, runId: string, choice: string, token?: string) {
  const res = await api.post(`${API_BASE}/workflows/continue`, {
    data: { run_id: runId, choice },
    headers: authHeader(token),
  })
  expect(res.ok()).toBeTruthy()
  return res.json()
}

test.describe('Run-scoped variables', () => {
  test('concurrent runs keep their own values', async ({ request }) => {
    const values = ['one', 'two', 'three', 'four']
    const results = await Promise.all(values.map((v) => run(request, flow(v))))
    results.forEach((result, i) => {
      expect(result.status).toBe('completed')
      expect(result.variables).toEqual({ x: { type: 'string', value: values[i] } })
    })
  })

  test('a run does not inherit variables from an earlier run', async ({ request }) => {
    const first = await run(request, {
      nodes: [
        { id: 't', type: 'trigger', data: { label: 'Start' } },
        { id: 'y', type: 'variable', data: { label: 'y', varType: 'string', value: 'leaked' } },
      ],
      edges: [edge('t', 'y')],
    })
    expect(first.variables.y.value).toBe('leaked')

    const result = await run(request, flow('second'))
    const log = result.steps.find((s: { type: string }) => s.type === 'log')
    expect(log.message).toContain('x is second, y is {y}')
    expect(result.variables).not.toHaveProperty('y')
  })

  test('a paused run can be continued once, keeping its variables', async ({ request }) => {
    const paused = await run(request, flow('paused', { withChoice: true }))
    expect(paused.status).toBe('awaiting_choice')
    expect(paused.variables.x.value).toBe('paused')

    const state = await (await request.get(`${API_BASE}/state?run_id=${paused.run_id}`)).json()
    expect(state.last_run.status).toBe('awaiting_choice')

    // A double-clicked choice: exactly one of the two continues may go through.
    const outcomes = await Promise.all([
      continueRun(request, paused.run_id, 'A'),
      continueRun(request, paused.run_id, 'A'),
    ])
    expect(outcomes.map((o) => o.status).sort()).toEqual(['completed', 'error'])
    const done = outcomes.find((o) => o.status === 'completed')
    expect(done.steps.find((s: { type: string }) => s.type === 'log').message).toContain('x is paused')
  })

  test("a signed-in user's run is private to them", async ({ request, signedInUser }) => {
    const paused = await run(request, flow('mine', { withChoice: true }), signedInUser.token)

    // Anonymous callers can neither read nor continue it, even holding the run id.
    const anonState = await (await request.get(`${API_BASE}/state?run_id=${paused.run_id}`)).json()
    expect(anonState.last_run).toBeNull()
    expect((await continueRun(request, paused.run_id, 'A')).status).toBe('error')

    const ownState = await (
      await request.get(`${API_BASE}/state`, { headers: authHeader(signedInUser.token) })
    ).json()
    expect(ownState.last_run.run_id).toBe(paused.run_id)
    expect((await continueRun(request, paused.run_id, 'A', signedInUser.token)).status).toBe('completed')

    await request.delete(`${API_BASE}/state`, { headers: authHeader(signedInUser.token) })
    const wiped = await (await request.get(`${API_BASE}/state`, { headers: authHeader(signedInUser.token) })).json()
    expect(wiped.last_run).toBeNull()
  })
})
