// vitest.rules.config.ts — config for the Firestore Security Rules suite only.
//
// Deliberately separate from vite.config.ts's test section so that
// `npm test` (which CI runs without an emulator) never picks up these
// emulator-dependent tests. Run them explicitly: npm run test:rules
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["firestore.rules.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
