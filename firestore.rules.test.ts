// Firestore Security Rules test suite for Lifeguard360.
//
// Verifies the rules in firebase/firestore.rules behave exactly as intended,
// running against the local Firestore emulator with a TEST-ONLY project id
// ("lifeguard360-rules-test") so production data is unreachable by design.
//
// Requires: firebase emulators:start --only firestore (see test:rules script)
// Does NOT deploy anything and does NOT modify the rules under test.
//
// Hermeticity: the emulator persists data across runs per project id, so
// beforeAll clears the dataset, and each concern writes its own document ids
// so intra-suite ordering can never turn a create into an update.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { serverTimestamp, type DocumentData } from "firebase/firestore";
import { beforeAll, afterAll, describe, it } from "vitest";

const TEST_PROJECT_ID = "lifeguard360-rules-test";
const RULES_PATH = resolve(import.meta.dirname, "firebase/firestore.rules");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  // Hermetic runs: wipe any data left by previous suites/runs.
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ------------------------------------------------------------------ helpers

// The rules require createdAt/updatedAt == request.time. The application
// satisfies this with the serverTimestamp() sentinel (the rules engine resolves
// it to request.time) — the tests mirror that exact client behaviour.
const SERVER_NOW = serverTimestamp();

/** The exact UserPreferences shape the application writes. */
function validPreferences(): DocumentData {
  return { language: "en", ttsEnabled: true, commsNoticeAcknowledged: false };
}

/** A profile payload satisfying every rule constraint on users/{uid}. */
function validProfile(): DocumentData {
  return {
    displayName: "Rules Test User",
    phone: null,
    preferences: { language: "en", ttsEnabled: true, commsNoticeAcknowledged: false },
    createdAt: SERVER_NOW,
    updatedAt: SERVER_NOW,
  };
}

/** A contact payload satisfying every rule constraint on contacts/{id}. */
function validContact(): DocumentData {
  return {
    fullName: "Test Contact",
    relationship: "Friend",
    phoneNumber: "+2348012345678",
    createdAt: SERVER_NOW,
    updatedAt: SERVER_NOW,
  };
}

/** An activity payload satisfying every rule constraint on activity/{id}. */
function validActivity(): DocumentData {
  return {
    type: "contact_added",
    detail: { relationship: "Friend" },
    createdAt: SERVER_NOW,
  };
}

