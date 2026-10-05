import { useState, type FormEvent, type JSX } from "react";
import { Link, useNavigate } from "react-router";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field, TextField } from "@/components/Field";
import { GoogleGlyph } from "@/components/GoogleGlyph";
import {
  registerWithEmail,
  signInWithGoogle,
  GoogleSignInCancelledError,
} from "@/services/auth/authService";
import { describeFirebaseError } from "@/services/firebase/db";
import styles from "@/pages/AuthPage.module.css";

/**
 * Create account (Phase 2 + Google). Password floor is deliberately modest
 * but real: 8+ characters with at least one letter and one digit. No fake
 * strength meters — just an enforceable rule with a clear message.
 * Registration triggers Firebase's real verification email; a persistent
 * notice offers resend until the address is verified.
 */
export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const passwordValid = password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);

  const handleGoogle = async (): Promise<void> => {
    setGoogleSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      // New Google identities are created automatically by Firebase; existing
      // Google users sign in. (A password account with the same address is
      // handled on the sign-in page's linking flow.)
      await signInWithGoogle();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof GoogleSignInCancelledError) {
        setInfo("Google sign-in was cancelled. You can try again any time.");
      } else if (
        err instanceof Error &&
        /already exists with a password/i.test(err.message)
      ) {
        // Same email already registered with a password — linking happens
        // during sign-in, where the password can be collected.
        setError(err.message + " Go to sign-in to link it.");
      } else {
        setError(describeFirebaseError(err));
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!passwordValid) {
      setError("Password must be at least 8 characters and include a letter and a number.");
      return;
    }
    if (displayName.trim().length < 2) {
      setError("Enter your name so we can personalise your account.");
      return;
    }
    setSubmitting(true);
    try {
      await registerWithEmail(displayName.trim(), email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(describeFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.authWrap}>
      <Card className={styles.authCard}>
        <h1 className={styles.authTitle}>Create your account</h1>
        <p className={styles.authSubtitle}>
          A registered account unlocks emergency contacts, activity history and the offline
          first-aid package. First-aid guidance is available to everyone, no account needed.
        </p>

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <Field label="Your name" htmlFor="register-name">
            <TextField
              id="register-name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="e.g. Ada Obi"
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Email" htmlFor="register-email">
            <TextField
              id="register-email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field
            label="Password"
            htmlFor="register-password"
            hint="At least 8 characters, with a letter and a number."
          >
            <TextField
              id="register-password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
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

          <Button type="submit" size="lg" block disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
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

        <div className={styles.authFooter}>
          <p>
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
