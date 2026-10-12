import { test, expect } from './fixtures/auth'

const API_BASE = process.env.API_BASE || 'http://localhost:8000'

test.describe('Websites to exclude', () => {
  test('the Vacation Planner form asks for them and feeds them to the blocks that look things up', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Vacation Planner/ }).click()

    await expect(page.getByPlaceholder('e.g. booking.com, {tripExcludedSites}')).toHaveValue('{tripExcludedSites}')
    await expect(page.getByPlaceholder('e.g. tripadvisor.com, {tripExcludedSites}')).toHaveValue('{tripExcludedSites}')

    // The template is wider than the viewport, so the form block's button can sit
    // off-screen - dispatch the click instead of moving the mouse to it. Scoped to the
    // block because React Flow gives the whole node role="button" too.
    await page
      .locator('.react-flow__node-formTrigger')
      .getByRole('button', { name: 'Fill in & run' })
      .dispatchEvent('click')
    const form = page.locator('form')
    // The modal's labels aren't tied to their inputs, so find the field by its wrapper.
    const field = form.locator('div').filter({ hasText: /^Websites to exclude/ }).locator('input')
    await expect(form.getByText('Websites to exclude')).toBeVisible()
    await expect(field).toHaveValue('pinterest.com')

    // "Exclude nothing" is a valid answer, while every other field stays required.
    await field.fill('')
    expect(await form.evaluate((f: HTMLFormElement) => f.checkValidity())).toBe(true)
  })

  test('Trip Cost passes them to the AI and reports entries that are not websites', async ({
    request,
    signedInUser,
  }) => {
    const headers = { Authorization: `Bearer ${signedInUser.token}` }
    // A "test..." key uses the built-in test provider - no real AI call, no API key needed.
    const credential = await (
      await request.post(`${API_BASE}/credentials`, { headers, data: { label: 'test', api_key: 'test-key' } })
    ).json()

    // No stay type or transport, so only the AI search runs - not the live hotel/fuel
    // lookups, which depend on outside services.
    const res = await request.post(`${API_BASE}/workflows/run`, {
      headers,
      data: {
        nodes: [
          { id: 't', type: 'trigger', data: { label: 'Start' } },
          {
            id: 'cost',
            type: 'costEstimate',
            data: {
              label: 'Trip Cost',
              activityContext: 'Amsterdam',
              waypoints: 'Rijksmuseum',
              excludedSites: 'https://www.Booking.com/hotels, social media',
            },
          },
          { id: 'm', type: 'aiModel', data: { label: 'Model', credentialId: credential.id, model: 'test-model' } },
        ],
        edges: [
          { id: 'e1', source: 't', target: 'cost' },
          { id: 'e2', source: 'm', target: 'cost', targetHandle: 'model' },
        ],
      },
    })
    const steps: { node_id: string | null; message: string }[] = (await res.json()).steps
    const message = steps.find((s) => s.node_id === 'cost')?.message ?? ''

    expect(message).toContain('excluded websites: booking.com')
    expect(message).toContain("ignored 'social', 'media' in Websites to exclude")
    expect(message).toContain("web search can't block websites, so the AI was only told to avoid the excluded ones")
  })
})