/** Firestore client authenticated as the given uid. */
function ownerDb(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

/** Firestore client authenticated as an admin (admin custom claim = true). */
function adminDb(uid = "admin-user") {
  return testEnv.authenticatedContext(uid, { admin: true }).firestore();
}

/** Firestore client authenticated with a non-authorizing admin-claim value. */
function claimantDb(uid: string, claim: unknown) {
  return testEnv.authenticatedContext(uid, { admin: claim }).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

// ------------------------------------------------------------- USER PROFILE

describe("users/{uid} — user profile rules", () => {
  it("unauthenticated user cannot read users/{uid}", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("profile-locked").set(validProfile());
    });
    await assertFails(unauthDb().collection("users").doc("profile-locked").get());
  });

  it("user can read their own users/{uid}", async () => {
    await assertSucceeds(ownerDb("profile-locked").collection("users").doc("profile-locked").get());
  });

  it("user cannot read another user's profile", async () => {
    await assertFails(ownerDb("profile-intruder").collection("users").doc("profile-locked").get());
  });

  it("user can create their own valid profile", async () => {
    await assertSucceeds(
      ownerDb("profile-creator").collection("users").doc("profile-creator").set(validProfile()),
    );
  });

  it("user cannot create a profile for someone else", async () => {
    await assertFails(
      ownerDb("profile-creator").collection("users").doc("someone-else").set(validProfile()),
    );
  });

  it("invalid profile fields are rejected (unknown key)", async () => {
    await assertFails(
      ownerDb("profile-bad")
        .collection("users")
        .doc("profile-bad")
        .set({ ...validProfile(), isAdmin: true }),
    );
  });

  it("empty displayName is rejected", async () => {
    await assertFails(
      ownerDb("profile-empty-name")
        .collection("users")
        .doc("profile-empty-name")
        .set({ ...validProfile(), displayName: "" }),
    );
  });

  it("non-map preferences are rejected", async () => {
    await assertFails(
      ownerDb("profile-bad-prefs")
        .collection("users")
        .doc("profile-bad-prefs")
        .set({ ...validProfile(), preferences: "nope" }),
    );
  });

  it("valid preferences are accepted on create", async () => {
    // The canonical app shape, written by ensureUserDocument.
    await assertSucceeds(
      ownerDb("prefs-ok")
        .collection("users")
        .doc("prefs-ok")
        .set({ ...validProfile(), preferences: validPreferences() }),
    );
  });

  it("unknown preference key is rejected", async () => {
    await assertFails(
      ownerDb("prefs-extra")
        .collection("users")
        .doc("prefs-extra")
        .set({ ...validProfile(), preferences: { ...validPreferences(), isAdmin: true } }),
    );
  });

  it("missing preference key is rejected", async () => {
    const { commsNoticeAcknowledged: _omitted, ...partial } = validPreferences();
    void _omitted;
    await assertFails(
      ownerDb("prefs-missing")
        .collection("users")
        .doc("prefs-missing")
        .set({ ...validProfile(), preferences: partial }),
    );
  });

  it("invalid preference value types are rejected", async () => {
    const base = ownerDb("prefs-bad-types").collection("users").doc("prefs-bad-types");
    // language must be a string
    await assertFails(
      base.set({ ...validProfile(), preferences: { ...validPreferences(), language: 7 } }),
    );
    // ttsEnabled must be a bool
    await assertFails(
      base.set({ ...validProfile(), preferences: { ...validPreferences(), ttsEnabled: "yes" } }),
    );
    // commsNoticeAcknowledged must be a bool
    await assertFails(
      base.set({
        ...validProfile(),
        preferences: { ...validPreferences(), commsNoticeAcknowledged: "no" },
      }),
    );
  });

  it("valid null phone is accepted", async () => {
    await assertSucceeds(
      ownerDb("phone-null").collection("users").doc("phone-null").set(validProfile()),
    );
  });

  it("valid Nigerian E.164 phone is accepted", async () => {
    await assertSucceeds(
      ownerDb("phone-ok")
        .collection("users")
        .doc("phone-ok")
        .set({ ...validProfile(), phone: "+2348012345678" }),
    );
  });

  it("invalid local phone formats are rejected", async () => {
    const base = ownerDb("phone-local").collection("users").doc("phone-local");
    await assertFails(base.set({ ...validProfile(), phone: "08012345678" }));
    await assertFails(base.set({ ...validProfile(), phone: "0801 234 5678" }));
  });

  it("invalid non-Nigerian E.164 phone is rejected", async () => {
    const base = ownerDb("phone-foreign").collection("users").doc("phone-foreign");
    await assertFails(base.set({ ...validProfile(), phone: "+15551234567" }));
    await assertFails(base.set({ ...validProfile(), phone: "+23480123456789" }));
    await assertFails(base.set({ ...validProfile(), phone: "+234-801-234-5678" }));
  });

  it("user cannot set their own createdAt during update", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("profile-updater").set(validProfile());
    });
    await assertFails(
      ownerDb("profile-updater")
        .collection("users")
        .doc("profile-updater")
        .set({ ...validProfile(), createdAt: new Date(0) }),
    );
  });

  it("user cannot delete their profile", async () => {
    await assertFails(ownerDb("profile-locked").collection("users").doc("profile-locked").delete());
  });
});

// ----------------------------------------------------------------- CONTACTS

describe("users/{uid}/contacts/{id} — contact rules", () => {
  const collection = (uid: string) =>
    ownerDb(uid).collection("users").doc(uid).collection("contacts");

  it("unauthenticated user cannot access contacts", async () => {
    await assertFails(
      unauthDb().collection("users").doc("contacts-uid").collection("contacts").doc("c-unauth").get(),
    );
    await assertFails(
      unauthDb()
        .collection("users")
        .doc("contacts-uid")
        .collection("contacts")
        .doc("c-unauth")
        .set(validContact()),
    );
  });

  it("user can create a valid contact under their own uid", async () => {
    await assertSucceeds(collection("contacts-uid").doc("c-create").set(validContact()));
  });

  it("user can read their own contacts", async () => {
    await assertSucceeds(collection("contacts-uid").doc("c-create").get());
  });

  it("user cannot read another user's contacts", async () => {
    // Auth as intruder, but the document path belongs to contacts-uid.
    await assertFails(
      ownerDb("contacts-intruder")
        .collection("users")
        .doc("contacts-uid")
        .collection("contacts")
        .doc("c-create")
        .get(),
    );
  });

  it("user cannot create a contact under another user's uid", async () => {
    await assertFails(
      ownerDb("contacts-intruder")
        .collection("users")
        .doc("contacts-uid")
        .collection("contacts")
        .doc("c-intrude")
        .set(validContact()),
    );
  });

  it("user can update their own contact", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("users")
        .doc("contacts-uid")
        .collection("contacts")
        .doc("c-update")
        .set(validContact());
    });
    // Mirrors contactService: merge-update of changed fields + serverTimestamp
    // updatedAt, leaving the original createdAt untouched.
    await assertSucceeds(
      collection("contacts-uid").doc("c-update").set(
        { fullName: "Renamed Contact", updatedAt: SERVER_NOW },
        { merge: true },
      ),
    );
  });

  it("user can delete their own contact", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("users")
        .doc("contacts-uid")
        .collection("contacts")
        .doc("c-delete")
        .set(validContact());
    });
    await assertSucceeds(collection("contacts-uid").doc("c-delete").delete());
  });

  it("invalid relationship is rejected", async () => {
    await assertFails(
      collection("contacts-uid")
        .doc("c-bad-rel")
        .set({ ...validContact(), relationship: "Cousin" }),
    );
  });

  it("invalid phone format is rejected", async () => {
    await assertFails(
      collection("contacts-uid").doc("c-bad-phone").set({ ...validContact(), phoneNumber: "08012345678" }),
    );
    await assertFails(
      collection("contacts-uid").doc("c-bad-phone2").set({ ...validContact(), phoneNumber: "+15551234567" }),
    );
  });

  it("createdAt cannot be changed during update", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("users")
        .doc("contacts-uid")
        .collection("contacts")
        .doc("c-keep-created")
        .set(validContact());
    });
    await assertFails(
      collection("contacts-uid")
        .doc("c-keep-created")
        .set({ ...validContact(), createdAt: new Date(0) }),
    );
  });
});

