import { defineConfig } from 'vitest/config';

/**
 * Vitest owns the unit, contract and integration suites. It must not collect
 * `tests/e2e`, which is Playwright's — those specs call `test.describe()` from
 * `@playwright/test` and throw "Playwright Test did not expect test.describe()
 * to be called here" the moment vitest imports them.
 *
 * This never surfaced while Playwright was uninstalled: the spec existed but
 * nothing could resolve its import, so it was skipped rather than run. Adding
 * the dependency turned a silently absent suite into a failing one.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
