import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Minimal, transient values read from a device contact. */
export type DeviceContactNumber = {
  name: string;
  number: string;
  countryCode?: string | null;
};

/** A number after local E.164 normalization; keep it in memory only. */
export type NormalizedDeviceContact = {
  id: string;
  name: string;
  phoneE164: string;
};

export type ContactMatch = {
  phoneHash: string;
  name: string;
  verificationTier: "none" | "phone" | "id_selfie";
};

function countryCode(value: string | null | undefined): CountryCode | undefined {
  const candidate = value?.trim().toUpperCase();
  return candidate && /^[A-Z]{2}$/.test(candidate) ? (candidate as CountryCode) : undefined;
}

/**
 * Normalize a phone number on the device. A national-format number without an
 * explicit country context is ignored rather than guessed, so +1 is never
 * silently prepended to a number from a different locale.
 */
export function normalizeDevicePhone(
  raw: string | null | undefined,
  contactCountry?: string | null,
  deviceRegion?: string | null,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const region = countryCode(contactCountry) ?? countryCode(deviceRegion);
  const parsed = parsePhoneNumberFromString(value, region);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/**
 * Dedupe duplicate phone entries locally and cap the batch before hashing.
 * Contact names remain local; they are never part of the lookup payload.
 */
export function normalizeDeviceContacts(
  entries: readonly DeviceContactNumber[],
  deviceRegion?: string | null,
  limit = 500,
): NormalizedDeviceContact[] {
  const byPhone = new Map<string, NormalizedDeviceContact>();
  for (const entry of entries) {
    const phoneE164 = normalizeDevicePhone(entry.number, entry.countryCode, deviceRegion);
    if (!phoneE164 || byPhone.has(phoneE164)) continue;
    const name = entry.name.trim().slice(0, 80) || "Contact";
    byPhone.set(phoneE164, { id: phoneE164, name, phoneE164 });
    if (byPhone.size >= limit) break;
  }
  return [...byPhone.values()];
}

/** Only valid SHA-256 hex hashes are accepted at the API boundary. */
export function normalizePhoneHashes(value: unknown, limit = 500): string[] {
  if (!Array.isArray(value)) return [];
  const hashes = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string" || !/^[a-f0-9]{64}$/i.test(candidate)) continue;
    hashes.add(candidate.toLowerCase());
    if (hashes.size >= limit) break;
  }
  return [...hashes];
}

/** Compose a friendly invitation message; sending is always left to the member. */
export function contactInviteMessage(downloadUrl: string, senderName?: string): string {
  const cleanUrl = downloadUrl.trim();
  const name = senderName?.trim();
  const greeting = name ? `Hi, it's ${name}.` : "Hi!";
  return `${greeting} I'm on Trufrenz — a friendship-only community for genuine connections and relaxed meetups. Join me: ${cleanUrl}`;
}