// ----------------------------------------------------------------- ACTIVITY

describe("users/{uid}/activity/{id} — activity rules (append-only)", () => {
  const collection = (uid: string) =>
    ownerDb(uid).collection("users").doc(uid).collection("activity");

  it("user can create a valid activity entry", async () => {
    await assertSucceeds(collection("activity-uid").doc("a-create").set(validActivity()));
  });

  it("user can read their own activity", async () => {
    await assertSucceeds(collection("activity-uid").doc("a-create").get());
  });

  it("user cannot read another user's activity", async () => {
    // Auth as intruder, but the document path belongs to activity-uid.
    await assertFails(
      ownerDb("activity-intruder")
        .collection("users")
        .doc("activity-uid")
        .collection("activity")
        .doc("a-create")
        .get(),
    );
  });

  it("user cannot create activity under another user's uid", async () => {
    await assertFails(
      ownerDb("activity-intruder")
        .collection("users")
        .doc("activity-uid")
        .collection("activity")
        .doc("a-intrude")
        .set(validActivity()),
    );
  });

  it("user cannot update activity", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("users")
        .doc("activity-uid")
        .collection("activity")
        .doc("a-update")
        .set(validActivity());
    });
    await assertFails(
      collection("activity-uid").doc("a-update").set({ ...validActivity(), type: "emergency_action" }),
    );
  });

  it("user cannot delete activity", async () => {
    await assertFails(collection("activity-uid").doc("a-create").delete());
  });

  it("invalid activity type is rejected", async () => {
    await assertFails(
      collection("activity-uid").doc("a-bad-type").set({ ...validActivity(), type: "made_up_type" }),
    );
  });

  it("createdAt must use request.time on create", async () => {
    // A stale client-supplied timestamp is not request.time → rejected.
    await assertFails(
      collection("activity-uid").doc("a-stale").set({ ...validActivity(), createdAt: new Date(0) }),
    );
  });
});

// ------------------------------------------- ACTIVITY detail — exact shapes

