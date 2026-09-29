import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const accountRoutes = readFileSync(join(process.cwd(), "server/accountRoutes.ts"), "utf8");
const contactMatchRoute = accountRoutes
  .split('app.post("/api/account/contacts/matches"')[1]
  ?.split('app.post("/api/account/contacts/discoverability"')[0] ?? "";

describe("privacy-safe contact matching route", () => {
  it("requires a signed-in account and accepts only bounded phone hashes", () => {
    expect(contactMatchRoute).toContain("requireMember");
    expect(contactMatchRoute).toContain("normalizePhoneHashes(req.body?.phoneHashes)");
    expect(contactMatchRoute).toContain("req.body.phoneHashes.length > 500");
    expect(contactMatchRoute).toContain('eq(members.contactDiscoveryEnabled, true)');
    expect(contactMatchRoute).toContain('eq(otpSendAttempts.kind, "contact_lookup")');
    expect(contactMatchRoute).toContain("recent.length >= 10");
  });

  it("does not treat the caller's opt-out as an opt-out from searching their own contacts", () => {
    expect(contactMatchRoute).not.toContain("if (!req.member!.contactDiscoveryEnabled");
  });

  it("returns a hash and minimal profile label, never a phone number or email", () => {
    expect(contactMatchRoute).toContain("phoneHash: createHash(\"sha256\")");
    expect(contactMatchRoute).toContain("name: match.name");
    expect(contactMatchRoute).toContain("verificationTier: match.verificationTier");
    expect(contactMatchRoute).not.toContain("phone: match.phoneE164");
    expect(contactMatchRoute).not.toContain("email: match.email");
  });
});
