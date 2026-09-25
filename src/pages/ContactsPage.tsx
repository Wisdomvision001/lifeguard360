import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, SelectField, TextField } from "@/components/Field";
import { Icon } from "@/components/icons";
import {
  addContact,
  deleteContact,
  listContacts,
  updateContact,
} from "@/services/contacts/contactService";
import {
  addDemoContact,
  deleteDemoContact,
  listDemoContacts,
  updateDemoContact,
} from "@/services/contacts/demoContactStore";
import {
  DUPLICATE_PHONE_MESSAGE,
  findDuplicateContactPhone,
} from "@/services/contacts/duplicatePhone";
import { logActivity } from "@/services/activity/activityService";
import { CONTACT_RELATIONSHIPS, type ContactRelationship, type EmergencyContact } from "@/types";
import { phoneNumberSchema } from "@/utils/phone";
import styles from "@/pages/ContactsPage.module.css";

/**
 * Emergency Contacts (Phase 5): registered-user CRUD over users/{uid}/contacts.
 * Phones are normalised to E.164 on the client; Firestore rules remain the
 * authoritative validation.
 *
 * TEMPORARY AUTHENTICATION BYPASS (same posture as the unauthenticated admin
 * access): signed-out users get the identical interface backed by the
 * device-local store (demoContactStore — localStorage only, never Firestore).
 * The authenticated Firestore architecture is untouched and resumes
 * automatically the moment a user signs in. Authentication enforcement
 * returns after the supervisor review.
 */

interface ContactDraft {
  fullName: string;
  relationship: ContactRelationship;
  phoneNumber: string;
}

const EMPTY_DRAFT: ContactDraft = { fullName: "", relationship: "Parent", phoneNumber: "" };

function validateDraft(draft: ContactDraft): Partial<Record<keyof ContactDraft, string>> {
  const errors: Partial<Record<keyof ContactDraft, string>> = {};
  if (draft.fullName.trim().length < 2) {
    errors.fullName = "Enter the contact's full name.";
  }
  if (!CONTACT_RELATIONSHIPS.includes(draft.relationship)) {
    errors.relationship = "Choose a relationship.";
  }
  const phone = phoneNumberSchema.safeParse(draft.phoneNumber);
  if (!phone.success) {
    errors.phoneNumber = phone.error.issues[0]?.message ?? "Enter a valid phone number.";
  }
  return errors;
}

