/**
 * Attachment preview.
 *
 * Nothing leaves the composer until the member has seen what they are about to
 * send. A picked photo or a recorded voice note therefore becomes a *pending*
 * draft that sits above the input bar with its own preview, caption and Remove
 * action. This module holds the rules for that pending state so the composer
 * only has to render them.
 *
 * A manual place pin is deliberately excluded: the member taps a named public
 * venue and the pin is sent immediately, so there is nothing to verify.
 */

import type { AttachmentDraft } from "./chat-extras";

export type PendingAttachment = {
  /** Stable id so the preview can be animated and dismissed reliably. */
  id: string;
  kind: AttachmentDraft["kind"];
  uri?: string;
  durationSeconds?: number;
  place?: string;
};

/** Attachment kinds that need a confirmation step before sending. */
export function requiresPreview(kind: AttachmentDraft["kind"]): boolean {
  return kind === "photo" || kind === "voice";
}

/** Heading shown on the preview card. */
export function attachmentPreviewTitle(kind: AttachmentDraft["kind"]): string {
  switch (kind) {
    case "photo":
      return "Photo ready to send";
    case "voice":
      return "Voice note ready to send";
    case "location":
      return "Place ready to share";
    default:
      return "Ready to send";
  }
}

/**
 * The reassurance line under the heading. Mirrors the app's promise that media
 * is reviewed before it leaves the device.
 */
export function attachmentPreviewNote(kind: AttachmentDraft["kind"]): string {
  switch (kind) {
    case "photo":
      return "Check it looks right, then send. It only leaves your device when you tap send.";
    case "voice":
      return "Give it a listen before sending. Recording stays on your device until then.";
    default:
      return "Nothing is sent until you confirm.";
  }
}

/**
 * Compact label for the pending chip, e.g. "📷 Photo · 1.2 MB".
 * Size is omitted when it is not known rather than guessed.
 */
export function attachmentPreviewLabel(draft: PendingAttachment, options?: { sizeBytes?: number }): string {
  const prefix = draft.kind === "photo" ? "📷 Photo" : draft.kind === "voice" ? "🎤 Voice note" : "📍 Place";
  if (draft.kind === "voice") {
    return `${prefix} · ${formatVoiceLength(draft.durationSeconds ?? 0)}`;
  }
  if (draft.kind === "photo" && typeof options?.sizeBytes === "number" && options.sizeBytes > 0) {
    return `${prefix} · ${formatBytes(options.sizeBytes)}`;
  }
  return prefix;
}

/** Voice notes read better as a clock length than a raw second count. */
export function formatVoiceLength(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 1;
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Human file size for a photo chip. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Turn a pending attachment into the draft the chat actually sends.
 * Returns null when the member has nothing pending, so callers cannot send an
 * empty attachment by accident.
 */
export function pendingToDraft(pending: PendingAttachment | null): AttachmentDraft | null {
  if (!pending) return null;
  if (pending.kind === "photo") {
    return pending.uri ? { kind: "photo", uri: pending.uri } : null;
  }
  if (pending.kind === "voice") {
    return { kind: "voice", uri: pending.uri, durationSeconds: pending.durationSeconds };
  }
  if (pending.kind === "location") {
    return pending.place ? { kind: "location", place: pending.place } : null;
  }
  return null;
}

/**
 * Build the pending attachment for a freshly picked or recorded item, or null
 * when that kind is sent straight away.
 */
export function createPendingAttachment(
  draft: AttachmentDraft,
  idFactory: () => string,
): PendingAttachment | null {
  if (!requiresPreview(draft.kind)) return null;
  return {
    id: idFactory(),
    kind: draft.kind,
    uri: draft.uri,
    durationSeconds: draft.durationSeconds,
    place: draft.place,
  };
}