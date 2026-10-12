import { test, expect } from './fixtures/auth'

const API_BASE = process.env.API_BASE || 'http://localhost:8000'

test.describe('Run overview', () => {
  test('lists a run with its status and opens its details', async ({ signedInPage: page, signedInUser, request }) => {
    // An AI Agent without an AI Model block skips with an error step, so the run is "failed".
    await request.post(`${API_BASE}/workflows/run`, {
      headers: { Authorization: `Bearer ${signedInUser.token}` },
      data: {
        nodes: [
          { id: 't', type: 'trigger', data: { label: 'Start' } },
          { id: 'a', type: 'aiAgent', data: { label: 'Summarizer', prompt: 'Summarize this' } },
        ],
        edges: [{ id: 'e', source: 't', target: 'a' }],
      },
    })
    await page.reload()

    const runs = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Recent runs' }) })
    const failedRun = runs.getByRole('button', { name: /Failed.*Unsaved workflow/ })
    await expect(failedRun).toBeVisible()

    await failedRun.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('1 step failed')).toBeVisible()
    await expect(dialog.getByText(/Summarizer" has no AI Model block connected/)).toBeVisible()
  })

  test('a saved flow run from the editor is listed under its name', async ({
    signedInPage: page,
    signedInUser,
    request,
  }) => {
    const flowName = `E2E Run Flow ${Date.now()}`
    await request.post(`${API_BASE}/flows`, {
      headers: { Authorization: `Bearer ${signedInUser.token}` },
      data: {
        name: flowName,
        nodes: [
          { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Go' } },
          { id: 'l', type: 'log', position: { x: 300, y: 0 }, data: { label: 'Log', message: 'hello' } },
        ],
        edges: [{ id: 'e', source: 't', target: 'l' }],
      },
    })
    await page.reload()

    await page.getByRole('button', { name: flowName }).click()
    // React Flow gives the whole node role="button" too, so scope to the trigger block's own button.
    await page.locator('.react-flow__node-trigger').getByRole('button', { name: 'Go' }).click()
    await expect(page.getByText('Workflow finished')).toBeVisible()
    await page.getByRole('button', { name: 'Dashboard' }).click()

    const runs = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Recent runs' }) })
    await expect(runs.getByRole('button', { name: new RegExp(`Succeeded.*${flowName}`) })).toBeVisible()
  })
})
