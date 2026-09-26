import { describe, expect, it } from "vitest";
import { createIncomingMeetupInviteNotification, createIncomingMessageNotification, MAX_NOTIFICATION_PREVIEW_LENGTH, shouldDismissIncomingNotificationSwipe } from "../lib/incoming-notifications";

describe("incoming notification payloads", () => {
  it("creates a new-message notification with a usable chat target and compact preview", () => {
    expect(createIncomingMessageNotification({ id: "m1", senderName: "  Maya Chen ", chatId: "maya", messagePreview: "  Are you free for coffee?  " })).toEqual({
      id: "m1", kind: "message", senderName: "Maya Chen", preview: "Are you free for coffee?", chatId: "maya",
    });
  });

  it("builds meetup invitation copy and falls back to a friendly sender label", () => {
    expect(createIncomingMeetupInviteNotification({ id: "i1", senderName: " ", chatId: "maya", meetupTitle: "Coffee walk", venue: "Juniper Café", time: "Today · 10:30" })).toEqual({
      id: "i1", kind: "meetup-invite", senderName: "A friend", preview: "Coffee walk · Juniper Café · Today · 10:30", chatId: "maya",
    });
  });

  it("normalizes and truncates a long message preview", () => {
    const notification = createIncomingMessageNotification({ id: "m2", senderName: "Noah", chatId: "noah", messagePreview: `  ${"hello  ".repeat(30)} ` });
    expect(notification.preview.length).toBe(MAX_NOTIFICATION_PREVIEW_LENGTH);
    expect(notification.preview.endsWith("…")).toBe(true);
  });

  it("dismisses after a decisive horizontal swipe in either direction", () => {
    expect(shouldDismissIncomingNotificationSwipe(76, 0)).toBe(true);
    expect(shouldDismissIncomingNotificationSwipe(-76, 0)).toBe(true);
    expect(shouldDismissIncomingNotificationSwipe(28, 0.7)).toBe(true);
    expect(shouldDismissIncomingNotificationSwipe(-28, -0.7)).toBe(true);
  });

  it("keeps short, slow horizontal drags on screen", () => {
    expect(shouldDismissIncomingNotificationSwipe(23, 0.2)).toBe(false);
    expect(shouldDismissIncomingNotificationSwipe(-42, 0.35)).toBe(false);
    expect(shouldDismissIncomingNotificationSwipe(70, 0.1)).toBe(false);
  });
});
