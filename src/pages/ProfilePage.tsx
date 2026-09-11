import { useEffect, useState, type JSX } from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, TextField } from "@/components/Field";
import {
  loadUserProfile,
  signOutUser,
  updateUserProfileFields,
  updatePreferences,
} from "@/services/auth/authService";
import {
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  storeLocale,
  getStoredLocale,
} from "@/services/i18n/i18nService";
import { describeFirebaseError } from "@/services/firebase/db";
import styles from "@/pages/ProfilePage.module.css";

/**
 * Profile (Phase 2): registered-user identity, preferences, sign-out.
 * Guests never reach this page (route is account-gated).
 */
export function ProfilePage(): JSX.Element {
  const { authState } = useAuth();
  const signedIn = authState.status === "signed-in";
  const uid = signedIn ? (authState.user?.uid ?? null) : null;

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [language, setLanguage] = useState<string>(getStoredLocale());

  useEffect(() => {
    if (uid === null) return;
    let cancelled = false;
    loadUserProfile(uid)
      .then((profile) => {
        if (cancelled) return;
        setDisplayName(profile?.displayName ?? authState.user?.displayName ?? "");
        setPhone(profile?.phone ?? "");
      })
      .catch(() => {
        if (!cancelled) setDisplayName(authState.user?.displayName ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, authState.user]);

  const handleSaveProfile = async (): Promise<void> => {
    if (uid === null) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      await updateUserProfileFields(uid, {
        displayName: displayName.trim() || "User",
        phone: phone.trim() === "" ? undefined : phone.trim(),
      });
      setSaveMessage("Profile updated.");
    } catch (error) {
      setSaveError(describeFirebaseError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleTtsToggle = async (enabled: boolean): Promise<void> => {
    setTtsEnabled(enabled);
    if (uid === null) return;
    try {
      await updatePreferences(uid, { ttsEnabled: enabled });
    } catch {
      // Preference sync is best-effort; the local toggle remains honest.
    }
  };

  const handleLanguageChange = (next: string): void => {
    setLanguage(next);
    storeLocale(next as (typeof SUPPORTED_LOCALES)[number]);
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOutUser();
    } catch (error) {
      setSaveError(describeFirebaseError(error));
    }
  };

  if (!signedIn || uid === null) {
    return (
      <div className={styles.page}>
        <Card title="Sign in required" titleIcon="alert">
          <p>Your profile is available when you are signed in.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Profile</h1>
        <p>
          Signed in as <strong>{authState.user?.email ?? "your account"}</strong>
        </p>
      </header>

      <div className={styles.grid}>
        <Card title="Your details" titleIcon="user">
          {loadingProfile ? (
            <p aria-busy="true">Loading your profile…</p>
          ) : (
            <div className={styles.fields}>
              <Field label="Display name" htmlFor="profile-name">
                <TextField
                  id="profile-name"
                  value={displayName}
                  onChange={setDisplayName}
                  autoComplete="name"
                />
              </Field>
              <Field
                label="Phone (optional)"
                htmlFor="profile-phone"
                hint="Used only for your own reference; contacts have their own numbers."
              >
                <TextField
                  id="profile-phone"
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  autoComplete="tel"
                />
              </Field>
              {saveMessage !== null && (
                <p role="status" className={styles.saveMessage}>
                  {saveMessage}
                </p>
              )}
              {saveError !== null && (
                <p role="alert" className={styles.saveError}>
                  {saveError}
                </p>
              )}
              <div>
                <Button disabled={saving} onClick={() => void handleSaveProfile()}>
                  Save profile
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className={styles.side}>
          <Card title="Preferences" titleIcon="settings">
            <div className={styles.prefRow}>
              <label htmlFor="pref-tts" className={styles.prefLabel}>
                <input
                  id="pref-tts"
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(event) => void handleTtsToggle(event.target.checked)}
                />
                <span>Enable voice assistance (text-to-speech) controls</span>
              </label>
            </div>
            <div className={styles.prefRow}>
              <Field
                label="Language"
                htmlFor="pref-language"
                hint="Guides render in English until reviewed translations are published."
              >
                <select
                  id="pref-language"
                  className={styles.select}
                  value={language}
                  onChange={(event) => handleLanguageChange(event.target.value)}
                >
                  {SUPPORTED_LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {LOCALE_LABELS[locale]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Session" titleIcon="logout">
            <p className={styles.sessionNote}>
              Signing out keeps any downloaded offline package on this device.
            </p>
            <Button variant="outline" icon="logout" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </Card>

          <Card title="Account" titleIcon="check">
            <Badge tone="success" dot>
              Registered user
            </Badge>
            <p className={styles.sessionNote}>
              Personal features — contacts, activity history, offline package — are tied to this
              account and protected by Firestore security rules.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
