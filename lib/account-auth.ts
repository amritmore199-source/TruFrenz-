/**
 * Native account APIs cannot rely on browser cookies: React Native's fetch
 * does not maintain the same cookie jar. Keep the bearer format tiny and pure
 * so it can be tested without SecureStore or a network request.
 */
export function memberAuthorizationHeader(token: string | null | undefined): string | undefined {
  const clean = typeof token === "string" ? token.trim() : "";
  return clean ? `Bearer ${clean}` : undefined;
}

/** Read only a well-formed Bearer header; never accept arbitrary schemes. */
export function memberTokenFromAuthorization(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,256})$/i.exec(header.trim());
  return match?.[1] ?? null;
}
