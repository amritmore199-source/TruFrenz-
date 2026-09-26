export type QuickReply = { id: string; text: string };

export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: "default-yes", text: "Yes, that sounds lovely!" },
  { id: "default-public", text: "Let's meet somewhere public." },
  { id: "default-time", text: "That time works for me." },
  { id: "default-change", text: "Could we pick another day?" },
  { id: "default-no", text: "Not this time, but thank you for asking." },
];

export const MAX_QUICK_REPLY_LENGTH = 120;
export const MAX_QUICK_REPLIES = 12;

export function parseQuickReplies(serialized: string | null): QuickReply[] {
  if (!serialized) return [...DEFAULT_QUICK_REPLIES];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [...DEFAULT_QUICK_REPLIES];
    const seenIds = new Set<string>();
    const seenPhrases = new Set<string>();
    const clean = parsed.flatMap((item): QuickReply[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<QuickReply>;
      if (typeof candidate.id !== "string" || typeof candidate.text !== "string") return [];
      const id = candidate.id.trim();
      const text = candidate.text.trim().replace(/\s+/g, " ");
      const folded = text.toLocaleLowerCase();
      if (!id || !text || text.length > MAX_QUICK_REPLY_LENGTH || seenIds.has(id) || seenPhrases.has(folded)) return [];
      seenIds.add(id);
      seenPhrases.add(folded);
      return [{ id, text }];
    }).slice(0, MAX_QUICK_REPLIES);
    return clean.length ? clean : [...DEFAULT_QUICK_REPLIES];
  } catch {
    return [...DEFAULT_QUICK_REPLIES];
  }
}

export function addQuickReply(replies: readonly QuickReply[], rawText: string): QuickReply[] {
  const text = rawText.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_QUICK_REPLY_LENGTH || replies.length >= MAX_QUICK_REPLIES) return [...replies];
  if (replies.some((reply) => reply.text.trim().toLocaleLowerCase() === text.toLocaleLowerCase())) return [...replies];
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "phrase";
  let id = `custom-${slug}`;
  let suffix = 2;
  while (replies.some((reply) => reply.id === id)) id = `custom-${slug}-${suffix++}`;
  return [...replies, { id, text }];
}

export function removeQuickReply(replies: readonly QuickReply[], id: string): QuickReply[] {
  return replies.filter((reply) => reply.id !== id);
}