describe("users/{uid}/activity/{id} — detail per-type shape validation", () => {
  /** Build an activity payload with the given type/detail. */
  function activityDetail(type: string, detail: DocumentData): DocumentData {
    return { type, detail, createdAt: SERVER_NOW };
  }

  /** Every canonical payload the application actually writes (8 call sites). */
  const ALL_VALID_PAYLOADS: Array<[string, DocumentData]> = [
    ["contact_added", { relationship: "Parent" }],
    ["contact_added", { relationship: "Other" }],
    ["contact_updated", { contactId: "abc123" }],
    ["contact_deleted", { contactId: "abc123" }],
    ["location_shared", { via: "sms", contactId: "abc123", coordinates: { latitude: 6.5244, longitude: 3.3792 } }],
    ["location_shared", { via: "get-help", coordinates: { latitude: -1.2921, longitude: 36.8219 } }],
    ["emergency_action", { action: "sms_prepared", contactId: "abc123", includedLocation: true }],
    ["emergency_action", { action: "call_initiated", contactId: "abc123", observedState: "composer-opened" }],
    ["offline_download", { version: "0.1.0-unreviewed" }],
  ];

  it("every valid activity shape is accepted", async () => {
    let i = 0;
    for (const [type, detail] of ALL_VALID_PAYLOADS) {
      await assertSucceeds(
        ownerDb("activity-uid")
          .collection("users")
          .doc("activity-uid")
          .collection("activity")
          .doc(`ad-ok-${i}`)
          .set(activityDetail(type, detail)),
      );
      i += 1;
    }
  });

  it("contact_added rejects invalid relationship", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-rel-bad").set(activityDetail("contact_added", { relationship: "Cousin" })),
    );
  });

  it("contact_added rejects missing relationship", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-rel-missing").set(activityDetail("contact_added", {})),
    );
  });

  it("contact_added rejects unknown extra detail key", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-rel-extra").set(activityDetail("contact_added", { relationship: "Friend", contactId: "x" })),
    );
  });

  it("contact_added rejects wrong relationship type", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-rel-type").set(activityDetail("contact_added", { relationship: 7 })),
    );
  });

  it("contact_updated rejects missing contactId", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-upd-missing").set(activityDetail("contact_updated", {})),
    );
  });

  it("contact_updated rejects wrong contactId type", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-upd-type").set(activityDetail("contact_updated", { contactId: 123 })),
    );
  });

  it("contact_deleted rejects missing contactId and extra keys", async () => {
    const act = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    await assertFails(act.doc("ad-del-missing").set(activityDetail("contact_deleted", {})));
    await assertFails(
      act.doc("ad-del-extra").set(activityDetail("contact_deleted", { contactId: "x", relationship: "Friend" })),
    );
  });

  it("location_shared accepts both variants and rejects incorrect via", async () => {
    const act = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    // Both canonical variants already covered by ALL_VALID_PAYLOADS; here the via value.
    await assertFails(
      act.doc("ad-via-bad").set(
        activityDetail("location_shared", { via: "web", coordinates: { latitude: 1, longitude: 2 } }),
      ),
    );
    await assertFails(
      act.doc("ad-via-missing").set(activityDetail("location_shared", { coordinates: { latitude: 1, longitude: 2 } })),
    );
  });

  it("location_shared rejects malformed coordinates", async () => {
    const act = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    // string latitude
    await assertFails(
      act.doc("ad-coord-str").set(
        activityDetail("location_shared", { via: "get-help", coordinates: { latitude: "6.5", longitude: 3.37 } }),
      ),
    );
    // missing longitude
    await assertFails(
      act.doc("ad-coord-missing").set(activityDetail("location_shared", { via: "get-help", coordinates: { latitude: 6.5 } })),
    );
    // coordinates not a map
    await assertFails(
      act.doc("ad-coord-nonmap").set(activityDetail("location_shared", { via: "get-help", coordinates: "6.5,3.4" })),
    );
  });

  it("location_shared rejects extra coordinate keys", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-coord-extra").set(
          activityDetail("location_shared", {
            via: "get-help",
            coordinates: { latitude: 6.5, longitude: 3.4, accuracy: 12 },
          }),
        ),
    );
  });

  it("location_shared rejects extra top-level detail keys", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-loc-extra").set(
          activityDetail("location_shared", {
            via: "sms",
            contactId: "abc123",
            coordinates: { latitude: 6.5, longitude: 3.4 },
            note: "extra",
          }),
        ),
    );
  });

  it("emergency_action rejects incorrect action/shape combinations", async () => {
    const act = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    // sms_prepared carrying the call variant's observedState key instead of includedLocation
    await assertFails(
      act.doc("ad-act-mix").set(
        activityDetail("emergency_action", { action: "sms_prepared", contactId: "abc", observedState: "composer-opened" }),
      ),
    );
    // call_initiated carrying the SMS variant's includedLocation key instead of observedState
    await assertFails(
      act.doc("ad-act-mix2").set(
        activityDetail("emergency_action", { action: "call_initiated", contactId: "abc", includedLocation: true }),
      ),
    );
    // unknown action value
    await assertFails(
      act.doc("ad-act-unknown").set(
        activityDetail("emergency_action", { action: "text_sent", contactId: "abc", includedLocation: false }),
      ),
    );
    // sms_prepared with includedLocation of wrong type
    await assertFails(
      act.doc("ad-act-bool").set(
        activityDetail("emergency_action", { action: "sms_prepared", contactId: "abc", includedLocation: "yes" }),
      ),
    );
    // missing contactId
    await assertFails(
      act.doc("ad-act-noid").set(
        activityDetail("emergency_action", { action: "sms_prepared", includedLocation: false }),
      ),
    );
    // observedState outside the CommunicationState union
    await assertFails(
      act.doc("ad-act-state").set(
        activityDetail("emergency_action", { action: "call_initiated", contactId: "abc", observedState: "delivered" }),
      ),
    );
  });

  it("offline_download rejects missing and wrong version", async () => {
    const act = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    await assertFails(act.doc("ad-ver-missing").set(activityDetail("offline_download", {})));
    await assertFails(act.doc("ad-ver-type").set(activityDetail("offline_download", { version: 3 })));
    await assertFails(
      act.doc("ad-ver-extra").set(activityDetail("offline_download", { version: "1.0.0", category: "first-aid" })),
    );
  });

  it("detail shape for one type is rejected when paired with another type", async () => {
    await assertFails(
      ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity")
        .doc("ad-cross-type").set(activityDetail("contact_updated", { relationship: "Friend" })),
    );
  });

  it("non-map detail and empty detail are rejected", async () => {
    const act = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    await assertFails(
      act.doc("ad-nonmap").set({ type: "contact_added", detail: "Friend", createdAt: SERVER_NOW }),
    );
    await assertFails(
      act.doc("ad-empty").set(activityDetail("contact_added", {})),
    );
  });

  it("detail hardening does not weaken cross-user and append-only protections", async () => {
    const victimDocs = ownerDb("activity-uid").collection("users").doc("activity-uid").collection("activity");
    // Cross-user create with a perfectly valid detail shape is still denied.
    await assertFails(
      ownerDb("activity-intruder")
        .collection("users")
        .doc("activity-uid")
        .collection("activity")
        .doc("ad-intrude")
        .set(activityDetail("contact_added", { relationship: "Friend" })),
    );
    // Append-only still holds: an existing valid document cannot be updated
    // even with another perfectly valid detail shape.
    await assertFails(
      victimDocs.doc("ad-ok-0").set(activityDetail("contact_updated", { contactId: "abc123" })),
    );
    await assertFails(victimDocs.doc("ad-ok-0").delete());
  });
});

