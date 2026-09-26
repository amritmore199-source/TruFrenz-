import { describe, expect, it } from "vitest";

import {
  attachmentPreviewLabel,
  attachmentPreviewNote,
  attachmentPreviewTitle,
  createPendingAttachment,
  formatBytes,
  formatVoiceLength,
  pendingToDraft,
  requiresPreview,
} from "../lib/attachment-preview";

const id = () => "att-1";

describe("which attachments need a preview", () => {
  it("asks for confirmation on photos and voice notes", () => {
    expect(requiresPreview("photo")).toBe(true);
    expect(requiresPreview("voice")).toBe(true);
  });

  it("sends a manual place pin straight away", () => {
    // The member already chose a named public venue, so there is nothing to
    // verify before it goes out.
    expect(requiresPreview("location")).toBe(false);
  });
});

describe("creating a pending attachment", () => {
  it("holds a photo for review", () => {
    const pending = createPendingAttachment({ kind: "photo", uri: "file://a.jpg" }, id);
    expect(pending).toEqual({ id: "att-1", kind: "photo", uri: "file://a.jpg", durationSeconds: undefined, place: undefined });
  });

  it("holds a voice note with its length", () => {
    const pending = createPendingAttachment({ kind: "voice", uri: "local-voice-1", durationSeconds: 14 }, id);
    expect(pending?.kind).toBe("voice");
    expect(pending?.durationSeconds).toBe(14);
  });

  it("returns nothing for a place pin so it cannot be held by mistake", () => {
    expect(createPendingAttachment({ kind: "location", place: "Alta Plaza Park" }, id)).toBeNull();
  });
});

describe("sending a pending attachment", () => {
  it("converts a held photo back into a draft", () => {
    expect(pendingToDraft({ id: "att-1", kind: "photo", uri: "file://a.jpg" })).toEqual({ kind: "photo", uri: "file://a.jpg" });
  });

  it("converts a held voice note back into a draft", () => {
    expect(pendingToDraft({ id: "att-1", kind: "voice", durationSeconds: 9 })).toEqual({ kind: "voice", uri: undefined, durationSeconds: 9 });
  });

  it("refuses to send an empty photo", () => {
    expect(pendingToDraft({ id: "att-1", kind: "photo" })).toBeNull();
  });

  it("refuses to send an empty place pin", () => {
    expect(pendingToDraft({ id: "att-1", kind: "location" })).toBeNull();
  });

  it("returns nothing when there is no pending attachment", () => {
    expect(pendingToDraft(null)).toBeNull();
  });
});

describe("preview copy", () => {
  it("names what is waiting", () => {
    expect(attachmentPreviewTitle("photo")).toMatch(/photo/i);
    expect(attachmentPreviewTitle("voice")).toMatch(/voice/i);
  });

  it("reassures that nothing has left the device", () => {
    expect(attachmentPreviewNote("photo")).toMatch(/only leaves your device/i);
    expect(attachmentPreviewNote("voice")).toMatch(/on your device/i);
  });

  it("labels a photo with its size when the platform reports one", () => {
    expect(attachmentPreviewLabel({ id: "a", kind: "photo" }, { sizeBytes: 1_258_291 })).toBe("📷 Photo · 1.2 MB");
  });

  it("omits the size rather than inventing one", () => {
    expect(attachmentPreviewLabel({ id: "a", kind: "photo" })).toBe("📷 Photo");
  });

  it("labels a voice note with its length", () => {
    expect(attachmentPreviewLabel({ id: "a", kind: "voice", durationSeconds: 8 })).toBe("🎤 Voice note · 8s");
  });
});

describe("formatting helpers", () => {
  it("keeps short voice notes in seconds", () => {
    expect(formatVoiceLength(1)).toBe("1s");
    expect(formatVoiceLength(59)).toBe("59s");
  });

  it("switches to minutes past a minute", () => {
    expect(formatVoiceLength(60)).toBe("1m");
    expect(formatVoiceLength(75)).toBe("1m 15s");
  });

  it("never shows a zero length", () => {
    expect(formatVoiceLength(0)).toBe("1s");
    expect(formatVoiceLength(Number.NaN)).toBe("1s");
  });

  it("formats file sizes readably", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5_242_880)).toBe("5.0 MB");
  });

  it("returns an empty size rather than guessing", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});