export function ContactsPage(): JSX.Element {
  const { authState } = useAuth();
  const uid = authState.status === "signed-in" ? (authState.user?.uid ?? null) : null;

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [draftErrors, setDraftErrors] = useState<Partial<Record<keyof ContactDraft, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (uid === null) {
      // Not signed in: load this device's localStorage-backed contacts only.
      // Never touches Firestore.
      Promise.resolve().then(() => {
        if (!cancelled) {
          setContacts(listDemoContacts());
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    listContacts(uid)
      .then((loaded) => {
        if (!cancelled) setContacts(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setListError(error instanceof Error ? error.message : "Could not load contacts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const startEdit = (contact: EmergencyContact): void => {
    setEditingId(contact.id);
    setDraft({
      fullName: contact.fullName,
      relationship: contact.relationship,
      phoneNumber: contact.phoneNumber,
    });
    setDraftErrors({});
    setActionError(null);
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDraftErrors({});
  };

  const handleSave = async (): Promise<void> => {
    const errors = validateDraft(draft);
    // Duplicate-phone gate (unauthenticated + authenticated modes): compared
    // against the
    // current contact list, normalised via toE164Nigerian. Excluding the
    // contact being edited prevents a false positive when its own number is
    // unchanged. Presentation-layer validation only — Firestore rules remain
    // the server-side authority and are untouched.
    const duplicate = findDuplicateContactPhone(contacts, draft.phoneNumber, editingId);
    if (duplicate !== null) {
      errors.phoneNumber = DUPLICATE_PHONE_MESSAGE;
    }
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setActionError(null);
    try {
      const payload = {
        fullName: draft.fullName.trim(),
        relationship: draft.relationship,
        phoneNumber: phoneNumberSchema.parse(draft.phoneNumber),
      };
      if (uid === null) {
        // Not signed in: device-local storage ONLY — no Firestore call exists
        // on this branch. Activity goes to the device-local activity store
        // via logActivity(null, …) — never Firestore.
        if (editingId !== null) {
          updateDemoContact(editingId, payload);
          void logActivity(uid, "contact_updated", { contactId: editingId });
        } else {
          const added = addDemoContact(payload);
          void logActivity(uid, "contact_added", { relationship: added.relationship });
        }
        setContacts(listDemoContacts());
        cancelEdit();
        return;
      }
      if (editingId !== null) {
        await updateContact(uid, editingId, payload);
        void logActivity(uid, "contact_updated", { contactId: editingId });
      } else {
        await addContact(uid, payload);
        void logActivity(uid, "contact_added", { relationship: payload.relationship });
      }
      setContacts(await listContacts(uid));
      cancelEdit();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save the contact.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contactId: string): Promise<void> => {
    setSaving(true);
    setActionError(null);
    try {
      if (uid === null) {
        deleteDemoContact(contactId);
        void logActivity(uid, "contact_deleted", { contactId });
        setContacts(listDemoContacts());
        setConfirmDeleteId(null);
        return;
      }
      await deleteContact(uid, contactId);
      void logActivity(uid, "contact_deleted", { contactId });
      setContacts(await listContacts(uid));
      setConfirmDeleteId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete the contact.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Card>
          <p aria-busy="true">Loading your emergency contacts…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Emergency Contacts</h1>
        <p>
          The people Lifeguard360 will help you call or message with{" "}
          <Link to="/get-help">Get Help Now</Link>. Numbers are stored in international format.
        </p>
      </header>

      {uid === null && (
        <Card title="Not signed in — saved on this device" titleIcon="contacts">
          <p>
            You're not signed in, so these contacts are saved on this device — nothing is sent to
            Firestore. Sign in to keep your contacts associated with your account.
          </p>
        </Card>
      )}

      {listError !== null && (
        <Card title="Contacts unavailable" titleIcon="alert">
          <p role="alert">{listError}</p>
        </Card>
      )}

      <div className={styles.grid}>
        <section aria-label="Your contacts" className={styles.list}>
          {contacts.length === 0 && listError === null && (
            <Card title="No contacts yet" titleIcon="contacts">
              <p>Add your first trusted contact — someone you can reach quickly in an emergency.</p>
            </Card>
          )}

          {contacts.map((contact) => (
            <Card key={contact.id}>
              <div className={styles.contactCard}>
                <div className={styles.contactInfo}>
                  <h3>
                    {contact.fullName}{" "}
                    {contact.id.startsWith("demo-") && <Badge tone="neutral">on this device</Badge>}
                  </h3>
                  <p className={styles.contactMeta}>
                    <Badge tone="neutral">{contact.relationship}</Badge>
                    <span>{contact.phoneNumber}</span>
                  </p>
                </div>
                <div className={styles.contactActions}>
                  <a
                    className={styles.iconAction}
                    href={`tel:${contact.phoneNumber}`}
                    aria-label={`Call ${contact.fullName}`}
                  >
                    <Icon name="phone" size={18} />
                  </a>
                  <button
                    type="button"
                    className={styles.iconAction}
                    aria-label={`Edit ${contact.fullName}`}
                    onClick={() => startEdit(contact)}
                  >
                    <Icon name="settings" size={18} />
                  </button>
                  {confirmDeleteId === contact.id ? (
                    <span className={styles.confirmDelete}>
                      <Button
                        variant="danger"
                        size="md"
                        disabled={saving}
                        onClick={() => void handleDelete(contact.id)}
                      >
                        Delete
                      </Button>
                      <Button variant="outline" size="md" onClick={() => setConfirmDeleteId(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.iconAction}
                      aria-label={`Delete ${contact.fullName}`}
                      onClick={() => setConfirmDeleteId(contact.id)}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </section>

        <aside className={styles.form}>
          <Card title={editingId !== null ? "Edit contact" : "Add a contact"} titleIcon="user">
            <div className={styles.fields}>
              <Field
                label="Full name"
                htmlFor="contact-name"
                error={draftErrors.fullName ?? undefined}
              >
                <TextField
                  id="contact-name"
                  value={draft.fullName}
                  onChange={(value) => setDraft((d) => ({ ...d, fullName: value }))}
                  placeholder="e.g. Ada Obi"
                  autoComplete="name"
                />
              </Field>
              <Field
                label="Relationship"
                htmlFor="contact-relationship"
                error={draftErrors.relationship ?? undefined}
              >
                <SelectField
                  id="contact-relationship"
                  value={draft.relationship}
                  onChange={(value) =>
                    setDraft((d) => ({ ...d, relationship: value as ContactRelationship }))
                  }
                  options={CONTACT_RELATIONSHIPS.map((relationship) => ({
                    value: relationship,
                    label: relationship,
                  }))}
                />
              </Field>
              <Field
                label="Phone number"
                htmlFor="contact-phone"
                error={draftErrors.phoneNumber ?? undefined}
                hint="Nigerian format, e.g. 0801 234 5678 or +2348012345678"
              >
                <TextField
                  id="contact-phone"
                  type="tel"
                  value={draft.phoneNumber}
                  onChange={(value) => setDraft((d) => ({ ...d, phoneNumber: value }))}
                  placeholder="0801 234 5678"
                  autoComplete="tel"
                />
              </Field>
              {actionError !== null && (
                <p role="alert" className={styles.formError}>
                  {actionError}
                </p>
              )}
              <div className={styles.formActions}>
                <Button disabled={saving} onClick={() => void handleSave()}>
                  {editingId !== null ? "Save changes" : "Add contact"}
                </Button>
                {editingId !== null && (
                  <Button variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