// ---------------------------------------------------------------- FIRST-AID

describe("firstAidGuides — public read, no client writes", () => {
  it("unauthenticated users can read firstAidGuides", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("firstAidGuides").doc("bleeding").set({ title: "Bleeding" });
    });
    await assertSucceeds(unauthDb().collection("firstAidGuides").doc("bleeding").get());
  });

  it("unauthenticated users can read versions", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("firstAidGuides")
        .doc("bleeding")
        .collection("versions")
        .doc("v1")
        .set({ content: "c" });
    });
    await assertSucceeds(
      unauthDb().collection("firstAidGuides").doc("bleeding").collection("versions").doc("v1").get(),
    );
  });

  it("unauthenticated users cannot write firstAidGuides", async () => {
    await assertFails(
      unauthDb().collection("firstAidGuides").doc("choking").set({ title: "Choking" }),
    );
  });

  it("unauthenticated users cannot write versions", async () => {
    await assertFails(
      unauthDb()
        .collection("firstAidGuides")
        .doc("bleeding")
        .collection("versions")
        .doc("v2")
        .set({ content: "c" }),
    );
  });

  it("authenticated users cannot write firstAidGuides either", async () => {
    await assertFails(
      ownerDb("any-uid").collection("firstAidGuides").doc("choking").set({ title: "Choking" }),
    );
  });
});

// --------------------------------------------------------------- FACILITIES

describe("facilities — public read, no client writes", () => {
  it("unauthenticated users can read facilities", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("facilities").doc("fac-1").set({ name: "F" });
    });
    await assertSucceeds(unauthDb().collection("facilities").doc("fac-1").get());
  });

  it("unauthenticated users cannot create facilities", async () => {
    await assertFails(unauthDb().collection("facilities").doc("fac-2").set({ name: "F" }));
  });

  it("unauthenticated users cannot update facilities", async () => {
    await assertFails(unauthDb().collection("facilities").doc("fac-1").set({ name: "G" }));
  });

  it("unauthenticated users cannot delete facilities", async () => {
    await assertFails(unauthDb().collection("facilities").doc("fac-1").delete());
  });

  it("authenticated users cannot write facilities either", async () => {
    await assertFails(ownerDb("any-uid").collection("facilities").doc("fac-3").set({ name: "F" }));
  });
});

// ------------------------------------------------------------------- CONFIG

describe("config — public read, no client writes", () => {
  it("unauthenticated users can read config", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("config").doc("contentVersion").set({ version: "1" });
    });
    await assertSucceeds(unauthDb().collection("config").doc("contentVersion").get());
  });

  it("unauthenticated users cannot write config", async () => {
    await assertFails(unauthDb().collection("config").doc("other").set({ x: 1 }));
  });

  it("authenticated users cannot write config either", async () => {
    await assertFails(ownerDb("any-uid").collection("config").doc("other").set({ x: 1 }));
  });
});

