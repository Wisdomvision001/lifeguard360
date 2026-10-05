import { useEffect, useState } from "react";
import type { JSX } from "react";

import {
  listUserProfiles,
  type AdminUserProfileSummary,
} from "@/services/admin/adminUserService";
import { useAuth } from "@/app/providers/AuthProvider";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import styles from "@/pages/admin/AdminUsersPage.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; profiles: AdminUserProfileSummary[] }
  | { kind: "error"; message: string };

/**
 * Admin Users (read-only).
 *
 * What is real: Firestore rules allow an admin-claim holder to READ and LIST
 * users/{uid} profiles, so "Load user profiles" performs that exact query.
 * What is deliberately absent: any write path. Profile writes are
 * owner-controlled by rules; contacts and activity are owner-private and are
 * never read here. Sensitive authentication details (email/password state)
 * belong to Firebase Authentication and are not exposed from the client.
 */
export function AdminUsersPage(): JSX.Element {
  const { authState } = useAuth();
  const isAdmin =
    authState.status === "signed-in" && authState.claims.admin === true;
  // RequireAdmin only admits verified admins, but this page still states the
  // contract honestly: the load attempt is made for whoever is signed in,
  // and Firestore rules — never the UI — decide the real outcome.
  const adminGateNote =
    authState.status === "signed-in" && !isAdmin
      ? "Signed in without an admin claim — the directory query is expected to be rejected by Firestore rules."
      : null;

  // Starts in "loading": the mount effect begins the query and state is only
  // ever updated from the async callbacks below — never synchronously inside
  // the effect (the project's react-hooks/set-state-in-effect convention).
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const fetchProfiles = (): void => {
    listUserProfiles()
      .then((profiles) => setState({ kind: "loaded", profiles }))
      .catch((error: unknown) =>
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not load user profiles.",
        }),
      );
  };

  const load = (): void => {
    setState({ kind: "loading" });
    fetchProfiles();
  };

  // Auto-load once on mount: the query succeeds only for a principal whose
  // ID token carries the admin claim — Firestore rules enforce that
  // independently of anything rendered here.
  useEffect(() => {
    fetchProfiles();
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Users</h1>
        <p>
          Registered Lifeguard360 user profiles, read directly from Firestore.
          This directory is read-only by design.
        </p>
      </header>

      <Card
        title="User directory"
        titleIcon="user"
        actions={
          <Button variant="outline" icon="history" onClick={load} disabled={state.kind === "loading"}>
            Refresh
          </Button>
        }
      >
        {adminGateNote !== null && (
          <p className={styles.notice} role="note">
            {adminGateNote}
          </p>
        )}

        {state.kind === "loading" && (
          <p className={styles.stateText} aria-busy="true">
            Loading user profiles…
          </p>
        )}

        {state.kind === "error" && (
          <div className={styles.errorBox} role="alert">
            <p className={styles.stateText}>{state.message}</p>
            <Button variant="outline" icon="history" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {state.kind === "loaded" &&
          (state.profiles.length === 0 ? (
            <p className={styles.stateText}>
              No user profiles exist yet. Profiles appear here as people
              register for Lifeguard360 accounts.
            </p>
          ) : (
            <>
              <p className={styles.countNote} role="status">
                {state.profiles.length} registered {state.profiles.length === 1 ? "user" : "users"}
              </p>
              <ul className={styles.userList}>
                {state.profiles.map((profile) => (
                  <li key={profile.uid} className={styles.userRow}>
                    <span className={styles.userName}>{profile.displayName}</span>
                    <span className={styles.userMeta}>
                      UID <code>{profile.uid}</code>
                    </span>
                    <span className={styles.userMeta}>
                      Joined{" "}
                      {profile.createdAt === ""
                        ? "date not recorded"
                        : new Date(profile.createdAt).toLocaleDateString("en-NG", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                    </span>
                    <Badge tone="neutral">Read-only</Badge>
                  </li>
                ))}
              </ul>
            </>
          ))}
      </Card>

      <Card title="Access boundaries" titleIcon="alert">
        <ul className={styles.boundaryList}>
          <li>Profile display names and join dates — readable by admins (Firestore rules).</li>
          <li>Contacts and activity history — private to each user; admins cannot read them, and this page never attempts it.</li>
          <li>Passwords and sign-in credentials — belong to Firebase Authentication; never exposed in the app.</li>
          <li>Editing or deleting users — requires Admin SDK tooling in a later phase; no client-side user management is attempted.</li>
        </ul>
      </Card>
    </div>
  );
}
