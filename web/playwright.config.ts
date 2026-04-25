import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3001'
const usePerf = process.env.PLAYWRIGHT_PERF === '1'
const e2eAuth = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)

const chrome = { ...devices['Desktop Chrome'] }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: usePerf
    ? [
        {
          name: 'chromium-perf',
          testMatch: /admin-perf\.spec\.ts/,
          use: { ...chrome },
        },
      ]
    : [
        {
          name: 'chromium-guest',
          testMatch: /(admin-guest|admin-api|admin-audit|admin-a11y)\.spec\.ts/,
          use: { ...chrome },
        },
        ...(e2eAuth
          ? [
              {
                name: 'setup',
                testMatch: /auth\.setup\.ts/,
              },
              {
                name: 'chromium-admin',
                testMatch: /admin-(authenticated|ui-crawl)\.spec\.ts/,
                dependencies: ['setup'],
                use: {
                  ...chrome,
                  storageState: 'e2e/.auth/admin.json',
                },
              },
            ]
          : []),
      ],
  webServer: usePerf
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: process.env.PLAYWRIGHT_FRESH_SERVER !== '1',
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