// ------------------------------------------------------------- DEFAULT DENY

describe("default deny — unlisted paths are locked", () => {
  it("arbitrary unlisted collection cannot be read or written", async () => {
    await assertFails(unauthDb().collection("someRandomCollection").doc("x").get());
    await assertFails(unauthDb().collection("someRandomCollection").doc("x").set({ a: 1 }));
    await assertFails(ownerDb("any-uid").collection("someRandomCollection").doc("x").set({ a: 1 }));
  });

  it("escalation attempts outside the users family are denied", async () => {
    await assertFails(ownerDb("any-uid").collection("users_other").doc("any-uid").get());
    await assertFails(ownerDb("any-uid").collection("admins").doc("any-uid").set({ isAdmin: true }));
  });
});

// ------------------------------------------------- CROSS-USER CONSISTENCY

describe("cross-user access consistency", () => {
  const A = "cross-user-a";
  const B = "cross-user-b";

  it("profile, contacts and activity of user B are consistently invisible to user A", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const w = ctx.firestore();
      await w.collection("users").doc(B).set(validProfile());
      await w.collection("users").doc(B).collection("contacts").doc("c1").set(validContact());
      await w.collection("users").doc(B).collection("activity").doc("a1").set(validActivity());
    });
    const asA = ownerDb(A);
    await assertFails(asA.collection("users").doc(B).get());
    await assertFails(asA.collection("users").doc(B).collection("contacts").doc("c1").get());
    await assertFails(asA.collection("users").doc(B).collection("contacts").doc("c2").set(validContact()));
    await assertFails(asA.collection("users").doc(B).collection("activity").doc("a1").get());
    await assertFails(asA.collection("users").doc(B).collection("activity").doc("a2").set(validActivity()));
  });
});

// ------------------------------------------------------------ ADMIN ACCESS

/** A minimal VALID guide payload satisfying every Stage 3 rule constraint. */
function validGuide(id = "bleeding"): DocumentData {
  return {
    id,
    label: "Bleeding",
    summary: "Control severe bleeding while help arrives.",
    iconClass: "first-aid",
    content: {
      contentVersion: "2026-09-01",
      summary: "Control severe bleeding while help arrives.",
      // The application's GuideStep model: { title, text } required,
      // image/imageAlt/warning optional (reconciled with isValidGuideStep).
      steps: [{ title: "Press", text: "Apply firm direct pressure." }],
      dos: ["Press firmly"],
      donts: ["Do not remove embedded objects"],
      whenToSeekHelp: ["Bleeding does not stop"],
      quickGuide: {
        immediatePriority: "Apply firm direct pressure.",
        essentialActions: ["Press firmly on the wound."],
        criticalDonts: ["Do not remove embedded objects."],
      },
      provenance: [],
    },
    provenance: [],
    publishedAt: SERVER_NOW,
  };
}

/** The same guide payload as a DRAFT document (server-set updatedAt instead of publishedAt). */
function validDraft(id = "bleeding"): DocumentData {
  const body: DocumentData = { ...validGuide(id) };
  delete body.publishedAt;
  return { ...body, updatedAt: SERVER_NOW };
}

describe("users/{uid} — admin read (Stage 3)", () => {
  it("admin can read any user's profile", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("admin-target").set(validProfile());
    });
    await assertSucceeds(adminDb("admin-reader").collection("users").doc("admin-target").get());
  });

  it("admin can list users", async () => {
    await assertSucceeds(adminDb("admin-lister").collection("users").where("displayName", "!=", "").get());
  });

  it("admin writes to user profiles remain denied — owner-controlled by design", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("admin-target").set(validProfile());
    });
    await assertFails(
      adminDb("admin-reader").collection("users").doc("admin-target").update({ displayName: "Hijacked" }),
    );
    await assertFails(
      adminDb("admin-reader").collection("users").doc("admin-target").delete(),
    );
  });

  it("unauthenticated users still cannot read users", async () => {
    await assertFails(unauthDb().collection("users").doc("admin-target").get());
  });

  it("authenticated non-admin remains denied for another user's profile", async () => {
    await assertFails(ownerDb("plain-user").collection("users").doc("admin-target").get());
  });

  it("claim strictness — only boolean true authorizes (false / \"true\" / 1 / \"1\" / {} / missing)", async () => {
    await assertFails(claimantDb("claimant-false", false).collection("users").doc("admin-target").get());
    await assertFails(claimantDb("claimant-str", "true").collection("users").doc("admin-target").get());
    await assertFails(claimantDb("claimant-one", 1).collection("users").doc("admin-target").get());
    await assertFails(claimantDb("claimant-str-one", "1").collection("users").doc("admin-target").get());
    await assertFails(claimantDb("claimant-obj", {}).collection("users").doc("admin-target").get());
    // No admin claim at all — the plain authenticated user from the helpers.
    await assertFails(ownerDb("claimant-none").collection("users").doc("admin-target").get());
  });
});

