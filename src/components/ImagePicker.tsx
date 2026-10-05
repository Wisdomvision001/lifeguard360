import { useEffect, useId, useRef, useState, type JSX } from "react";

import { Button } from "@/components/Button";
import {
  ACCEPTED_IMAGE_TYPES,
  uploadImage,
  validateImageFile,
} from "@/services/admin/adminMediaService";
import { assetPath } from "@/utils/paths";
import styles from "@/components/ImagePicker.module.css";

/**
 * ImagePicker — the CMS's only way to assign an image to a guide.
 *
 * Flow (Phase 3/5): "Upload image" opens the native file picker → the file is
 * validated locally (type/size) → a local preview is shown → the admin
 * CONFIRMS the upload → the file goes to Firebase Storage → only after the
 * upload succeeds does onChange deliver the download URL. The previous value
 * is never touched before that point, so a failed upload or an abandoned
 * selection preserves the existing image. Removal clears the reference; the
 * file itself is managed from the Media page.
 *
 * Every state is honest: uploading/failed/retry are always distinguished —
 * success is only reported after Storage confirms the upload.
 */

export interface ImagePickerProps {
  /** Current image reference (Storage URL or bundled path); "" = none. */
  value: string;
  /** Fires with the new reference after a successful upload, or "" on remove. */
  onChange: (next: string) => void;
  /** Storage folder this image belongs to, e.g. images/guides/burns. */
  folder: string;
  /** Field label — also used for accessible names of previews and buttons. */
  label: string;
  /**
   * Explicit id for the hidden file input, so an external <label
   * htmlFor=…> (the Field component) opens the native picker.
   */
  inputId?: string;
  disabled?: boolean;
}

type Phase = "idle" | "selected" | "uploading";

export function ImagePicker({
  value,
  onChange,
  folder,
  label,
  inputId,
  disabled = false,
}: ImagePickerProps): JSX.Element {
  const fallbackId = useId();
  const resolvedId = inputId ?? fallbackId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Revoke the previous local preview whenever it changes or unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetSelection = (): void => {
    setPhase("idle");
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  };

  const handleFileChosen = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const chosen = event.target.files?.[0];
    if (chosen === undefined) return;
    setNotice(null);
    const problem = validateImageFile(chosen);
    if (problem !== null) {
      setFile(null);
      setPreviewUrl(null);
      setPhase("idle");
      setError(problem);
      return;
    }
    setError(null);
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
    setPhase("selected");
  };

  const handleUpload = async (): Promise<void> => {
    if (file === null) return;
    setPhase("uploading");
    setError(null);
    try {
      const { url } = await uploadImage(file, folder);
      // Only now does the reference change — Storage confirmed the upload.
      onChange(url);
      setNotice(`Uploaded “${file.name}” — it is now in Firebase Storage.`);
      resetSelection();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The upload failed. Try again.",
      );
      setPhase("selected");
    }
  };

  const handleRemove = (): void => {
    resetSelection();
    setNotice(null);
    onChange("");
  };

  const openPicker = (): void => {
    inputRef.current?.click();
  };

  const uploading = phase === "uploading";
  const hasPending = previewUrl !== null && file !== null;

  return (
    <div className={styles.picker}>
      <input
        ref={inputRef}
        id={resolvedId}
        className={styles.fileInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={handleFileChosen}
        disabled={disabled || uploading}
        data-testid={`file-input-${label}`}
      />

      {(value !== "" || previewUrl !== null) && (
        <div className={styles.previewRow}>
          <img
            className={styles.preview}
            src={previewUrl !== null ? previewUrl : assetPath(value)}
            alt={
              previewUrl !== null
                ? `Selected file preview for ${label}`
                : `Current image for ${label}`
            }
            width={112}
            height={84}
          />
          <span className={styles.previewMeta}>
            {hasPending ? (
              <>
                <strong>{file?.name}</strong>
                <span className={styles.pendingNote}>
                  {uploading
                    ? "Uploading to Firebase Storage…"
                    : "Selected — not uploaded yet. The current image stays until you confirm."}
                </span>
              </>
            ) : (
              <span className={styles.previewPath}>{value}</span>
            )}
          </span>
        </div>
      )}

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice !== null && !hasPending && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <div className={styles.actions}>
        {hasPending ? (
          <>
            <Button
              variant="primary"
              icon="upload"
              onClick={() => void handleUpload()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Confirm upload"}
            </Button>
            <Button variant="ghost" onClick={resetSelection} disabled={uploading}>
              Cancel
            </Button>
          </>
        ) : uploading ? (
          <Button variant="outline" icon="upload" disabled>
            Uploading…
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              icon="upload"
              onClick={openPicker}
              disabled={disabled}
            >
              {value === "" ? "Upload image" : "Replace image"}
            </Button>
            {value !== "" && (
              <Button
                variant="ghost"
                icon="close"
                onClick={handleRemove}
                disabled={disabled}
                aria-label={`Remove image for ${label}`}
              >
                Remove
              </Button>
            )}
          </>
        )}
      </div>

      {!hasPending && (
        <p className={styles.hint}>
          PNG, JPEG, WebP or GIF — up to 5 MB. Files upload to Firebase Storage
          when you confirm.
        </p>
      )}
    </div>
  );
}
