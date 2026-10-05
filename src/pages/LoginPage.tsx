import { useState, type FormEvent, type JSX } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field, TextField } from "@/components/Field";
import { GoogleGlyph } from "@/components/GoogleGlyph";
import {
  signInWithEmail,
  sendPasswordReset,
  signInWithGoogle,
  linkGoogleAccount,
  GoogleSignInCancelledError,
  GoogleSignInLinkNeededError,
} from "@/services/auth/authService";
import { describeFirebaseError } from "@/services/firebase/db";
import styles from "@/pages/AuthPage.module.css";

/**
 * Sign in (Phase 2 + Google). Two real Firebase paths:
 *   - email/password (with the real password-reset email flow), and
 *   - "Continue with Google" via signInWithPopup — cancellation is a benign
 *     status, not an error; an existing password account with the same email
 *     completes through Firebase's account-linking flow (prove ownership with
 *     the password, then the Google credential is linked to that account).
 * Errors are honest Firebase messages — no fabricated success states.
 */
export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  // Set when Google sign-in hit an existing password account: which email to
  // link, and the pending Google credential to attach after password proof.
  const [linkNeeded, setLinkNeeded] = useState<GoogleSignInLinkNeededError | null>(null);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    setResetMessage(null);
    try {
      await signInWithEmail(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async (): Promise<void> => {
    setGoogleSubmitting(true);
    setError(null);
    setInfo(null);
    setResetMessage(null);
    try {
      await signInWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof GoogleSignInCancelledError) {
        // The user dismissed the popup — a normal choice, not a failure.
        setInfo("Google sign-in was cancelled. You can try again any time.");
      } else if (err instanceof GoogleSignInLinkNeededError) {
        setLinkNeeded(err);
        setLinkPassword("");
      } else {
        setError(describeFirebaseError(err));
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleLinkSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (linkNeeded === null) return;
    setLinkSubmitting(true);
    setError(null);
    try {
      await linkGoogleAccount(linkNeeded.email, linkPassword, linkNeeded.credential);
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeFirebaseError(err));
    } finally {
      setLinkSubmitting(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    if (email.trim() === "") {
      setResetMessage("Enter your email address above first, then request a reset link.");
      return;
    }
    setResetMessage(null);
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      setResetMessage(`Password reset email sent to ${email.trim()}. Check your inbox.`);
    } catch (err) {
      setError(describeFirebaseError(err));
    }
  };

  return (
    <div className={styles.authWrap}>
      <Card className={styles.authCard}>
        <h1 className={styles.authTitle}>Welcome back</h1>
        <p className={styles.authSubtitle}>
          Sign in to manage your emergency contacts, activity history and offline first aid.
        </p>

        {linkNeeded !== null ? (
          <form className={styles.form} onSubmit={(event) => void handleLinkSubmit(event)}>
            <p className={styles.infoNote} role="status">
              An account already exists for <strong>{linkNeeded.email}</strong> with a
              password. Enter that password once to link Google sign-in to the same
              account — from then on “Continue with Google” works directly.
            </p>
            <Field label="Password" htmlFor="link-password">
              <TextField
                id="link-password"
                type="password"
                value={linkPassword}
                onChange={setLinkPassword}
                autoComplete="current-password"
                required
              />
            </Field>
            {error !== null && (
              <p role="alert" className={styles.errorNote}>
                {error}
              </p>
            )}
            <Button type="submit" size="lg" block disabled={linkSubmitting}>
              {linkSubmitting ? "Linking accounts…" : "Link Google sign-in"}
            </Button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setLinkNeeded(null);
                setError(null);
              }}
            >
              Use a different sign-in method
            </button>
          </form>
        ) : (
          <>
            <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
              <Field label="Email" htmlFor="login-email">
                <TextField
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password" htmlFor="login-password">
                <TextField
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  required
                />
              </Field>

              {error !== null && (
                <p role="alert" className={styles.errorNote}>
                  {error}
                </p>
              )}
              {info !== null && (
                <p role="status" className={styles.infoNote}>
                  {info}
                </p>
              )}
              {resetMessage !== null && (
                <p role="status" className={styles.infoNote}>
                  {resetMessage}
                </p>
              )}

              <Button type="submit" size="lg" block disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className={styles.divider}>or</p>

            <button
              type="button"
              className={styles.googleButton}
              onClick={() => void handleGoogle()}
              disabled={googleSubmitting}
            >
              <GoogleGlyph />
              {googleSubmitting ? "Opening Google…" : "Continue with Google"}
            </button>
          </>
        )}

        <div className={styles.authFooter}>
          <button type="button" className={styles.linkButton} onClick={() => void handleReset()}>
            Forgot password?
          </button>
          <p>
            New here? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
