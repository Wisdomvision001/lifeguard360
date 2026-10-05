import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ImagePicker } from "@/components/ImagePicker";
import styles from "@/pages/admin/AdminMediaPage.module.css";
import {
  buildMediaUsageIndex,
  collectBundledMedia,
  deleteMediaItem,
  listMediaItems,
  replaceMediaItem,
  validateImageFile,
  type MediaItem,
  type MediaUsageIndex,
} from "@/services/admin/adminMediaService";
import { assetPath } from "@/utils/paths";

/**
 * Media management (Admin) — real Firebase Storage inventory.
 *
 * Every file listed here comes from the Storage bucket (listAll on images/);
 * when Storage holds nothing, the page says so truthfully instead of
 * inventing entries. Each file shows type, size, upload time, a live
 * thumbnail and its REAL references in published guides/drafts (or an honest
 * "not referenced" state). Upload/replace/delete are the actual Storage
 * operations gated by the admin claim in the Storage rules — failures are
 * surfaced verbatim, never faked.
 *
 * Delete refuses files still referenced by content (the service enforces
 * this); Replace rewrites every reference to the new URL before removing the
 * old object, so the public app never points at a deleted file.
 */

type Inventory =
  | { kind: "loading" }
  | { kind: "ready"; items: MediaItem[]; usage: MediaUsageIndex }
  | { kind: "error"; message: string };

