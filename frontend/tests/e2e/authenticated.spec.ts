import { test, expect } from './fixtures/auth'

test.describe('Dashboard (signed in)', () => {
  test('shows a personalized greeting and empty state', async ({ signedInPage: page, signedInUser }) => {
    const firstName = signedInUser.email.split(/[\s@]/)[0]
    await expect(page.getByRole('heading', { name: `Back at it, ${firstName}` })).toBeVisible()
    await expect(page.getByText('No saved flows yet.')).toBeVisible()
  })

  test('adding a task shows it in the list and it can be completed and deleted', async ({
    signedInPage: page,
  }) => {
    const title = `Write the report ${Date.now()}`
    await page.getByPlaceholder('Add a task...').fill(title)
    await page.getByPlaceholder('Add a task...').press('Enter')

    const item = page.getByText(title)
    await expect(item).toBeVisible()

    const row = page.locator('li', { has: item })
    await row.locator('button').first().click()
    await expect(item).toHaveClass(/line-through/)

    await row.hover()
    await row.getByRole('button').last().click()
    await expect(item).not.toBeVisible()
  })

  test('creating an assignment shows it with zero bound flows', async ({ signedInPage: page }) => {
    const name = `Q4 Launch ${Date.now()}`
    await page.getByTitle('New assignment').click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Create Assignment' }).click()

    await expect(page.getByText(name)).toBeVisible()
    await expect(page.getByText('0 flows bound')).toBeVisible()
  })

  test('signing out returns to the anonymous dashboard', async ({ signedInPage: page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Log out' }).click()

    await expect(page.getByRole('heading', { name: 'Welcome to OverFlowEngine' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})

test.describe('Saved flows', () => {
  test('saving a flow from the editor lists it on the dashboard', async ({ signedInPage: page }) => {
    await page.getByRole('button', { name: 'New Workflow', exact: true }).click()
    await page.getByRole('button', { name: 'My Flows' }).click()

    const flowName = `E2E Flow ${Date.now()}`
    await page.getByPlaceholder('Flow name, e.g. Email Auto-Reply').fill(flowName)
    await page.getByRole('button', { name: 'Save current canvas as new flow' }).click()
    await expect(page.getByText(flowName, { exact: true })).toBeVisible()

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page.getByRole('button', { name: flowName })).toBeVisible()
  })
})