describe("firstAidGuides — admin writes (Stage 3)", () => {
  it("public read is preserved for guides and versions", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("firstAidGuides").doc("bleeding").set(validGuide());
    });
    await assertSucceeds(unauthDb().collection("firstAidGuides").doc("bleeding").get());
    await assertSucceeds(
      unauthDb().collection("firstAidGuides").doc("bleeding").collection("versions").doc("v1").get(),
    );
  });

  it("admin can create a valid guide (publishedAt must be the server time)", async () => {
    await assertSucceeds(
      adminDb("guide-admin").collection("firstAidGuides").doc("choking").set(validGuide("choking")),
    );
  });

  it("admin create with a client-set publishedAt is rejected (server-set only)", async () => {
    await assertFails(
      adminDb("guide-admin-2")
        .collection("firstAidGuides")
        .doc("burns")
        .set({ ...validGuide("burns"), publishedAt: new Date("2026-01-01T00:00:00Z") }),
    );
    await assertFails(
      adminDb("guide-admin-2").collection("firstAidGuides").doc("burns").set({ ...validGuide("burns"), publishedAt: "not-a-timestamp" }),
    );
  });

  it("admin can update a valid guide without changing publishedAt", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("firstAidGuides").doc("bleeding").set(validGuide());
    });
    await assertSucceeds(
      adminDb("guide-admin-3")
        .collection("firstAidGuides")
        .doc("bleeding")
        .update({ label: "Severe Bleeding", "content.summary": "Updated summary." }),
    );
  });

  it("admin cannot delete guides — withdraw by publishing a new version instead", async () => {
    await assertFails(adminDb("guide-admin-4").collection("firstAidGuides").doc("bleeding").delete());
  });

  it("authenticated non-admin cannot write guides", async () => {
    await assertFails(
      ownerDb("guide-non-admin").collection("firstAidGuides").doc("fracture").set(validGuide("fracture")),
    );
  });

  it("unauthenticated users still cannot write guides", async () => {
    await assertFails(
      unauthDb().collection("firstAidGuides").doc("fracture").set(validGuide("fracture")),
    );
  });

  it("invalid content is rejected even for admins", async () => {
    // Unknown top-level key.
    await assertFails(
      adminDb("guide-admin-5")
        .collection("firstAidGuides")
        .doc("poisoning")
        .set({ ...validGuide("poisoning"), isAdminField: true }),
    );
    // Empty steps list — a guide without steps is not publishable.
    await assertFails(
      adminDb("guide-admin-5")
        .collection("firstAidGuides")
        .doc("poisoning")
        .set({
          ...validGuide("poisoning"),
          content: { ...validGuide("poisoning").content as DocumentData, steps: [] },
        }),
    );
  });

  it("immutable version protections remain enforced — even for admins", async () => {
    await assertFails(
      adminDb("guide-admin-6")
        .collection("firstAidGuides")
        .doc("bleeding")
        .collection("versions")
        .doc("v2")
        .set({ content: "c" }),
    );
  });

  it("step media fields (image/imageAlt/warning) are accepted — application model", async () => {
    await assertSucceeds(
      adminDb("guide-admin-7").collection("firstAidGuides").doc("burns-step-media").set({
        ...validGuide("burns-step-media"),
        content: {
          ...validGuide("burns-step-media").content as DocumentData,
          steps: [
            {
              title: "Cool the burn",
              text: "Cool the burn under cool running water.",
              image: "/images/first-aid/burns/burns-cool-running-water.jpg",
              imageAlt: "Hands under cool running water.",
              warning: "Do not use ice.",
            },
          ],
        },
      }),
    );
  });

  it("a Storage download URL on guide image and step image passes the 512 bound", async () => {
    const storageUrl =
      "https://firebasestorage.googleapis.com/v0/b/lifeguard360.appspot.com/o/images%2Fburns%2Fabc.png?alt=media&token=11111111-2222-3333-4444-555555555555";
    await assertSucceeds(
      adminDb("guide-admin-8").collection("firstAidGuides").doc("burns-storage-url").set({
        ...validGuide("burns-storage-url"),
        image: storageUrl,
        content: {
          ...validGuide("burns-storage-url").content as DocumentData,
          steps: [{ title: "Cool the burn", text: "Cool under running water.", image: storageUrl }],
        },
      }),
    );
  });

  it("an over-long guide image (beyond 512) is rejected", async () => {
    await assertFails(
      adminDb("guide-admin-9")
        .collection("firstAidGuides")
        .doc("burns-image-too-long")
        .set({ ...validGuide("burns-image-too-long"), image: "x".repeat(513) }),
    );
  });

  it("legacy/unknown step keys are still rejected (schema stays closed)", async () => {
    await assertFails(
      adminDb("guide-admin-10").collection("firstAidGuides").doc("burns-legacy-keys").set({
        ...validGuide("burns-legacy-keys"),
        content: {
          ...validGuide("burns-legacy-keys").content as DocumentData,
          steps: [
            { title: "Press", text: "Apply pressure.", flaggedPhrases: [] },
          ],
        },
      }),
    );
    await assertFails(
      adminDb("guide-admin-10").collection("firstAidGuides").doc("burns-missing-text").set({
        ...validGuide("burns-missing-text"),
        content: {
          ...validGuide("burns-missing-text").content as DocumentData,
          steps: [{ title: "Press" }], // missing text
        },
      }),
    );
  });
});

