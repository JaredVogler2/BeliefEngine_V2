import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // the inference routes, as the local simulator with its scripted provider: NO model is called, and the game labels every
      // answer "simulated". `vite preview` forwards /api here. Only the online-reading spec uses it; Classic never calls /api.
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:8787/api/ai-status',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { BE_AI_ENABLED: '1', BE_AI_DEV_PROVIDER: 'mock', BE_AI_DEV_MEMORY_STORE: '1', BE_AI_DEV_PORT: '8787' },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    // Cross-browser smoke (opt in: needs `npx playwright install firefox webkit`, and on Linux `npx playwright install-deps webkit`).
    // Run with BE_CROSS_BROWSER=1 npm run test:e2e -- --project=firefox --project=webkit --project=iphone
    ...(process.env.BE_CROSS_BROWSER === '1'
      ? [
          { name: 'firefox', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
          { name: 'webkit', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
          { name: 'iphone', testMatch: /smoke\.spec\.ts/, use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
});
