import { useState, type JSX } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import {
  refreshCurrentUser,
  resendVerificationEmail,
} from "@/services/auth/authService";
import styles from "@/components/EmailVerificationNotice.module.css";

type SendState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent" }
  | { phase: "failed"; message: string }
  | { phase: "refreshed-verified" }
  | { phase: "refresh-failed"; message: string };

/**
 * Persistent, honest notice for signed-in users whose email is not verified
 * yet (Firebase's real emailVerified state — never simulated). Offers the two
 * real recovery actions: re-send the verification email, and re-check the
 * verification state after the user has clicked the link in the email.
 */
export function EmailVerificationNotice(): JSX.Element | null {
  const { authState } = useAuth();
  const [sendState, setSendState] = useState<SendState>({ phase: "idle" });

  const user = authState.user;
  if (authState.status !== "signed-in" || user === null) return null;
  if (user.emailVerified === true) return null;

  const handleResend = (): void => {
    setSendState({ phase: "sending" });
    resendVerificationEmail().then(
      () => setSendState({ phase: "sent" }),
      (error: unknown) =>
        setSendState({
          phase: "failed",
          message: error instanceof Error ? error.message : "Could not send the email. Try again.",
        }),
    );
  };

  const handleRecheck = (): void => {
    setSendState({ phase: "sending" });
    refreshCurrentUser().then(
      () => setSendState({ phase: "refreshed-verified" }),
      (error: unknown) =>
        setSendState({
          phase: "refresh-failed",
          message: error instanceof Error ? error.message : "Could not refresh. Try again.",
        }),
    );
  };

  return (
    <div className={styles.notice} role="status" data-testid="email-verification-notice">
      <p className={styles.text}>
        <strong>Verify your email.</strong> We sent a verification link to{" "}
        <span className={styles.email}>{user.email}</span>. Open it and follow the
        link — some features (and the admin area) wait for a verified address.
        Can’t find it? Check your spam folder.
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={handleResend}
          disabled={sendState.phase === "sending"}
        >
          {sendState.phase === "sending" ? "Sending…" : "Resend email"}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={handleRecheck}
          disabled={sendState.phase === "sending"}
        >
          I’ve verified — check now
        </button>
      </div>
      {sendState.phase === "sent" && (
        <p className={styles.status}>Verification email sent again — check your inbox.</p>
      )}
      {sendState.phase === "failed" && (
        <p className={styles.error} role="alert">
          {sendState.message}
        </p>
      )}
      {sendState.phase === "refreshed-verified" && (
        <p className={styles.status}>
          Still unverified on our side — make sure you clicked the most recent
          verification link, then check again.
        </p>
      )}
      {sendState.phase === "refresh-failed" && (
        <p className={styles.error} role="alert">
          {sendState.message}
        </p>
      )}
    </div>
  );
}
