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
 *
 * The orchestration control-plane qualification is intentionally an .mjs test
 * because the control-plane implementation is native ESM infrastructure. Keep
 * the native-ESM orchestration suites explicit rather than widening collection to
 * every JavaScript file under tests/.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/orchestration-control-plane.test.mjs', 'tests/orchestration-operations-plane.test.mjs', 'tests/orchestration-chat-control.test.mjs', 'tests/orchestration-vekl.test.mjs', 'tests/orchestration-vekl-resources.test.mjs', 'tests/orchestration-process-capture.test.mjs', 'tests/orchestration-operator-status.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
