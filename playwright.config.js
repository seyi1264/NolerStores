const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 5000 },
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', headless: true },
    },
  ],
});
