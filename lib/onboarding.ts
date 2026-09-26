export type ContactMethod = "Email" | "Phone";

/** Validate an independent email or phone contact before the demo verification step. */
export function isValidCredential(method: ContactMethod, value: string): boolean {
  const trimmed = value.trim();
  if (method === "Email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/** Demo flow uses six numeric digits; a production app must verify these server-side. */
export function isValidDemoCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}
