export type ProfileLookup = { id: string };

export function resolveChatProfile<T extends ProfileLookup>(chatId: string, kind: "friend" | "group", people: readonly T[]): T | null {
  if (kind === "group") return null;
  return people.find((person) => person.id === chatId) ?? null;
}