type ReplaceState =
  | { phase: "closed" }
  | { phase: "choosing"; item: MediaItem }
  | { phase: "confirm"; item: MediaItem; file: File }
  | { phase: "working"; item: MediaItem; file: File };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminMediaPage(): JSX.Element {
  const [inventory, setInventory] = useState<Inventory>({ kind: "loading" });
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [replaceState, setReplaceState] = useState<ReplaceState>({ phase: "closed" });
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Mount-only load: state is only ever updated from the promise callbacks
  // (the project's react-hooks/set-state-in-effect convention).
  const fetchAll = (): Promise<void> =>
    Promise.all([listMediaItems(), buildMediaUsageIndex()])
      .then(([items, usage]) => setInventory({ kind: "ready", items, usage }))
      .catch((error: unknown) =>
        setInventory({
          kind: "error",
          message: `Firebase Storage could not be read: ${messageOf(error)}`,
        }),
      );

  useEffect(() => {
    void fetchAll();
  }, []);

  const handleDelete = (item: MediaItem): void => {
    setBusyPath(item.path);
    setActionError(null);
    deleteMediaItem(item).then(
      () => {
        setBusyPath(null);
        setConfirmingDelete(null);
        void fetchAll();
      },
      (error: unknown) => {
        setBusyPath(null);
        setActionError(`Could not delete “${item.name}”: ${messageOf(error)}`);
      },
    );
  };

  const openReplace = (item: MediaItem): void => {
    setActionError(null);
    setReplaceState({ phase: "choosing", item });
    replaceInputRef.current?.click();
  };

  const handleReplaceFileChosen = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (chosen === undefined) {
      setReplaceState({ phase: "closed" });
      return;
    }
    if (replaceState.phase === "closed") return;
    const problem = validateImageFile(chosen);
    if (problem !== null) {
      setActionError(problem);
      setReplaceState({ phase: "closed" });
      return;
    }
    setReplaceState({ phase: "confirm", item: replaceState.item, file: chosen });
  };

  const handleConfirmReplace = (): void => {
    if (replaceState.phase !== "confirm") return;
    const { item, file } = replaceState;
    setReplaceState({ phase: "working", item, file });
    setActionError(null);
    replaceMediaItem(item, file).then(
      () => {
        setReplaceState({ phase: "closed" });
        void fetchAll();
      },
      (error: unknown) => {
        // Keep the selection so the admin can retry without re-picking.
        setReplaceState({ phase: "confirm", item, file });
        setActionError(`Could not replace “${item.name}”: ${messageOf(error)}`);
      },
    );
  };

  const bundled = collectBundledMedia();
  const bundledStepCount = bundled.filter((item) => item.id.includes("-step-")).length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Media</h1>
        <p>
          Imagery for the first-aid guides: real files in Firebase Storage plus
          the bundled assets the application ships with. Nothing here is
          fabricated.
        </p>
      </header>

      <Card title="Upload to Firebase Storage" titleIcon="upload">
        {inventory.kind === "error" && (
          <div className={styles.errorBox} role="alert">
            <p className={styles.stateText}>{inventory.message}</p>
            <Button variant="outline" icon="upload" onClick={() => void fetchAll()}>
              Try again
            </Button>
          </div>
        )}
        <ImagePicker
          value=""
          folder="images/uploads"
          label="Upload new image"
          disabled={inventory.kind === "error"}
          onChange={(next) => {
            if (next !== "") void fetchAll();
          }}
        />
        <input
          ref={replaceInputRef}
          className={styles.hiddenFileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleReplaceFileChosen}
          data-testid="replace-file-input"
        />
      </Card>

      <Card
        title={
          inventory.kind === "ready"
            ? `Storage media (${inventory.items.length})`
            : "Storage media"
        }
        titleIcon="first-aid"
      >
        {inventory.kind === "loading" && (
          <p className={styles.stateText} aria-busy="true">
            Loading media from Firebase Storage…
          </p>
        )}

        {inventory.kind === "error" && (
          <p className={styles.stateText}>
            The Storage inventory is unavailable while the backend cannot be
            reached. Bundled assets below are unaffected.
          </p>
        )}

        {inventory.kind === "ready" && inventory.items.length === 0 && (
          <div className={styles.emptyState} role="status">
            <p>
              No files in Firebase Storage yet. Upload an image above — it will
              appear here and can be attached to a guide in the editor.
            </p>
          </div>
        )}

        {inventory.kind === "ready" && inventory.items.length > 0 && (
          <ul className={styles.mediaList}>
            {inventory.items.map((item) => {
              const references = inventory.usage.get(item.url) ?? [];
              const busy = busyPath === item.path;
              const confirming = confirmingDelete === item.path;
              const replacing =
                replaceState.phase !== "closed" && replaceState.item.path === item.path;
              return (
                <li key={item.path} className={styles.mediaRow}>
                  <img
                    src={assetPath(item.url)}
                    alt=""
                    loading="lazy"
                    width={88}
                    height={66}
                    className={styles.thumb}
                  />
                  <span className={styles.mediaBody}>
                    <span className={styles.mediaPath}>
                      <code>{item.path}</code>
                    </span>
                    <span className={styles.mediaUsage}>
                      {item.contentType} · {formatBytes(item.sizeBytes)}
                      {item.updatedAt !== "" &&
                        ` · uploaded ${item.updatedAt.slice(0, 10)}`}
                    </span>
                    <span className={styles.mediaUsage}>
                      {references.length > 0
                        ? `Used by: ${references.join("; ")}`
                        : "Not referenced by any guide or draft"}
                    </span>
                    {replacing && replaceState.phase === "confirm" && (
                      <span className={styles.inlineConfirm}>
                        Replace with “{replaceState.file.name}” (
                        {formatBytes(replaceState.file.size)})? References are
                        updated automatically.
                        <Button
                          variant="primary"
                          onClick={handleConfirmReplace}
                          disabled={busy}
                        >
                          Confirm replace
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setReplaceState({ phase: "closed" })}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </span>
                    )}
                    {replacing && replaceState.phase === "working" && (
                      <span className={styles.stateText} role="status">
                        Replacing — uploading the new file and updating
                        references…
                      </span>
                    )}
                    {confirming && (
                      <span className={styles.inlineConfirm}>
                        Delete “{item.name}” permanently? It is not referenced by
                        any content.
                        <Button
                          variant="danger"
                          onClick={() => handleDelete(item)}
                          disabled={busy}
                        >
                          {busy ? "Deleting…" : "Yes, delete"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmingDelete(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </span>
                    )}
                  </span>
                  <span className={styles.mediaActions}>
                    <Badge tone={references.length > 0 ? "blue" : "neutral"}>
                      {references.length > 0
                        ? `In use (${references.length})`
                        : "Unreferenced"}
                    </Badge>
                    <Button
                      variant="outline"
                      icon="upload"
                      onClick={() => openReplace(item)}
                      disabled={busy || busyPath !== null || confirming}
                      aria-label={`Replace file ${item.name}`}
                    >
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      icon="close"
                      onClick={() => {
                        setActionError(null);
                        setConfirmingDelete(item.path);
                      }}
                      disabled={busy || confirming}
                      aria-label={`Delete file ${item.name}`}
                    >
                      Delete
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {actionError !== null && (
          <p className={styles.actionError} role="alert">
            {actionError}
          </p>
        )}
      </Card>

      <Card title={`Bundled assets (${bundled.length})`} titleIcon="first-aid">
        <p className={styles.sectionIntro}>
          {bundled.length} files: one banner per guide plus {bundledStepCount} step
          images. These ship with the application as the offline/fallback set and
          live under public/images.
        </p>
        <ul className={styles.mediaList}>
          {bundled.map((item) => (
            <li key={item.id} className={styles.mediaRow}>
              <img
                src={assetPath(item.path)}
                alt=""
                loading="lazy"
                width={88}
                height={66}
                className={styles.thumb}
              />
              <span className={styles.mediaBody}>
                <span className={styles.mediaPath}>
                  <code>{item.path}</code>
                </span>
                <span className={styles.mediaUsage}>{item.usage}</span>
              </span>
              <Badge tone="neutral">Bundled</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
