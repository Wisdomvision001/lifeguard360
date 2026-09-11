import { useState, type FormEvent, type JSX } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field, TextField } from "@/components/Field";
import { signInWithEmail, sendPasswordReset } from "@/services/auth/authService";
import { describeFirebaseError } from "@/services/firebase/db";
import styles from "@/pages/AuthPage.module.css";

/**
 * Sign in (Phase 2). Errors are honest Firebase messages — no fabricated
 * success states; the offline path surfaces a network error plainly.
 */
export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
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
          {resetMessage !== null && (
            <p role="status" className={styles.infoNote}>
              {resetMessage}
            </p>
          )}

          <Button type="submit" size="lg" block disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

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