describe("firstAidDrafts — admin-only draft working copies (CMS)", () => {
  it("admin can create and read a valid draft; the public cannot", async () => {
    await assertSucceeds(
      adminDb("draft-admin-1").collection("firstAidDrafts").doc("burns").set(validDraft("burns")),
    );
    await assertSucceeds(adminDb("draft-admin-1").collection("firstAidDrafts").doc("burns").get());
    await assertFails(unauthDb().collection("firstAidDrafts").doc("burns").get());
    await assertFails(ownerDb("draft-reader").collection("firstAidDrafts").doc("burns").get());
  });

  it("admin can list drafts; non-admin and unauthenticated cannot", async () => {
    await assertSucceeds(adminDb("draft-admin-2").collection("firstAidDrafts").get());
    await assertFails(ownerDb("draft-lister").collection("firstAidDrafts").get());
    await assertFails(unauthDb().collection("firstAidDrafts").get());
  });

  it("admin can update a draft — updatedAt is server-set every time", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("firstAidDrafts").doc("bleeding").set(validDraft());
    });
    await assertSucceeds(
      adminDb("draft-admin-3")
        .collection("firstAidDrafts")
        .doc("bleeding")
        .update({ label: "Bleeding (edited)", updatedAt: SERVER_NOW }),
    );
    // A client-chosen timestamp is rejected.
    await assertFails(
      adminDb("draft-admin-3")
        .collection("firstAidDrafts")
        .doc("bleeding")
        .update({ label: "Nope", updatedAt: new Date("2026-01-01T00:00:00Z") }),
    );
  });

  it("admin can discard a draft — published guides stay untouched", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("firstAidDrafts").doc("choking").set(validDraft("choking"));
    });
    await assertSucceeds(adminDb("draft-admin-4").collection("firstAidDrafts").doc("choking").delete());
  });

  it("authenticated non-admin cannot create, update or delete drafts", async () => {
    await assertFails(
      ownerDb("draft-non-admin").collection("firstAidDrafts").doc("burns").set(validDraft("burns")),
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("firstAidDrafts").doc("fractures").set(validDraft("fractures"));
    });
    await assertFails(
      ownerDb("draft-non-admin").collection("firstAidDrafts").doc("fractures").update({ label: "Hijacked" }),
    );
    await assertFails(ownerDb("draft-non-admin").collection("firstAidDrafts").doc("fractures").delete());
  });

  it("a draft may not carry publishedAt — publication state is the collection", async () => {
    await assertFails(
      adminDb("draft-admin-5").collection("firstAidDrafts").doc("burns").set({
        ...validDraft("burns"),
        publishedAt: SERVER_NOW,
      }),
    );
  });

  it("draft content is validated exactly like published content", async () => {
    // Invalid step shape.
    await assertFails(
      adminDb("draft-admin-6").collection("firstAidDrafts").doc("burns").set({
        ...validDraft("burns"),
        content: {
          ...validDraft("burns").content as DocumentData,
          steps: [{ number: 1, title: "Press", text: "Apply pressure.", flaggedPhrases: [] }],
        },
      }),
    );
    // Empty steps list.
    await assertFails(
      adminDb("draft-admin-6").collection("firstAidDrafts").doc("burns").set({
        ...validDraft("burns"),
        content: { ...validDraft("burns").content as DocumentData, steps: [] },
      }),
    );
    // Unknown top-level key.
    await assertFails(
      adminDb("draft-admin-6")
        .collection("firstAidDrafts")
        .doc("burns")
        .set({ ...validDraft("burns"), draftNote: "unvalidated free text" }),
    );
  });
});
