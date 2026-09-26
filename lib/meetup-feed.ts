export type Identifiable = { id: string };

/** Prefer the newest server/local preview item while retaining saved items not present in the refreshed page. */
export function mergeMeetupRefresh<T extends Identifiable>(current: readonly T[], incoming: readonly T[]): T[] {
  const refreshedIds = new Set(incoming.map((item) => item.id));
  const incomingIds = new Set<string>();
  const refreshed: T[] = [];
  for (const item of incoming) {
    if (!incomingIds.has(item.id)) {
      incomingIds.add(item.id);
      refreshed.push(item);
    }
  }
  return [...refreshed, ...current.filter((item) => !refreshedIds.has(item.id) && !incomingIds.has(item.id))];
}
