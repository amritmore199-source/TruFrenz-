const INTEREST_GROUPS: Record<string, string[]> = {
  coffee: ["coffee", "cafe", "cafes", "tea", "barista"],
  books: ["book", "books", "bookshop", "bookshops", "reading", "literature"],
  walks: ["walk", "walks", "walking", "stroll", "strolls"],
  parks: ["park", "parks", "picnic", "picnics"],
  outdoors: ["hike", "hiking", "trail", "trails", "nature", "outdoors"],
  art: ["art", "arts", "gallery", "galleries", "ceramics", "drawing"],
};

function interestKeys(value: string): Set<string> {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words: string[] = normalized.match(/[a-z0-9]+/g) ?? [];
  const keys = new Set<string>(words.map((word) => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
  for (const [key, aliases] of Object.entries(INTEREST_GROUPS)) {
    if (aliases.some((alias) => words.includes(alias))) keys.add(key);
  }
  return keys;
}

export function findCommonInterests(mine: readonly string[], theirs: readonly string[]): string[] {
  const myKeys = new Set(mine.flatMap((interest) => [...interestKeys(interest)]));
  return theirs.filter((interest) => [...interestKeys(interest)].some((key) => myKeys.has(key)));
}
