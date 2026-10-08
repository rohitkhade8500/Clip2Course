import { defineConfig } from 'vitest/config'

/**
 * Server tests run in Node. Without this file Vitest walks up and picks up the
 * client's jsdom config, which pulls in a browser-only setup file.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
