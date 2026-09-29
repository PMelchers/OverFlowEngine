import { test, expect } from '@playwright/test'

test.describe('Dashboard (anonymous)', () => {
  test('shows the welcome heading and sign-in prompt', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome to OverFlowEngine' })).toBeVisible()
    await expect(page.getByText('Sign in to see your flows.')).toBeVisible()
  })

  test('starting a new workflow opens a blank editor', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start a new workflow' }).click()
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible()
  })

  test('exiting the editor returns to the dashboard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New Workflow', exact: true }).click()
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to OverFlowEngine' })).toBeVisible()
  })

  test('opening a template loads its starter blocks into the editor', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Email Auto-Reply/ }).click()
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible()
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
  })
})

test.describe('Marketplace', () => {
  test('opens from the sidebar and returns to the dashboard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Marketplace' }).click()
    await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to OverFlowEngine' })).toBeVisible()
  })
})

test.describe('Auth modal', () => {
  test('opens on sign in and toggles between sign in and create account', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Create one' }).click()
    await expect(dialog.getByRole('heading', { name: 'Create account' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Sign in' }).click()
    await expect(dialog.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('requires a valid email and a 6+ character password', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in' }).click()

    const email = page.getByLabel('Email')
    const password = page.getByLabel('Password')
    await expect(email).toHaveAttribute('required', '')
    await expect(password).toHaveAttribute('minlength', '6')
  })

  test('cancel closes the modal without signing in', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).not.toBeVisible()
  })
})
