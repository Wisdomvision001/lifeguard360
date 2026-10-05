// storage.rules.test.ts — Firebase Storage Security Rules test suite for Lifeguard360.
//
// Verifies firebase/storage.rules against the local Storage emulator with the
// SAME TEST-ONLY project id as the Firestore rules suite
// ("lifeguard360-rules-test") so production data is unreachable by design.
//
// Requires the storage emulator:
//   export JAVA_HOME=... && npx firebase emulators:exec --only storage \
//     --project lifeguard360-rules-test \
//     "npx vitest run --config vitest.storage.rules.config.ts"
//
// Does NOT deploy anything and does NOT modify the rules under test.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";

const TEST_PROJECT_ID = "lifeguard360-rules-test";
const RULES_PATH = resolve(import.meta.dirname, "firebase/storage.rules");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    storage: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
  // Hermetic runs: wipe any objects left by previous suites/runs.
  await testEnv.clearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ------------------------------------------------------------------ helpers

type TestStorage = ReturnType<RulesTestContext["storage"]>;

/** Storage client authenticated as an admin (admin custom claim = true). */
function adminStorage(): TestStorage {
  return testEnv.authenticatedContext("storage-admin", { admin: true }).storage();
}

/** Storage client authenticated as a normal user (no admin claim). */
function userStorage(): TestStorage {
  return testEnv.authenticatedContext("storage-user").storage();
}

/** Storage client whose admin claim is the STRING "true" — must never authorize. */
function claimantStorage(): TestStorage {
  return testEnv.authenticatedContext("storage-claimant", { admin: "true" }).storage();
}

/** Unauthenticated storage client. */
function anonStorage(): TestStorage {
  return testEnv.unauthenticatedContext().storage();
}

/**
 * Upload that resolves only after the object is stored and rejects with the
 * SDK's StorageError (storage/unauthorized) when the rules deny the write.
 */
function put(
  storage: TestStorage,
  path: string,
  data: Uint8Array,
  contentType: string,
): Promise<void> {
  const task = storage.ref(path).put(data, { contentType });
  return new Promise<void>((onDone, onErr) => {
    task.then(
      () => onDone(),
      (error) => onErr(error),
    );
  });
}

/**
 * Seed an object with rules bypassed (emulator "owner" token) — test setup
 * only, never a code path the application can reach.
 */
async function seed(path: string, data: Uint8Array, contentType: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(data, { contentType });
  });
}

/** Download an object's bytes as the given client; throws on any failure. */
async function download(storage: TestStorage, path: string): Promise<number> {
  const url = await storage.ref(path).getDownloadURL();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download of ${path} failed with HTTP ${response.status}`);
  }
  const body = new Uint8Array(await response.arrayBuffer());
  return body.byteLength;
}

// ------------------------------------------------------------------- tests

describe("images — public read, admin-only writes (CMS upload contract)", () => {
  it("an admin can upload valid images within the 5 MB cap (all four content types)", async () => {
    await assertSucceeds(put(adminStorage(), "images/cms/upload-png.png", new Uint8Array(64), "image/png"));
    await assertSucceeds(put(adminStorage(), "images/cms/upload-jpeg.jpg", new Uint8Array(64), "image/jpeg"));
    await assertSucceeds(put(adminStorage(), "images/cms/upload-webp.webp", new Uint8Array(64), "image/webp"));
    await assertSucceeds(put(adminStorage(), "images/cms/upload-gif.gif", new Uint8Array(64), "image/gif"));
  });

  it("nested guide image paths are allowed — images/{allPaths=**}", async () => {
    await assertSucceeds(
      put(adminStorage(), "images/guides/burns/step-1/cool-the-burn.png", new Uint8Array(64), "image/png"),
    );
  });

  it("an unauthenticated client can never upload", async () => {
    await assertFails(put(anonStorage(), "images/denied-anon.png", new Uint8Array(16), "image/png"));
  });

  it("an authenticated non-admin can never upload", async () => {
    await assertFails(put(userStorage(), "images/denied-user.png", new Uint8Array(16), "image/png"));
  });

  it('a non-boolean admin claim ("true") never authorizes — strict claim equality', async () => {
    await assertFails(put(claimantStorage(), "images/denied-claim.png", new Uint8Array(16), "image/png"));
  });

  it("an upload of exactly 5 MB is accepted; one byte more is rejected", async () => {
    await assertSucceeds(put(adminStorage(), "images/cms/at-cap.png", new Uint8Array(MAX_IMAGE_BYTES), "image/png"));
    await assertFails(
      put(adminStorage(), "images/cms/over-cap.png", new Uint8Array(MAX_IMAGE_BYTES + 1), "image/png"),
    );
  });

  it("non-image and unsupported image content types are rejected even for admins", async () => {
    await assertFails(put(adminStorage(), "images/cms/not-image.txt", new Uint8Array(32), "text/plain"));
    await assertFails(put(adminStorage(), "images/cms/binary.bin", new Uint8Array(32), "application/octet-stream"));
    await assertFails(put(adminStorage(), "images/cms/vector.svg", new Uint8Array(32), "image/svg+xml"));
  });

  it("uploaded images are publicly readable — list and download without auth", async () => {
    await put(adminStorage(), "images/read-check/hero.png", new Uint8Array(32), "image/png");
    const { items } = await anonStorage().ref("images/read-check").listAll();
    if (items.length !== 1) {
      throw new Error(`expected exactly 1 seeded object under images/read-check, got ${items.length}`);
    }
    const size = await download(anonStorage(), "images/read-check/hero.png");
    if (size !== 32) {
      throw new Error(`expected 32 downloaded bytes, got ${size}`);
    }
  });

  it("an admin can delete an image; non-admins and guests cannot", async () => {
    await seed("images/deletable-by-admin.png", new Uint8Array(16), "image/png");
    await seed("images/deletable-denied.png", new Uint8Array(16), "image/png");
    await assertSucceeds(adminStorage().ref("images/deletable-by-admin.png").delete());
    await assertFails(userStorage().ref("images/deletable-denied.png").delete());
    await assertFails(anonStorage().ref("images/deletable-denied.png").delete());
  });
});

describe("videos — public read, no client writes", () => {
  it("videos are publicly readable but no client write ever succeeds", async () => {
    await seed("videos/burns/lesson-v1.mp4", new Uint8Array(64), "video/mp4");
    const size = await download(anonStorage(), "videos/burns/lesson-v1.mp4");
    if (size !== 64) {
      throw new Error(`expected 64 downloaded bytes, got ${size}`);
    }
    // Not even an admin may write to the videos prefix from a client.
    await assertFails(put(adminStorage(), "videos/burns/lesson-v2.mp4", new Uint8Array(64), "video/mp4"));
    await assertFails(adminStorage().ref("videos/burns/lesson-v1.mp4").delete());
  });
});

describe("default deny — everything else in the bucket", () => {
  it("paths outside images/ and videos/ are unreadable and unwritable for everyone", async () => {
    await seed("private/secret.png", new Uint8Array(16), "image/png");
    await assertFails(put(adminStorage(), "private/admin-note.png", new Uint8Array(16), "image/png"));
    await assertFails(anonStorage().ref("private").listAll());
    await assertFails(adminStorage().ref("private").listAll());
  });
});
