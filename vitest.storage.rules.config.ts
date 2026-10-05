// vitest.storage.rules.config.ts — config for the Firebase Storage Security
// Rules suite only.
//
// Deliberately separate from vite.config.ts's test section so that
// `npm test` (which CI runs without an emulator) never picks up these
// emulator-dependent tests, and separate from vitest.rules.config.ts so the
// Firestore suite keeps its own emulator wiring. Run explicitly:
//   npm run test:rules:storage
// with the storage emulator running, e.g.:
//   npx firebase emulators:exec --only storage --project lifeguard360-rules-test \
//     "npx vitest run --config vitest.storage.rules.config.ts"
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["storage.rules.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
