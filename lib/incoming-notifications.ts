export type IncomingNotificationKind = "message" | "meetup-invite";
export type IncomingNotification = {
  id: string;
  kind: IncomingNotificationKind;
  senderName: string;
  preview: string;
  chatId: string;
};

export const MAX_NOTIFICATION_PREVIEW_LENGTH = 96;

export function shouldDismissIncomingNotificationSwipe(translationX: number, velocityX: number): boolean {
  const distance = Math.abs(translationX);
  const velocity = Math.abs(velocityX);
  return distance >= 72 || (distance >= 24 && velocity >= 0.62);
}

function cleanPreview(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, " ");
  if (compact.length <= MAX_NOTIFICATION_PREVIEW_LENGTH) return compact;
  return `${compact.slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

export function createIncomingMessageNotification(input: { id: string; senderName: string; chatId: string; messagePreview: string }): IncomingNotification {
  return {
    id: input.id,
    kind: "message",
    senderName: input.senderName.trim() || "A friend",
    preview: cleanPreview(input.messagePreview) || "Sent you a new message",
    chatId: input.chatId,
  };
}

export function createIncomingMeetupInviteNotification(input: { id: string; senderName: string; chatId: string; meetupTitle: string; venue: string; time: string }): IncomingNotification {
  const details = [input.meetupTitle.trim(), input.venue.trim(), input.time.trim()].filter(Boolean).join(" · ");
  return {
    id: input.id,
    kind: "meetup-invite",
    senderName: input.senderName.trim() || "A friend",
    preview: cleanPreview(details) || "Invited you to a meetup",
    chatId: input.chatId,
  };
}
