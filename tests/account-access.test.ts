import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATUS_LABEL,
  blockedActionMessage,
  canAccount,
  canRequestVerification,
  describeRestriction,
  isDiscoverable,
  normalizeAccountStatus,
  normalizeVerificationTier,
  requiresAccountNotice,
  resolveCapabilities,
  type AccountState,
} from "../lib/account-access";

const active: AccountState = { status: "active", verificationTier: "phone" };
const warned: AccountState = { status: "warned", verificationTier: "phone" };
const suspended: AccountState = { status: "suspended", verificationTier: "phone" };
const banned: AccountState = { status: "banned", verificationTier: "phone" };

describe("capabilities per account status", () => {
  it("gives an active account every capability", () => {
    expect(resolveCapabilities(active)).toEqual([
      "browse",
      "appear-in-discovery",
      "send-friend-requests",
      "open-chats",
      "send-messages",
      "join-meetups",
      "share-location",
      "start-calls",
      "request-verification",
    ]);
  });

  it("keeps a warned account fully functional", () => {
    expect(resolveCapabilities(warned)).toEqual(resolveCapabilities(active));
    expect(canAccount(warned, "send-messages")).toBe(true);
    expect(canAccount(warned, "start-calls")).toBe(true);
  });

  it("makes a suspended account read-only", () => {
    expect(resolveCapabilities(suspended)).toEqual(["browse", "open-chats"]);
    expect(canAccount(suspended, "send-messages")).toBe(false);
    expect(canAccount(suspended, "send-friend-requests")).toBe(false);
    expect(canAccount(suspended, "join-meetups")).toBe(false);
    expect(canAccount(suspended, "share-location")).toBe(false);
    expect(canAccount(suspended, "start-calls")).toBe(false);
    expect(canAccount(suspended, "appear-in-discovery")).toBe(false);
    // Reading must survive, so the member can see what happened.
    expect(canAccount(suspended, "browse")).toBe(true);
    expect(canAccount(suspended, "open-chats")).toBe(true);
  });

  it("leaves a banned account with nothing", () => {
    expect(resolveCapabilities(banned)).toEqual([]);
    expect(canAccount(banned, "browse")).toBe(false);
    expect(canAccount(banned, "open-chats")).toBe(false);
  });

  it("hides suspended and banned accounts from discovery", () => {
    expect(isDiscoverable(active)).toBe(true);
    expect(isDiscoverable(warned)).toBe(true);
    expect(isDiscoverable(suspended)).toBe(false);
    expect(isDiscoverable(banned)).toBe(false);
  });
});

describe("restriction notices", () => {
  it("returns nothing for a healthy account", () => {
    expect(describeRestriction(active)).toBeNull();
  });

  it("explains a warning without claiming anything is blocked", () => {
    const notice = describeRestriction(warned);
    expect(notice?.title).toMatch(/warning/i);
    expect(notice?.body).toMatch(/nothing is blocked/i);
    expect(notice?.imposedByStaff).toBe(true);
  });

  it("explains a suspension and what still works", () => {
    const notice = describeRestriction(suspended);
    expect(notice?.title).toMatch(/suspended/i);
    expect(notice?.body).toMatch(/cannot send new messages/i);
    expect(notice?.stillAllowed).toMatch(/reading existing chats/i);
  });

  it("explains a ban and points at support", () => {
    const notice = describeRestriction(banned);
    expect(notice?.title).toMatch(/closed/i);
    expect(notice?.body).toMatch(/contact support/i);
  });

  it("requires a blocking notice only for suspension and ban", () => {
    expect(requiresAccountNotice(active)).toBe(false);
    expect(requiresAccountNotice(warned)).toBe(false);
    expect(requiresAccountNotice(suspended)).toBe(true);
    expect(requiresAccountNotice(banned)).toBe(true);
  });

  it("labels every status", () => {
    expect(ACCOUNT_STATUS_LABEL.active).toBe("Active");
    expect(ACCOUNT_STATUS_LABEL.warned).toBe("Warned");
    expect(ACCOUNT_STATUS_LABEL.suspended).toBe("Suspended");
    expect(ACCOUNT_STATUS_LABEL.banned).toBe("Banned");
  });
});

describe("blocked action messaging", () => {
  it("returns null when the action is permitted", () => {
    expect(blockedActionMessage(active, "send-messages")).toBeNull();
    expect(blockedActionMessage(suspended, "open-chats")).toBeNull();
  });

  it("names the suspension rather than failing silently", () => {
    const message = blockedActionMessage(suspended, "send-messages");
    expect(message).toMatch(/suspended/i);
    expect(message).toMatch(/reading existing chats/i);
  });

  it("tells a banned member to contact support", () => {
    const message = blockedActionMessage(banned, "send-messages");
    expect(message).toMatch(/closed/i);
    expect(message).toMatch(/support/i);
  });
});

describe("verification eligibility", () => {
  it("allows a phone-verified member to submit for ID review", () => {
    expect(canRequestVerification({ status: "active", verificationTier: "phone" })).toBe(true);
    expect(canRequestVerification({ status: "active", verificationTier: "none" })).toBe(true);
  });

  it("does not ask an already-verified member to resubmit", () => {
    expect(canRequestVerification({ status: "active", verificationTier: "id_selfie" })).toBe(false);
  });

  it("blocks a suspended or banned member from starting verification", () => {
    expect(canRequestVerification(suspended)).toBe(false);
    expect(canRequestVerification(banned)).toBe(false);
  });
});

describe("normalisation of untrusted values", () => {
  it("maps unknown statuses to active", () => {
    expect(normalizeAccountStatus("banned")).toBe("banned");
    expect(normalizeAccountStatus("suspended")).toBe("suspended");
    expect(normalizeAccountStatus("warned")).toBe("warned");
    expect(normalizeAccountStatus("nonsense")).toBe("active");
    expect(normalizeAccountStatus(undefined)).toBe("active");
    expect(normalizeAccountStatus(42)).toBe("active");
  });

  it("maps unknown verification tiers to none", () => {
    expect(normalizeVerificationTier("id_selfie")).toBe("id_selfie");
    expect(normalizeVerificationTier("phone")).toBe("phone");
    expect(normalizeVerificationTier("gold")).toBe("none");
    expect(normalizeVerificationTier(null)).toBe("none");
  });
});
